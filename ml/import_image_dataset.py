"""Extract MediaPipe hand landmarks from an image dataset (e.g., Kaggle ASL / ISL)
into `ml/data/dataset.csv` (ASL, 63 features) or `ml/data/isl_dataset.csv` (ISL, 130 features).
"""

import argparse
import csv
import random
import string
from pathlib import Path

import cv2
import mediapipe as mp

try:
    from utils import normalize_landmarks, normalize_hands
except ImportError:
    from ml.utils import normalize_landmarks, normalize_hands

ML_DIR = Path(__file__).resolve().parent
LANG_DEFAULTS = {
    "asl": (ML_DIR / "data" / "dataset.csv", "kaggle_asl", 63, 1),
    "isl": (ML_DIR / "data" / "isl_dataset.csv", "kaggle_isl", 130, 2),
}
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
ALL_LETTERS = list(string.ascii_uppercase)


def resolve_class_root(dataset_dir: Path) -> Path:
    """Handle archives that unpack an extra outer folder (e.g. asl_alphabet_train/asl_alphabet_train)."""
    if not dataset_dir.exists():
        raise FileNotFoundError(f"Dataset folder not found: {dataset_dir}")

    direct_letters = [p for p in dataset_dir.iterdir() if p.is_dir() and p.name.upper() in ALL_LETTERS]
    if direct_letters:
        return dataset_dir

    subdirs = [p for p in dataset_dir.iterdir() if p.is_dir()]
    if len(subdirs) == 1:
        nested = subdirs[0]
        nested_letters = [p for p in nested.iterdir() if p.is_dir() and p.name.upper() in ALL_LETTERS]
        if nested_letters:
            return nested

    raise ValueError(f"No A-Z class folders found inside: {dataset_dir}")


def load_existing_rows(csv_path: Path, exclude_person: str | None) -> list[list[str]]:
    """Read existing CSV rows, optionally dropping rows belonging to `exclude_person`."""
    if not csv_path.exists():
        return []
    with open(csv_path, "r", newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        if not header:
            return []
        rows = [row for row in reader if row]
    if exclude_person is not None:
        rows = [row for row in rows if len(row) > 1 and row[1] != exclude_person]
    return rows


def main():
    parser = argparse.ArgumentParser(
        description="Convert A-Z hand sign image folders (ASL or ISL) into MediaPipe landmark CSV."
    )
    parser.add_argument(
        "--language",
        choices=["asl", "isl"],
        default="asl",
        help="Target sign language format: asl (63 features, 1 hand) or isl (130 features, up to 2 hands)",
    )
    parser.add_argument(
        "--dataset-dir",
        required=True,
        help="Path to unzipped folder containing A..Z subfolders (e.g. C:\\Downloads\\asl_alphabet_train)",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="Output CSV path (default: ml/data/dataset.csv for ASL, ml/data/isl_dataset.csv for ISL)",
    )
    parser.add_argument(
        "--labels",
        nargs="+",
        default=ALL_LETTERS,
        help="Subset of labels to import (default: A-Z)",
    )
    parser.add_argument(
        "--max-per-class",
        type=int,
        default=500,
        help="Max valid samples to extract per letter (default: 500)",
    )
    parser.add_argument(
        "--person",
        default=None,
        help="Tag stored in CSV 'person' column (default: kaggle_asl or kaggle_isl)",
    )
    parser.add_argument(
        "--min-detection-confidence",
        type=float,
        default=0.5,
        help="MediaPipe hand detection confidence threshold (default: 0.5)",
    )
    parser.add_argument(
        "--replace-source",
        action="store_true",
        help="Remove previous rows with the same --person tag before writing new rows",
    )
    args = parser.parse_args()

    default_csv, default_person, n_feat, max_hands = LANG_DEFAULTS[args.language]
    person_tag = args.person or default_person
    csv_path = Path(args.output).resolve() if args.output else default_csv.resolve()

    class_root = resolve_class_root(Path(args.dataset_dir).expanduser().resolve())
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    target_labels = [lbl.upper() for lbl in args.labels]

    existing_rows = load_existing_rows(csv_path, person_tag if args.replace_source else None)

    mp_hands = mp.solutions.hands
    rng = random.Random(42)
    extracted_rows: list[list] = []

    print(f"Language    : {args.language.upper()} ({n_feat} features, max_hands={max_hands})")
    print(f"Source root : {class_root}")
    print(f"Output CSV  : {csv_path}")
    print(f"Source tag  : {person_tag} | Max/class: {args.max_per_class}")

    with mp_hands.Hands(
        static_image_mode=True,
        max_num_hands=max_hands,
        min_detection_confidence=args.min_detection_confidence,
    ) as hands:
        for label in target_labels:
            folder = class_root / label
            if not folder.is_dir():
                matches = [p for p in class_root.iterdir() if p.is_dir() and p.name.upper() == label]
                folder = matches[0] if matches else None
            if not folder:
                print(f"[{label}] Folder not found — skipped")
                continue

            img_paths = [p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXTS]
            rng.shuffle(img_paths)

            saved = 0
            scanned = 0
            for img_path in img_paths:
                if saved >= args.max_per_class:
                    break
                scanned += 1
                img = cv2.imread(str(img_path))
                if img is None:
                    continue

                rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
                res = hands.process(rgb)
                if not res.multi_hand_landmarks:
                    continue

                if args.language == "isl":
                    detected = [
                        [(p.x, p.y, p.z) for p in hl.landmark]
                        for hl in res.multi_hand_landmarks
                    ]
                    feats = normalize_hands(detected)
                else:
                    hl = res.multi_hand_landmarks[0]
                    lm = [(p.x, p.y, p.z) for p in hl.landmark]
                    feats = normalize_landmarks(lm)

                extracted_rows.append([label, person_tag] + [float(v) for v in feats])
                saved += 1

            print(f"[{label}] extracted {saved}/{args.max_per_class} (scanned {scanned}/{len(img_paths)})")

    if not extracted_rows:
        print("\nNo landmarks were extracted. Check image resolution/visibility and try again.")
        return

    header = ["label", "person"] + [f"f{i}" for i in range(n_feat)]
    all_rows = existing_rows + extracted_rows
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(header)
        writer.writerows(all_rows)

    print(f"\nDone! Added {len(extracted_rows)} samples (total CSV rows: {len(all_rows)}).")
    print(f"Next step: python ml/train_model.py --language {args.language}")


if __name__ == "__main__":
    main()

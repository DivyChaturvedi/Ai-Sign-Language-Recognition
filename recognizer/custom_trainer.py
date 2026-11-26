"""Browser-based Custom Sign Trainer backend for ASL, ISL, and Dynamic Motion models."""

import csv
import re
from pathlib import Path

import joblib
import numpy as np
from django.conf import settings
from sklearn.ensemble import RandomForestClassifier

from ml.utils import normalize_landmarks, normalize_hands
from . import predictor
from .motion_engine import (
    MOTION_CSV_PATH,
    N_MOTION_FEATURES,
    extract_motion_features,
    train_motion_model,
)

VALID_LABEL_RE = re.compile(r"^[A-Za-z0-9 _-]{1,24}$")

STATIC_CONFIG = {
    "asl": (settings.BASE_DIR / "ml" / "data" / "dataset.csv", settings.MODEL_PATHS["asl"], 63, True),
    "isl": (settings.BASE_DIR / "ml" / "data" / "isl_dataset.csv", settings.MODEL_PATHS["isl"], 130, False),
}


def _clean_label(raw_label: str) -> str:
    lbl = re.sub(r"\s+", " ", (raw_label or "").strip())
    if not VALID_LABEL_RE.match(lbl):
        raise ValueError("Label must be 1-24 characters (letters, digits, space, _, -)")
    return lbl.upper() if len(lbl) == 1 else lbl


def _read_csv_rows(csv_path: Path):
    if not csv_path.exists():
        return [], []
    with open(csv_path, "r", newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        rows = [r for r in reader if r]
    return header or [], rows


def _mirror_features(arr):
    m = arr.copy()
    m[:, 0::3] *= -1
    return m


def _retrain_static_model(mode: str):
    csv_path, model_path, n_feat, mirror = STATIC_CONFIG[mode]
    _, rows = _read_csv_rows(csv_path)
    if not rows:
        raise ValueError(f"No samples available for {mode.upper()}")

    X = np.asarray([[float(v) for v in r[2 : 2 + n_feat]] for r in rows], dtype=np.float32)
    y = np.asarray([r[0] for r in rows])

    if mirror:
        X = np.vstack([X, _mirror_features(X)])
        y = np.concatenate([y, y])

    model = RandomForestClassifier(n_estimators=200, n_jobs=1, random_state=42)
    model.fit(X, y)

    model_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, model_path)
    predictor._models.pop(mode, None)
    return {"classes": [str(c) for c in model.classes_], "samples": len(rows)}


def add_custom_samples_and_train(mode: str, raw_label: str, samples: list, person: str = "web_user"):
    """Append samples collected in the browser to CSV and immediately retrain the target model."""
    label = _clean_label(raw_label)
    if not isinstance(samples, list) or len(samples) < 3:
        raise ValueError("Send at least 3 captured samples to train a sign")

    if mode in STATIC_CONFIG:
        csv_path, _, n_feat, _ = STATIC_CONFIG[mode]
        new_rows = []
        for sample in samples:
            if mode == "asl":
                # Accept either [21 pts] or [[21 pts]]
                hand = sample[0] if (isinstance(sample, list) and len(sample) in (1, 2) and isinstance(sample[0], list) and len(sample[0]) == 21) else sample
                feats = normalize_landmarks(hand)
            else:
                if not isinstance(sample, list) or len(sample) != 2:
                    raise ValueError("ISL samples require 2 hands per frame")
                feats = normalize_hands(sample)
            if not np.all(np.isfinite(feats)):
                raise ValueError("Non-finite landmark coordinates in sample")
            new_rows.append([label, person] + [float(v) for v in feats])

        csv_path.parent.mkdir(parents=True, exist_ok=True)
        _, existing = _read_csv_rows(csv_path)
        header = ["label", "person"] + [f"f{i}" for i in range(n_feat)]
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(header)
            writer.writerows(existing + new_rows)

        summary = _retrain_static_model(mode)
        return {"mode": mode, "label": label, "added": len(new_rows), **summary}

    if mode == "motion":
        new_rows = []
        for seq in samples:
            feats = extract_motion_features(seq)
            if not np.all(np.isfinite(feats)):
                raise ValueError("Non-finite coordinates in motion sequence")
            new_rows.append([label, person] + [float(v) for v in feats])

        MOTION_CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
        _, existing = _read_csv_rows(MOTION_CSV_PATH)
        header = ["label", "person"] + [f"f{i}" for i in range(N_MOTION_FEATURES)]
        with open(MOTION_CSV_PATH, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(header)
            writer.writerows(existing + new_rows)

        summary = train_motion_model()
        return {"mode": "motion", "label": label, "added": len(new_rows), **summary}

    raise ValueError("Unknown training mode. Use 'asl', 'isl', or 'motion'.")


def delete_custom_label(mode: str, raw_label: str):
    """Delete all CSV samples for `raw_label` and retrain (or clear model if empty)."""
    label = _clean_label(raw_label)
    if mode == "motion":
        csv_path = MOTION_CSV_PATH
        n_feat = N_MOTION_FEATURES
    elif mode in STATIC_CONFIG:
        csv_path, _, n_feat, _ = STATIC_CONFIG[mode]
    else:
        raise ValueError("Unknown mode")

    _, rows = _read_csv_rows(csv_path)
    remaining = [r for r in rows if r and r[0] != label]
    deleted = len(rows) - len(remaining)
    if deleted == 0:
        raise ValueError(f"Label '{label}' not found in {mode.upper()} dataset")

    header = ["label", "person"] + [f"f{i}" for i in range(n_feat)]
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(header)
        writer.writerows(remaining)

    if not remaining:
        if mode == "motion":
            from .motion_engine import MOTION_MODEL_PATH, invalidate_motion_cache
            if MOTION_MODEL_PATH.exists():
                MOTION_MODEL_PATH.unlink()
            invalidate_motion_cache()
        else:
            model_path = STATIC_CONFIG[mode][1]
            if model_path.exists():
                model_path.unlink()
            predictor._models.pop(mode, None)
        return {"mode": mode, "deleted": deleted, "classes": [], "samples": 0}
    summary = train_motion_model() if mode == "motion" else _retrain_static_model(mode)
    return {"mode": mode, "deleted": deleted, **summary}


def get_trainer_status():
    """Return label sample counts for ASL, ISL, and Motion datasets."""
    out = {}
    for mode, (csv_path, _, _, _) in STATIC_CONFIG.items():
        _, rows = _read_csv_rows(csv_path)
        counts = {}
        for r in rows:
            counts[r[0]] = counts.get(r[0], 0) + 1
        out[mode] = {"counts": dict(sorted(counts.items())), "classes": predictor.get_model_classes(mode)}

    _, m_rows = _read_csv_rows(MOTION_CSV_PATH)
    m_counts = {}
    for r in m_rows:
        m_counts[r[0]] = m_counts.get(r[0], 0) + 1
    from .motion_engine import get_motion_classes
    out["motion"] = {"counts": dict(sorted(m_counts.items())), "classes": get_motion_classes()}
    return out

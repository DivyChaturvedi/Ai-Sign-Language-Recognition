"""Collect 1-hand or 2-hand MediaPipe landmark samples for Action & Voice Studio into ml/data/actions_dataset.csv."""

import argparse
import csv
import os
import time
from pathlib import Path

import cv2
import mediapipe as mp

try:
    from utils import normalize_hands
except ImportError:
    from ml.utils import normalize_hands

ML_DIR = Path(__file__).resolve().parent
CSV_PATH = ML_DIR / "data" / "actions_dataset.csv"

DEFAULT_ACTION_LABELS = [
    "Hello / Hi",
    "Thank You",
    "I Love You",
    "Namaste / Welcome",
    "Help / Emergency",
    "Yes / Affirmative",
    "No",
    "Good / Great",
    "Bad / Dislike",
    "Peace / Victory",
    "Stop / Wait",
    "Call Me",
    "Please",
]


def main():
    parser = argparse.ArgumentParser(
        description="Record 1-hand or 2-hand landmark samples for Action & Voice Studio gestures."
    )
    parser.add_argument("--labels", nargs="+", default=DEFAULT_ACTION_LABELS)
    parser.add_argument("--samples", type=int, default=200)
    parser.add_argument("--person", default="p1", help="Signer name/tag (e.g. divy)")
    args = parser.parse_args()

    mp_hands = mp.solutions.hands
    hands = mp_hands.Hands(
        static_image_mode=False,
        max_num_hands=2,
        min_detection_confidence=0.6,
        min_tracking_confidence=0.5,
    )

    CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
    new_file = not os.path.exists(CSV_PATH)
    f = open(CSV_PATH, "a", newline="", encoding="utf-8")
    writer = csv.writer(f)
    if new_file:
        writer.writerow(["label", "person"] + [f"f{i}" for i in range(130)])

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("Error: Could not open webcam (VideoCapture(0)).")
        f.close()
        return

    def read_hands(frame):
        res = hands.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        if res.multi_hand_landmarks:
            return [[(p.x, p.y, p.z) for p in h.landmark] for h in res.multi_hand_landmarks]
        return []

    quit_all = False
    for label in args.labels:
        if quit_all:
            break
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            view = cv2.flip(frame, 1)
            cv2.putText(
                view,
                f"Action: {label} | SPACE = start, Q = next/quit",
                (10, 35),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.75,
                (0, 255, 0),
                2,
            )
            cv2.imshow("Collect Actions", view)
            k = cv2.waitKey(1) & 0xFF
            if k == ord(" "):
                break
            if k == ord("q") or k == 27:
                quit_all = True
                break
        if quit_all:
            break

        count = 0
        while count < args.samples:
            ok, frame = cap.read()
            if not ok:
                break
            detected = read_hands(frame)
            view = cv2.flip(frame, 1)
            if detected:
                writer.writerow([label, args.person] + [float(v) for v in normalize_hands(detected)])
                count += 1
                time.sleep(0.03)
            cv2.putText(
                view,
                f"{label}: {count}/{args.samples} (hands: {len(detected)})",
                (10, 35),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.75,
                (0, 200, 255),
                2,
            )
            cv2.imshow("Collect Actions", view)
            k = cv2.waitKey(1) & 0xFF
            if k == ord("q") or k == 27:
                break

    f.close()
    cap.release()
    cv2.destroyAllWindows()
    print(f"Saved samples to {CSV_PATH}")
    print("Next step: python ml/train_model.py --language actions")


if __name__ == "__main__":
    main()

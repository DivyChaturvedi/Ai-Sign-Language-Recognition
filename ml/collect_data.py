import argparse, csv, os, time
from pathlib import Path
import cv2
import mediapipe as mp
from utils import normalize_landmarks

ML_DIR = Path(__file__).resolve().parent

# J and Z need motion, so the static version uses 24 letters
DEFAULT_LABELS = list("ABCDEFGHIKLMNOPQRSTUVWXY")
CSV_PATH = ML_DIR / "data" / "dataset.csv"

parser = argparse.ArgumentParser()
parser.add_argument("--labels", nargs="+", default=DEFAULT_LABELS)
parser.add_argument("--samples", type=int, default=300)
parser.add_argument("--person", default="p1", help="who is recording (p1, p2...)")
args = parser.parse_args()

mp_hands = mp.solutions.hands
mp_draw = mp.solutions.drawing_utils
hands = mp_hands.Hands(static_image_mode=False, max_num_hands=1,
                       min_detection_confidence=0.7, min_tracking_confidence=0.5)

new_file = not os.path.exists(CSV_PATH)
f = open(CSV_PATH, "a", newline="")
writer = csv.writer(f)
if new_file:
    writer.writerow(["label", "person"] + [f"f{i}" for i in range(63)])

cap = cv2.VideoCapture(0)

def read_landmarks(frame):
    # NOTE: process the RAW frame (not mirrored). The browser app must do the same.
    res = hands.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    if res.multi_hand_landmarks:
        hl = res.multi_hand_landmarks[0]
        return [(p.x, p.y, p.z) for p in hl.landmark], hl
    return None, None

quit_all = False
for label in args.labels:
    if quit_all:
        break
    # wait for SPACE
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        lm, hl = read_landmarks(frame)
        view = cv2.flip(frame, 1)  # mirrored only for display
        cv2.putText(view, f"Sign: {label}  | SPACE = start, Q = quit", (10, 35),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 0), 2)
        cv2.imshow("Collect", view)
        k = cv2.waitKey(1) & 0xFF
        if k == ord(" "):
            break
        if k == ord("q"):
            quit_all = True
            break
    if quit_all:
        break

    count = 0
    while count < args.samples:
        ok, frame = cap.read()
        if not ok:
            break
        lm, hl = read_landmarks(frame)
        view = cv2.flip(frame, 1)
        if lm:
            writer.writerow([label, args.person] + list(normalize_landmarks(lm)))
            count += 1
            time.sleep(0.03)  # small gap so samples vary
        cv2.putText(view, f"{label}: {count}/{args.samples}", (10, 35),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 200, 255), 2)
        cv2.imshow("Collect", view)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            quit_all = True
            break

f.close()
cap.release()
cv2.destroyAllWindows()
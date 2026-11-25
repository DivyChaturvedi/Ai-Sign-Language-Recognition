import argparse, csv, os, time
from pathlib import Path
import cv2
import mediapipe as mp
from utils import normalize_hands

ML_DIR = Path(__file__).resolve().parent

# EDIT after checking the ISLRTC chart: letters that are signed with ONE hand.
ONE_HAND_LABELS = set("0123456789") | {"NONE"}
DEFAULT_LABELS = list("ABCDEFGHIJKLMNOPQRSTUVWXYZ") + list("0123456789")
CSV_PATH = ML_DIR / "data" / "isl_dataset.csv"

parser = argparse.ArgumentParser()
parser.add_argument("--labels", nargs="+", default=DEFAULT_LABELS)
parser.add_argument("--samples", type=int, default=300)
parser.add_argument("--person", default="p1")
args = parser.parse_args()

mp_hands = mp.solutions.hands
hands = mp_hands.Hands(static_image_mode=False, max_num_hands=2,
                       min_detection_confidence=0.6, min_tracking_confidence=0.5)

new_file = not os.path.exists(CSV_PATH)
f = open(CSV_PATH, "a", newline="")
writer = csv.writer(f)
if new_file:
    writer.writerow(["label", "person"] + [f"f{i}" for i in range(130)])

cap = cv2.VideoCapture(0)

def read_hands(frame):
    # Process the RAW frame (not mirrored), same as the browser app.
    res = hands.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    if res.multi_hand_landmarks:
        return [[(p.x, p.y, p.z) for p in h.landmark] for h in res.multi_hand_landmarks]
    return []

def hands_ok(label, n):
    if label == "NONE":
        return n >= 1
    return n == (1 if label in ONE_HAND_LABELS else 2)

quit_all = False
for label in args.labels:
    if quit_all:
        break
    need = "1 hand" if label in ONE_HAND_LABELS else "2 hands"
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        view = cv2.flip(frame, 1)
        cv2.putText(view, f"Sign: {label} ({need}) | SPACE = start, Q = quit", (10, 35),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
        cv2.imshow("Collect ISL", view)
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
        detected = read_hands(frame)
        view = cv2.flip(frame, 1)
        if hands_ok(label, len(detected)):
            writer.writerow([label, args.person] + list(normalize_hands(detected)))
            count += 1
            time.sleep(0.03)
        cv2.putText(view, f"{label}: {count}/{args.samples}  (hands seen: {len(detected)})", (10, 35),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 200, 255), 2)
        cv2.imshow("Collect ISL", view)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            quit_all = True
            break

f.close()
cap.release()
cv2.destroyAllWindows()
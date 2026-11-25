import numpy as np

def normalize_landmarks(landmarks):
    """landmarks: 21 (x, y, z) points -> 63-length normalized vector.
    Removes dependence on hand position and size in the frame."""
    pts = np.array(landmarks, dtype=np.float32).reshape(21, 3)
    pts = pts - pts[0]                      # wrist becomes the origin
    scale = np.linalg.norm(pts[9])          # wrist -> middle finger base
    if scale < 1e-6:
        scale = 1.0
    pts = pts / scale
    return pts.flatten()

def normalize_hands(hands):
    """hands: list of 1 or 2 hands, each 21 (x, y, z) points.
    Returns 130 features: hand1 (63) + hand2 (63) + relative wrist offset (3) + two-hands flag (1)."""
    hands = [np.array(h, dtype=np.float32).reshape(21, 3) for h in hands[:2]]
    hands.sort(key=lambda p: p[0][0])        # left-most wrist in the image first (no handedness needed)
    feats = np.zeros(130, dtype=np.float32)
    for i, pts in enumerate(hands):
        feats[i * 63:(i + 1) * 63] = normalize_landmarks(pts)
    if len(hands) == 2:
        s = np.linalg.norm(hands[0][9] - hands[0][0])
        if s < 1e-6:
            s = 1.0
        feats[126:129] = (hands[1][0] - hands[0][0]) / s
        feats[129] = 1.0
    return feats
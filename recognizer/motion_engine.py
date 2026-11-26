"""Lightweight Scikit-Learn Dynamic Motion Sequence Engine + Geometric J/Z Fallback."""

import csv
import threading
from pathlib import Path

import joblib
import numpy as np
from django.conf import settings
from sklearn.ensemble import RandomForestClassifier

from ml.utils import normalize_landmarks

SEQUENCE_LEN = 16
N_MOTION_FEATURES = 182  # 63 start + 63 delta + 48 trajectory checkpoints + 8 kinematics
MOTION_CSV_PATH = settings.BASE_DIR / "ml" / "data" / "motion_dataset.csv"
MOTION_MODEL_PATH = settings.BASE_DIR / "ml" / "models" / "motion_model.joblib"

_motion_lock = threading.Lock()
_cached_motion_model = None


def invalidate_motion_cache():
    global _cached_motion_model
    with _motion_lock:
        _cached_motion_model = None


def get_motion_model():
    global _cached_motion_model
    with _motion_lock:
        if _cached_motion_model is None and MOTION_MODEL_PATH.exists():
            m = joblib.load(MOTION_MODEL_PATH)
            if hasattr(m, "n_jobs"):
                m.n_jobs = 1
            _cached_motion_model = m
        return _cached_motion_model


def get_motion_classes():
    m = get_motion_model()
    return [str(c) for c in m.classes_] if m is not None else []


def _resample_sequence(sequence, target_len=SEQUENCE_LEN):
    """Uniformly resample a variable-length list of 21x3 hand frames to `target_len` frames."""
    arr = np.asarray(sequence, dtype=np.float32)
    if arr.ndim != 3 or arr.shape[1:] != (21, 3):
        raise ValueError("Motion sequence must have shape (T, 21, 3)")
    if len(arr) < 8:
        raise ValueError("Motion sequence must contain at least 8 frames")
    if len(arr) == target_len:
        return arr

    t_old = np.linspace(0.0, 1.0, len(arr))
    t_new = np.linspace(0.0, 1.0, target_len)
    flat_old = arr.reshape(len(arr), -1)
    flat_new = np.empty((target_len, flat_old.shape[1]), dtype=np.float32)
    for col in range(flat_old.shape[1]):
        flat_new[:, col] = np.interp(t_new, t_old, flat_old[:, col])
    return flat_new.reshape(target_len, 21, 3)


def _count_sign_reversals(diffs, eps=0.012):
    signs = [1 if d > eps else (-1 if d < -eps else 0) for d in diffs]
    nonzero = [s for s in signs if s != 0]
    if len(nonzero) < 2:
        return 0
    return sum(1 for a, b in zip(nonzero, nonzero[1:]) if a != b)


def extract_motion_features(sequence):
    """Convert a dynamic hand sequence (T, 21, 3) into a fixed 182-length invariant feature vector."""
    seq = _resample_sequence(sequence, SEQUENCE_LEN)
    start_pose = normalize_landmarks(seq[0])
    end_pose = normalize_landmarks(seq[-1])
    delta_pose = end_pose - start_pose

    # Scale trajectories by initial palm size so gestures are distance-invariant
    scale = float(np.linalg.norm(seq[0, 9] - seq[0, 0]))
    if scale < 1e-5:
        scale = 1.0

    # Checkpoints across 8 evenly spaced frames for wrist (0), index tip (8), pinky tip (20)
    idx_steps = np.linspace(0, SEQUENCE_LEN - 1, 8, dtype=int)
    origin_wrist = seq[0, 0]
    origin_idx = seq[0, 8]
    origin_pinky = seq[0, 20]

    traj = []
    for k in idx_steps:
        w = (seq[k, 0] - origin_wrist) / scale
        ix = (seq[k, 8] - origin_idx) / scale
        pk = (seq[k, 20] - origin_pinky) / scale
        traj.extend([w[0], w[1], ix[0], ix[1], pk[0], pk[1]])

    # Trajectory kinematics on wrist + index + pinky
    idx_xy = (seq[:, 8, :2] - origin_idx[:2]) / scale
    pk_xy = (seq[:, 20, :2] - origin_pinky[:2]) / scale
    idx_diffs = np.diff(idx_xy, axis=0)
    pk_diffs = np.diff(pk_xy, axis=0)

    idx_path_len = float(np.sum(np.linalg.norm(idx_diffs, axis=1)))
    pk_path_len = float(np.sum(np.linalg.norm(pk_diffs, axis=1)))
    net_dx_idx = float(idx_xy[-1, 0] - idx_xy[0, 0])
    net_dy_idx = float(idx_xy[-1, 1] - idx_xy[0, 1])
    net_dx_pk = float(pk_xy[-1, 0] - pk_xy[0, 0])
    net_dy_pk = float(pk_xy[-1, 1] - pk_xy[0, 1])
    rev_x_idx = float(_count_sign_reversals(idx_diffs[:, 0]))
    rev_x_pk = float(_count_sign_reversals(pk_diffs[:, 0]))

    kinematics = np.array(
        [idx_path_len, pk_path_len, net_dx_idx, net_dy_idx, net_dx_pk, net_dy_pk, rev_x_idx, rev_x_pk],
        dtype=np.float32,
    )
    return np.concatenate([start_pose, delta_pose, np.asarray(traj, dtype=np.float32), kinematics])


def detect_geometric_motion(sequence):
    """Detect dynamic ASL letters J and Z using hand-shape + trajectory geometry."""
    seq = _resample_sequence(sequence, SEQUENCE_LEN)
    scale = float(np.linalg.norm(seq[0, 9] - seq[0, 0]))
    if scale < 1e-5:
        return None

    mid = seq[SEQUENCE_LEN // 2]
    wrist = mid[0]
    ext_index = float(np.linalg.norm(mid[8] - wrist)) > float(np.linalg.norm(mid[6] - wrist)) * 1.15
    ext_middle = float(np.linalg.norm(mid[12] - wrist)) > float(np.linalg.norm(mid[10] - wrist)) * 1.15
    ext_ring = float(np.linalg.norm(mid[16] - wrist)) > float(np.linalg.norm(mid[14] - wrist)) * 1.15
    ext_pinky = float(np.linalg.norm(mid[20] - wrist)) > float(np.linalg.norm(mid[18] - wrist)) * 1.15

    # J: Pinky extended, other fingers mostly curled, downward stroke then horizontal hook
    pk_xy = (seq[:, 20, :2] - seq[0, 20, :2]) / scale
    pk_dy = float(np.max(pk_xy[:, 1]) - pk_xy[0, 1])  # downward movement in screen coords (+y)
    pk_dx_span = float(np.max(pk_xy[:, 0]) - np.min(pk_xy[:, 0]))
    if ext_pinky and not ext_middle and not ext_ring and pk_dy > 0.35 and pk_dx_span > 0.25:
        return {"label": "J", "confidence": 0.86, "source": "trajectory", "candidates": [{"label": "J", "confidence": 0.86}]}

    # Z: Index extended, others curled, zig-zag horizontal direction reversals while descending
    idx_xy = (seq[:, 8, :2] - seq[0, 8, :2]) / scale
    idx_diffs = np.diff(idx_xy, axis=0)
    rev_x = _count_sign_reversals(idx_diffs[:, 0], eps=0.025)
    idx_dx_span = float(np.max(idx_xy[:, 0]) - np.min(idx_xy[:, 0]))
    idx_dy_net = float(idx_xy[-1, 1] - idx_xy[0, 1])
    if ext_index and not ext_middle and not ext_ring and rev_x >= 2 and idx_dx_span > 0.45 and idx_dy_net > 0.25:
        return {"label": "Z", "confidence": 0.88, "source": "trajectory", "candidates": [{"label": "Z", "confidence": 0.88}]}

    return None


def train_motion_model():
    """Train Scikit-Learn motion classifier from `ml/data/motion_dataset.csv`."""
    if not MOTION_CSV_PATH.exists():
        raise FileNotFoundError("No motion dataset recorded yet.")

    X, y = [], []
    with open(MOTION_CSV_PATH, "r", newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        if not header:
            raise ValueError("Motion dataset is empty.")
        for row in reader:
            if len(row) >= 2 + N_MOTION_FEATURES:
                y.append(row[0])
                X.append([float(v) for v in row[2 : 2 + N_MOTION_FEATURES]])

    if not X:
        raise ValueError("Motion dataset contains no valid samples.")

    X_arr = np.asarray(X, dtype=np.float32)
    y_arr = np.asarray(y)

    model = RandomForestClassifier(
        n_estimators=150, max_depth=20, min_samples_leaf=2, n_jobs=1, random_state=42
    )
    model.fit(X_arr, y_arr)

    MOTION_MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, MOTION_MODEL_PATH, compress=3)
    invalidate_motion_cache()

    classes = [str(c) for c in model.classes_]
    return {"classes": classes, "samples": len(y_arr)}


def predict_motion(sequence):
    """Predict dynamic motion gesture using trained ML model or J/Z trajectory analyzer."""
    feats = extract_motion_features(sequence)
    model = get_motion_model()
    if model is not None and len(model.classes_) >= 2:
        probs = model.predict_proba(feats.reshape(1, -1))[0]
        classes = model.classes_
        order = np.argsort(probs)[::-1]
        top_idx = order[0]
        top_conf = float(probs[top_idx])
        top_label = str(classes[top_idx])
        candidates = [
            {"label": str(classes[i]), "confidence": round(float(probs[i]), 3)}
            for i in order[: min(4, len(classes))]
        ]
        # If ML model confidence is strong, return ML prediction; otherwise check geometric J/Z
        if top_conf >= 0.55:
            return {"label": top_label, "confidence": top_conf, "source": "ml_model", "candidates": candidates}

    geo = detect_geometric_motion(sequence)
    if geo is not None:
        return geo

    if model is not None and len(model.classes_) == 1:
        only_lbl = str(model.classes_[0])
        return {"label": only_lbl, "confidence": 0.75, "source": "ml_model", "candidates": [{"label": only_lbl, "confidence": 0.75}]}

    return {"label": None, "confidence": 0.0, "source": "none", "candidates": []}

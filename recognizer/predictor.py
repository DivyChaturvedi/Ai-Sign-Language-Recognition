import joblib
import numpy as np
from django.conf import settings
from ml.utils import normalize_landmarks, normalize_hands

_models = {}


def get_model(language):
    """Load and cache the trained scikit-learn model for `language`, optimized for single-frame inference."""
    if language not in _models:
        model = joblib.load(settings.MODEL_PATHS[language])
        # Single-sample online inference is ~3x faster with n_jobs=1 (avoids joblib thread-pool overhead per frame).
        if hasattr(model, "n_jobs"):
            model.n_jobs = 1
        _models[language] = model
    return _models[language]


def get_model_classes(language):
    """Return sorted/ordered trained class labels for `language`, or [] if model unavailable."""
    path = settings.MODEL_PATHS.get(language)
    if not path or not path.exists():
        return []
    return [str(c) for c in get_model(language).classes_]


def predict(language, hands):
    """
    hands: list of 1-2 hands, each 21 [x, y, z].
    Returns (label, confidence, candidates).
    """
    if language == "isl":
        features = normalize_hands(hands)
    else:
        features = normalize_landmarks(hands[0])

    if not np.all(np.isfinite(features)):
        raise ValueError("Non-finite landmark coordinates")

    model = get_model(language)
    probs = model.predict_proba(features.reshape(1, -1))[0]
    classes = model.classes_
    sorted_indices = np.argsort(probs)[::-1]

    top_idx = sorted_indices[0]
    top_label = str(classes[top_idx])
    top_conf = float(probs[top_idx])

    candidates = [
        {"label": str(classes[idx]), "confidence": round(float(probs[idx]), 3)}
        for idx in sorted_indices[:min(4, len(classes))]
    ]

    return top_label, top_conf, candidates

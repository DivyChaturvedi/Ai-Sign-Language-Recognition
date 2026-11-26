import argparse
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, ConfusionMatrixDisplay, accuracy_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC

ML_DIR = Path(__file__).resolve().parent

parser = argparse.ArgumentParser()
parser.add_argument("--language", choices=["asl", "isl"], default="asl")
args = parser.parse_args()

CONFIG = {
    "asl": (ML_DIR / "data/dataset.csv", ML_DIR / "models/sign_model.joblib", 63, ML_DIR / "models/confusion_matrix.png"),
    "isl": (ML_DIR / "data/isl_dataset.csv", ML_DIR / "models/isl_model.joblib", 130, ML_DIR / "models/isl_confusion_matrix.png"),
}
csv_path, model_path, n_feat, cm_path = CONFIG[args.language]
MIRROR = args.language == "asl"      # left-hand support only for one-handed ASL


def mirror(a):
    """Flip x of every landmark (features 0, 3, 6, ...): right hand <-> left hand."""
    m = a.copy()
    m[:, 0::3] *= -1
    return m


df = pd.read_csv(csv_path)
print("Language:", args.language.upper(), "| Samples:", len(df), "| Classes:", df["label"].nunique())
print(df["label"].value_counts().sort_index().to_string())

X = df[[f"f{i}" for i in range(n_feat)]].values
y = df["label"].values

persons = df["person"].unique()
use_person_split = False
if len(persons) > 1:
    test_person = persons[-1]
    mask = (df["person"] == test_person).values
    if set(y[~mask]) == set(y):
        use_person_split = True
        X_train, X_test, y_train, y_test = X[~mask], X[mask], y[~mask], y[mask]
        print(f"Testing on unseen person: {test_person}")

if not use_person_split:
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=42)
    print("Stratified 80/20 split (covers all classes)")

if MIRROR:
    X_train = np.vstack([X_train, mirror(X_train)])
    y_train = np.concatenate([y_train, y_train])
    X_test_left = mirror(X_test)

models = {
    "RandomForest": RandomForestClassifier(
        n_estimators=150, max_depth=22, min_samples_leaf=2, n_jobs=-1, random_state=42
    ),
    "SVM": make_pipeline(StandardScaler(), CalibratedClassifierCV(SVC(C=10, kernel="rbf"), cv=3)),
}

best_name, best_model, best_acc = None, None, 0
for name, model in models.items():
    model.fit(X_train, y_train)
    acc = accuracy_score(y_test, model.predict(X_test))
    print(f"{name}: {acc:.4f}")
    if acc > best_acc:
        best_name, best_model, best_acc = name, model, acc

print(f"\nBest: {best_name} ({best_acc:.4f})")
if MIRROR:
    print(f"Left-hand (mirrored test) accuracy: "
          f"{accuracy_score(y_test, best_model.predict(X_test_left)):.4f}")
print(classification_report(y_test, best_model.predict(X_test)))

fig, ax = plt.subplots(figsize=(12, 12))
ConfusionMatrixDisplay.from_estimator(best_model, X_test, y_test, ax=ax,
                                      xticks_rotation=90, colorbar=False)
plt.tight_layout()
cm_path.parent.mkdir(parents=True, exist_ok=True)
plt.savefig(cm_path, dpi=120)

# Final model: refit on ALL data (plus mirrored copies for ASL)
X_full, y_full = (np.vstack([X, mirror(X)]), np.concatenate([y, y])) if MIRROR else (X, y)
best_model.fit(X_full, y_full)
if hasattr(best_model, "n_jobs"):
    best_model.n_jobs = 1  # Fast single-sample online inference
model_path.parent.mkdir(parents=True, exist_ok=True)
joblib.dump(best_model, model_path, compress=3)
print("Saved", model_path, f"({model_path.stat().st_size / (1024 * 1024):.2f} MB)")

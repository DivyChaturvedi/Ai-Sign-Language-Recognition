# 🤟 SignTalk AI — Real-Time Sign Language Recognition

Real-time **ASL & ISL Alphabet Recognition** and **Action-to-Speech** web application built with Django, MediaPipe, Scikit-Learn, and Web Speech API.

---

## ✨ Features

- **🔤 Alphabet Studio (`/`):** Real-time **ASL (1-hand)** & **ISL (2-hand)** recognition with Temporal EMA smoothing, live sentence builder, TTS speech, and ASL/ISL sign charts.
- **🗣️ Action & Voice Studio (`/actions/`):** Hybrid engine — 13 built-in geometric gestures + optional custom ML-trained actions (`actions_model.joblib`) that speak automatically.
- **🔄 Two-Way Sign Communication:** Speak via microphone or type text to animate sequential gesture & SVG sign cards for reverse communication.
- **🎞️ Dynamic Motion Recognition:** Resampled 16-frame trajectory classifier + geometric detector for motion signs (**J**, **Z**, and custom words).
- **🎓 Browser Custom Sign Trainer:** Record ASL, ISL, Action (1/2 hands), or dynamic motion samples directly in the web UI (no terminal required) and retrain live.
- **✨ Grammar Polish & Hindi Translation:** Converts sign glosses (e.g. `"I STORE GO"` → `"I am going to the store."`) and translates/speaks in Hindi.
- **🎬 Video Upload Subtitles:** Scan uploaded `.mp4`/`.webm` sign videos to generate clickable timestamped transcripts and export `.SRT` / `.TXT` files.
- **📊 Student Progress Dashboard:** Persists Practice Arena scores in SQLite, tracking overall accuracy and weak letters (`<75%`).
- **📱 Mobile QR Camera Sync & Stop Camera:** Scan a QR code to use your phone's camera while displaying live signs on laptop, plus one-click **Stop / Start Camera** hardware control.

---

## 🚀 Quick Start (Clone & Run)

### 1. Clone the Repository
```powershell
git clone https://github.com/DivyChaturvedi/Ai-Sign-Language-Recognition.git
cd Ai-Sign-Language-Recognition
```

### 2. Create & Activate Virtual Environment
```powershell
python -m venv venv

# Windows PowerShell:
.\venv\Scripts\Activate.ps1

# Windows CMD:
venv\Scripts\activate.bat

# macOS / Linux:
source venv/bin/activate
```
*(If PowerShell blocks activation, run `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser` once.)*

### 3. Install Dependencies & Setup Database
```powershell
pip install -r requirements.txt
python manage.py migrate
```

### 4. Start the Server
```powershell
python manage.py runserver
```

Open in your browser (Chrome/Edge recommended) and **Allow camera permission**:
- **Alphabet Studio:** http://127.0.0.1:8000/
- **Action & Voice Studio:** http://127.0.0.1:8000/actions/

---

## 🧠 Train or Retrain Signs (ASL & ISL)

### Add New Letters
```powershell
# 1. Collect landmark samples (SPACE = record, Q = next/quit)
python ml/collect_data.py --labels E F G --samples 300 --person divy       # ASL (1 hand)
python ml/collect_data_isl.py --labels E F G --samples 300 --person divy   # ISL (2 hands)

# 2. Train the model
python ml/train_model.py --language asl
python ml/train_model.py --language isl

# 3. Restart server
python manage.py runserver
```

### Fix / Retrain Specific Letters (e.g. `A B C D`)
Delete old rows for those letters from CSV, re-record, and retrain:

```powershell
# ASL: delete old A B C D data
python -c "import pandas as pd; df=pd.read_csv('ml/data/dataset.csv'); df=df[~df['label'].isin(['A','B','C','D'])]; df.to_csv('ml/data/dataset.csv', index=False)"

# ISL: delete old A B C D data
python -c "import pandas as pd; df=pd.read_csv('ml/data/isl_dataset.csv'); df=df[~df['label'].isin(['A','B','C','D'])]; df.to_csv('ml/data/isl_dataset.csv', index=False)"
```
Then re-record and retrain:
```powershell
python ml/collect_data.py --labels A B C D --samples 300 --person divy
python ml/collect_data_isl.py --labels A B C D --samples 300 --person divy
python ml/train_model.py --language asl
python ml/train_model.py --language isl
```
*(Tip: Use `--person divy_v2` instead of deleting if you want to keep old samples and add new ones.)*

### Import Full A–Z Image Dataset (Kaggle ASL / ISL)
```powershell
# Extract landmarks from unzipped A..Z image folders:
python ml/import_image_dataset.py --language asl --dataset-dir "C:\path\to\asl_alphabet_train" --max-per-class 500 --replace-source
python ml/import_image_dataset.py --language isl --dataset-dir "C:\path\to\Indian" --max-per-class 300 --replace-source

# Train the corresponding model:
python ml/train_model.py --language asl
python ml/train_model.py --language isl
```

### Train Custom Action & Voice Gestures (1 or 2 Hands)
```powershell
# 1. Record samples for built-in or new actions (SPACE = start, Q = next/quit):
python ml/collect_data_actions.py --labels "Thank You" "Stop / Wait" "Water" "Bye" --samples 200 --person divy

# Or record all 13 default actions:
python ml/collect_data_actions.py --samples 200 --person divy

# 2. Train Action ML model (ml/models/actions_model.joblib):
python ml/train_model.py --language actions

# 3. Restart server (custom actions auto-appear in /actions/ library):
python manage.py runserver
```

---

## 🧪 Run Tests
```powershell
python manage.py test recognizer -v 2
```

---

## 📁 Project Structure

```text
Ai-Sign-Language-Recognition/
├── manage.py
├── requirements.txt
├── signtalk/              # Django settings & root URLs
├── recognizer/            # Web app (views, predictors, templates, static JS/CSS/SVGs)
└── ml/                    # Data collection, training scripts, CSV datasets & .joblib models
```

---

## 🛠️ Troubleshooting

| Issue | Fix |
|:---|:---|
| **Camera not opening** | Close other apps using the webcam (Zoom/Teams) and click 🔒 in browser bar → Camera → **Allow**. |
| **PowerShell script blocked** | Run `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`. |
| **Port 8000 in use** | Run `python manage.py runserver 8080` and open http://127.0.0.1:8080/. |
| **ISL says "needs 2 hands"** | Ensure both hands are clearly visible inside the camera frame. |

---

## ⚙️ Tech Stack
Django • Google MediaPipe • Scikit-Learn • OpenCV • NumPy • Pandas • deep-translator • Web Speech API • SQLite • Gunicorn • WhiteNoise

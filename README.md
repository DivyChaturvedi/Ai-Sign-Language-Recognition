# 🤟 SignTalk AI — Real-Time Sign Language Recognition

Real-time **ASL & ISL Alphabet Recognition** and **Action-to-Speech** web application built with Django, MediaPipe, Scikit-Learn, and Web Speech API.

---

## ✨ Features

- **🔤 Alphabet Studio (`/`):** Real-time single-hand (**ASL**) and two-hand (**ISL**) letter recognition, live sentence builder, Practice Arena quiz, and SVG sign gallery.
- **🗣️ Action & Voice Studio (`/actions/`):** Detects 13 everyday gestures (Hello, Namaste, Thank You, Help, Yes, No, Peace, Stop, etc.) and speaks them aloud automatically.

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
Django • Google MediaPipe • Scikit-Learn • OpenCV • NumPy • Web Speech API

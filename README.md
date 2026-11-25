# 🤟 SignTalk AI — Real-Time Sign Language & Action Recognition Studio

> **AI-Powered Real-Time Sign Language (ASL & ISL) and Dynamic Gesture-to-Speech System**  
> Built with Django, Google MediaPipe, Scikit-Learn, and Web Speech API with an immersive 3D Cyberpunk / Glassmorphism UI.

---

## 📌 Table of Contents
1. [Overview & Highlights](#-overview--highlights)
2. [Project Architecture](#-project-architecture)
3. [Key Features & Modules](#-key-features--modules)
4. [Prerequisites](#-prerequisites)
5. [Installation & Setup](#-installation--setup-step-by-step)
6. [How to Run the Project](#-how-to-run-the-project)
7. [How to Use the Application](#-how-to-use-the-application)
8. [Machine Learning Pipeline](#-machine-learning-pipeline-data-collection--training)
9. [🔄 Retraining Specific Letters (A B C D etc.)](#-retraining-specific-letters-important)
10. [Adding New Letters / Signs](#-adding-new-letters--signs)
11. [Project Directory Structure](#-project-directory-structure)
12. [Troubleshooting & Common Issues](#-troubleshooting--common-issues)
13. [Credits & Technology Stack](#-credits--technology-stack)

---

## 🌟 Overview & Highlights

**SignTalk AI** is an end-to-end intelligent assistive technology platform designed for seamless communication between deaf/hard-of-hearing individuals and the broader community. It translates finger spelling and dynamic hand gestures into text and real-time synthesized speech directly inside your browser.

- **⚡ Instant Camera Feed (~250ms):** Zero-lag camera startup running in parallel with MediaPipe model initialization.
- **🔤 Dual-Page Architecture:**
  1. Dedicated **Alphabet Recognition Studio** (`/`) for single/double hand letters (ASL & ISL).
  2. Dedicated **Action & Voice Studio** (`/actions/`) for daily phrases & automatic speech synthesis.
- **🎨 3D Animated UI:** Interactive 3D mouse tilt cards, ambient floating orbs, cyber grid mesh, holographic HUD targeting brackets, and tactile 3D control buttons.
- **🗣️ Real-time Text-to-Speech (TTS):** Instant audio playback with customizable voice, pitch, and speed.

---

## 🏛️ Project Architecture

```
                               ┌────────────────────────────────┐
                               │   Client Browser (WebCam)      │
                               └───────────────┬────────────────┘
                                               │
               ┌───────────────────────────────┴───────────────────────────────┐
               ▼                                                               ▼
   [Page 1: / (Alphabet Studio)]                               [Page 2: /actions/ (Action Studio)]
   - Fast Camera Initializer                                   - Independent Camera Loop
   - MediaPipe HandLandmarker                                  - Client-side Geometric Engine
   - 21 3D Hand Landmarks                                      - 13 Predefined Gesture Models
               │                                                               │
               ▼ (JSON Landmarks via POST /api/predict/)                       ▼
   ┌──────────────────────┐                                    ┌──────────────────────┐
   │ Django Backend View  │                                    │ Web Speech Synthesis │
   ├──────────────────────┤                                    ├──────────────────────┤
   │ Scikit-Learn Models  │                                    │ Dynamic Voice Output │
   │ - ASL: sign_model    │                                    │ Audio Visualizer Eq  │
   │ - ISL: isl_model     │                                    └──────────────────────┘
   └──────────┬───────────┘
              ▼
   Predicted Letter + Hold Stability
   -> Sentence Builder & History Log
```

---

## ✨ Key Features & Modules

### 1. 🔤 Alphabet Recognition Studio (`/`)
- **Side-by-Side Studio Layout:**
  - **Left Side:** Real-time 3D camera container, holographic targeting HUD, scanline beam, FPS counter, and camera source dropdown.
  - **Right Side:** 3D extruded recognized letter, confidence meter, hold stability ring, and candidate probability breakdown.
- **Dual Language Support:**
  - **ASL (American Sign Language):** Single-hand letters (A-Z).
  - **ISL (Indian Sign Language):** Two-hand gesture recognition (A-Z).
- **Live Translator:** Automatic word formation, backspace, speech synthesis, and clipboard copy.
- **Practice Arena (Gamified Quiz):** Practice signs against random target letters with streak counters and scoring.
- **Sign Reference Gallery:** Embedded SVG guide library for both ASL and ISL hand shapes.

### 2. 🗣️ Action & Voice Studio (`/actions/`)
- **Real-Time Voice Narration:** Detects gestures and automatically speaks the phrase via the browser's SpeechSynthesis engine.
- **13 Built-in Everyday Gestures:**
  | Gesture | Spoken Phrase | Category |
  | :--- | :--- | :--- |
  | 👋 Hello / Hi | *"Hello! How are you?"* | Greeting |
  | 🙏 Namaste | *"Namaste! Welcome."* | Greeting |
  | 🤟 I Love You | *"I love you!"* | Emotion |
  | 🤝 Thank You | *"Thank you so much!"* | Courtesy |
  | 🆘 Help | *"Please help me!"* | Emergency |
  | 👍 Yes / Good | *"Yes, sounds good!"* | Response |
  | 👎 No / Bad | *"No, I disagree."* | Response |
  | ✌️ Peace | *"Peace and calm!"* | Expression |
  | 🛑 Stop | *"Please stop right there."* | Command |
  | 🤙 Call Me | *"Please call me later."* | Request |
  | 🙏 Please | *"Please, I request you."* | Courtesy |
- **Audio Equalizer Animation:** Animated waveform bars that dance when audio is spoken.
- **Spoken Phrases Timeline:** History log of all recognized phrases with timestamps.

---

## 💻 Prerequisites

Ensure you have the following installed on your machine:
- **Operating System:** Windows 10/11, macOS, or Linux.
- **Python:** Python 3.10, 3.11, or 3.12 (Recommended: 3.11).
- **Webcam:** Any working USB or laptop integrated camera.
- **Modern Web Browser:** Google Chrome, Microsoft Edge, Brave, or Firefox (Chrome/Edge recommended for best Web Speech & WebGL support).
- **Internet Connection:** Required for first-time MediaPipe model download (~25MB).

---

## 🚀 Installation & Setup (Step-by-Step)

### Step 1: Open Terminal in Project Folder
```powershell
cd C:\sign_language_project
```

### Step 2: Activate Virtual Environment
```powershell
# Windows PowerShell:
.\venv\Scripts\Activate.ps1

# If you get a script execution policy error, run this ONCE first:
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Windows Command Prompt (CMD):
venv\Scripts\activate.bat
```
*(Once activated, you will see `(venv)` at the beginning of your terminal.)*

### Step 3: Install Required Dependencies (Fresh Setup Only)
```powershell
pip install -r requirements.txt
```

### Step 4: Run Database Migrations
```powershell
python manage.py migrate
```

---

## 🏃 How to Run the Project

### Start the Django Development Server
```powershell
cd C:\sign_language_project
.\venv\Scripts\Activate.ps1
python manage.py runserver
```

You will see:
```
Starting development server at http://127.0.0.1:8000/
Quit the server with CTRL-BREAK.
```

### Open in Browser
| Page | URL |
|:---|:---|
| 🔤 Alphabet Studio | http://127.0.0.1:8000/ |
| 🗣️ Action & Voice Studio | http://127.0.0.1:8000/actions/ |

> ⚠️ **Camera Permission:** When browser asks `Allow access to your camera`, click **"Allow"**.

---

## 🎮 How to Use the Application

### 🔤 Alphabet Recognition
1. Select **ASL (1 Hand)** or **ISL (2 Hands)** from the language dropdown (top-right).
2. Hold your hand(s) steadily inside the holographic HUD frame.
3. Once held for ~0.8s, the hold-stability bar fills and the letter types automatically.
4. Click **"Speak Sentence"** (🔊) to hear your composed sentence aloud.
5. Use the **Practice Arena** tab to test your signing skills in a timed quiz!

### 🗣️ Action & Voice Studio
1. Click **"Action & Voice Studio"** at the top header or visit `/actions/`.
2. Make any of the 13 supported gestures (open palm = Hello, thumbs up = Yes, etc.).
3. The AI detects the gesture, displays the phrase, and **speaks it aloud automatically**.
4. Adjust voice/speed from **Voice Engine Settings** at the bottom.

---

## 🧠 Machine Learning Pipeline (Data Collection & Training)

The project includes complete scripts inside the `ml/` folder.

### Step 1: Activate Virtual Environment
```powershell
cd C:\sign_language_project
.\venv\Scripts\Activate.ps1
```

### Step 2: Collect Data
```powershell
# ASL (Single hand — 1 hand letters):
python ml/collect_data.py --labels A B C D E F --samples 300 --person yourname

# ISL (Two hands — 2 hand letters):
python ml/collect_data_isl.py --labels A B C D E F --samples 300 --person yourname
```

**Controls during collection:**
| Key | Action |
|:---|:---|
| `SPACE` | Start/pause recording for the current letter |
| `Q` | Move to next letter or quit |
| `ESC` | Exit collection immediately |

### Step 3: Train the Model
```powershell
# Train ASL model:
python ml/train_model.py --language asl

# Train ISL model:
python ml/train_model.py --language isl
```

Training outputs:
- `ml/models/sign_model.joblib` — ASL trained model
- `ml/models/isl_model.joblib` — ISL trained model
- `ml/models/confusion_matrix.png` — ASL accuracy visualization
- `ml/models/isl_confusion_matrix.png` — ISL accuracy visualization

### Step 4: Restart Server
```powershell
# Press Ctrl+C to stop, then:
python manage.py runserver
```

---

## 🔄 Retraining Specific Letters (IMPORTANT)

> Yeh section tab use karo jab kisi specific letter ki training **galat ho** aur use **dobara sahi se train** karna ho.
> *(Use this when any letter's recognition is wrong and needs to be retrained.)*

---

### 📌 Option A: Purana Data Delete Karke Fresh Train (Clean Retrain)

Agar kisi letter ka data **bilkul delete** karke fresh data record karna hai:

#### Step 1: Delete Old Data for Those Letters

**ASL ke liye (e.g., A B C D):**
```powershell
cd C:\sign_language_project
.\venv\Scripts\Activate.ps1

python -c "
import pandas as pd
df = pd.read_csv('ml/data/dataset.csv')
print('Before:', df['label'].value_counts().sort_index())
df = df[~df['label'].isin(['A', 'B', 'C', 'D'])]
df.to_csv('ml/data/dataset.csv', index=False)
print('After:', df['label'].value_counts().sort_index())
"
```

**ISL ke liye (e.g., A B C D):**
```powershell
python -c "
import pandas as pd
df = pd.read_csv('ml/data/isl_dataset.csv')
print('Before:', df['label'].value_counts().sort_index())
df = df[~df['label'].isin(['A', 'B', 'C', 'D'])]
df.to_csv('ml/data/isl_dataset.csv', index=False)
print('After:', df['label'].value_counts().sort_index())
"
```

> ⚠️ **Warning:** Yeh command permanently delete kar deta hai. Baaki labels safe rahenge.

#### Step 2: Naya Data Record Karo

```powershell
# ASL (1 hand):
python ml/collect_data.py --labels A B C D --samples 300 --person divy

# ISL (2 hands):
python ml/collect_data_isl.py --labels A B C D --samples 300 --person divy
```

#### Step 3: Model Retrain Karo

```powershell
# ASL:
python ml/train_model.py --language asl

# ISL:
python ml/train_model.py --language isl
```

#### Step 4: Server Restart Karo

```powershell
python manage.py runserver
```

---

### 📌 Option B: Purana Data Safe Rakhke Naya Add Karo (Safe Retrain)

Agar purana data **delete nahi karna** aur sirf naya data **add karke** dono milake train karna hai:

```powershell
# ASL — naya data alag person name se collect karo:
python ml/collect_data.py --labels A B C D --samples 300 --person divy_v2

# ISL:
python ml/collect_data_isl.py --labels A B C D --samples 300 --person divy_v2
```

> ✅ Naya aur purana dono data CSV mein rahega. Train karne par dono milake model banega.

Phir train karo:
```powershell
python ml/train_model.py --language asl
python ml/train_model.py --language isl
python manage.py runserver
```

---

### 📌 Option C: Specific Person Ka Data Delete Karo

Agar kisi specific person (`divy`) ka data delete karna hai, baaki sab safe rakhte hue:

**ASL:**
```powershell
python -c "
import pandas as pd
df = pd.read_csv('ml/data/dataset.csv')
print('Before:', df.groupby(['label','person']).size() if 'person' in df.columns else df['label'].value_counts())
df = df[df.get('person', '') != 'divy']
df.to_csv('ml/data/dataset.csv', index=False)
print('After:', df['label'].value_counts().sort_index())
"
```

**ISL:**
```powershell
python -c "
import pandas as pd
df = pd.read_csv('ml/data/isl_dataset.csv')
df = df[df.get('person', '') != 'divy']
df.to_csv('ml/data/isl_dataset.csv', index=False)
print('After:', df['label'].value_counts().sort_index())
"
```

---

### ⚡ Quick Reference — Retrain Commands Summary

| Task | Command |
|:---|:---|
| Delete ASL A-D data | `python -c "import pandas as pd; df=pd.read_csv('ml/data/dataset.csv'); df=df[~df['label'].isin(['A','B','C','D'])]; df.to_csv('ml/data/dataset.csv',index=False)"` |
| Delete ISL A-D data | `python -c "import pandas as pd; df=pd.read_csv('ml/data/isl_dataset.csv'); df=df[~df['label'].isin(['A','B','C','D'])]; df.to_csv('ml/data/isl_dataset.csv',index=False)"` |
| Collect ASL data | `python ml/collect_data.py --labels A B C D --samples 300 --person divy` |
| Collect ISL data | `python ml/collect_data_isl.py --labels A B C D --samples 300 --person divy` |
| Train ASL model | `python ml/train_model.py --language asl` |
| Train ISL model | `python ml/train_model.py --language isl` |
| Restart server | `python manage.py runserver` |

---

## ➕ Adding New Letters / Signs

Agar **naye letters** (e.g., E F G H ...) train karne hain jo abhi model mein nahi hain:

### ASL — New Letters Add Karo
```powershell
# 1. Naya data collect karo (sirf naye letters):
python ml/collect_data.py --labels E F G H --samples 300 --person divy

# 2. Train karo (purana data automatically include hoga):
python ml/train_model.py --language asl

# 3. Server restart karo:
python manage.py runserver
```

### ISL — New Letters Add Karo
```powershell
# 1. Naya data collect karo:
python ml/collect_data_isl.py --labels E F G H --samples 300 --person divy

# 2. Train karo:
python ml/train_model.py --language isl

# 3. Server restart karo:
python manage.py runserver
```

> 💡 **Tip:** Jitna zyada aur diverse data (different lighting, angles, hands), utna zyada accurate model.

---

## 📁 Project Directory Structure

```text
C:\sign_language_project\
│
├── manage.py                          # Django CLI management script
├── requirements.txt                   # Python package dependencies
├── README.md                          # This file
├── db.sqlite3                         # Local SQLite database
│
├── signtalk/                          # Django Project Core Configuration
│   ├── settings.py                    # App settings (reads from env vars)
│   ├── urls.py                        # Root URL router
│   ├── wsgi.py                        # WSGI server gateway
│   └── asgi.py                        # ASGI server gateway
│
├── recognizer/                        # Main Web Application
│   ├── views.py                       # View logic (index, actions, prediction APIs)
│   ├── urls.py                        # App URL routes
│   ├── predictor.py                   # ML prediction handler (n_jobs=1 optimized)
│   ├── action_predictor.py            # Geometric action recognition engine
│   ├── tests.py                       # 11 Django unit + integration tests
│   ├── templates/recognizer/          # HTML Templates
│   │   ├── index.html                 # Alphabet Recognition Studio
│   │   └── actions.html               # Action & Voice Studio
│   └── static/recognizer/             # Frontend Assets
│       ├── style.css                  # 3D Glassmorphism & Cyberpunk stylesheet
│       ├── app.js                     # Alphabet recognition client controller
│       ├── actions_app.js             # Action Studio controller
│       └── img/signs/                 # 52+ SVG reference cards for ASL/ISL
│
└── ml/                                # Machine Learning Pipeline
    ├── utils.py                       # Landmark extraction & normalization utils
    ├── collect_data.py                # ASL landmark data collection (1 hand)
    ├── collect_data_isl.py            # ISL landmark data collection (2 hands)
    ├── train_model.py                 # Model training, evaluation & export script
    ├── data/
    │   ├── dataset.csv                # ASL training data (landmark rows)
    │   └── isl_dataset.csv            # ISL training data (landmark rows)
    └── models/
        ├── sign_model.joblib          # Trained ASL Random Forest model
        ├── isl_model.joblib           # Trained ISL Random Forest model
        ├── confusion_matrix.png       # ASL accuracy heatmap
        └── isl_confusion_matrix.png   # ISL accuracy heatmap
```

---

## 🛠️ Troubleshooting & Common Issues

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| **Camera not starting / Black box** | Browser blocked camera or another app using it. | 1. Close Zoom/Teams/Skype.<br>2. Click 🔒 in browser address bar → Camera → **Allow**.<br>3. Select correct camera from dropdown. |
| **"Script Execution Policy" Error** | Windows blocks PowerShell scripts by default. | Run: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser` |
| **Audio not speaking** | Browser requires user gesture before audio. | Click anywhere on the page once, check system volume. |
| **Slow predictions / Low FPS** | Poor lighting or background clutter. | Improve room lighting, use plain background, face hand clearly toward camera. |
| **Port 8000 already in use** | Old Django server still running. | Use: `python manage.py runserver 8080` → open `http://127.0.0.1:8080/` |
| **Model predicts wrong letter** | Training data was incorrect. | Follow [Retraining Specific Letters](#-retraining-specific-letters-important) section above. |
| **ISL shows "needs 2 hands"** | Only 1 hand visible for ISL mode. | Show both hands clearly inside the camera frame. |
| **NaN / prediction API 400 error** | Invalid landmark coordinates sent. | Ensure hand is fully visible; avoid partial hand views at extreme edges. |
| **ModuleNotFoundError when training** | Running script from wrong directory. | Always `cd C:\sign_language_project` first, then run `python ml/train_model.py`. |
| **train_model.py has no data** | CSV file empty after deleting rows. | Re-run `collect_data.py` to add fresh samples before training. |

---

## 🧪 Running Tests

```powershell
cd C:\sign_language_project
.\venv\Scripts\Activate.ps1

# Run all 11 Django unit tests:
python manage.py test recognizer -v 2

# Run integration tests:
python scratch/test_all_integration.py
```

Expected output: **11/11 PASS** ✅

---

## 👥 Credits & Technology Stack

| Component | Technology |
|:---|:---|
| **Web Framework** | [Django 5.x](https://www.djangoproject.com/) |
| **Computer Vision** | [Google MediaPipe HandLandmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker) |
| **Machine Learning** | [Scikit-Learn](https://scikit-learn.org/) (Random Forest + SVM) |
| **Numerical Computing** | [NumPy](https://numpy.org/) |
| **Frontend** | HTML5, CSS3 3D Transforms, Vanilla JavaScript ES2022 |
| **Camera API** | WebRTC MediaDevices API |
| **Speech** | Web Speech API (SpeechSynthesis + SpeechRecognition) |
| **UI Style** | Custom 3D Glassmorphism + Cyberpunk Design System |

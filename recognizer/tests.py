import json
import math
import random
import shutil
import tempfile
from pathlib import Path
from unittest.mock import patch
from django.conf import settings
from django.test import TestCase
import pandas as pd
from ml.utils import normalize_landmarks, normalize_hands
from recognizer.action_predictor import predict_action
from recognizer.grammar_translator import polish_gloss_to_english, translate_text
from recognizer.motion_engine import predict_motion
from recognizer.predictor import predict


def fake_hand():
    return [[random.random(), random.random(), 0.0] for _ in range(21)]


def _synthetic_open_palm(spread=True, wrist_y=0.8):
    """Build a realistic 21-landmark open palm in [x, y, z] normalized coordinates."""
    dx = 0.05 if spread else 0.015
    return [
        [0.50, wrist_y, 0.0],                                      # 0 wrist
        [0.42, wrist_y - 0.08, 0.0], [0.36, wrist_y - 0.15, 0.0],  # 1-2 thumb
        [0.31, wrist_y - 0.22, 0.0], [0.25, wrist_y - 0.30, 0.0],  # 3-4 thumb ip/tip
        [0.45, wrist_y - 0.25, 0.0], [0.45 - dx, wrist_y - 0.37, 0.0],
        [0.45 - 1.5 * dx, wrist_y - 0.46, 0.0], [0.45 - 2.0 * dx, wrist_y - 0.55, 0.0],  # 5-8 index
        [0.50, wrist_y - 0.28, 0.0], [0.50, wrist_y - 0.41, 0.0],
        [0.50, wrist_y - 0.50, 0.0], [0.50, wrist_y - 0.60, 0.0],                        # 9-12 middle
        [0.55, wrist_y - 0.26, 0.0], [0.55 + dx, wrist_y - 0.38, 0.0],
        [0.55 + 1.5 * dx, wrist_y - 0.47, 0.0], [0.55 + 2.0 * dx, wrist_y - 0.56, 0.0],  # 13-16 ring
        [0.60, wrist_y - 0.22, 0.0], [0.60 + 2 * dx, wrist_y - 0.32, 0.0],
        [0.60 + 2.5 * dx, wrist_y - 0.40, 0.0], [0.60 + 3.0 * dx, wrist_y - 0.48, 0.0],  # 17-20 pinky
    ]


def _synthetic_beak_pinch():
    """Build index+middle pinching thumb tip (No gesture) with ring+pinky curled."""
    return [
        [0.50, 0.80, 0.0],                                   # 0 wrist
        [0.45, 0.72, 0.0], [0.42, 0.65, 0.0],
        [0.41, 0.58, 0.0], [0.42, 0.52, 0.0],                # 1-4 thumb tip at (0.42, 0.52)
        [0.46, 0.58, 0.0], [0.45, 0.52, 0.0],
        [0.44, 0.51, 0.0], [0.43, 0.52, 0.0],                # 5-8 index tip touching thumb
        [0.50, 0.56, 0.0], [0.47, 0.51, 0.0],
        [0.45, 0.51, 0.0], [0.43, 0.53, 0.0],                # 9-12 middle tip touching thumb
        [0.55, 0.60, 0.0], [0.55, 0.66, 0.0],
        [0.55, 0.72, 0.0], [0.55, 0.75, 0.0],                # 13-16 ring curled
        [0.60, 0.63, 0.0], [0.60, 0.69, 0.0],
        [0.60, 0.74, 0.0], [0.60, 0.77, 0.0],                # 17-20 pinky curled
    ]


class PageAndStaticTests(TestCase):
    def test_pages_render(self):
        r_index = self.client.get("/")
        self.assertEqual(r_index.status_code, 200)
        self.assertIn(b"vision-column", r_index.content)
        self.assertIn(b"app.js", r_index.content)
        self.assertIn(b"ux_monitors.js", r_index.content)
        self.assertIn(b"handGuideOverlay", r_index.content)
        self.assertIn(b"lightingWarning", r_index.content)
        self.assertIn(b"btnModeBlitz", r_index.content)
        self.assertIn(b"btnSaveWord", r_index.content)
        self.assertIn(b"savedWordsList", r_index.content)

        r_actions = self.client.get("/actions/")
        self.assertEqual(r_actions.status_code, 200)
        self.assertIn(b"actions_app.js", r_actions.content)
        self.assertIn(b"ux_monitors.js", r_actions.content)
        self.assertIn(b"handGuideOverlay", r_actions.content)
        self.assertIn(b"lightingWarning", r_actions.content)

    def test_metadata_endpoints(self):
        r_info = self.client.get("/api/info/")
        self.assertEqual(r_info.status_code, 200)
        info = r_info.json()
        self.assertIn("asl", info)
        self.assertIn("isl", info)

        r_dict = self.client.get("/api/dictionary/")
        self.assertEqual(r_dict.status_code, 200)
        d = r_dict.json()
        self.assertEqual(len(d["asl"]), 26)
        self.assertEqual(len(d["isl"]), 26)
        self.assertEqual(len(d["numbers"]), 10)
        self.assertEqual(len(d["actions"]), 13)
        static_signs_root = settings.BASE_DIR / "recognizer" / "static"
        for section in ("asl", "isl", "numbers", "actions"):
            for item in d[section]:
                rel = item["local_fallback"].lstrip("/").replace("static/", "", 1)
                self.assertTrue((static_signs_root / rel).exists(), f"Missing sign asset: {item['local_fallback']}")
        if info["asl"]["available"]:
            supported = {x["letter"] for x in d["asl"] if x["is_ai_supported"]}
            self.assertEqual(supported, set(info["asl"]["classes"]))

        r_act_list = self.client.get("/api/actions/")
        self.assertEqual(r_act_list.status_code, 200)
        self.assertEqual(len(r_act_list.json()["actions"]), 13)


class PreprocessingAndMLTests(TestCase):
    def test_normalize_landmarks_invariance(self):
        h = fake_hand()
        f1 = normalize_landmarks(h)
        self.assertEqual(f1.shape, (63,))
        # Translate + scale hand -> normalized features should stay near-identical
        shifted_scaled = [[p[0] * 2.5 + 10.0, p[1] * 2.5 - 3.0, p[2] * 2.5] for p in h]
        f2 = normalize_landmarks(shifted_scaled)
        self.assertTrue(all(abs(a - b) < 1e-4 for a, b in zip(f1, f2)))

    def test_normalize_hands_shape(self):
        f = normalize_hands([fake_hand(), fake_hand()])
        self.assertEqual(f.shape, (130,))
        self.assertEqual(float(f[129]), 1.0)

    def test_real_dataset_samples_predict_accurately(self):
        csv_path = settings.BASE_DIR / "ml" / "data" / "dataset.csv"
        if not csv_path.exists() or not settings.MODEL_PATHS["asl"].exists():
            self.skipTest("ASL dataset or model missing")
        df = pd.read_csv(csv_path)
        for lbl in sorted(df["label"].unique()):
            row = df[df["label"] == lbl].iloc[0][[f"f{i}" for i in range(63)]].values.reshape(21, 3).tolist()
            pred_lbl, conf, cands = predict("asl", [row])
            self.assertEqual(pred_lbl, lbl)
            self.assertGreater(conf, 0.5)
            self.assertTrue(1 <= len(cands) <= 4)


class PredictAPITest(TestCase):
    def post(self, payload):
        return self.client.post("/api/predict/", data=payload, content_type="application/json")

    def test_asl_returns_label_or_503(self):
        r = self.post({"language": "asl", "hands": [fake_hand()]})
        self.assertIn(r.status_code, (200, 503))

    def test_isl_two_hands_returns_label_or_503(self):
        r = self.post({"language": "isl", "hands": [fake_hand(), fake_hand()]})
        self.assertIn(r.status_code, (200, 503))

    def test_bad_input_rejected(self):
        self.assertEqual(self.post({"language": "asl", "hands": [[[0, 0, 0]]]}).status_code, 400)

    def test_unknown_language_rejected(self):
        self.assertEqual(self.post({"language": "xyz", "hands": [fake_hand()]}).status_code, 400)

    def test_nan_and_malformed_json_rejected(self):
        nan_payload = '{"language":"asl","hands":[[[NaN,0,0]' + ',[0,0,0]' * 20 + ']]}'
        r_nan = self.client.post("/api/predict/", data=nan_payload, content_type="application/json")
        self.assertEqual(r_nan.status_code, 400)
        r_bad = self.client.post("/api/predict/", data="{bad-json", content_type="application/json")
        self.assertEqual(r_bad.status_code, 400)

    def test_predict_action_endpoints(self):
        # Empty hands -> 200 detected=False
        r_empty = self.client.post("/api/predict_action/", data=json.dumps({"hands": []}), content_type="application/json")
        self.assertEqual(r_empty.status_code, 200)
        self.assertFalse(r_empty.json()["detected"])

        # Malformed hand shape -> 400 (must not crash with 500 IndexError)
        r_bad = self.client.post("/api/predict_action/", data=json.dumps({"hands": [[[1, 2]]]}), content_type="application/json")
        self.assertEqual(r_bad.status_code, 400)

        # Open palm spread -> Hello / Hi
        r_hello = self.client.post("/api/predict_action/", data=json.dumps({"hands": [_synthetic_open_palm(spread=True)]}), content_type="application/json")
        self.assertEqual(r_hello.status_code, 200)
        self.assertEqual(r_hello.json()["action"], "Hello / Hi")

        # Beak pinch -> No (must not be shadowed by Yes fist)
        res_no = predict_action([_synthetic_beak_pinch()])
        self.assertIsNotNone(res_no)
        self.assertEqual(res_no["action"], "No")

        # Upright closed palm in chest/mid zone -> Stop / Wait
        res_stop = predict_action([_synthetic_open_palm(spread=False, wrist_y=0.80)])
        self.assertIsNotNone(res_stop)
        self.assertEqual(res_stop["action"], "Stop / Wait")

        # Closed palm raised near face/chin zone -> Thank You
        res_ty = predict_action([_synthetic_open_palm(spread=False, wrist_y=0.40)])
        self.assertIsNotNone(res_ty)
        self.assertEqual(res_ty["action"], "Thank You")

    def test_remote_mobile_camera_flow(self):
        # Invalid session ID rejected
        self.assertEqual(self.client.get("/mobile/bad!id/").status_code, 400)

        # Mobile camera page loads
        r_page = self.client.get("/mobile/TEST12/")
        self.assertEqual(r_page.status_code, 200)
        self.assertContains(r_page, "TEST12")

        # Initial poll before mobile pushes -> connected=False
        r_poll0 = self.client.get("/api/remote_poll/TEST12/?lang=asl")
        self.assertEqual(r_poll0.status_code, 200)
        self.assertFalse(r_poll0.json()["connected"])

        # Mobile pushes hand landmarks -> laptop poll receives connected=True + label
        r_push = self.client.post(
            "/api/remote_push/TEST12/",
            data=json.dumps({"hands": [fake_hand()]}),
            content_type="application/json",
        )
        self.assertIn(r_push.status_code, (200, 503))
        if r_push.status_code == 200:
            r_poll1 = self.client.get("/api/remote_poll/TEST12/?lang=asl")
            self.assertEqual(r_poll1.status_code, 200)
            data = r_poll1.json()
            self.assertTrue(data["connected"])
            self.assertEqual(data["hand_count"], 1)
            self.assertIsNotNone(data["label"])

        # Disconnect clears session
        r_disc = self.client.get("/api/remote_poll/TEST12/?disconnect=1")
        self.assertEqual(r_disc.status_code, 200)
        self.assertFalse(r_disc.json()["connected"])


class ExtendedStudioFeaturesTests(TestCase):
    def _make_j_sequence(self):
        # Pinky extended (20), others curled; pinky traces downward hook
        seq = []
        base = _synthetic_open_palm(spread=False)
        for i in range(16):
            frame = [list(pt) for pt in base]
            # Curl index, middle, ring near wrist/mcp
            for tip, mcp in ((8, 5), (12, 9), (16, 13)):
                frame[tip][1] = frame[mcp][1] + 0.02
            # Move whole hand / pinky tip downward (+y) then hook left (-x)
            t = i / 15.0
            dx = 0.0 if t < 0.55 else -0.15 * ((t - 0.55) / 0.45)
            dy = 0.20 * min(1.0, t / 0.75)
            for p in frame:
                p[0] += dx
                p[1] += dy
            seq.append(frame)
        return seq

    def _make_z_sequence(self):
        # Index extended (8), others curled; sweeps right -> down-left -> right
        seq = []
        base = _synthetic_open_palm(spread=False)
        for i in range(16):
            frame = [list(pt) for pt in base]
            for tip, mcp in ((12, 9), (16, 13), (20, 17)):
                frame[tip][1] = frame[mcp][1] + 0.02
            t = i / 15.0
            if t < 0.35:
                dx = 0.25 * (t / 0.35)
                dy = 0.02 * (t / 0.35)
            elif t < 0.70:
                u = (t - 0.35) / 0.35
                dx = 0.25 - 0.25 * u
                dy = 0.02 + 0.16 * u
            else:
                u = (t - 0.70) / 0.30
                dx = 0.25 * u
                dy = 0.18
            for p in frame:
                p[0] += dx
                p[1] += dy
            seq.append(frame)
        return seq

    def test_grammar_polish_and_hindi_translation(self):
        self.assertEqual(polish_gloss_to_english("I STORE GO"), "I am going to the store.")
        self.assertEqual(polish_gloss_to_english("MY NAME DIVY"), "My name is Divy.")
        self.assertEqual(polish_gloss_to_english("WHERE HOSPITAL"), "Where is the hospital?")
        self.assertEqual(polish_gloss_to_english("I WATER WANT"), "I want water.")

        # Empty input rejected
        r_empty = self.client.post("/api/polish_translate/", data=json.dumps({"text": ""}), content_type="application/json")
        self.assertEqual(r_empty.status_code, 400)

        # Offline dictionary/word-fallback guarantees non-empty Hindi even without internet
        r_ok = self.client.post(
            "/api/polish_translate/",
            data=json.dumps({"text": "I STORE GO", "polish": True, "target_lang": "hi"}),
            content_type="application/json",
        )
        self.assertEqual(r_ok.status_code, 200)
        body = r_ok.json()
        self.assertEqual(body["polished"], "I am going to the store.")
        self.assertTrue(len(body["translated"]) > 0)

    def test_motion_engine_jz_and_ml_training(self):
        # Test geometric J and Z sequences directly
        j_seq = self._make_j_sequence()
        z_seq = self._make_z_sequence()

        with patch("recognizer.motion_engine.get_motion_model", return_value=None):
            res_j = predict_motion(j_seq)
            self.assertEqual(res_j["label"], "J")
            res_z = predict_motion(z_seq)
            self.assertEqual(res_z["label"], "Z")

        # API validation for bad sequence
        r_short = self.client.post(
            "/api/predict_motion/",
            data=json.dumps({"sequence": j_seq[:3]}),
            content_type="application/json",
        )
        self.assertEqual(r_short.status_code, 400)

        r_ok = self.client.post(
            "/api/predict_motion/",
            data=json.dumps({"sequence": z_seq}),
            content_type="application/json",
        )
        self.assertEqual(r_ok.status_code, 200)
        self.assertTrue(r_ok.json()["detected"])

    def test_custom_trainer_isolated_motion_and_validation(self):
        # GET status returns expected keys
        r_get = self.client.get("/api/trainer/")
        self.assertEqual(r_get.status_code, 200)
        self.assertIn("asl", r_get.json())
        self.assertIn("motion", r_get.json())

        # Validation checks
        r_bad_lbl = self.client.post(
            "/api/trainer/",
            data=json.dumps({"mode": "asl", "label": "$$$", "samples": [fake_hand(), fake_hand(), fake_hand()]}),
            content_type="application/json",
        )
        self.assertEqual(r_bad_lbl.status_code, 400)

        # Isolated train + delete for motion mode in tempdir
        tmp = Path(tempfile.mkdtemp())
        try:
            tmp_csv = tmp / "motion.csv"
            tmp_model = tmp / "motion.joblib"
            with patch("recognizer.custom_trainer.MOTION_CSV_PATH", tmp_csv), \
                 patch("recognizer.motion_engine.MOTION_CSV_PATH", tmp_csv), \
                 patch("recognizer.motion_engine.MOTION_MODEL_PATH", tmp_model):
                j_seq = self._make_j_sequence()
                z_seq = self._make_z_sequence()
                from recognizer.custom_trainer import add_custom_samples_and_train, delete_custom_label
                out1 = add_custom_samples_and_train("motion", "WaveJ", [j_seq, j_seq, j_seq])
                self.assertEqual(out1["added"], 3)
                out2 = add_custom_samples_and_train("motion", "WaveZ", [z_seq, z_seq, z_seq])
                self.assertEqual(sorted(out2["classes"]), ["WaveJ", "WaveZ"])
                pred = predict_motion(j_seq)
                self.assertEqual(pred["label"], "WaveJ")
                self.assertEqual(pred["source"], "ml_model")
                del_res = delete_custom_label("motion", "WaveJ")
                self.assertEqual(del_res["deleted"], 3)
        finally:
            shutil.rmtree(tmp)

    def test_student_progress_dashboard_db(self):
        # Record attempts
        self.assertEqual(
            self.client.post("/api/progress/", data=json.dumps({"language": "asl", "target_letter": "A", "predicted_letter": "A", "is_correct": True, "confidence": 0.92}), content_type="application/json").status_code,
            200,
        )
        self.assertEqual(
            self.client.post("/api/progress/", data=json.dumps({"language": "asl", "target_letter": "B", "predicted_letter": "SKIPPED", "is_correct": False, "confidence": 0.0}), content_type="application/json").status_code,
            200,
        )
        self.assertEqual(
            self.client.post("/api/progress/", data=json.dumps({"language": "asl", "target_letter": "B", "predicted_letter": "SKIPPED", "is_correct": False, "confidence": 0.0}), content_type="application/json").status_code,
            200,
        )

        r_stats = self.client.get("/api/progress/")
        self.assertEqual(r_stats.status_code, 200)
        stats = r_stats.json()
        self.assertEqual(stats["total"], 3)
        self.assertEqual(stats["correct"], 1)
        self.assertIn("B", stats["weak_letters"])
        self.assertNotIn("A", stats["weak_letters"])

        # Reset stats
        self.assertEqual(self.client.delete("/api/progress/").status_code, 200)
        self.assertEqual(self.client.get("/api/progress/").json()["total"], 0)

    def test_action_ml_training_and_hybrid_prediction(self):
        tmp = Path(tempfile.mkdtemp())
        try:
            tmp_csv = tmp / "actions.csv"
            tmp_model = tmp / "actions.joblib"
            h_water = [_synthetic_open_palm(spread=True, wrist_y=0.7)]
            h_bye = [_synthetic_beak_pinch()]
            with patch.dict("recognizer.custom_trainer.STATIC_CONFIG", {"actions": (tmp_csv, tmp_model, 130, False)}), \
                 patch("recognizer.action_predictor.ACTIONS_MODEL_PATH", tmp_model):
                from recognizer.action_predictor import invalidate_action_cache
                from recognizer.custom_trainer import add_custom_samples_and_train, delete_custom_label
                invalidate_action_cache()

                out1 = add_custom_samples_and_train("actions", "Water", [h_water, h_water, h_water])
                self.assertEqual(out1["added"], 3)
                out2 = add_custom_samples_and_train("actions", "Bye", [h_bye, h_bye, h_bye])
                self.assertEqual(sorted(out2["classes"]), ["Bye", "Water"])

                res_ml = predict_action(h_water)
                self.assertIsNotNone(res_ml)
                self.assertEqual(res_ml["action"], "Water")
                self.assertEqual(res_ml["source"], "ml_model")

                r_list = self.client.get("/api/actions/").json()
                self.assertTrue(r_list["ml_trained"])
                self.assertTrue(any(a["action"] == "Water" for a in r_list["actions"]))

                del_res = delete_custom_label("actions", "Water")
                self.assertEqual(del_res["deleted"], 3)
                invalidate_action_cache()
        finally:
            shutil.rmtree(tmp)

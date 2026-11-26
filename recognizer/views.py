import json
import logging
import math
import re
import threading
import time
from django.conf import settings
from django.db.models import Count, Q
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_POST, require_GET, require_http_methods
from .predictor import predict, get_model_classes
from .action_predictor import predict_action, get_action_classes, metadata_for_action
from .models import PracticeAttempt
from .grammar_translator import polish_gloss_to_english, translate_text
from .motion_engine import predict_motion, get_motion_classes
from .custom_trainer import add_custom_samples_and_train, delete_custom_label, get_trainer_status

logger = logging.getLogger(__name__)


def _parse_hands(raw_hands, allow_empty=False):
    """Validate and convert hand landmark payload to finite float triples."""
    if not isinstance(raw_hands, list):
        raise ValueError("'hands' must be a list")
    if len(raw_hands) == 0:
        if allow_empty:
            return []
        raise ValueError("Send 1-2 hands of 21 [x, y, z] points")
    if len(raw_hands) > 2:
        raise ValueError("At most 2 hands are supported")

    parsed = []
    for hand in raw_hands:
        if not isinstance(hand, list) or len(hand) != 21:
            raise ValueError("Each hand must contain exactly 21 landmarks")
        clean_hand = []
        for pt in hand:
            if not isinstance(pt, (list, tuple)) or len(pt) != 3:
                raise ValueError("Each landmark must have 3 coordinates [x, y, z]")
            vals = [float(v) for v in pt]
            if not all(math.isfinite(v) for v in vals):
                raise ValueError("Landmark coordinates must be finite numbers")
            clean_hand.append(vals)
        parsed.append(clean_hand)
    return parsed


def index(request):
    return render(request, "recognizer/index.html")


def actions_view(request):
    return render(request, "recognizer/actions.html")


@require_POST
def predict_view(request):
    try:
        data = json.loads(request.body)
        if not isinstance(data, dict):
            raise ValueError("JSON body must be an object")
        language = data.get("language", "asl")
        if language not in settings.MODEL_PATHS:
            raise ValueError("unknown language")
        hands = _parse_hands(data.get("hands"), allow_empty=False)
    except (json.JSONDecodeError, ValueError, KeyError, TypeError) as exc:
        return JsonResponse(
            {"error": f"Invalid input: {exc}. Send 'language' and 'hands': 1-2 hands of 21 finite [x, y, z] points."},
            status=400,
        )

    try:
        label, confidence, candidates = predict(language, hands)
    except FileNotFoundError:
        return JsonResponse(
            {"error": f"{language.upper()} model not trained yet. Run ml/train_model.py --language {language}."},
            status=503,
        )
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)
    except Exception:
        logger.exception("Unexpected error during sign prediction for language=%s", language)
        return JsonResponse({"error": "Prediction engine failure"}, status=500)

    return JsonResponse({
        "label": label,
        "confidence": confidence,
        "candidates": candidates,
    })


@require_POST
def predict_action_view(request):
    try:
        data = json.loads(request.body)
        if not isinstance(data, dict):
            raise ValueError("JSON body must be an object")
        hands = _parse_hands(data.get("hands", []), allow_empty=True)
        if not hands:
            return JsonResponse({"action": None, "detected": False})
    except (json.JSONDecodeError, ValueError, TypeError) as exc:
        return JsonResponse({"error": f"Invalid hands format: {exc}"}, status=400)

    try:
        result = predict_action(hands)
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)
    except Exception:
        logger.exception("Unexpected error during action prediction")
        return JsonResponse({"error": "Action prediction failure"}, status=500)

    if result:
        return JsonResponse({"detected": True, **result})
    return JsonResponse({"detected": False, "action": None})

@require_GET
def api_actions_list(request):
    actions = [
        {"action": "Hello / Hi", "phrase": "Hello! How are you?", "emoji": "👋", "category": "Greeting", "gesture": "Open palm waving with spread fingers"},
        {"action": "Thank You", "phrase": "Thank you so much!", "emoji": "🙏", "category": "Courtesy", "gesture": "Open flat hand extending forward from chin"},
        {"action": "I Love You", "phrase": "I love you!", "emoji": "🤟", "category": "Affection", "gesture": "Thumb, index, and pinky extended upright"},
        {"action": "Namaste / Welcome", "phrase": "Namaste! Welcome!", "emoji": "🪷", "category": "Greeting", "gesture": "Both palms pressed together in front of chest"},
        {"action": "Help / Emergency", "phrase": "Please help me!", "emoji": "🆘", "category": "Emergency", "gesture": "Thumbs-up resting on flat open palm"},
        {"action": "Yes / Affirmative", "phrase": "Yes, I agree!", "emoji": "✊", "category": "Response", "gesture": "Fist held in front with gentle nod"},
        {"action": "No", "phrase": "No, thank you.", "emoji": "🙅", "category": "Response", "gesture": "Index and middle tapping thumb like a beak"},
        {"action": "Good / Great", "phrase": "Very good, nice job!", "emoji": "👍", "category": "Feedback", "gesture": "Thumbs-up pointing straight upward"},
        {"action": "Bad / Dislike", "phrase": "No, that's not good.", "emoji": "👎", "category": "Feedback", "gesture": "Thumbs-down pointing downward"},
        {"action": "Peace / Victory", "phrase": "Peace and victory!", "emoji": "✌️", "category": "Social", "gesture": "Index and middle fingers in a spread V"},
        {"action": "Stop / Wait", "phrase": "Stop, please wait.", "emoji": "✋", "category": "Command", "gesture": "Flat palm facing camera with closed fingers"},
        {"action": "Call Me", "phrase": "Call me later.", "emoji": "🤙", "category": "Social", "gesture": "Thumb and pinky extended to ear (Shaka sign)"},
        {"action": "Please", "phrase": "Please, could you help?", "emoji": "🤲", "category": "Courtesy", "gesture": "Both palms open and cupped together"},
    ]
    ml_classes = get_action_classes()
    known = {a["action"] for a in actions}
    for cls in ml_classes:
        if cls not in known:
            meta = metadata_for_action(cls)
            actions.append({
                "action": cls,
                "phrase": meta["phrase"],
                "emoji": meta["emoji"],
                "category": meta["category"],
                "gesture": meta["description"],
                "ml_custom": True,
            })
    return JsonResponse({
        "actions": actions,
        "ml_trained": bool(ml_classes),
        "ml_classes": ml_classes,
    })

@require_GET
def api_info(request):
    """Returns metadata about models, classes, and supported languages."""
    info = {}
    for lang, path in settings.MODEL_PATHS.items():
        exists = path.exists()
        classes = []
        load_error = None
        if exists:
            try:
                classes = get_model_classes(lang)
            except Exception as exc:
                logger.warning("Failed to inspect model '%s' at %s: %s", lang, path, exc)
                load_error = str(exc)
        entry = {
            "name": "American Sign Language (ASL)" if lang == "asl" else "Indian Sign Language (ISL)",
            "type": "1-hand (63 features)" if lang == "asl" else "2-hands (130 features)",
            "available": exists and load_error is None,
            "classes": classes,
        }
        if load_error:
            entry["error"] = load_error
        info[lang] = entry
    return JsonResponse(info)


@require_GET
def api_dictionary(request):
    """Returns complete visual guidance, ISL/ASL dictionary entries, and chart poster links."""
    try:
        asl_supported = set(get_model_classes("asl"))
    except Exception as exc:
        logger.warning("Could not load ASL classes for dictionary: %s", exc)
        asl_supported = set()

    try:
        isl_supported = set(get_model_classes("isl"))
    except Exception as exc:
        logger.warning("Could not load ISL classes for dictionary: %s", exc)
        isl_supported = set()
    asl_letters = [
        {"letter": "A", "name": "Letter A", "category": "alphabet", "is_ai_supported": True, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/Sign_language_A.svg", "summary": "Fist with thumb vertical along the index finger.", "steps": ["Make a clenched fist.", "Keep thumb upright flat along index finger.", "Palm faces forward."], "tip": "Do not fold thumb over fingers."},
        {"letter": "B", "name": "Letter B", "category": "alphabet", "is_ai_supported": True, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/Sign_language_B.svg", "summary": "Flat open hand with four fingers upright together, thumb tucked.", "steps": ["Extend 4 fingers straight up touching.", "Fold thumb flat across palm.", "Palm faces forward."], "tip": "Keep all 4 fingers touching closely."},
        {"letter": "C", "name": "Letter C", "category": "alphabet", "is_ai_supported": True, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/Sign_language_C.svg", "summary": "Curved fingers and thumb forming a 'C' arc shape.", "steps": ["Curve 4 fingers in upper arch.", "Curve thumb in opposing lower arch.", "Tilt slightly sideways to show C curve."], "tip": "Imagine gripping a baseball."},
        {"letter": "D", "name": "Letter D", "category": "alphabet", "is_ai_supported": True, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/Sign_language_D.svg", "summary": "Index finger pointing up, thumb touching middle, ring, pinky tips.", "steps": ["Extend index finger straight up.", "Touch tips of middle, ring, pinky to thumb tip.", "Forms a loop under the upright index."], "tip": "Only index finger points up."},
        {"letter": "E", "name": "Letter E", "category": "alphabet", "is_ai_supported": True, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/Sign_language_E.svg", "summary": "All fingers tightly curled with tips resting on the tucked thumb.", "steps": ["Curl all 4 fingers downward.", "Tuck thumb horizontally under fingertips.", "Fingertips rest against edge of thumb."], "tip": "Keep knuckles facing camera."},
        {"letter": "F", "name": "Letter F", "category": "alphabet", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/Sign_language_F.svg", "summary": "Thumb and index finger touch forming an 'O', other 3 fingers up.", "steps": ["Touch index to thumb in circle.", "Keep remaining 3 fingers straight up.", "Resembles the 'OK' hand gesture."], "tip": "Keep the three upper fingers upright."},
        {"letter": "G", "name": "Letter G", "category": "alphabet", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/Sign_language_G.svg", "summary": "Index finger and thumb pointing horizontally forward parallel.", "steps": ["Extend index and thumb to the side.", "Keep them parallel.", "Other fingers curled into palm."], "tip": "Looks like measuring coin thickness."},
        {"letter": "H", "name": "Letter H", "category": "alphabet", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/Sign_language_H.svg", "summary": "Index and middle fingers extended horizontally together.", "steps": ["Extend index and middle together.", "Keep them touching.", "Point horizontally across body."], "tip": "Hold fingers horizontal."},
        {"letter": "I", "name": "Letter I", "category": "alphabet", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/Sign_language_I.svg", "summary": "Make a fist with only the pinky finger pointing straight up.", "steps": ["Clench hand into a fist.", "Extend only the pinky finger straight up.", "Thumb rests over other fingers."], "tip": "Keep only pinky raised."},
        {"letter": "J", "name": "Letter J", "category": "alphabet", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/Sign_language_J.svg", "summary": "Pinky finger pointing up, then tracing the curve of a 'J'.", "steps": ["Start with 'I' handshape.", "Trace the bottom curve of a 'J' with pinky.", "Twist wrist inward."], "tip": "Dynamic gesture with pinky."},
        {"letter": "K", "name": "Letter K", "category": "alphabet", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/Sign_language_K.svg", "summary": "Index pointing up, middle finger forward, thumb between them.", "steps": ["Extend index up, middle forward.", "Rest thumb between them.", "Forms a 'V' with thumb inside."], "tip": "Keep knuckles facing front."},
        {"letter": "L", "name": "Letter L", "category": "alphabet", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/Sign_language_L.svg", "summary": "Thumb and index finger extended at right angles forming an 'L'.", "steps": ["Point index finger up.", "Extend thumb outward at 90 degrees.", "Other 3 fingers curled into palm."], "tip": "Forms a capital 'L'."},
        {"letter": "M", "name": "Letter M", "category": "alphabet", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/Sign_language_M.svg", "summary": "Thumb tucked under the first three curled fingers.", "steps": ["Fold thumb across palm.", "Curl index, middle, ring over thumb.", "Pinky curls next to ring finger."], "tip": "Three finger bumps show over thumb."},
        {"letter": "N", "name": "Letter N", "category": "alphabet", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/Sign_language_N.svg", "summary": "Thumb tucked under the first two curled fingers.", "steps": ["Fold thumb across palm.", "Curl index and middle over thumb.", "Ring and pinky curl beside."], "tip": "Two finger bumps show over thumb."},
        {"letter": "O", "name": "Letter O", "category": "alphabet", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/Sign_language_O.svg", "summary": "All fingertips touch the thumb tip to form an 'O' ring.", "steps": ["Curve all fingers.", "Touch all tips to thumb tip.", "Forms complete hollow circle."], "tip": "All fingertips touch thumb."},
        {"letter": "P", "name": "Letter P", "category": "alphabet", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/Sign_language_P.svg", "summary": "Downward pointing 'K': index horizontal, middle finger down.", "steps": ["Form 'K' handshape.", "Point index horizontal, middle straight down.", "Thumb rests on middle knuckle."], "tip": "Think of upside-down 'K'."},
        {"letter": "Q", "name": "Letter Q", "category": "alphabet", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/Sign_language_Q.svg", "summary": "Downward pointing 'G': index and thumb pointing down.", "steps": ["Form 'G' handshape.", "Point index and thumb straight down.", "Other fingers stay curled."], "tip": "Pencil-grip pointing down."},
        {"letter": "R", "name": "Letter R", "category": "alphabet", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/Sign_language_R.svg", "summary": "Index and middle fingers extended and crossed over each other.", "steps": ["Extend index and middle straight up.", "Cross middle over index in front.", "Thumb folds over curled fingers."], "tip": "Fingers crossed for good luck."},
        {"letter": "S", "name": "Letter S", "category": "alphabet", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/Sign_language_S.svg", "summary": "Fist with thumb folded across the front of the curled fingers.", "steps": ["Form tight fist.", "Wrap thumb horizontally across front.", "Palm faces forward."], "tip": "Thumb crosses across the front."},
        {"letter": "T", "name": "Letter T", "category": "alphabet", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/Sign_language_T.svg", "summary": "Thumb tucked under the index finger, peeking between index & middle.", "steps": ["Place thumb between index and middle.", "Curl index over thumb.", "Other fingers in a fist."], "tip": "Only one finger over thumb."},
        {"letter": "U", "name": "Letter U", "category": "alphabet", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/Sign_language_U.svg", "summary": "Index and middle fingers extended straight up touching together.", "steps": ["Extend index and middle up.", "Press them together with no gap.", "Thumb over ring and pinky."], "tip": "Keep the two upright fingers closed."},
        {"letter": "V", "name": "Letter V", "category": "alphabet", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/Sign_language_V.svg", "summary": "Index and middle fingers extended spread apart in a 'V' shape.", "steps": ["Extend index and middle up.", "Spread them in 'V' shape.", "Thumb folds over curled fingers."], "tip": "Classic peace sign."},
        {"letter": "W", "name": "Letter W", "category": "alphabet", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/Sign_language_W.svg", "summary": "Index, middle, and ring fingers extended upward in a 'W'.", "steps": ["Extend index, middle, ring up.", "Spread them evenly.", "Thumb touches curled pinky."], "tip": "Three fingers form 'W'."},
        {"letter": "X", "name": "Letter X", "category": "alphabet", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/Sign_language_X.svg", "summary": "Index finger curled into a hook, other fingers in a fist.", "steps": ["Form a fist.", "Raise index and bend into hook.", "Thumb rests on middle finger."], "tip": "Looks like Captain Hook."},
        {"letter": "Y", "name": "Letter Y", "category": "alphabet", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/Sign_language_Y.svg", "summary": "Thumb and pinky extended outward, middle 3 fingers curled down.", "steps": ["Extend thumb to one side.", "Extend pinky to opposing side.", "Curl middle 3 fingers into palm."], "tip": "Shaka / Hang loose sign."},
        {"letter": "Z", "name": "Letter Z", "category": "alphabet", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/Sign_language_Z.svg", "summary": "Index finger extended and tracing the letter 'Z' in the air.", "steps": ["Extend index finger forward.", "Trace 'Z' path in the air.", "Other fingers stay curled in fist."], "tip": "Trace the letter Z in space."}
    ]

    isl_signs = [
        {"letter": "A", "name": "Letter A (ISL)", "category": "isl", "is_ai_supported": True, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/BSL_letter_A.svg", "local_fallback": "/static/recognizer/img/signs/isl_a.svg", "summary": "Touch tips of both index fingers together forming an apex / roof.", "steps": ["Raise both hands in front of chest.", "Extend index fingers toward each other.", "Touch index tips together forming a roof peak."], "tip": "Keep both hands clearly in frame."},
        {"letter": "B", "name": "Letter B (ISL)", "category": "isl", "is_ai_supported": True, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/BSL_letter_B.svg", "local_fallback": "/static/recognizer/img/signs/isl_b.svg", "summary": "Form two touching loops with index & thumbs placed side by side.", "steps": ["Form loops with index and thumb on both hands.", "Bring both circular loops together side-by-side.", "Mimics the two rounded lobes of 'B'."], "tip": "Keep both loops level."},
        {"letter": "C", "name": "Letter C (ISL)", "category": "isl", "is_ai_supported": True, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/BSL_letter_C.svg", "local_fallback": "/static/recognizer/img/signs/isl_c.svg", "summary": "Dominant hand curves as 'C' while secondary hand supports the base.", "steps": ["Curve dominant hand into strong open 'C'.", "Secondary hand placed flat underneath supporting.", "Hold steady toward camera."], "tip": "Both hands active."},
        {"letter": "D", "name": "Letter D (ISL)", "category": "isl", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/BSL_letter_D.svg", "local_fallback": "/static/recognizer/img/signs/isl_d.svg", "summary": "Left index vertical, right index and thumb curve to form loop of 'D'.", "steps": ["Hold left index finger straight up.", "Curve right thumb and index into half-circle.", "Touch right tips to top and base of left index."], "tip": "Forms clear letter 'D' profile."},
        {"letter": "E", "name": "Letter E (ISL)", "category": "isl", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/BSL_letter_E.svg", "local_fallback": "/static/recognizer/img/signs/isl_e.svg", "summary": "Right index finger points to left index fingertip (2nd vowel rule).", "steps": ["Hold left hand open facing you.", "Point right index to left index fingertip.", "Vowel rule: Thumb=A, Index=E, Middle=I, Ring=O, Pinky=U."], "tip": "Index finger corresponds to letter E."},
        {"letter": "F", "name": "Letter F (ISL)", "category": "isl", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/BSL_letter_F.svg", "local_fallback": "/static/recognizer/img/signs/isl_f.svg", "summary": "Two index fingers crossed at right angles like a plus symbol.", "steps": ["Hold left index horizontally.", "Lay right index perpendicularly across it.", "Forms a clean '+' cross shape."], "tip": "Keep fingers perpendicular."},
        {"letter": "G", "name": "Letter G (ISL)", "category": "isl", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/BSL_letter_G.svg", "local_fallback": "/static/recognizer/img/signs/isl_g.svg", "summary": "Both hands in fists, right fist placed directly on top of left fist.", "steps": ["Form fists with both hands.", "Place right fist on top of left fist.", "Hold stacked fists steady in chest view."], "tip": "Resembles grinding or stacking."},
        {"letter": "H", "name": "Letter H (ISL)", "category": "isl", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/BSL_letter_H.svg", "local_fallback": "/static/recognizer/img/signs/isl_h.svg", "summary": "Right flat fingers stroke horizontally across flat left palm.", "steps": ["Hold left palm flat facing upward.", "Wipe right flat fingers across left palm from wrist to tips.", "Clean sweeping motion across palm."], "tip": "Smooth horizontal stroke."},
        {"letter": "I", "name": "Letter I (ISL)", "category": "isl", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/BSL_letter_I.svg", "local_fallback": "/static/recognizer/img/signs/isl_i.svg", "summary": "Right index finger points to left middle fingertip (3rd vowel rule).", "steps": ["Hold left hand open upright.", "Touch right index tip to tip of left middle finger.", "Middle finger corresponds to vowel 'I'."], "tip": "3rd digit indicates I."},
        {"letter": "J", "name": "Letter J (ISL)", "category": "isl", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/BSL_letter_J.svg", "local_fallback": "/static/recognizer/img/signs/isl_j.svg", "summary": "Right index finger traces the letter 'J' on the open left palm.", "steps": ["Hold left palm flat and open.", "Use right index finger like a pen.", "Draw the downward hook path of 'J' on left palm."], "tip": "Trace from middle to bottom hook."},
        {"letter": "K", "name": "Letter K (ISL)", "category": "isl", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/BSL_letter_K.svg", "local_fallback": "/static/recognizer/img/signs/isl_k.svg", "summary": "Left index held vertical, right bent index touches middle of left index.", "steps": ["Left index straight up.", "Bend right index into a hook / knuckle.", "Touch right bent joint to middle of left index."], "tip": "Resembles the branch of 'K'."},
        {"letter": "L", "name": "Letter L (ISL)", "category": "isl", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/BSL_letter_L.svg", "local_fallback": "/static/recognizer/img/signs/isl_l.svg", "summary": "Right index finger placed across open left palm forming an 'L'.", "steps": ["Open left palm flat.", "Place extended right index across the base.", "Forms a right angle letter 'L'."], "tip": "Clear 90-degree corner."},
        {"letter": "M", "name": "Letter M (ISL)", "category": "isl", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/BSL_letter_M.svg", "local_fallback": "/static/recognizer/img/signs/isl_m.svg", "summary": "Three right fingers (index, middle, ring) rest across open left palm.", "steps": ["Open left palm flat facing up.", "Lay right 3 fingers across left palm.", "The three fingers symbolize 'M'."], "tip": "Three fingers across palm."},
        {"letter": "N", "name": "Letter N (ISL)", "category": "isl", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/BSL_letter_N.svg", "local_fallback": "/static/recognizer/img/signs/isl_n.svg", "summary": "Two right fingers (index, middle) rest across open left palm.", "steps": ["Open left palm flat facing up.", "Lay right 2 fingers across left palm.", "The two fingers symbolize 'N'."], "tip": "Two fingers across palm."},
        {"letter": "O", "name": "Letter O (ISL)", "category": "isl", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/BSL_letter_O.svg", "local_fallback": "/static/recognizer/img/signs/isl_o.svg", "summary": "Right index finger points to left ring fingertip (4th vowel rule).", "steps": ["Hold left hand open upright.", "Touch right index to tip of left ring finger.", "Ring finger corresponds to vowel 'O'."], "tip": "4th digit indicates O."},
        {"letter": "P", "name": "Letter P (ISL)", "category": "isl", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/BSL_letter_P.svg", "local_fallback": "/static/recognizer/img/signs/isl_p.svg", "summary": "Left index vertical, right index-thumb loop touches top of left index.", "steps": ["Hold left index upright.", "Form small circle with right index and thumb.", "Touch circle to tip of left index finger."], "tip": "Forms 'P' outline on stem."},
        {"letter": "Q", "name": "Letter Q (ISL)", "category": "isl", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/BSL_letter_Q.svg", "local_fallback": "/static/recognizer/img/signs/isl_q.svg", "summary": "Left circle (index+thumb) with right index finger hooked inside.", "steps": ["Form circle with left thumb and index.", "Hook right index finger into the bottom of circle.", "Forms the tail loop of 'Q'."], "tip": "Hook mimics tail of Q."},
        {"letter": "R", "name": "Letter R (ISL)", "category": "isl", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/BSL_letter_R.svg", "local_fallback": "/static/recognizer/img/signs/isl_r.svg", "summary": "Right crossed index and middle fingers touch flat left palm.", "steps": ["Cross right index and middle fingers.", "Rest fingertips of crossed fingers on open left palm.", "Symbolizes 'R' loop and leg."], "tip": "Crossed fingers on palm."},
        {"letter": "S", "name": "Letter S (ISL)", "category": "isl", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/BSL_letter_S.svg", "local_fallback": "/static/recognizer/img/signs/isl_s.svg", "summary": "Both pinky fingers interlocked tightly together.", "steps": ["Extend both pinky fingers.", "Hook left and right pinky fingers together.", "Pull slightly to form tight interlock."], "tip": "Pinky finger handshake."},
        {"letter": "T", "name": "Letter T (ISL)", "category": "isl", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/BSL_letter_T.svg", "local_fallback": "/static/recognizer/img/signs/isl_t.svg", "summary": "Right index finger touches the side of upright left index finger.", "steps": ["Hold left index finger pointing up.", "Touch tip of right index finger to side of left index near base.", "Forms a 'T' junction."], "tip": "Perpendicular 'T' shape."},
        {"letter": "U", "name": "Letter U (ISL)", "category": "isl", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/BSL_letter_U.svg", "local_fallback": "/static/recognizer/img/signs/isl_u.svg", "summary": "Right index finger points to left pinky fingertip (5th vowel rule).", "steps": ["Hold left hand open upright.", "Touch right index to tip of left pinky finger.", "Pinky finger corresponds to vowel 'U'."], "tip": "5th digit indicates U."},
        {"letter": "V", "name": "Letter V (ISL)", "category": "isl", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/BSL_letter_V.svg", "local_fallback": "/static/recognizer/img/signs/isl_v.svg", "summary": "Right index and middle fingers in 'V' shape resting on open left palm.", "steps": ["Open left palm facing up.", "Make peace/V shape with right hand.", "Rest fingertips of V onto left palm."], "tip": "'V' placed onto palm."},
        {"letter": "W", "name": "Letter W (ISL)", "category": "isl", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/BSL_letter_W.svg", "local_fallback": "/static/recognizer/img/signs/isl_w.svg", "summary": "Both hands with fingers spread and interlaced pointing upward.", "steps": ["Spread fingers on both hands.", "Interlock fingers together pointing up.", "Crown / interlaced 'W' shape."], "tip": "Intertwined upright fingers."},
        {"letter": "X", "name": "Letter X (ISL)", "category": "isl", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/BSL_letter_X.svg", "local_fallback": "/static/recognizer/img/signs/isl_x.svg", "summary": "Both index fingers crossed forming an 'X' shape in front of chest.", "steps": ["Extend index fingers on both hands.", "Cross index fingers in the center.", "Clear diagonal 'X' cross."], "tip": "Crossed indices."},
        {"letter": "Y", "name": "Letter Y (ISL)", "category": "isl", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/BSL_letter_Y.svg", "local_fallback": "/static/recognizer/img/signs/isl_y.svg", "summary": "Right thumb and index spread in 'Y' resting on left wrist.", "steps": ["Spread right thumb and index into 'V/Y'.", "Rest web of right thumb against left wrist.", "Forms a 'Y' branch on forearm."], "tip": "Branch on wrist."},
        {"letter": "Z", "name": "Letter Z (ISL)", "category": "isl", "is_ai_supported": False, "image_url": "https://commons.wikimedia.org/wiki/Special:FilePath/BSL_letter_Z.svg", "local_fallback": "/static/recognizer/img/signs/isl_z.svg", "summary": "Right index finger traces a 'Z' shape across the open left palm.", "steps": ["Open left palm flat.", "Trace horizontal right, diagonal left, horizontal right with right index.", "Z stroke across palm surface."], "tip": "Trace Z onto palm."}
    ]

    for entry in asl_letters:
        entry["is_ai_supported"] = entry["letter"] in asl_supported
        entry["local_fallback"] = f"/static/recognizer/img/signs/asl_{entry['letter'].lower()}.svg"
    for entry in isl_signs:
        entry["is_ai_supported"] = entry["letter"] in isl_supported

    numbers = [
        {"digit": str(i), "name": f"Number {i}", "image_url": f"https://commons.wikimedia.org/wiki/Special:FilePath/Sign_language_{i}.svg"}
        for i in range(10)
    ]

    return JsonResponse({
        "asl": asl_letters,
        "isl": isl_signs,
        "numbers": numbers,
        "asl_chart_url": "https://commons.wikimedia.org/wiki/Special:FilePath/Asl_alphabet_gallaudet.svg",
        "isl_chart_url": "/static/recognizer/img/signs/isl_alphabet_chart.svg",
        "isl_chart_online_url": "https://commons.wikimedia.org/wiki/Special:FilePath/British_Sign_Language_chart.png",
        "isl_gov_chart_url": "https://static.vikaspedia.in/mediastorage/image/alphabets_in_isl.png",
        "chart_url": "https://commons.wikimedia.org/wiki/Special:FilePath/Asl_alphabet_gallaudet.svg",
    })


# ---- Remote Mobile Camera Session Store ----
_REMOTE_SESSIONS = {}
_REMOTE_LOCK = threading.Lock()
_VALID_SESSION_RE = re.compile(r"^[A-Za-z0-9_-]{4,32}$")
_REMOTE_TTL_SECONDS = 3600
_REMOTE_HEARTBEAT_TIMEOUT = 8.0


def _cleanup_remote_sessions(now):
    stale = [k for k, v in _REMOTE_SESSIONS.items() if now - v.get("created_at", now) > _REMOTE_TTL_SECONDS]
    for k in stale:
        _REMOTE_SESSIONS.pop(k, None)
    while len(_REMOTE_SESSIONS) > 100:
        oldest = min(_REMOTE_SESSIONS, key=lambda k: _REMOTE_SESSIONS[k].get("last_seen", 0))
        _REMOTE_SESSIONS.pop(oldest, None)


def _get_or_create_session(session_id):
    now = time.time()
    _cleanup_remote_sessions(now)
    sess = _REMOTE_SESSIONS.get(session_id)
    if sess is None:
        sess = {
            "created_at": now,
            "last_seen": 0.0,
            "language": "asl",
            "hand_count": 0,
            "needs_two_hands": False,
            "label": None,
            "confidence": 0.0,
            "candidates": [],
            "seq": 0,
        }
        _REMOTE_SESSIONS[session_id] = sess
    return sess


def mobile_camera_view(request, session_id):
    """Lightweight camera-only page for phone QR scanning."""
    if not _VALID_SESSION_RE.match(session_id):
        return JsonResponse({"error": "Invalid session ID"}, status=400)
    with _REMOTE_LOCK:
        _get_or_create_session(session_id)
    return render(request, "recognizer/mobile_camera.html", {"session_id": session_id})


@require_POST
def api_remote_push(request, session_id):
    """Receive hand landmarks from mobile camera, run prediction, and store for laptop."""
    if not _VALID_SESSION_RE.match(session_id):
        return JsonResponse({"error": "Invalid session ID"}, status=400)

    try:
        data = json.loads(request.body)
        if not isinstance(data, dict):
            raise ValueError("JSON body must be an object")
        hands = _parse_hands(data.get("hands", []), allow_empty=True)
    except (json.JSONDecodeError, ValueError, TypeError) as exc:
        return JsonResponse({"error": f"Invalid input: {exc}"}, status=400)

    with _REMOTE_LOCK:
        sess = _get_or_create_session(session_id)
        language = sess["language"]

    label = None
    confidence = 0.0
    candidates = []
    needs_two_hands = False

    if len(hands) > 0:
        if language == "isl" and len(hands) < 2:
            needs_two_hands = True
        else:
            use_hands = hands if language == "isl" else [hands[0]]
            try:
                label, confidence, candidates = predict(language, use_hands)
            except FileNotFoundError:
                return JsonResponse({"error": f"{language.upper()} model not trained yet."}, status=503)
            except ValueError as exc:
                return JsonResponse({"error": str(exc)}, status=400)
            except Exception:
                logger.exception("Remote prediction error for session=%s", session_id)
                return JsonResponse({"error": "Prediction engine failure"}, status=500)

    now = time.time()
    with _REMOTE_LOCK:
        sess = _get_or_create_session(session_id)
        sess["last_seen"] = now
        sess["hand_count"] = len(hands)
        sess["needs_two_hands"] = needs_two_hands
        sess["label"] = label
        sess["confidence"] = confidence
        sess["candidates"] = candidates
        sess["seq"] += 1

    return JsonResponse({
        "ok": True,
        "language": language,
        "label": label,
        "confidence": confidence,
        "needs_two_hands": needs_two_hands,
    })


@require_GET
def api_remote_poll(request, session_id):
    """Laptop polls latest mobile prediction and syncs selected language."""
    if not _VALID_SESSION_RE.match(session_id):
        return JsonResponse({"error": "Invalid session ID"}, status=400)

    if request.GET.get("disconnect") == "1":
        with _REMOTE_LOCK:
            _REMOTE_SESSIONS.pop(session_id, None)
        return JsonResponse({"connected": False})

    lang = request.GET.get("lang")
    now = time.time()
    with _REMOTE_LOCK:
        sess = _get_or_create_session(session_id)
        if lang in settings.MODEL_PATHS:
            sess["language"] = lang
        connected = (now - sess["last_seen"]) <= _REMOTE_HEARTBEAT_TIMEOUT
        payload = {
            "connected": connected,
            "seq": sess["seq"],
            "language": sess["language"],
            "hand_count": sess["hand_count"],
            "needs_two_hands": sess["needs_two_hands"],
            "label": sess["label"],
            "confidence": sess["confidence"],
            "candidates": sess["candidates"],
        }
    return JsonResponse(payload)


# ---- AI Grammar Polish + Hindi Translation ----
@require_POST
def api_polish_translate(request):
    try:
        data = json.loads(request.body)
        if not isinstance(data, dict):
            raise ValueError("JSON body must be an object")
        raw_text = str(data.get("text", "")).strip()
        if not raw_text:
            return JsonResponse({"error": "Text is empty"}, status=400)
        do_polish = bool(data.get("polish", True))
        target_lang = str(data.get("target_lang", "hi")).strip().lower() or "hi"
        if target_lang not in {"hi", "en", "es", "fr", "de"}:
            target_lang = "hi"
    except (json.JSONDecodeError, ValueError, TypeError) as exc:
        return JsonResponse({"error": f"Invalid input: {exc}"}, status=400)

    polished = polish_gloss_to_english(raw_text) if do_polish else raw_text
    tr = translate_text(polished, target_lang=target_lang)
    return JsonResponse({
        "raw": raw_text,
        "polished": polished,
        "translated": tr["translated"],
        "source": tr["source"],
        "target_lang": target_lang,
    })


# ---- Dynamic Motion Sequence Prediction (J, Z & Custom Words) ----
@require_POST
def api_predict_motion(request):
    try:
        data = json.loads(request.body)
        if not isinstance(data, dict):
            raise ValueError("JSON body must be an object")
        raw_seq = data.get("sequence")
        if not isinstance(raw_seq, list) or len(raw_seq) < 8 or len(raw_seq) > 90:
            raise ValueError("'sequence' must contain 8-90 hand frames")
        parsed_seq = []
        for frame in raw_seq:
            parsed_frame = _parse_hands([frame], allow_empty=False)[0]
            parsed_seq.append(parsed_frame)
    except (json.JSONDecodeError, ValueError, TypeError) as exc:
        return JsonResponse({"error": f"Invalid motion sequence: {exc}"}, status=400)

    try:
        res = predict_motion(parsed_seq)
    except ValueError as exc:
        return JsonResponse({"error": str(exc)}, status=400)
    except Exception:
        logger.exception("Motion prediction failure")
        return JsonResponse({"error": "Motion prediction failure"}, status=500)

    return JsonResponse({
        "detected": bool(res.get("label")),
        "motion_classes": get_motion_classes(),
        **res,
    })


# ---- Browser Custom Sign Trainer (Static + Motion) ----
@require_http_methods(["GET", "POST"])
def api_trainer(request):
    if request.method == "GET":
        try:
            return JsonResponse(get_trainer_status())
        except Exception:
            logger.exception("Failed to read trainer status")
            return JsonResponse({"error": "Could not inspect datasets"}, status=500)

    try:
        data = json.loads(request.body)
        if not isinstance(data, dict):
            raise ValueError("JSON body must be an object")
        action = data.get("action", "train")
        mode = str(data.get("mode", "asl")).lower()
        label = str(data.get("label", ""))

        if action == "delete":
            result = delete_custom_label(mode, label)
            return JsonResponse({"ok": True, **result})

        raw_samples = data.get("samples", [])
        if not isinstance(raw_samples, list) or len(raw_samples) < 3 or len(raw_samples) > 300:
            raise ValueError("Send 3-300 captured samples")

        validated = []
        if mode == "motion":
            for seq in raw_samples:
                if not isinstance(seq, list) or len(seq) < 8 or len(seq) > 90:
                    raise ValueError("Each motion sample must have 8-90 frames")
                validated.append([_parse_hands([frame], allow_empty=False)[0] for frame in seq])
        elif mode == "isl":
            for sample in raw_samples:
                hands = _parse_hands(sample, allow_empty=False)
                if len(hands) != 2:
                    raise ValueError("ISL samples require 2 hands per frame")
                validated.append(hands)
        elif mode == "actions":
            for sample in raw_samples:
                wrapped = sample if (isinstance(sample, list) and len(sample) in (1, 2) and isinstance(sample[0], list) and len(sample[0]) == 21) else [sample]
                validated.append(_parse_hands(wrapped, allow_empty=False))
        elif mode == "asl":
            for sample in raw_samples:
                wrapped = sample if (isinstance(sample, list) and len(sample) in (1, 2) and isinstance(sample[0], list) and len(sample[0]) == 21) else [sample]
                hands = _parse_hands(wrapped, allow_empty=False)
                validated.append(hands[0])
        else:
            raise ValueError("Unknown training mode")

        person = str(data.get("person", "web_user"))[:32] or "web_user"
        result = add_custom_samples_and_train(mode, label, validated, person=person)
        return JsonResponse({"ok": True, **result})
    except (json.JSONDecodeError, ValueError, TypeError) as exc:
        return JsonResponse({"error": str(exc)}, status=400)
    except Exception:
        logger.exception("Custom trainer failure")
        return JsonResponse({"error": "Custom sign training failed"}, status=500)


# ---- Student Practice Progress Dashboard (SQLite DB) ----
@require_http_methods(["GET", "POST", "DELETE"])
def api_progress(request):
    if request.method == "POST":
        try:
            data = json.loads(request.body)
            if not isinstance(data, dict):
                raise ValueError("JSON body must be an object")
            lang = str(data.get("language", "asl")).lower()
            if lang not in ("asl", "isl"):
                lang = "asl"
            target = str(data.get("target_letter", "")).strip()[:24]
            if not target:
                raise ValueError("target_letter is required")
            predicted = str(data.get("predicted_letter", "")).strip()[:24]
            is_correct = bool(data.get("is_correct", False))
            conf = float(data.get("confidence", 0.0))
            if not math.isfinite(conf):
                conf = 0.0
            conf = max(0.0, min(1.0, conf))
        except (json.JSONDecodeError, ValueError, TypeError) as exc:
            return JsonResponse({"error": f"Invalid progress payload: {exc}"}, status=400)

        PracticeAttempt.objects.create(
            language=lang,
            target_letter=target,
            predicted_letter=predicted,
            is_correct=is_correct,
            confidence=conf,
        )
        return JsonResponse({"ok": True})

    if request.method == "DELETE":
        PracticeAttempt.objects.all().delete()
        return JsonResponse({"ok": True})

    total = PracticeAttempt.objects.count()
    correct = PracticeAttempt.objects.filter(is_correct=True).count()
    accuracy = round((correct / total) * 100, 1) if total > 0 else 100.0

    per_letter_qs = (
        PracticeAttempt.objects.values("target_letter")
        .annotate(
            attempts=Count("id"),
            hits=Count("id", filter=Q(is_correct=True)),
        )
        .order_by("target_letter")
    )
    breakdown = []
    weak_letters = []
    for row in per_letter_qs:
        acc = round((row["hits"] / row["attempts"]) * 100) if row["attempts"] > 0 else 0
        entry = {
            "letter": row["target_letter"],
            "attempts": row["attempts"],
            "correct": row["hits"],
            "accuracy": acc,
        }
        breakdown.append(entry)
        if acc < 75:
            weak_letters.append(entry["letter"])

    recent = [
        {
            "language": item.language,
            "target": item.target_letter,
            "is_correct": item.is_correct,
            "confidence": round(item.confidence * 100),
            "time": item.created_at.strftime("%H:%M"),
        }
        for item in PracticeAttempt.objects.all()[:8]
    ]

    return JsonResponse({
        "total": total,
        "correct": correct,
        "accuracy": accuracy,
        "weak_letters": weak_letters,
        "breakdown": breakdown,
        "recent": recent,
    })

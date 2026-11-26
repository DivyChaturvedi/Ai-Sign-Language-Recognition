"""
Action & Phrase Recognition Engine for Sign Language.
Classifies multi-finger and multi-hand gestures into meaningful spoken phrases and actions:
Hello, Thank You, I Love You, Yes, No, Help, Namaste, Good, Bad, Stop, Call Me, Please, My Name Is.
"""

import math

def dist3d(p1, p2):
    return math.sqrt((p1[0] - p2[0])**2 + (p1[1] - p2[1])**2 + (p1[2] - p2[2])**2)

def analyze_hand(hand):
    """
    hand: list of 21 [x, y, z] points.
    Returns geometric metrics and finger states.
    """
    wrist = hand[0]
    thumb_cmc, thumb_mcp, thumb_ip, thumb_tip = hand[1], hand[2], hand[3], hand[4]
    index_mcp, index_pip, index_dip, index_tip = hand[5], hand[6], hand[7], hand[8]
    mid_mcp, mid_pip, mid_dip, mid_tip = hand[9], hand[10], hand[11], hand[12]
    ring_mcp, ring_pip, ring_dip, ring_tip = hand[13], hand[14], hand[15], hand[16]
    pinky_mcp, pinky_pip, pinky_dip, pinky_tip = hand[17], hand[18], hand[19], hand[20]

    # Hand scale: distance between wrist and middle MCP
    hand_size = max(dist3d(wrist, mid_mcp), 0.001)

    # Finger extensions: compare distance from wrist to tip vs wrist to pip
    index_ext = dist3d(wrist, index_tip) > dist3d(wrist, index_pip) * 1.14
    mid_ext = dist3d(wrist, mid_tip) > dist3d(wrist, mid_pip) * 1.14
    ring_ext = dist3d(wrist, ring_tip) > dist3d(wrist, ring_pip) * 1.14
    pinky_ext = dist3d(wrist, pinky_tip) > dist3d(wrist, pinky_pip) * 1.14

    # Thumb extension: tip distance from pinky/index MCP and wrist
    thumb_dist_pinky = dist3d(thumb_tip, pinky_mcp) / hand_size
    thumb_dist_idx_mcp = dist3d(thumb_tip, index_mcp) / hand_size
    thumb_ext = (
        (dist3d(wrist, thumb_tip) > dist3d(wrist, thumb_ip) * 1.05 and thumb_dist_pinky > 0.62)
        or thumb_dist_idx_mcp > 0.65
    )

    # Finger spread / gaps
    spread_idx_mid = dist3d(index_tip, mid_tip) / hand_size
    spread_mid_rng = dist3d(mid_tip, ring_tip) / hand_size
    spread_rng_pnk = dist3d(ring_tip, pinky_tip) / hand_size

    # Pinch metrics
    pinch_thumb_idx = dist3d(thumb_tip, index_tip) / hand_size
    pinch_thumb_mid = dist3d(thumb_tip, mid_tip) / hand_size

    return {
        "wrist": wrist,
        "hand_size": hand_size,
        "thumb_mcp": thumb_mcp,
        "index_mcp": index_mcp,
        "mid_mcp": mid_mcp,
        "thumb_tip": thumb_tip,
        "index_tip": index_tip,
        "mid_tip": mid_tip,
        "ring_tip": ring_tip,
        "pinky_tip": pinky_tip,
        "thumb_ext": thumb_ext,
        "index_ext": index_ext,
        "mid_ext": mid_ext,
        "ring_ext": ring_ext,
        "pinky_ext": pinky_ext,
        "num_extended": sum([index_ext, mid_ext, ring_ext, pinky_ext]),
        "spread_idx_mid": spread_idx_mid,
        "spread_mid_rng": spread_mid_rng,
        "spread_rng_pnk": spread_rng_pnk,
        "pinch_thumb_idx": pinch_thumb_idx,
        "pinch_thumb_mid": pinch_thumb_mid,
    }

def predict_action(hands):
    """
    hands: list of 1 or 2 hands. Each hand is 21 [x, y, z] points.
    Returns dict:
      {
         "action": str,
         "phrase": str,
         "emoji": str,
         "confidence": float,
         "category": str,
         "description": str
      }
    """
    if not hands or len(hands) == 0:
        return None
    if any(len(h) != 21 or any(len(p) != 3 for p in h) for h in hands[:2]):
        raise ValueError("Each hand must contain 21 [x, y, z] landmarks")

    h1 = analyze_hand(hands[0])
    h2 = analyze_hand(hands[1]) if len(hands) > 1 else None

    # ---- 1. Check Two-Handed Gestures (if 2 hands present) ----
    if h2:
        # Distance between wrists and between fingertips
        wrist_dist = dist3d(h1["wrist"], h2["wrist"]) / max(h1["hand_size"], h2["hand_size"])
        tip_dist = dist3d(h1["mid_tip"], h2["mid_tip"]) / max(h1["hand_size"], h2["hand_size"])

        # Namaste / Welcome: Palms joined together facing each other
        if wrist_dist < 1.4 and tip_dist < 0.9 and (h1["num_extended"] >= 3 and h2["num_extended"] >= 3):
            return {
                "action": "Namaste / Welcome",
                "phrase": "Namaste! Welcome!",
                "emoji": "🙏",
                "confidence": 0.96,
                "category": "Greeting",
                "description": "Two hands pressed together in prayer/greeting."
            }

        # Help / Emergency: Thumbs up on flat open palm
        h1_is_flat = h1["num_extended"] >= 3
        h2_is_flat = h2["num_extended"] >= 3
        h1_is_thumb_up = h1["thumb_ext"] and h1["num_extended"] == 0 and h1["thumb_tip"][1] < h1["wrist"][1]
        h2_is_thumb_up = h2["thumb_ext"] and h2["num_extended"] == 0 and h2["thumb_tip"][1] < h2["wrist"][1]

        if (h1_is_flat and h2_is_thumb_up) or (h2_is_flat and h1_is_thumb_up):
            return {
                "action": "Help",
                "phrase": "Please help me!",
                "emoji": "🆘",
                "confidence": 0.95,
                "category": "Emergency",
                "description": "Thumbs-up resting on flat open palm."
            }

        # Please (Two hands offering palms up)
        if h1["num_extended"] >= 4 and h2["num_extended"] >= 4 and wrist_dist < 1.8:
            return {
                "action": "Please",
                "phrase": "Please, could you help?",
                "emoji": "🤲",
                "confidence": 0.92,
                "category": "Courtesy",
                "description": "Both palms open and cupped together."
            }

    # ---- 2. Single-Hand Gestures (Dominant Hand) ----
    h = h1

    # I Love You: Thumb, Index, Pinky extended, Middle & Ring curled
    if h["thumb_ext"] and h["index_ext"] and (not h["mid_ext"]) and (not h["ring_ext"]) and h["pinky_ext"]:
        return {
            "action": "I Love You",
            "phrase": "I love you!",
            "emoji": "🤟",
            "confidence": 0.98,
            "category": "Affection",
            "description": "Thumb, index, and pinky extended (universal ILY sign)."
        }

    # Call Me: Thumb and Pinky extended, middle three curled
    if h["thumb_ext"] and (not h["index_ext"]) and (not h["mid_ext"]) and (not h["ring_ext"]) and h["pinky_ext"]:
        return {
            "action": "Call Me",
            "phrase": "Call me later.",
            "emoji": "🤙",
            "confidence": 0.97,
            "category": "Social",
            "description": "Thumb and pinky extended (Shaka / Phone sign)."
        }

    # Peace / Victory: Index and Middle extended in V, Ring and Pinky curled
    if h["index_ext"] and h["mid_ext"] and (not h["ring_ext"]) and (not h["pinky_ext"]):
        if h["spread_idx_mid"] > 0.24:
            return {
                "action": "Peace / Victory",
                "phrase": "Peace and victory!",
                "emoji": "✌️",
                "confidence": 0.96,
                "category": "Social",
                "description": "Index and middle fingers spread in a clean V."
            }

    # No: Index & middle pinching thumb tip (beak shape) - check before Thumbs Up / Yes so pinch isn't shadowed
    if h["pinch_thumb_idx"] < 0.44 and h["pinch_thumb_mid"] < 0.50 and (not h["ring_ext"]) and (not h["pinky_ext"]):
        return {
            "action": "No",
            "phrase": "No, thank you.",
            "emoji": "🙅",
            "confidence": 0.94,
            "category": "Response",
            "description": "Index and middle fingers tapping against thumb (beak snap)."
        }

    # Good / Thumbs Up: Thumb pointing UP, other 4 fingers curled into palm
    if h["thumb_ext"] and h["num_extended"] == 0 and h["thumb_tip"][1] < h["thumb_mcp"][1] - 0.15 * h["hand_size"] and h["thumb_tip"][1] < h["wrist"][1]:
        return {
            "action": "Good / Nice",
            "phrase": "Very good, nice job!",
            "emoji": "👍",
            "confidence": 0.97,
            "category": "Feedback",
            "description": "Thumbs-up fist with thumb pointing upward."
        }

    # Bad / Dislike: Thumb pointing DOWN, other 4 fingers curled
    if h["thumb_ext"] and h["num_extended"] == 0 and h["thumb_tip"][1] > h["thumb_mcp"][1] + 0.15 * h["hand_size"] and h["thumb_tip"][1] > h["mid_mcp"][1]:
        return {
            "action": "Bad / Dislike",
            "phrase": "No, that's not good.",
            "emoji": "👎",
            "confidence": 0.95,
            "category": "Feedback",
            "description": "Thumbs-down fist pointing downward."
        }

    # Yes: Tight fist nodding or held firmly
    if (not h["thumb_ext"]) and h["num_extended"] == 0:
        return {
            "action": "Yes / Affirmative",
            "phrase": "Yes, I agree!",
            "emoji": "✊",
            "confidence": 0.92,
            "category": "Response",
            "description": "Fist gesture representing agreement/nod."
        }

    # Open palm gestures: Hello (spread) vs Thank You (raised near chin or tilted forward) vs Stop (upright closed palm)
    if h["num_extended"] >= 4:
        is_spread = h["spread_idx_mid"] > 0.40 or h["spread_mid_rng"] > 0.38
        if is_spread:
            return {
                "action": "Hello / Hi",
                "phrase": "Hello! How are you?",
                "emoji": "👋",
                "confidence": 0.96,
                "category": "Greeting",
                "description": "Open palm waving with spread fingers."
            }
        vertical_lift = (h["wrist"][1] - h["mid_tip"][1]) / h["hand_size"]
        if h["wrist"][1] < 0.46 or vertical_lift < 1.20:
            return {
                "action": "Thank You",
                "phrase": "Thank you so much!",
                "emoji": "🙏",
                "confidence": 0.93,
                "category": "Courtesy",
                "description": "Flat hand starting near mouth and extending outward."
            }
        return {
            "action": "Stop / Wait",
            "phrase": "Stop, please wait.",
            "emoji": "✋",
            "confidence": 0.95,
            "category": "Command",
            "description": "Open flat palm facing camera with closed fingers."
        }

    # Thank you: Open hand moving forward from chin/face
    if h["num_extended"] >= 3 and (h["wrist"][1] < 0.46 or (h["wrist"][1] - h["mid_tip"][1]) / h["hand_size"] < 1.15):
        return {
            "action": "Thank You",
            "phrase": "Thank you so much!",
            "emoji": "🙏",
            "confidence": 0.91,
            "category": "Courtesy",
            "description": "Flat hand starting near mouth and extending outward."
        }

    # Default fallback if unrecognized
    return None

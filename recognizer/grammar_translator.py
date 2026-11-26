"""Rule-based ASL/ISL gloss-to-English grammar polisher + Hindi/multi-language translator."""

import re

_PLACES = {
    "store", "shop", "market", "school", "college", "hospital", "home",
    "office", "bank", "station", "road", "city", "village", "temple",
    "park", "library", "kitchen", "room", "doctor", "class", "work",
}
_NO_ARTICLE_PLACES = {"home", "school", "college", "work", "class"}
_ADJECTIVES = {
    "fine", "good", "well", "happy", "sad", "angry", "tired", "hungry",
    "thirsty", "sick", "sorry", "ready", "busy", "free", "late", "early",
    "hot", "cold", "big", "small", "okay", "ok",
}
_OBJECTS = {
    "water", "food", "help", "money", "book", "pen", "paper", "phone",
    "computer", "medicine", "tea", "coffee", "milk", "bread", "rice",
    "ticket", "bag", "key", "chair", "pen", "break", "rest",
}
_WH_WORDS = {"what", "where", "when", "why", "how", "who", "which"}

_OFFLINE_HI_DICT = {
    "hello": "नमस्ते",
    "hello! how are you?": "नमस्ते! आप कैसे हैं?",
    "how are you?": "आप कैसे हैं?",
    "thank you": "धन्यवाद",
    "thank you so much!": "आपका बहुत-बहुत धन्यवाद!",
    "i am fine.": "मैं ठीक हूँ।",
    "i am going to the store.": "मैं दुकान जा रहा हूँ।",
    "i want water.": "मुझे पानी चाहिए।",
    "please help me.": "कृपया मेरी मदद करें।",
    "yes": "हाँ",
    "no": "नहीं",
    "i love you": "मैं तुमसे प्यार करता हूँ",
    "good morning": "सुप्रभात",
    "good night": "शुभ रात्रि",
    "namaste": "नमस्ते",
    "sorry": "माफ़ कीजिए",
    "what is your name?": "आपका नाम क्या है?",
}


def _capitalize_sentence(s: str, is_question: bool = False) -> str:
    s = re.sub(r"\s+", " ", s).strip()
    if not s:
        return ""
    s = s[0].upper() + s[1:]
    # Capitalize standalone 'i'
    s = re.sub(r"\bi\b", "I", s)
    if s[-1] not in ".!?":
        s += "?" if is_question else "."
    return s


def polish_gloss_to_english(raw_text: str) -> str:
    """Convert sign-language gloss sequences (e.g. 'I STORE GO') into natural English."""
    text = re.sub(r"\s+", " ", (raw_text or "").strip())
    if not text:
        return ""

    # If already contains common English auxiliaries/articles in mixed case, lightly normalize
    lower_tokens = re.findall(r"[A-Za-z0-9']+", text.lower())
    if any(w in {"am", "is", "are", "was", "were", "the", "a", "an", "to", "will", "have"} for w in lower_tokens) and text != text.upper():
        is_q = text.endswith("?") or (lower_tokens[0] in _WH_WORDS if lower_tokens else False)
        return _capitalize_sentence(text, is_question=is_q)

    # Normalize tokens (preserve original casing for proper names like Divy)
    orig_tokens = [t.strip(".,!?") for t in text.split() if t.strip(".,!?")]
    tokens = [t.lower() for t in orig_tokens]
    if not tokens:
        return ""

    # Map ME -> I when subject-like at start
    if tokens[0] == "me":
        tokens[0] = "i"
        orig_tokens[0] = "I"

    n = len(tokens)

    # Pattern: MY NAME <X>
    if n >= 3 and tokens[0] == "my" and tokens[1] == "name":
        name_part = " ".join(orig_tokens[2:]).title()
        return f"My name is {name_part}."

    # Pattern: WHAT YOUR NAME / YOUR NAME WHAT
    if set(tokens) >= {"what", "your", "name"}:
        return "What is your name?"

    # Pattern: HOW YOU / YOU HOW
    if set(tokens) == {"how", "you"} or tokens in (["you", "how", "are"], ["how", "you", "doing"]):
        return "How are you?"

    # Pattern: WHERE <PLACE> or <PLACE> WHERE
    if "where" in tokens and n >= 2:
        rest = [orig_tokens[i] for i, t in enumerate(tokens) if t != "where"]
        place_str = " ".join(rest).lower()
        article = "" if (len(rest) == 1 and place_str in _NO_ARTICLE_PLACES) else "the "
        return _capitalize_sentence(f"Where is {article}{place_str}", is_question=True)

    # Pattern: <SUBJ> <PLACE> GO / GO <PLACE> (e.g., I STORE GO, TODAY SCHOOL GO)
    if "go" in tokens and n >= 2:
        time_words = [t for t in tokens if t in {"today", "tomorrow", "now", "later"}]
        subj = "I"
        for t in tokens:
            if t in {"i", "we", "you", "they", "he", "she"}:
                subj = t
                break
        place_candidates = [
            t for t in tokens
            if t not in {"i", "we", "you", "they", "he", "she", "go", "to", "now", "today", "tomorrow", "later"}
        ]
        be_verb = {"i": "am", "he": "is", "she": "is"}.get(subj, "are")
        subj_cap = "I" if subj == "i" else subj.capitalize()
        if place_candidates:
            place = " ".join(place_candidates)
            prep = "" if place in _NO_ARTICLE_PLACES else "the "
            suffix = f" {time_words[0]}" if time_words else ""
            return f"{subj_cap} {be_verb} going to {prep}{place}{suffix}."

    # Pattern: <SUBJ> <OBJ> WANT / NEED / LIKE / LOVE (SOV gloss order)
    for verb in ("want", "need", "like", "love", "have", "drink", "eat"):
        if verb in tokens and n >= 2:
            subj = "I"
            for t in tokens:
                if t in {"i", "we", "you", "they", "he", "she"}:
                    subj = "I" if t == "i" else t.capitalize()
                    break
            objs = [
                orig_tokens[i].lower()
                for i, t in enumerate(tokens)
                if t not in {"i", "we", "you", "they", "he", "she", verb, "please"}
            ]
            v_form = f"{verb}s" if subj in {"He", "She"} else verb
            prefix = "Please, " if "please" in tokens else ""
            obj_str = " ".join(objs)
            if obj_str:
                return _capitalize_sentence(f"{prefix}{subj} {v_form} {obj_str}")

    # Pattern: <SUBJ> <ADJ> (e.g., I FINE, YOU GOOD, HE SICK)
    if n == 2 and tokens[0] in {"i", "we", "you", "they", "he", "she"} and tokens[1] in _ADJECTIVES:
        be_verb = {"i": "am", "he": "is", "she": "is"}.get(tokens[0], "are")
        subj_cap = "I" if tokens[0] == "i" else tokens[0].capitalize()
        return f"{subj_cap} {be_verb} {tokens[1]}."

    # Pattern: YOU HELP PLEASE / HELP ME / PLEASE HELP
    if "help" in tokens:
        if "please" in tokens or "you" in tokens or "me" in tokens:
            return "Please help me."
        return "I need help."

    # Fallback: smart punctuation & capitalization
    is_q = tokens[0] in _WH_WORDS or tokens[-1] in _WH_WORDS or text.endswith("?")
    return _capitalize_sentence(" ".join(orig_tokens), is_question=is_q)


def translate_text(text: str, target_lang: str = "hi") -> dict:
    """Translate English text into `target_lang` (default Hindi 'hi') with offline fallback."""
    cleaned = (text or "").strip()
    if not cleaned:
        return {"translated": "", "source": "empty", "target_lang": target_lang}

    key = cleaned.lower()
    if target_lang == "hi" and key in _OFFLINE_HI_DICT:
        return {"translated": _OFFLINE_HI_DICT[key], "source": "dictionary", "target_lang": target_lang}

    try:
        from deep_translator import GoogleTranslator
        translated = GoogleTranslator(source="auto", target=target_lang).translate(cleaned)
        if translated:
            return {"translated": translated, "source": "google_translate", "target_lang": target_lang}
    except Exception:
        pass

    # Word-level offline fallback if network is unavailable
    if target_lang == "hi":
        word_map = {
            "i": "मैं", "me": "मुझे", "you": "आप", "am": "हूँ", "is": "है",
            "going": "जा रहा हूँ", "to": "को", "the": "", "store": "दुकान",
            "school": "स्कूल", "hospital": "अस्पताल", "home": "घर", "water": "पानी",
            "food": "खाना", "help": "मदद", "please": "कृपया", "thank": "धन्यवाद",
            "good": "अच्छा", "fine": "ठीक", "morning": "सुबह", "yes": "हाँ", "no": "नहीं",
            "hello": "नमस्ते", "want": "चाहिए", "need": "ज़रूरत है", "love": "प्यार",
        }
        parts = []
        for w in re.findall(r"[A-Za-z]+", key):
            mapped = word_map.get(w, w)
            if mapped:
                parts.append(mapped)
        if parts:
            return {"translated": " ".join(parts), "source": "offline_fallback", "target_lang": target_lang}

    return {"translated": cleaned, "source": "passthrough", "target_lang": target_lang}

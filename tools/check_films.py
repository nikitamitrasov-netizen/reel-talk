#!/usr/bin/env python
"""Validate Reel Talk film JSON files. Usage: python tools/check_films.py content/films/a2.json [...]"""
import json
import re
import sys
from pathlib import Path

LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]
GENRES = {"drama", "comedy", "romance", "thriller", "crime", "sci-fi", "animation", "family",
          "musical", "war", "sport", "mystery", "noir", "western", "documentary", "horror", "historical"}
MOODS = {"warm", "cool", "noir", "neon", "sepia", "pastel", "earth", "ice"}
AGES = {"all", "12+", "15+", "18+"}
SCENE_TYPES = {"observe", "predict", "listen", "speak", "think", "detail"}
REQUIRED = ["id", "title", "year", "level", "runtime", "genres", "director", "country", "age",
            "mood", "logline", "why", "language", "content", "scenes", "words", "questions",
            "gaps", "quotes", "quiz", "roleplay", "quest"]


def is_text(v, lo=1, hi=1000):
    return isinstance(v, str) and lo <= len(v.strip()) <= hi and v.strip() == v


def check(film, errors, warn, fname):
    fid = film.get("id", "?")
    where = f"{fname} :: {fid}"

    for key in REQUIRED:
        if key not in film:
            errors.append(f"{where}: missing key '{key}'")
    if errors and not all(k in film for k in REQUIRED):
        return

    kind = film.get("kind", "film")
    if kind not in ("film", "series"):
        errors.append(f"{where}: kind must be 'film' or 'series'")
    if kind == "series":
        if not is_text(film.get("episode", "")):
            errors.append(f"{where}: series needs an 'episode' such as S1E1")
        if not is_text(film.get("episodeTitle", "")):
            errors.append(f"{where}: series needs an 'episodeTitle'")

    if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", str(film["id"])):
        errors.append(f"{where}: id is not kebab-case")
    if film["level"] not in LEVELS:
        errors.append(f"{where}: bad level {film['level']!r}")
    if fname.startswith(("a1", "a2", "b1", "b2", "c1", "c2")) and fname[:2].upper() != film["level"]:
        errors.append(f"{where}: level {film['level']} does not match file {fname}")
    if not isinstance(film["year"], int) or not 1880 <= film["year"] <= 2030:
        errors.append(f"{where}: bad year")
    if not isinstance(film["runtime"], int) or not 3 <= film["runtime"] <= 400:
        errors.append(f"{where}: bad runtime")
    for key in ("title", "director", "country", "logline", "why", "language", "content"):
        if not is_text(film[key]):
            errors.append(f"{where}: '{key}' must be a non-empty trimmed string")
    if len(film["logline"]) > 210:
        warn.append(f"{where}: logline is long ({len(film['logline'])} chars)")
    if not (2 <= len(film["genres"]) <= 3) or any(g not in GENRES for g in film["genres"]):
        errors.append(f"{where}: genres must be 2-3 of the allowed list, got {film['genres']}")
    if film["age"] not in AGES:
        errors.append(f"{where}: bad age {film['age']!r}")
    if film["mood"] not in MOODS:
        errors.append(f"{where}: bad mood {film['mood']!r}")

    scenes = film["scenes"]
    if not (3 <= len(scenes) <= 6):
        errors.append(f"{where}: need 3-6 scenes, got {len(scenes)}")
    last = -1
    for i, s in enumerate(scenes):
        at = s.get("at", "")
        m = re.fullmatch(r"(\d{2}):([0-5]\d):([0-5]\d)", str(at))
        if not m:
            errors.append(f"{where}: scene {i+1} bad time {at!r} (use HH:MM:SS)")
            continue
        secs = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + int(m.group(3))
        if secs > film["runtime"] * 60 + 30:
            errors.append(f"{where}: scene {i+1} at {at} is after the film ends ({film['runtime']} min)")
        if secs <= last:
            warn.append(f"{where}: scenes are not in chronological order at {at}")
        last = secs
        if s.get("type") not in SCENE_TYPES:
            warn.append(f"{where}: scene {i+1} unusual type {s.get('type')!r}")
        for k in ("title", "task"):
            if not is_text(s.get(k, "")):
                errors.append(f"{where}: scene {i+1} missing '{k}'")

    words = film["words"]
    if len(words) != 6:
        errors.append(f"{where}: need exactly 6 words, got {len(words)}")
    for i, w in enumerate(words):
        if not all(is_text(w.get(k, "")) for k in ("w", "def", "ex")):
            errors.append(f"{where}: word {i+1} needs w/def/ex")
        elif len(w["def"]) > 90:
            warn.append(f"{where}: definition too long for {w['w']!r}")

    if len(film["questions"]) != 8 or not all(is_text(q, 5) for q in film["questions"]):
        errors.append(f"{where}: need 8 non-empty questions, got {len(film['questions'])}")

    gaps = film["gaps"]
    if len(gaps) != 5:
        errors.append(f"{where}: need 5 gaps, got {len(gaps)}")
    for i, g in enumerate(gaps):
        line = g.get("line", "")
        if line.count("___") != 1:
            errors.append(f"{where}: gap {i+1} must contain exactly one '___'")
        if not is_text(g.get("answer", "")):
            errors.append(f"{where}: gap {i+1} needs an answer")
        if "adapted" not in g:
            warn.append(f"{where}: gap {i+1} should say adapted true/false")
        if 0 < line.find("___") < 1:
            warn.append(f"{where}: gap {i+1} blank at start")

    for group, count in (("quotes", 3), ("quiz", 5)):
        items = film[group]
        if len(items) != count:
            errors.append(f"{where}: need {count} {group}, got {len(items)}")
        for i, it in enumerate(items):
            opts = it.get("options")
            if not isinstance(opts, list) or len(opts) != 3 or not all(is_text(o, 1, 90) for o in opts):
                errors.append(f"{where}: {group} {i+1} needs exactly 3 short options")
            if not isinstance(it.get("answer"), int) or not 0 <= it["answer"] <= 2:
                errors.append(f"{where}: {group} {i+1} answer must be 0, 1 or 2")
            key = "q" if group == "quiz" else "quote"
            if not is_text(it.get(key, "")):
                errors.append(f"{where}: {group} {i+1} missing '{key}'")
            if group == "quiz" and not is_text(it.get("why", "")):
                errors.append(f"{where}: quiz {i+1} missing 'why'")

    rp = film["roleplay"]
    if not all(is_text(rp.get(k, "")) for k in ("title", "setting", "challenge")):
        errors.append(f"{where}: roleplay needs title/setting/challenge")
    roles = rp.get("roles", [])
    if not (2 <= len(roles) <= 3):
        errors.append(f"{where}: roleplay needs 2-3 roles, got {len(roles)}")
    for i, r in enumerate(roles):
        if not is_text(r.get("role", "")) or not is_text(r.get("brief", "")):
            errors.append(f"{where}: role {i+1} needs role/brief")

    quest = film["quest"]
    if len(quest) != 4:
        errors.append(f"{where}: need 4 quest stations, got {len(quest)}")
    for i, q in enumerate(quest):
        if not all(is_text(q.get(k, "")) for k in ("title", "task", "answer")):
            errors.append(f"{where}: quest {i+1} needs title/task/answer")
        if not isinstance(q.get("points"), int):
            warn.append(f"{where}: quest {i+1} points should be an integer")

    blob = json.dumps(film, ensure_ascii=False)
    if re.search(r"[\u0400-\u04FF]", blob):
        errors.append(f"{where}: contains Cyrillic characters — content must be English only")


def main(paths):
    errors, warn = [], []
    seen = {}
    total = 0
    for path in paths:
        p = Path(path)
        fname = p.name
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except Exception as exc:
            errors.append(f"{fname}: invalid JSON — {exc}")
            continue
        if not isinstance(data, list):
            errors.append(f"{fname}: top level must be a JSON array")
            continue
        for film in data:
            total += 1
            check(film, errors, warn, fname)
            fid = film.get("id")
            if fid in seen:
                errors.append(f"duplicate id '{fid}' in {fname} and {seen[fid]}")
            seen[fid] = fname
    for w in warn:
        print("WARN ", w)
    for e in errors:
        print("ERROR", e)
    print(f"\n{total} films checked in {len(paths)} file(s): {len(errors)} errors, {len(warn)} warnings")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

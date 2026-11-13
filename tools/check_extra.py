#!/usr/bin/env python
"""Validate content/extra/<level>.json files. Usage: python tools/check_extra.py content/extra/a1.json"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]


def load_films():
    films = {}
    for path in sorted((ROOT / "content" / "films").glob("*.json")):
        for film in json.loads(path.read_text(encoding="utf-8")):
            films[film["id"]] = film
    return films


def text(v, lo=1, hi=400):
    return isinstance(v, str) and lo <= len(v.strip()) <= hi and v.strip() == v


def main(paths):
    films = load_films()
    errors, warnings = [], []
    seen = set()
    total = 0
    for path in paths:
        p = pathlib.Path(path)
        data = json.loads(p.read_text(encoding="utf-8"))
        expected = p.stem.upper() if p.stem.upper() in LEVELS else None
        for item in data:
            total += 1
            fid = item.get("id")
            where = f"{p.name} :: {fid}"
            if fid not in films:
                errors.append(f"{where}: unknown film id")
                continue
            if fid in seen:
                errors.append(f"{where}: duplicate id")
            seen.add(fid)
            film = films[fid]
            if expected and film["level"] != expected:
                errors.append(f"{where}: film is {film['level']}, file is {expected}")

            base_gaps = {g["line"] for g in film.get("gaps", [])}
            base_quotes = {q["quote"] for q in film.get("quotes", [])}
            base_qs = {q["q"] for q in film.get("quiz", [])}

            gaps = item.get("gaps", [])
            if len(gaps) != 5:
                errors.append(f"{where}: need 5 extra gaps, got {len(gaps)}")
            for i, g in enumerate(gaps):
                line = g.get("line", "")
                if line.count("___") != 1:
                    errors.append(f"{where}: gap {i+1} must contain exactly one ___")
                if line in base_gaps:
                    warnings.append(f"{where}: gap {i+1} repeats an existing line")
                if not text(g.get("answer", ""), 1, 40):
                    errors.append(f"{where}: gap {i+1} needs an answer")
                if "adapted" not in g:
                    warnings.append(f"{where}: gap {i+1} should say adapted true/false")

            quiz = item.get("quiz", [])
            if len(quiz) != 3:
                errors.append(f"{where}: need 3 extra quiz, got {len(quiz)}")
            for i, q in enumerate(quiz):
                if not text(q.get("q", "")):
                    errors.append(f"{where}: quiz {i+1} missing q")
                if q.get("q") in base_qs:
                    warnings.append(f"{where}: quiz {i+1} repeats an existing question")
                opts = q.get("options")
                if not isinstance(opts, list) or len(opts) != 3 or not all(text(o, 1, 90) for o in opts):
                    errors.append(f"{where}: quiz {i+1} needs exactly 3 options")
                if not isinstance(q.get("answer"), int) or q["answer"] not in (0, 1, 2):
                    errors.append(f"{where}: quiz {i+1} answer must be 0-2")
                if not text(q.get("why", "")):
                    errors.append(f"{where}: quiz {i+1} needs why")

            quotes = item.get("quotes", [])
            if len(quotes) != 2:
                errors.append(f"{where}: need 2 extra quotes, got {len(quotes)}")
            for i, q in enumerate(quotes):
                if not text(q.get("quote", ""), 3, 120):
                    errors.append(f"{where}: quote {i+1} missing quote")
                if q.get("quote") in base_quotes:
                    warnings.append(f"{where}: quote {i+1} repeats an existing quote")
                opts = q.get("options")
                if not isinstance(opts, list) or len(opts) != 3:
                    errors.append(f"{where}: quote {i+1} needs exactly 3 options")
                if not isinstance(q.get("answer"), int) or q["answer"] not in (0, 1, 2):
                    errors.append(f"{where}: quote {i+1} answer must be 0-2")

            tf = item.get("truefalse", [])
            if len(tf) != 6:
                errors.append(f"{where}: need 6 true/false, got {len(tf)}")
            if sum(1 for x in tf if x.get("answer") is True) != 3:
                errors.append(f"{where}: true/false must have exactly 3 true and 3 false")
            for i, x in enumerate(tf):
                if not text(x.get("s", ""), 5, 220):
                    errors.append(f"{where}: T/F {i+1} missing statement")
                if not isinstance(x.get("answer"), bool):
                    errors.append(f"{where}: T/F {i+1} answer must be true/false")
                if x.get("answer") is False and not text(x.get("fix", ""), 3, 200):
                    errors.append(f"{where}: T/F {i+1} is false but has no fix")

            sa = item.get("shortAnswers", [])
            if len(sa) != 4:
                errors.append(f"{where}: need 4 short answers, got {len(sa)}")
            for i, x in enumerate(sa):
                if not text(x.get("q", ""), 5):
                    errors.append(f"{where}: short answer {i+1} missing q")
                if not text(x.get("model", ""), 10, 400):
                    errors.append(f"{where}: short answer {i+1} needs a model answer")

            blob = json.dumps(item, ensure_ascii=False)
            if re.search(r"[\u0400-\u04FF]", blob):
                errors.append(f"{where}: contains Cyrillic — English only")

    for w in warnings:
        print("WARN ", w)
    for e in errors:
        print("ERROR", e)
    print(f"\n{total} film entries in {len(paths)} file(s): {len(errors)} errors, {len(warnings)} warnings")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

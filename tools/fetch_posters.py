#!/usr/bin/env python
"""
Fetch film posters for the catalogue from Wikipedia and store them locally.

    python tools/fetch_posters.py

For every film in content/films/*.json it asks the Wikipedia REST API for the
article summary (one request per candidate title), takes the lead image — the
poster — and saves a 500px-wide JPEG to assets/posters/<id>.jpg.

The images stay on disk: the site never hotlinks Wikimedia. The report records
the source article for every file. Posters are copyrighted artwork, used here
only to identify the films in a non-commercial teaching club.
"""
import io
import json
import pathlib
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from PIL import Image

UA = "ReelTalkFilmClub/1.0 (educational film club; poster lookup)"
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "posters"
REPORT = ROOT / "tools" / "posters_report.json"
SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary/"


def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    for attempt in range(4):
        try:
            return json.loads(urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "ignore"))
        except urllib.error.HTTPError as exc:
            if exc.code == 429:
                time.sleep(6 * (attempt + 1))
                continue
            return None
        except Exception:
            time.sleep(2)
    return None


def download(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    return urllib.request.urlopen(req, timeout=40).read()


def save_jpeg(raw, path):
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    w, h = img.size
    if w > 500:
        img = img.resize((500, round(h * 500 / w)), Image.LANCZOS)
    img.save(path, "JPEG", quality=84, optimize=True)
    return img.size


def candidates(film):
    title = film["title"]
    year = film.get("year")
    if film.get("kind") == "series":
        return [f"{title} (TV series)", title]
    return [f"{title} ({year} film)", f"{title} (film)", title]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    films = []
    for path in sorted((ROOT / "content" / "films").glob("*.json")):
        films.extend(json.loads(path.read_text(encoding="utf-8")))

    report, found, missing = {}, 0, []
    for i, film in enumerate(films, 1):
        fid = film["id"]
        target = OUT / (fid + ".jpg")
        if target.exists() and target.stat().st_size > 3000:
            found += 1
            report[fid] = {"title": film["title"], "found": True, "note": "already on disk"}
            continue

        hit = None
        for cand in candidates(film):
            data = get_json(SUMMARY + urllib.parse.quote(cand.replace(" ", "_")))
            time.sleep(0.55)
            if not data or data.get("type") == "disambiguation":
                continue
            src = (data.get("originalimage") or {}).get("source") or (data.get("thumbnail") or {}).get("source")
            if src:
                hit = (data.get("title", cand), src)
                break

        if not hit:
            missing.append(fid)
            report[fid] = {"title": film["title"], "found": False}
            print(f"[{i}/{len(films)}] {film['title']}: —")
            continue

        try:
            raw = download(hit[1])
            size = save_jpeg(raw, target)
            found += 1
            report[fid] = {"title": film["title"], "found": True, "page": hit[0], "source": hit[1].split("?")[0], "size": size}
            print(f"[{i}/{len(films)}] {film['title']}: {hit[0]} {size[0]}x{size[1]}")
        except Exception as exc:  # noqa: BLE001
            missing.append(fid)
            report[fid] = {"title": film["title"], "found": False, "error": str(exc)[:120]}
            print(f"[{i}/{len(films)}] {film['title']}: ERROR {exc}")
        time.sleep(0.5)

    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n{found}/{len(films)} posters in assets/posters — report: {REPORT.name}")
    if missing:
        print("missing:", ", ".join(missing))


if __name__ == "__main__":
    sys.exit(main())

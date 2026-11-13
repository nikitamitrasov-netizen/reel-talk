#!/usr/bin/env python
"""
Fill the remaining poster gaps by searching Wikipedia's File namespace.

    python tools/fill_posters.py

For every film without assets/posters/<id>.jpg it searches files whose name
contains the title and "poster", keeps only portrait images, and saves a
500px JPEG. Anything still missing is drawn by the site as a catalogue card.
"""
import io
import json
import pathlib
import re
import sys
import time
import urllib.parse
import urllib.request

from PIL import Image

UA = "ReelTalkFilmClub/1.0 (educational film club; poster lookup)"
API = "https://en.wikipedia.org/w/api.php"
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "posters"
REPORT = ROOT / "tools" / "posters_report.json"


def api(params):
    params = dict(params)
    params.update({"format": "json", "formatversion": "2"})
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    for attempt in range(4):
        try:
            return json.loads(urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "ignore"))
        except urllib.error.HTTPError as exc:
            if exc.code == 429:
                time.sleep(12 * (attempt + 1))
                continue
            return {}
        except Exception:
            time.sleep(2)
    return {}


def norm(text):
    return re.sub(r"[^a-z0-9]+", "", text.lower())


def name_matches(file_title, title):
    """Only accept a file whose name is the title, optionally + 'poster'."""
    stem = file_title.split(":", 1)[-1].rsplit(".", 1)[0]
    name, base = norm(stem), norm(title)
    if not name.startswith(base):
        return False
    rest = name[len(base):]
    return rest in ("", "poster", "filmposter", "movieposter", "poster1", "poster2", "ver2")


def search_files(query):
    data = api({"action": "query", "list": "search", "srsearch": query, "srnamespace": "6", "srlimit": "6"})
    return [h["title"] for h in data.get("query", {}).get("search", [])]


def image_info(title):
    data = api({"action": "query", "titles": title, "prop": "imageinfo",
                "iiprop": "url|size", "iiurlwidth": "500", "format": "json", "formatversion": "2"})
    for page in data.get("query", {}).get("pages", []):
        info = (page.get("imageinfo") or [{}])[0]
        src = info.get("thumburl") or info.get("url")
        if src:
            return src, info.get("width", 0), info.get("height", 0)
    return None, 0, 0


def save(raw, path):
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    w, h = img.size
    if (w / h) > 1.02 or h < 180:
        return None
    if w > 500:
        img = img.resize((500, round(h * 500 / w)), Image.LANCZOS)
    img.save(path, "JPEG", quality=84, optimize=True)
    return img.size


def download(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    return urllib.request.urlopen(req, timeout=40).read()


def main():
    report = json.loads(REPORT.read_text(encoding="utf-8")) if REPORT.exists() else {}
    films = []
    for path in sorted((ROOT / "content" / "films").glob("*.json")):
        films.extend(json.loads(path.read_text(encoding="utf-8")))

    missing = [f for f in films if not (OUT / (f["id"] + ".jpg")).exists()]
    print(f"{len(missing)} films without a poster")

    fixed = 0
    for film in missing:
        target = OUT / (film["id"] + ".jpg")
        title = film["title"]
        queries = [f'{title} poster', f'{title} film poster']
        if film.get("kind") == "series":
            queries = [f'{title} poster', f'{title} series poster']
        done = False
        for q in queries:
            if done:
                break
            for file_title in search_files(q):
                if not name_matches(file_title, title):
                    continue
                url, w, h = image_info(file_title)
                time.sleep(1.2)
                if not url or h <= w:
                    continue
                try:
                    size = save(download(url), target)
                except Exception:
                    size = None
                time.sleep(1.0)
                if size:
                    report[film["id"]] = {"title": title, "found": True, "page": "File:" + file_title.split(":", 1)[-1],
                                          "source": url.split("?")[0], "size": size, "via": "file search"}
                    fixed += 1
                    print(f"fixed {title}: {file_title} {size[0]}x{size[1]}")
                    done = True
                    break
            time.sleep(1.4)

    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    have = len(list(OUT.glob("*.jpg")))
    print(f"\nfixed {fixed} — {have}/{len(films)} posters on disk")


if __name__ == "__main__":
    sys.exit(main())

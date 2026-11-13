#!/usr/bin/env python
"""
Repair pass for the poster pack.

    python tools/fix_posters.py

1. Drops any downloaded image that is landscape (a title card or logo, not a poster).
2. For every film still without a poster, looks through the images used in its
   Wikipedia article and picks the first portrait one whose file name looks like
   a poster or cover.
3. Leaves whatever is still missing to the site, which draws a typographic card.

The site never hotlinks Wikimedia — files are stored in assets/posters/.
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
GOOD_NAME = re.compile(r"poster", re.I)
BAD_NAME = re.compile(r"festival|premiere|cast|actor|actress|logo|title.?card|screenshot|berlin|cannes", re.I)

# Wikipedia article per film id, filled by fetch_posters.py where possible.
MANUAL_PAGES = {
    "paddington": "Paddington (film)",
    "kings-speech": "The King's Speech",
    "the-favourite": "The Favourite",
    "tinker-tailor": "Tinker Tailor Soldier Spy (film)",
    "the-office-s1e1": "The Office (American TV series)",
    "sherlock-s1e1": "Sherlock (TV series)",
    "the-crown-s1e1": "The Crown (TV series)",
    "black-mirror-s1e1": "Black Mirror",
    "friends-s1e1": "Friends",
    "modern-family-s1e1": "Modern Family",
    "bluey-xylophone": "Bluey (2018 TV series)",
    "peppa-muddy-puddles": "Peppa Pig",
    "our-planet-s1e1": "Our Planet",
    "ted-lasso-s1e1": "Ted Lasso",
    "brooklyn-99-s1e1": "Brooklyn Nine-Nine",
    "fleabag-s1e1": "Fleabag",
    "frozen": "Frozen (2013 film)",
    "back-to-the-future": "Back to the Future",
    "marriage-story": "Marriage Story",
}


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
                time.sleep(15 * (attempt + 1))
                continue
            return {}
        except Exception:
            time.sleep(2)
    return {}


def download(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    return urllib.request.urlopen(req, timeout=40).read()


def aspects_bad(path):
    try:
        img = Image.open(path)
        w, h = img.size
        return (w / h) > 1.02, w, h
    except Exception:
        return True, 0, 0


def save(raw, path):
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    w, h = img.size
    if (w / h) > 1.02:
        return None
    if w > 500:
        img = img.resize((500, round(h * 500 / w)), Image.LANCZOS)
    img.save(path, "JPEG", quality=84, optimize=True)
    return img.size


def article_images(page):
    data = api({"action": "query", "titles": page, "prop": "images", "imlimit": "60", "redirects": "1"})
    out = []
    for p in data.get("query", {}).get("pages", []):
        out.extend(img["title"] for img in p.get("images", []))
    return out


def file_url(file_title):
    data = api({"action": "query", "titles": file_title, "prop": "imageinfo",
                "iiprop": "url|size", "format": "json", "formatversion": "2"})
    for p in data.get("query", {}).get("pages", []):
        info = (p.get("imageinfo") or [{}])[0]
        if info.get("url"):
            return info["url"], info.get("width", 0), info.get("height", 0)
    return None, 0, 0


def main():
    report = json.loads(REPORT.read_text(encoding="utf-8")) if REPORT.exists() else {}
    films = {}
    for path in sorted((ROOT / "content" / "films").glob("*.json")):
        for film in json.loads(path.read_text(encoding="utf-8")):
            films[film["id"]] = film

    removed = []
    for jpg in OUT.glob("*.jpg"):
        bad, w, h = aspects_bad(jpg)
        if bad:
            jpg.unlink()
            removed.append(f"{jpg.stem} ({w}x{h})")
    print("dropped landscape:", ", ".join(removed) or "none")

    fixed = 0
    for fid, film in films.items():
        target = OUT / (fid + ".jpg")
        if target.exists():
            continue
        page = MANUAL_PAGES.get(fid) or (report.get(fid) or {}).get("page") or film["title"]
        files = [t for t in article_images(page) if t.lower().startswith("file:") and GOOD_NAME.search(t) and not BAD_NAME.search(t)]
        for file_title in files:
            url, w, h = file_url(file_title)
            time.sleep(1.8)
            if not url or h <= w:
                continue
            try:
                size = save(download(url), target)
            except Exception:
                size = None
            time.sleep(1.4)
            if size:
                report[fid] = {"title": film["title"], "found": True, "page": page,
                               "source": url.split("?")[0], "size": size, "via": "article image"}
                fixed += 1
                print(f"fixed {film['title']}: {file_title} {size[0]}x{size[1]}")
                break
        else:
            report[fid] = {"title": film["title"], "found": False, "page": page}

    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    have = len(list(OUT.glob("*.jpg")))
    print(f"\nfixed {fixed} — {have}/{len(films)} posters on disk")


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python
"""
Find free, legal YouTube copies of public-domain / openly licensed films.

    python tools/find_youtube.py tools/youtube_targets.json

Discovery goes through Yahoo video search (which returns YouTube ids, titles and
durations in plain HTML), then every candidate is verified through the noembed
oEmbed proxy — so the output only contains videos that really exist, with the
channel that uploaded them. Nothing is guessed.

The result is a shortlist for a human to look at; the script prints it and
writes tools/youtube_candidates.json.
"""
import argparse
import html as htmllib
import json
import re
import ssl
import sys
import time
import urllib.parse
import urllib.request
from difflib import SequenceMatcher

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

BAD_WORDS = ("trailer", "teaser", " clip", "scene", "review", "reaction", "explained",
             "commentary", "behind the scenes", "interview", "podcast", "soundtrack",
             "theme song", "opening credits", "deleted scene", "bloopers", "analysis")
GOOD_WORDS = ("full movie", "full film", "full length", "complete movie", "full feature",
              "full classic", "entire movie")

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE


def fetch(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"})
    return urllib.request.urlopen(req, timeout=timeout, context=ctx).read().decode("utf-8", "ignore")


def clean(text):
    text = htmllib.unescape(text or "")
    text = re.sub(r"<[^>]+>", "", text)
    return re.sub(r"\s+", " ", text).strip()


def hhmmss_to_sec(value):
    if not value:
        return 0
    parts = [int(p) for p in value.split(":") if p.isdigit()]
    sec = 0
    for p in parts:
        sec = sec * 60 + p
    return sec


def yahoo_search(query):
    url = "https://video.search.yahoo.com/search/video?p=" + urllib.parse.quote_plus(query)
    page = fetch(url)
    chunks = page.split('data-referenceurl="https://www.youtube.com/watch?v=')
    out = []
    for chunk in chunks[1:]:
        vid = re.match(r"([\w-]{11})", chunk)
        if not vid:
            continue
        vid = vid.group(1)
        title_m = re.search(r'title="([^"]{5,200})"', chunk) or re.search(r'alt="([^"]{5,200})"', chunk)
        dur_m = re.search(r'class="[^"]*\btime\b[^"]*"[^>]*>([\d:]{4,8})<', chunk)
        title = clean(title_m.group(1)) if title_m else ""
        out.append({"id": vid, "title": title, "duration": dur_m.group(1) if dur_m else None})
    seen, uniq = set(), []
    for c in out:
        if c["id"] in seen:
            continue
        seen.add(c["id"])
        uniq.append(c)
    return uniq


def oembed(vid):
    try:
        raw = fetch("https://noembed.com/embed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D" + vid, timeout=20)
        data = json.loads(raw)
        if data.get("error"):
            return None
        return {"title": data.get("title", ""), "author": data.get("author_name", ""),
                "author_url": data.get("author_url", "")}
    except Exception:  # noqa: BLE001
        return None


def score(cand, target):
    text = (cand.get("title") or "") + " " + (cand.get("oembed_title") or "")
    low = text.lower()
    s = SequenceMatcher(None, target["title"].lower(), (cand.get("oembed_title") or cand.get("title") or "").lower()).ratio() * 55
    if str(target.get("year", "")) in low or str(target.get("year", "")) in (cand.get("title") or ""):
        s += 10
    if any(w in low for w in GOOD_WORDS):
        s += 16
    if any(w in low for w in BAD_WORDS):
        s -= 40
    dur = hhmmss_to_sec(cand.get("duration"))
    need = target.get("min_minutes", 40) * 60
    if dur:
        s += 24 if dur >= need else -55
    author = (cand.get("author") or "").lower()
    for good in ("internet archive", "timeless classic", "pizzaflix", "cult cinema", "film detective",
                 "artflix", "retrovision", "grapevine", "blender foundation", "official", "shout"):
        if good in author:
            s += 14
            break
    return round(s, 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("targets")
    ap.add_argument("-o", "--out", default="tools/youtube_candidates.json")
    ap.add_argument("--delay", type=float, default=2.0)
    ap.add_argument("--top", type=int, default=3)
    args = ap.parse_args()

    targets = json.load(open(args.targets, encoding="utf-8"))
    results = {}
    for i, target in enumerate(targets, 1):
        query = "%s %s full movie" % (target["title"], target.get("year", ""))
        print("[%d/%d] %s" % (i, len(targets), target["title"]))
        try:
            cands = yahoo_search(query)
        except Exception as exc:  # noqa: BLE001
            print("   search failed:", exc)
            cands = []
        verified = []
        for c in cands[:10]:
            meta = oembed(c["id"])
            if not meta:
                continue
            c["oembed_title"] = meta["title"]
            c["author"] = meta["author"]
            c["score"] = score(c, target)
            verified.append(c)
            time.sleep(0.3)
        verified.sort(key=lambda x: -x["score"])
        picked = [v for v in verified if v["score"] > 30][: args.top]
        results[target["id"]] = {"target": target, "picked": picked, "found": len(cands)}
        for p in picked:
            print("   %5.1f  %s  %-52s | %-9s | %s" % (
                p["score"], p["id"], (p.get("oembed_title") or "")[:52],
                p.get("duration") or "?", (p.get("author") or "")[:26]))
        if not picked:
            print("   — nothing convincing")
        time.sleep(args.delay)

    json.dump(results, open(args.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    ok = sum(1 for r in results.values() if r["picked"])
    print("\n%d/%d targets have a candidate -> %s" % (ok, len(results), args.out))


if __name__ == "__main__":
    main()

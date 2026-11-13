#!/usr/bin/env python
"""
Reel Talk — static server + tiny realtime hub (stdlib only).

    python tools/server.py            # http://127.0.0.1:8000
    python tools/server.py 8080       # another port
    python tools/server.py 8000 --open

Serves the site from the project root and adds the room API used by
js/sync.js (Server-Sent Events for downstream, POST for upstream).

Endpoints
    GET  /api/health
    GET  /api/room/<code>/events?id=&name=&host=       (SSE)
    POST /api/room/<code>/state     {playing,t0,pos,dur,seq,source,cd,cue}
    POST /api/room/<code>/chat      {msg:{id,name,text,ts}}
    POST /api/room/<code>/presence  {type: hello|bye}
"""
import json
import mimetypes
import os
import queue
import socket
import sys
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs, unquote

ROOT = Path(__file__).resolve().parent.parent
MAX_EVENTS = 200
ROOM_TTL = 60 * 60 * 8

mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("application/json", ".json")
mimetypes.add_type("font/woff2", ".woff2")

LOCK = threading.Lock()
ROOMS = {}

VOTES = {}                     # film id -> {voter id: 1..5}
VOTES_FILE = ROOT / "tools" / "votes.json"


def load_votes():
    global VOTES
    try:
        if VOTES_FILE.exists():
            VOTES = json.loads(VOTES_FILE.read_text(encoding="utf-8")).get("films", {})
    except Exception:
        VOTES = {}


def save_votes():
    try:
        VOTES_FILE.write_text(json.dumps({"films": VOTES}, ensure_ascii=False, indent=1), encoding="utf-8")
    except Exception:
        pass


def vote_summary():
    out = {}
    for film, voters in VOTES.items():
        vals = [v for v in voters.values() if isinstance(v, int) and 1 <= v <= 5]
        if not vals:
            continue
        out[film] = {"count": len(vals), "sum": sum(vals), "avg": round(sum(vals) / len(vals), 2)}
    return out


class Room:
    def __init__(self, code):
        self.code = code
        self.state = None
        self.chats = []
        self.subs = []          # list[queue.Queue]
        self.people = {}        # id -> {name, host, ts}
        self.touched = time.time()

    def broadcast(self, event, data):
        payload = "event: %s\ndata: %s\n\n" % (event, json.dumps(data, ensure_ascii=False))
        with LOCK:
            subs = list(self.subs)
        for q in subs:
            try:
                q.put_nowait(payload)
            except queue.Full:
                pass

    def presence_list(self):
        now = time.time()
        return [
            {"id": pid, "name": p.get("name", "Guest"), "host": bool(p.get("host")),
             "ts": int(p.get("ts", 0) * 1000)}
            for pid, p in self.people.items() if now - p.get("ts", 0) < 45
        ]


def get_room(code):
    code = (code or "").upper()[:12]
    with LOCK:
        room = ROOMS.get(code)
        if room is None:
            room = ROOMS[code] = Room(code)
        room.touched = time.time()
        return room


def gc_rooms():
    while True:
        time.sleep(600)
        now = time.time()
        with LOCK:
            dead = [c for c, r in ROOMS.items() if now - r.touched > ROOM_TTL and not r.subs]
            for c in dead:
                ROOMS.pop(c, None)


class Handler(BaseHTTPRequestHandler):
    server_version = "ReelTalk/1.0"
    protocol_version = "HTTP/1.0"

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else "") or "events" in str(args):
            return
        sys.stdout.write("  %s %s\n" % (self.command, self.path.split("?")[0]))

    # ---------- helpers ----------

    def send_json(self, obj, status=200, extra=None):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(length) if length else b"{}"
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return {}

    # ---------- routing ----------

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/votes":
            return self.send_json({"films": vote_summary()})
        if path == "/api/health":
            return self.send_json({"ok": True, "mode": "server", "rooms": len(ROOMS)})
        if path.startswith("/api/room/"):
            parts = path.strip("/").split("/")
            if len(parts) == 4 and parts[3] == "events":
                return self.sse(parts[2])
            return self.send_json({"error": "not found"}, 404)
        return self.serve_static(path)

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/vote":
            body = self.read_json()
            film = str(body.get("film") or "")[:80]
            voter = str(body.get("voter") or "")[:64]
            try:
                value = int(body.get("value") or 0)
            except Exception:
                value = 0
            if not film or not voter or not (1 <= value <= 5):
                return self.send_json({"error": "bad vote"}, 400)
            with LOCK:
                VOTES.setdefault(film, {})[voter] = value
                save_votes()
            summary = vote_summary().get(film, {"count": 0, "sum": 0, "avg": 0})
            return self.send_json({"ok": True, "film": film, "rating": summary})
        parts = path.strip("/").split("/")
        if len(parts) == 4 and parts[0] == "api" and parts[1] == "room":
            code, action = unquote(parts[2]), parts[3]
            room = get_room(code)
            body = self.read_json()
            if action == "state":
                room.state = body.get("state")
                room.touched = time.time()
                room.broadcast("state", body)
                return self.send_json({"ok": True})
            if action == "chat":
                msg = body.get("msg") or {}
                room.chats.append(msg)
                room.chats = room.chats[-MAX_EVENTS:]
                room.broadcast("chat", body)
                return self.send_json({"ok": True})
            if action == "signal":
                # generic realtime message: polls, votes, quest scores, prompts
                room.broadcast("signal", body)
                room.touched = time.time()
                return self.send_json({"ok": True})
            if action == "presence":
                pid = body.get("from")
                if pid:
                    if body.get("type") == "bye":
                        room.people.pop(pid, None)
                    else:
                        room.people[pid] = {"name": body.get("name", "Guest"),
                                            "host": bool(body.get("host")), "ts": time.time()}
                room.broadcast("presence", {"people": room.presence_list()})
                return self.send_json({"ok": True, "people": room.presence_list()})
        return self.send_json({"error": "not found"}, 404)

    # ---------- SSE ----------

    def sse(self, code):
        room = get_room(code)
        qs = parse_qs(urlparse(self.path).query)
        pid = (qs.get("id") or [""])[0]
        name = (qs.get("name") or ["Guest"])[0]
        host = (qs.get("host") or ["0"])[0] == "1"
        q = queue.Queue(maxsize=300)

        with LOCK:
            room.subs.append(q)
            if pid:
                room.people[pid] = {"name": name or "Guest", "host": host, "ts": time.time()}

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache, no-transform")
        self.send_header("Connection", "keep-alive")
        self.send_header("X-Accel-Buffering", "no")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()

        def write(chunk):
            self.wfile.write(chunk.encode("utf-8"))
            self.wfile.flush()

        try:
            write("retry: 3000\n\n")
            if room.state:
                write("event: state\ndata: %s\n\n" % json.dumps(room.state, ensure_ascii=False))
            for msg in room.chats[-20:]:
                write("event: chat\ndata: %s\n\n" % json.dumps({"msg": msg}, ensure_ascii=False))
            write("event: presence\ndata: %s\n\n" % json.dumps({"people": room.presence_list()}, ensure_ascii=False))
            room.broadcast("presence", {"people": room.presence_list()})

            last = time.time()
            while True:
                try:
                    payload = q.get(timeout=15)
                    write(payload)
                except queue.Empty:
                    write(": ping %d\n\n" % int(time.time()))
                if time.time() - last > 15:
                    last = time.time()
                    room.touched = time.time()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        finally:
            with LOCK:
                if q in room.subs:
                    room.subs.remove(q)
                if pid:
                    room.people.pop(pid, None)
            try:
                room.broadcast("presence", {"people": room.presence_list()})
            except Exception:
                pass
            self.close_connection = True

    # ---------- static ----------

    def serve_static(self, path):
        if path in ("/", ""):
            path = "/index.html"
        target = (ROOT / unquote(path).lstrip("/")).resolve()
        try:
            target.relative_to(ROOT)
        except ValueError:
            return self.send_json({"error": "forbidden"}, 403)
        if target.is_dir():
            target = target / "index.html"
        if not target.is_file():
            return self.send_json({"error": "not found", "path": path}, 404)
        ctype = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        data = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ctype + ("; charset=utf-8" if ctype.startswith("text/") or ctype.endswith("javascript") else ""))
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)


def local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    port = int(args[0]) if args else 8000
    load_votes()
    threading.Thread(target=gc_rooms, daemon=True).start()
    httpd = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    ip = local_ip()
    print()
    print("  REEL TALK — club server")
    print("  " + "-" * 46)
    print("  Local    http://127.0.0.1:%d" % port)
    print("  Network  http://%s:%d   (phones on the same Wi-Fi)" % (ip, port))
    print("  Rooms    realtime sync is live on this server")
    print("  Stop     Ctrl+C")
    print()
    if "--open" in sys.argv:
        threading.Timer(0.8, lambda: webbrowser.open("http://127.0.0.1:%d" % port)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  bye")


if __name__ == "__main__":
    main()

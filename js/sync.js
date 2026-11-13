/* Reel Talk — realtime layer
   Three transports, one interface:
     server  — tools/server.py on the same origin (SSE + POST), true realtime
     cloud   — ntfy.sh public relay, works on static hosting (GitHub Pages)
     local   — BroadcastChannel, tabs on one machine (projector + laptop)
*/
(function () {
  'use strict';
  const RT = window.RT;

  RT.rid = (n) => {
    let s = '';
    const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
    for (let i = 0; i < (n || 8); i++) s += abc[Math.floor(Math.random() * abc.length)];
    return s;
  };
  RT.roomCode = () => {
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += abc[Math.floor(Math.random() * abc.length)];
    return s;
  };

  RT.Realtime = function (opts) {
    const room = opts.room;
    const topic = 'reeltalk-' + room.toLowerCase();
    const me = {
      id: RT.rid(8),
      name: opts.name || 'Guest',
      host: !!opts.host
    };
    let mode = 'local';
    let es = null;
    let bc = null;
    let heartbeatTimer = null;
    let closed = false;
    const seen = new Map(); // peer id -> {name, ts, host}
    let state = null;

    const emit = (fn, a, b) => { try { if (fn) fn(a, b); } catch (e) { console.warn(e); } };

    function status(s, detail) { emit(opts.onStatus, s, detail); }

    function handle(payload) {
      if (!payload || payload.from === me.id) {
        if (payload && payload.from === me.id) touch(me.id, me.name, me.host);
        return;
      }
      touch(payload.from, payload.name, payload.host);
      if (payload.type === 'state') {
        state = payload.state;
        emit(opts.onState, payload.state, payload.from);
      } else if (payload.type === 'chat') {
        emit(opts.onChat, payload.msg);
      } else if (payload.type === 'hello') {
        emit(opts.onHello, payload);
        if (me.host) setTimeout(() => send({ type: 'state', state }), 250);
      } else if (payload.type === 'bye') {
        seen.delete(payload.from);
        emit(opts.onPresence, presence());
      } else {
        emit(opts.onSignal, payload);
      }
    }

    function touch(id, name, host) {
      if (!id) return;
      seen.set(id, { name: name || 'Guest', ts: Date.now(), host: !!host });
      emit(opts.onPresence, presence());
    }

    function presence() {
      const now = Date.now();
      const list = [];
      seen.forEach((v, k) => { if (now - v.ts < 45000) list.push(Object.assign({ id: k }, v)); });
      if (!list.some((p) => p.id === me.id)) list.push({ id: me.id, name: me.name, ts: now, host: me.host });
      return list;
    }

    /* ---------- server ---------- */

    function startServer() {
      mode = 'server';
      status('connecting', 'local server');
      const url = `/api/room/${encodeURIComponent(room)}/events?id=${me.id}&name=${encodeURIComponent(me.name)}&host=${me.host ? 1 : 0}`;
      es = new EventSource(url);
      es.addEventListener('open', () => { status('live', 'local server'); send({ type: 'hello' }); });
      es.addEventListener('state', (e) => handle(Object.assign(JSON.parse(e.data), { type: 'state' })));
      es.addEventListener('chat', (e) => handle(Object.assign(JSON.parse(e.data), { type: 'chat' })));
      es.addEventListener('signal', (e) => handle(JSON.parse(e.data)));
      es.addEventListener('presence', (e) => {
        const d = JSON.parse(e.data);
        seen.clear();
        (d.people || []).forEach((p) => seen.set(p.id, { name: p.name, ts: Date.now(), host: p.host }));
        emit(opts.onPresence, presence());
      });
      es.addEventListener('error', () => status('reconnecting', 'local server'));
    }

    /* ---------- cloud ---------- */

    function startCloud() {
      mode = 'cloud';
      status('connecting', 'public relay');
      const src = `https://ntfy.sh/${topic}/sse?since=2m`;
      let opened = false;
      es = new EventSource(src);
      es.onopen = () => { opened = true; status('live', 'public relay'); };
      es.onmessage = (e) => {
        try {
          const outer = JSON.parse(e.data);
          if (outer.event !== 'message' || !outer.message) return;
          handle(JSON.parse(outer.message));
        } catch (err) {}
      };
      es.onerror = () => { if (!opened) status('connecting', 'public relay'); else status('reconnecting', 'public relay'); };
      publish({ type: 'hello' });
      // if the relay never opens, keep the room working on this device
      setTimeout(() => {
        if (closed || opened) return;
        if (es) { try { es.close(); } catch (e) {} es = null; }
        startLocal();
        status('offline', 'relay unreachable');
        if (opts.onFallback) opts.onFallback();
      }, 5500);
    }

    /* ---------- local ---------- */

    function startLocal() {
      mode = 'local';
      status('live', 'this device');
      try {
        bc = new BroadcastChannel('reeltalk-' + room);
        bc.onmessage = (e) => handle(e.data);
      } catch (err) {
        window.addEventListener('storage', (e) => {
          if (e.key === 'rt.room.' + room && e.newValue) {
            try { handle(JSON.parse(e.newValue)); } catch (err2) {}
          }
        });
      }
      send({ type: 'hello' });
    }

    /* ---------- send ---------- */

    function send(payload) {
      if (closed) return;
      const body = Object.assign({ room, from: me.id, name: me.name, host: me.host, ts: Date.now() }, payload);
      if (mode === 'server') {
        const ep = payload.type === 'chat' ? 'chat'
          : payload.type === 'state' ? 'state'
            : (payload.type === 'hello' || payload.type === 'bye') ? 'presence'
              : 'signal';
        fetch(`/api/room/${encodeURIComponent(room)}/${ep}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body)
        }).catch(() => {});
      } else if (mode === 'cloud') {
        publish(body);
      } else {
        if (bc) bc.postMessage(body);
        else try { localStorage.setItem('rt.room.' + room, JSON.stringify(body)); } catch (err) {}
      }
    }

    function publish(body) {
      fetch(`https://ntfy.sh/${topic}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(body)
      }).catch(() => {
        status('offline', 'relay unreachable');
        if (opts.onFallback) opts.onFallback();
      });
    }

    /* ---------- public ---------- */

    const api = {
      me,
      get mode() { return mode; },
      get state() { return state; },
      setState(s) { state = s; send({ type: 'state', state: s }); },
      signal(payload) { send(payload); },
      chat(text) { send({ type: 'chat', msg: { id: RT.rid(6), name: me.name, text, ts: Date.now() } }); },
      presence,
      heartbeat() { send({ type: 'hello' }); emit(opts.onPresence, presence()); },
      setName(n) { me.name = n; send({ type: 'hello' }); },
      becomeHost() { me.host = true; send({ type: 'hello' }); },
      async start() {
        if (opts.allowCloud !== false && location.protocol.startsWith('http')) {
          try {
            const ctl = new AbortController();
            const t = setTimeout(() => ctl.abort(), 1600);
            const res = await fetch('/api/health', { signal: ctl.signal, cache: 'no-store' });
            clearTimeout(t);
            if (res.ok) {
              startServer();
              heartbeatTimer = setInterval(() => api.heartbeat(), 20000);
              return mode;
            }
          } catch (e) {}
        }
        if (opts.allowCloud !== false) {
          startCloud();
          if (opts.onFallback) {
            // if the relay never opens, fall back to local
            setTimeout(() => {
              if (closed) return;
              if (mode === 'cloud' && es && es.readyState === 2) startLocal();
            }, 6000);
          }
        } else {
          startLocal();
        }
        heartbeatTimer = setInterval(() => api.heartbeat(), 20000);
        return mode;
      },
      useLocal() {
        if (es) { try { es.close(); } catch (e) {} es = null; }
        startLocal();
      },
      close() {
        closed = true;
        clearInterval(heartbeatTimer);
        send({ type: 'bye' });
        if (es) { try { es.close(); } catch (e) {} }
        if (bc) { try { bc.close(); } catch (e) {} }
      }
    };
    return api;
  };
})();

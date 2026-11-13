/* Reel Talk — shared core: data access, helpers, chrome, poster art */
(function () {
  'use strict';
  document.documentElement.classList.add('js');
  const RT = (window.RT = window.RT || {});

  /* ---------- constants ---------- */

  RT.LEVELS = [
    { id: 'A1', name: 'First words', tag: 'Short films, slow clear narration, pictures that carry the story', color: '#6f6f69' },
    { id: 'A2', name: 'Everyday English', tag: 'Family films with concrete plots and familiar situations', color: '#5e5e58' },
    { id: 'B1', name: 'Stories that carry you', tag: 'Clear standard English, strong plots, a few idioms', color: '#4b4b46' },
    { id: 'B2', name: 'Real world, real voices', tag: 'Accents, humour, professional vocabulary, irony', color: '#383834' },
    { id: 'C1', name: 'Language under pressure', tag: 'Overlapping talk, subtext, rhetorical moves', color: '#222220' },
    { id: 'C2', name: 'The deep end', tag: 'Period diction, dialect, jargon, deliberate ambiguity', color: '#111111' }
  ];

  RT.MOODS = ['warm', 'cool', 'noir', 'neon', 'sepia', 'pastel', 'earth', 'ice'];
  RT.MOTIFS = ['spot', 'beam', 'window', 'orbit', 'stairs', 'grid', 'stripes', 'arc'];

  /* ---------- tiny helpers ---------- */

  RT.$ = (sel, root) => (root || document).querySelector(sel);
  RT.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  RT.esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  RT.hash = (str) => {
    let h = 2166136261;
    for (let i = 0; i < String(str).length; i++) {
      h ^= String(str).charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
  };
  RT.duration = (min) => (min >= 60 ? Math.floor(min / 60) + 'h ' + (min % 60) + 'm' : min + ' min');
  RT.clock = (sec) => {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const ss = s < 10 ? '0' + s : String(s);
    if (h) return h + ':' + (m < 10 ? '0' + m : m) + ':' + ss;
    return m + ':' + ss;
  };
  RT.cue = (at) => RT.clock(RT.parseCue(at));
  RT.parseCue = (cue) => {
    const p = String(cue || '0:0:0').split(':').map(Number);
    if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
    if (p.length === 2) return p[0] * 60 + p[1];
    return p[0] || 0;
  };
  RT.debounce = (fn, ms) => {
    let t;
    return function () {
      clearTimeout(t);
      const args = arguments, self = this;
      t = setTimeout(() => fn.apply(self, args), ms || 180);
    };
  };
  RT.qs = (key, def) => {
    const v = new URLSearchParams(location.search).get(key);
    return v == null ? def : v;
  };
  RT.norm = (s) =>
    String(s || '')
      .toLowerCase()
      .replace(/[’‘`]/g, "'")
      .replace(/[^a-z0-9' ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  RT.copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    }
  };
  RT.toast = (msg, tone) => {
    let host = RT.$('.rt-toasts');
    if (!host) {
      host = document.createElement('div');
      host.className = 'rt-toasts';
      document.body.appendChild(host);
    }
    const el = document.createElement('div');
    el.className = 'rt-toast' + (tone ? ' is-' + tone : '');
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(() => el.classList.add('is-in'), 10);
    setTimeout(() => {
      el.classList.remove('is-in');
      setTimeout(() => el.remove(), 300);
    }, 2600);
  };

  /* ---------- storage ---------- */

  RT.store = {
    get(key, def) {
      try {
        const raw = localStorage.getItem('rt.' + key);
        return raw == null ? def : JSON.parse(raw);
      } catch (e) {
        return def;
      }
    },
    set(key, val) {
      try {
        localStorage.setItem('rt.' + key, JSON.stringify(val));
      } catch (e) {}
    },
    del(key) {
      try {
        localStorage.removeItem('rt.' + key);
      } catch (e) {}
    }
  };

  RT.progress = {
    all: () => RT.store.get('progress', {}),
    get(filmId) {
      const all = RT.progress.all();
      return all[filmId] || { gaps: {}, quotes: {}, quiz: {}, seen: {} };
    },
    save(filmId, patch) {
      const all = RT.progress.all();
      all[filmId] = Object.assign(RT.progress.get(filmId), patch);
      RT.store.set('progress', all);
    },
    score(film) {
      const p = RT.progress.get(film.id);
      let done = 0, total = 0;
      (film.gaps || []).forEach((g, i) => { total++; if (p.gaps && p.gaps[i]) done++; });
      (film.quotes || []).forEach((q, i) => { total++; if (p.quotes && p.quotes[i] != null) done++; });
      (film.quiz || []).forEach((q, i) => { total++; if (p.quiz && p.quiz[i] != null) done++; });
      total += (film.words || []).length;
      done += (p.vocab || []).length;
      total += 1;
      if (p.order) done += 1;
      total += 3;
      done += Object.keys(p.scramble || {}).length;
      total += (film.truefalse || []).length;
      done += Object.keys(p.tf || {}).length;
      total += (film.shortAnswers || []).length;
      done += Object.keys(p.sa || {}).length;
      return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
    }
  };

  /* ---------- data ---------- */

  RT.voter = () => {
    let v = RT.store.get('voter', '');
    if (!v) {
      v = 'u' + RT.rid(9);
      RT.store.set('voter', v);
    }
    return v;
  };

  RT.ratings = {
    server: false,
    data: { films: {} },
    mine: RT.store.get('myvotes', {}),
    async load() {
      if (location.protocol.startsWith('http')) {
        try {
          const res = await fetch('/api/votes', { cache: 'no-store' });
          if (res.ok) {
            const json = await res.json();
            RT.ratings.data = json && json.films ? json : { films: {} };
            RT.ratings.server = true;
            return RT.ratings.data;
          }
        } catch (e) {}
      }
      RT.ratings.data = { films: RT.store.get('ratingsLocal', {}) };
      return RT.ratings.data;
    },
    get(filmId) {
      return RT.ratings.data.films[filmId] || { count: 0, sum: 0, avg: 0 };
    },
    my(filmId) {
      return RT.ratings.mine[filmId] || 0;
    },
    async vote(filmId, value) {
      RT.ratings.mine[filmId] = value;
      RT.store.set('myvotes', RT.ratings.mine);
      const cur = RT.ratings.get(filmId);
      if (location.protocol.startsWith('http')) {
        try {
          const res = await fetch('/api/vote', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ film: filmId, value, voter: RT.voter() })
          });
          if (res.ok) {
            const json = await res.json();
            RT.ratings.data.films[filmId] = json.rating;
            return json.rating;
          }
        } catch (e) {}
      }
      const local = RT.store.get('ratingsLocal', {});
      const prev = RT.ratings.mine[filmId] && cur.count ? cur : { count: 0, sum: 0 };
      const next = { count: Math.max(prev.count, cur.count) + (cur.count ? 0 : 1), sum: (cur.sum || 0) + value, avg: 0 };
      next.avg = Math.round((next.sum / next.count) * 100) / 100;
      local[filmId] = next;
      RT.store.set('ratingsLocal', local);
      RT.ratings.data.films[filmId] = next;
      return next;
    }
  };

  RT.ready = (fn) => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  };

  Object.defineProperty(RT, 'films', {
    get() {
      const data = window.FILM_DATA || [];
      return data.map((f) => Object.assign({}, f, { _i: RT.hash(f.id) }));
    }
  });

  RT.byId = (id) => RT.films.find((f) => f.id === id);
  RT.questRoom = (filmId) => 'Q' + RT.hash(filmId + '-quest').toString(36).slice(0, 5).toUpperCase();
  RT.level = (id) => RT.LEVELS.find((l) => l.id === id) || RT.LEVELS[0];
  RT.byLevel = (id) => RT.films.filter((f) => f.level === id);
  RT.mood = (f) => f.mood || RT.MOODS[f._i % RT.MOODS.length];
  RT.motif = (f) => f.motif || RT.MOTIFS[f._i % RT.MOTIFS.length];

  RT.youtubeSearch = (f) =>
    'https://www.youtube.com/results?search_query=' +
    encodeURIComponent(f.title + ' ' + (f.episode || '') + ' ' + f.year + ' full movie');

  RT.watchLinks = (f) => {
    const q = encodeURIComponent(f.title + ' ' + f.year);
    const links = [];
    if (f.youtube && f.youtube.id) {
      links.push({ label: 'Watch on YouTube', note: (f.youtube.channel || 'free upload') + ' · opens on YouTube', url: 'https://www.youtube.com/watch?v=' + f.youtube.id, kind: 'youtube' });
    }
    links.push({ label: 'Search YouTube for the full film', note: 'find a free copy in your region', url: RT.youtubeSearch(f), kind: 'youtube-search' });
    if (f.free && f.free.url) {
      links.push({ label: 'Watch free on Internet Archive', note: 'Public domain · plays inside the club', url: f.free.url, kind: 'free' });
    }
    links.push({ label: 'Find where to watch', note: 'JustWatch — legal services by country', url: 'https://www.justwatch.com/us/search?q=' + q, kind: 'search' });
    links.push({ label: 'Trailer and clips', note: 'YouTube search', url: 'https://www.youtube.com/results?search_query=' + q + '+official+trailer', kind: 'trailer' });
    links.push({ label: 'About the film', note: 'Wikipedia', url: 'https://en.wikipedia.org/w/index.php?search=' + q, kind: 'info' });
    return links;
  };

  /* ---------- poster art ---------- */

  RT.poster = (f, opts) => {
    const o = opts || {};
    const title = f.title.length > 22 ? 'is-long' : f.title.length > 14 ? 'is-mid' : '';
    return (
      '<div class="poster ' + (f.poster ? 'is-photo ' : '') + (o.cls || '') + '" data-mood="' + RT.mood(f) + '" data-motif="' + RT.motif(f) + '">' +
      '<div class="poster-art">' +
      (f.poster
        ? '<img class="poster-img" src="' + f.poster + '" alt="' + RT.esc(f.title) + ' poster" loading="lazy">'
        : '') +
      (f.poster ? '' : '<span class="poster-mark" aria-hidden="true">' + f.level + '</span>') +
      '<span class="poster-level" style="--lv:' + RT.level(f.level).color + '">' + f.level + '</span>' +
      '<span class="poster-year">' + f.year + '</span>' +
      (f.kind === 'series' ? '<span class="poster-series">' + RT.esc(f.episode || 'series') + '</span>' : '') +
      '<div class="poster-name ' + title + '">' + RT.esc(f.title) + '</div>' +
      '<div class="poster-meta"><span>' + RT.esc(f.director.split('&')[0].trim()) + '</span><span>' + RT.duration(f.runtime) + '</span></div>' +
      '</div></div>'
    );
  };

  /* a missing poster file falls back to the drawn artwork */
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (!img || !img.classList || !img.classList.contains('poster-img')) return;
    const holder = img.closest ? img.closest('.poster') : null;
    if (holder) holder.classList.remove('is-photo');
    img.remove();
  }, true);

  /* ---------- chrome ---------- */

  RT.header = function (active) {
    const links = [
      ['index.html', 'Films', 'films'],
      ['index.html#tonight', 'Tonight', 'tonight'],
      ['watch.html', 'Watch party', 'watch'],
      ['quest.html', 'Team quest', 'quest'],
      ['index.html#toolkit', 'Toolkit', 'toolkit']
    ];
    return (
      '<div class="shell nav-inner">' +
      '<a class="brand" href="index.html" aria-label="Reel Talk home">' +
      '<span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="20" cy="20" r="4.2" fill="currentColor"/><circle cx="20" cy="8.5" r="2.1" fill="currentColor"/><circle cx="20" cy="31.5" r="2.1" fill="currentColor"/><circle cx="8.5" cy="20" r="2.1" fill="currentColor"/><circle cx="31.5" cy="20" r="2.1" fill="currentColor"/></svg></span>' +
      '<span class="brand-text"><strong>Reel Talk</strong><small>English film club</small></span>' +
      '</a>' +
      '<nav class="nav-links" aria-label="Main">' +
      links.map((l) => '<a href="' + l[0] + '"' + (active === l[2] ? ' class="is-active" aria-current="page"' : '') + '>' + l[1] + '</a>').join('') +
      '</nav>' +
      '<a class="btn btn-ghost btn-sm nav-cta" href="watch.html?new=1">Start a party</a>' +
      '<button class="nav-burger" type="button" aria-label="Menu" aria-expanded="false"><span></span><span></span></button>' +
      '</div>'
    );
  };

  RT.footer = function () {
    return (
      '<div class="shell footer-inner">' +
      '<div class="footer-brand"><span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="20" cy="20" r="4.2" fill="currentColor"/><circle cx="20" cy="8.5" r="2.1" fill="currentColor"/><circle cx="20" cy="31.5" r="2.1" fill="currentColor"/><circle cx="8.5" cy="20" r="2.1" fill="currentColor"/><circle cx="31.5" cy="20" r="2.1" fill="currentColor"/></svg></span>' +
      '<div><strong>Reel Talk</strong><p>Watch together, talk it through, play the scene. 83 titles, A1 to C2.</p></div></div>' +
      '<div class="footer-cols">' +
      '<div><h4>Club</h4><a href="index.html">The catalogue</a><a href="index.html#tonight">Tonight\'s screening</a><a href="index.html#toolkit">Toolkit</a></div>' +
      '<div><h4>Run a session</h4><a href="watch.html">Watch party</a><a href="quest.html">Team quest</a><a href="print.html">Worksheet</a></div>' +
      '<div><h4>Small print</h4><a href="index.html#legal">Where the films come from</a><a href="index.html#how">How a session works</a></div>' +
      '</div>' +
      '<p class="footer-note">Reel Talk links only to legal sources. Films stay on their own platforms — the club supplies the clock, the questions and the tasks, never a pirated copy. Posters come from the Wikipedia articles about these films and belong to their rights holders; they are used only to identify the titles.</p>' +
      '</div>'
    );
  };

  RT.mountChrome = function (active) {
    const h = RT.$('[data-rt-header]');
    if (h) h.innerHTML = RT.header(active);
    const f = RT.$('[data-rt-footer]');
    if (f) f.innerHTML = RT.footer();
    const burger = RT.$('.nav-burger');
    if (burger) {
      burger.addEventListener('click', () => {
        const open = document.body.classList.toggle('nav-open');
        burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      RT.$$('.nav-links a').forEach((a) => a.addEventListener('click', () => document.body.classList.remove('nav-open')));
    }
    // reveal on scroll
    const revealAll = () => RT.$$('[data-reveal]:not(.is-in)').forEach((el) => el.classList.add('is-in'));
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(
        (entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }),
        { rootMargin: '0px 0px -6% 0px' }
      );
      RT.$$('[data-reveal]').forEach((el, i) => {
        el.style.setProperty('--d', (i % 6) * 60 + 'ms');
        io.observe(el);
      });
      // safety net: if the observer never fires (headless, print, odd browsers), show everything
      setTimeout(() => {
        RT.$$('[data-reveal]:not(.is-in)').forEach((el) => {
          if (el.getBoundingClientRect().top < innerHeight * 1.2) el.classList.add('is-in');
        });
      }, 900);
      setTimeout(revealAll, 3200);
    } else {
      revealAll();
    }
  };

  /* ---------- misc UI ---------- */

  RT.levelChip = (level, extra) =>
    '<span class="lvl" style="--lv:' + RT.level(level).color + '">' + level + (extra ? ' · ' + extra : '') + '</span>';

  RT.ageChip = (age) => (age && age !== 'all' ? '<span class="chip chip-age">' + age + '</span>' : '<span class="chip chip-age">all ages</span>');

  RT.marquee = (items) => items.join('<span class="dot">·</span>');

  /* ---------- modal ---------- */

  RT.modal = function (opts) {
    const back = document.createElement('div');
    back.className = 'modal-backdrop';
    back.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true" aria-label="' + RT.esc(opts.title || '') + '">' +
      '<div class="modal-head"><div><h3>' + RT.esc(opts.title || '') + '</h3>' +
      (opts.sub ? '<p class="modal-sub">' + opts.sub + '</p>' : '') + '</div>' +
      '<button class="modal-x" type="button" aria-label="Close">✕</button></div>' +
      (opts.body || '') +
      (opts.actions ? '<div class="modal-actions">' + opts.actions + '</div>' : '') +
      '</div>';
    document.body.appendChild(back);
    document.body.style.overflow = 'hidden';
    const close = () => {
      back.classList.remove('is-open');
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      setTimeout(() => back.remove(), 260);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    back.addEventListener('click', (e) => { if (e.target === back) close(); });
    back.querySelector('.modal-x').addEventListener('click', close);
    requestAnimationFrame(() => back.classList.add('is-open'));
    const first = back.querySelector('input, button.btn');
    if (first) setTimeout(() => first.focus(), 120);
    return { el: back, close };
  };

  /* ---------- QR ---------- */

  RT.qr = function (text, cellSize) {
    try {
      const qr = qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      return qr.createSvgTag({ cellSize: cellSize || 5, margin: 2, scalable: true });
    } catch (e) {
      return '<span class="qr-fail">QR</span>';
    }
  };

  RT.baseUrl = () => location.origin === 'null' ? location.href.replace(/[^/]*$/, '') : location.origin + location.pathname.replace(/[^/]*$/, '');
  RT.abs = (rel) => new URL(rel, location.href).href;

  /* ---------- layout debug (?debug=1) ---------- */

  if (new URLSearchParams(location.search).has('debug')) {
    setTimeout(() => {
      const w = document.documentElement.clientWidth;
      const bad = [];
      document.querySelectorAll('body *').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width > w + 1 || r.right > w + 1) {
          bad.push(el.tagName.toLowerCase() + '.' + String(el.className || '').split(' ')[0] + '  w=' + Math.round(r.width) + ' right=' + Math.round(r.right));
        }
      });
      const pre = document.createElement('pre');
      pre.id = 'rt-debug';
      const sheets = Array.from(document.querySelectorAll('.sheet')).map((el, i) => 'sheet' + (i + 1) + '=' + Math.round(el.getBoundingClientRect().height)).join(' ');
      pre.textContent = 'viewport=' + w + ' bodyScroll=' + document.body.scrollWidth + ' | ' + sheets + '\n' + bad.slice(0, 40).join('\n');
      document.body.prepend(pre);
    }, 1400);
  }
})();

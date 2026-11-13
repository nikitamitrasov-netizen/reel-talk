/* Reel Talk — film page */
(function () {
  'use strict';
  const RT = window.RT;
  const $ = RT.$;
  const esc = RT.esc;

  let film = null;
  let deckIndex = 0;
  let deckEl = null;

  const TABS = [
    ['overview', 'Overview'],
    ['discuss', 'Discuss'],
    ['tasks', 'Tasks'],
    ['act', 'Act it out'],
    ['quest', 'Team quest'],
    ['teacher', 'For the teacher']
  ];

  RT.ready(() => {
    RT.mountChrome('films');
    const route = parseHash();
    film = RT.byId(route.id);
    if (!film) {
      $('#filmPanels').innerHTML = '<div class="empty" style="padding:120px 0">That film is not in the catalogue. <a class="text-link" href="index.html">Back to all films</a></div>';
      return;
    }
    document.title = film.title + ' — Reel Talk';
    renderHero();
    renderPanels();
    bindHero();
    showTab(route.tab || 'overview', true);
    window.addEventListener('hashchange', () => {
      const r = parseHash();
      if (r.id && r.id !== film.id) location.reload();
      else showTab(r.tab || 'overview', false);
    });
  });

  function parseHash() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    return { id: parts[0] === 'f' ? parts[1] : parts[0], tab: parts[2] || '' };
  }

  /* ── hero ─────────────────────────────────────────────── */

  function renderHero() {
    const lv = RT.level(film.level);
    $('#filmHero').dataset.mood = RT.mood(film);
    $('#filmPoster').innerHTML = RT.poster(film);
    $('#filmTitle').textContent = film.title;
    $('#crumbLevel').textContent = film.kind === 'series'
      ? 'Series · ' + film.episode + ' · ' + (film.episodeTitle || '')
      : film.level + ' · ' + lv.name;
    $('#filmLogline').textContent = film.logline;
    $('#filmMeta').innerHTML = [
      `<span class="lvl" style="--lv:${lv.color}">${film.level} · ${lv.name}</span>`,
      film.kind === 'series' ? `<span class="chip chip-amber">${esc(film.episode)}</span>` : '',
      `<span class="chip">${film.year}</span>`,
      `<span class="chip">${RT.duration(film.runtime)}</span>`,
      `<span class="chip">${film.genres.join(' / ')}</span>`,
      `<span class="chip">${esc(film.country)}</span>`,
      RT.ageChip(film.age),
      film.free ? '<span class="chip chip-free">▶ free to stream here</span>' : ''
    ].join('');

    $('#filmActions').innerHTML =
      `<a class="btn btn-primary" href="watch.html#/w/${film.id}">Watch together <span class="arr">→</span></a>` +
      `<a class="btn btn-ghost" href="${RT.youtubeSearch(film)}" target="_blank" rel="noopener">Find on YouTube</a>` +
      `<button class="btn btn-ghost" id="btnWhere" type="button">Where to watch</button>` +
      `<a class="btn btn-ghost" href="watch.html?taster=1#/w/${film.id}">Taster · 20 min</a>`;

    $('#filmTabs').innerHTML = TABS.map(([id, label]) => {
      let n = '';
      if (id === 'discuss') n = film.questions.length;
      if (id === 'tasks') n = film.gaps.length + film.quotes.length + film.quiz.length + film.words.length + 3;
      if (id === 'quest') n = film.quest.length;
      return `<button type="button" data-tab="${id}">${label}${n ? `<span class="n">${n}</span>` : ''}</button>`;
    }).join('');
    RT.$$('#filmTabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab, false)));
    refreshProgress();
  }

  function bindHero() {
    $('#btnWhere').addEventListener('click', showWhere);
    const setLink = $('#btnSetLink2');
    if (setLink) setLink.addEventListener('click', showLinkModal);
  }

  function showLinkModal() {
    const saved = RT.store.get('source.' + film.id, null);
    const m = RT.modal({
      title: 'Your film link',
      sub: 'Paste the page where the club watches this film. The room will show an “Open the film” button and keep the shared clock.',
      body: `<label class="field" style="display:grid;gap:6px;margin-bottom:10px"><span>Link</span>
          <input id="myLink" placeholder="https://…" value="${saved && saved.url ? RT.esc(saved.url) : ''}"></label>
        <p style="font-size:12.5px;color:var(--muted);line-height:1.6">Reel Talk does not host or copy the film and does not check the site you use. The link stays on this device and in your room.</p>`,
      actions: `<button class="btn btn-ghost btn-sm" id="linkClear" type="button">Clear</button>
                <a class="btn btn-ghost btn-sm" href="watch.html#/w/${film.id}">Open the room</a>
                <button class="btn btn-primary btn-sm" id="linkSave" type="button">Save</button>`
    });
    $('#linkSave').addEventListener('click', () => {
      const url = $('#myLink').value.trim();
      if (!url) return;
      RT.store.set('source.' + film.id, { type: 'page', url, label: 'External player' });
      m.close();
      RT.toast('Link saved — the room will use it', 'good');
    });
    $('#linkClear').addEventListener('click', () => {
      RT.store.del('source.' + film.id);
      m.close();
      RT.toast('Link cleared');
    });
  }

  function refreshProgress() {
    const s = RT.progress.score(film);
    const el = $('#filmProgress');
    if (!el) return;
    el.innerHTML = s.done
      ? `<span>Language tasks</span><span class="bar"><i style="width:${s.pct}%"></i></span><span>${s.done} of ${s.total} done</span>`
      : `<span>Language tasks</span><span class="bar"><i></i></span><span>${s.total} ready · nothing started</span>`;
  }

  /* ── tab switching ────────────────────────────────────── */

  function showTab(tab, initial) {
    if (!TABS.some((t) => t[0] === tab)) tab = 'overview';
    RT.$$('#filmTabs button').forEach((b) => b.classList.toggle('is-on', b.dataset.tab === tab));
    RT.$$('.tab-panel').forEach((p) => p.classList.toggle('is-on', p.dataset.tab === tab));
    const hash = '#/f/' + film.id + (tab === 'overview' ? '' : '/' + tab);
    if (location.hash !== hash) history.replaceState(null, '', hash);
    if (!initial) {
      const wrap = $('.film-tabs-wrap');
      const y = wrap ? wrap.getBoundingClientRect().top + window.scrollY - 69 : 0;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  }

  /* ── panels ───────────────────────────────────────────── */

  function renderPanels() {
    const lv = RT.level(film.level);
    const total = film.gaps.length + film.quotes.length + film.quiz.length + film.words.length + 3;
    const html =
      `<section class="tab-panel" data-tab="overview">${overviewHTML(lv)}</section>` +
      `<section class="tab-panel" data-tab="discuss">${discussHTML()}</section>` +
      `<section class="tab-panel" data-tab="tasks">${tasksHTML(total)}</section>` +
      `<section class="tab-panel" data-tab="act">${actHTML()}</section>` +
      `<section class="tab-panel" data-tab="quest">${questHTML()}</section>` +
      `<section class="tab-panel" data-tab="teacher">${teacherHTML()}</section>`;
    $('#filmPanels').innerHTML = html;
    bindOverview();
    bindDiscuss();
    bindTasks();
    bindAct();
    bindQuest();
    bindTeacher();
  }

  /* ── overview ─────────────────────────────────────────── */

  function overviewHTML(lv) {
    const words = film.words.map((w) =>
      `<div class="vocab-card"><div class="w">${esc(w.w)}</div><div class="d">${esc(w.def)}</div>` +
      (w.ex ? `<div class="e">“${esc(w.ex)}”</div>` : '') + `</div>`
    ).join('');

    const cues = film.scenes.map((s, i) =>
      `<div class="cue-item"><div class="t">≈ ${RT.cue(s.at)}<small>cue ${(i + 1)}</small></div>` +
      `<div><h3>${esc(s.title)}</h3><p>${esc(s.task)}</p></div>` +
      `<span class="cue-type">${esc(s.type || 'moment')}</span></div>`
    ).join('');

    const links = RT.watchLinks(film).map((l) =>
      `<a class="link-row" href="${l.url}" target="_blank" rel="noopener"><span class="lk-body"><strong>${esc(l.label)}</strong><span>${esc(l.note)}</span></span><span class="lk-arr">↗</span></a>`
    ).join('');

    return `
    <div class="cols">
      <div class="col-main">
        <section>
          <div class="block-head"><h2>Why it works at ${film.level}</h2><span class="mono-note">${film.words.length} words · ${film.scenes.length} cues</span></div>
          <p class="why-block">${esc(film.why)}</p>
        </section>

        <div class="note-grid">
          <div class="note-card"><h3>What you will hear</h3><p>${esc(film.language)}</p></div>
          <div class="note-card is-content"><h3>Content note</h3><p>${esc(film.content)}</p></div>
        </div>

        <section>
          <div class="block-head"><h2>Six words to take home</h2><span class="mono-note">say them out loud</span></div>
          <div class="vocab-grid">${words}</div>
        </section>

        <section>
          <div class="block-head"><h2>Cue points</h2><span class="mono-note">pause the room here</span></div>
          <p class="block-lede">Times are approximate — players differ by a few seconds. While hosting, hit <b>Capture moment</b> in the watch room to pin the exact second.</p>
          <div class="cue-list">${cues}</div>
        </section>
      </div>

      <aside class="col-side">
        <div class="side-card">
          <h3>At a glance</h3>
          <dl class="fact-list">
            <div><dt>Level</dt><dd>${film.level} · ${lv.name}</dd></div>
            <div><dt>Year</dt><dd>${film.year}</dd></div>
            <div><dt>Runtime</dt><dd>${RT.duration(film.runtime)}</dd></div>
            <div><dt>Country</dt><dd>${esc(film.country)}</dd></div>
            <div><dt>Director</dt><dd>${esc(film.director)}</dd></div>
            <div><dt>Genre</dt><dd>${esc(film.genres.join(', '))}</dd></div>
            <div><dt>Age</dt><dd>${film.age === 'all' ? 'all ages' : film.age}</dd></div>
          </dl>
        </div>

        <div class="side-card">
          <h3>Club rating</h3>
          <div id="rateBox"><p class="room-note">Loading…</p></div>
        </div>

        <div class="side-card">
          <h3>Where to watch</h3>
          <div class="link-list">${links}</div>
        </div>

        <div class="side-card">
          <h3>Run this film</h3>
          <div style="display:grid;gap:8px">
            <a class="btn btn-primary btn-block btn-sm" href="watch.html#/w/${film.id}">Open the watch room</a>
            <button class="btn btn-ghost btn-block btn-sm" id="btnSetLink2" type="button">Save the film link</button>
            <a class="btn btn-ghost btn-block btn-sm" href="watch.html?taster=1#/w/${film.id}">Run a 20-minute taster</a>
            <a class="btn btn-ghost btn-block btn-sm" href="print.html#/ws/${film.id}">Print the worksheet</a>
            <a class="btn btn-ghost btn-block btn-sm" href="quest.html#/build/${film.id}">Build the team quest</a>
          </div>
        </div>
      </aside>
    </div>`;
  }

  function bindOverview() {
    renderRating();
  }

  async function renderRating() {
    const box = $('#rateBox');
    if (!box) return;
    await RT.ratings.load();
    const r = RT.ratings.get(film.id);
    const mine = RT.ratings.my(film.id);
    const shown = mine || Math.round(r.avg || 0);
    box.innerHTML =
      '<div class="stars" role="group" aria-label="Rate this film">' +
      [1, 2, 3, 4, 5].map((n) => `<button type="button" data-star="${n}" class="${n <= shown ? 'is-on' : ''}" aria-label="${n} out of 5">★</button>`).join('') +
      '</div>' +
      '<p class="rate-meta">' + (r.count
        ? '<b>' + Number(r.avg).toFixed(1) + '</b> · ' + r.count + (r.count === 1 ? ' vote' : ' votes') +
          (RT.ratings.server ? ' from the club' : ' on this device')
        : 'No votes yet — be the first') + '</p>' +
      (RT.ratings.server ? '' : '<p class="rate-mine">Club-wide votes need the club server; here the rating stays in this browser.</p>') +
      (mine ? '<p class="rate-mine">Your vote: ' + mine + '/5 · tap another star to change it</p>' : '');
    RT.$$('#rateBox [data-star]').forEach((b) => b.addEventListener('click', async () => {
      await RT.ratings.vote(film.id, +b.dataset.star);
      renderRating();
      RT.toast('Your vote is in', 'good');
    }));
  }

  /* ── discuss ──────────────────────────────────────────── */

  function discussHTML() {
    return `
    <div class="block-head">
      <div><h2>Eight questions</h2><p class="block-lede" style="margin:6px 0 0">From “what happened” to “what would you have done”. Use the deck so the room stays on one question.</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" id="btnDeck" type="button">Question deck</button>
        <button class="btn btn-ghost btn-sm" id="btnCopyQ" type="button">Copy all</button>
      </div>
    </div>
    <div class="q-grid">
      ${film.questions.map((q, i) => `<div class="q-card"><span class="n">${(i + 1)}</span><p>${esc(q)}</p></div>`).join('')}
    </div>
    <div class="discuss-tips">
      <div class="tip"><h4>One at a time</h4><p>Read the question, then stop talking. Seven seconds of silence is thinking time, not a gap to fill.</p></div>
      <div class="tip"><h4>Ask for evidence</h4><p>“Which moment makes you say that?” turns an opinion into a scene reference — and a second listening.</p></div>
      <div class="tip"><h4>Use the language</h4><p>Push for one word from the vocabulary list per answer. Six words used beats sixty explained.</p></div>
    </div>`;
  }

  function bindDiscuss() {
    $('#btnDeck').addEventListener('click', openDeck);
    $('#btnCopyQ').addEventListener('click', async () => {
      const text = film.title + ' (' + film.year + ') — discussion questions\n\n' + film.questions.map((q, i) => (i + 1) + '. ' + q).join('\n');
      const ok = await RT.copy(text);
      RT.toast(ok ? 'Eight questions copied' : 'Could not copy', ok ? 'good' : 'bad');
    });
  }

  function openDeck() {
    if (deckEl) deckEl.remove();
    deckIndex = 0;
    deckEl = document.createElement('div');
    deckEl.className = 'deck';
    deckEl.innerHTML =
      '<div class="deck-top"><span class="deck-kicker">' + esc(film.title) + ' · question deck</span>' +
      '<button class="icon-btn" id="deckClose" aria-label="Close">✕</button></div>' +
      '<div class="deck-body"><p class="deck-q" id="deckQ"></p></div>' +
      '<div class="deck-foot">' +
      '<button class="deck-btn" id="deckPrev" aria-label="Previous question">←</button>' +
      '<span class="deck-count" id="deckCount"></span>' +
      '<button class="deck-btn" id="deckNext" aria-label="Next question">→</button>' +
      '</div><p class="deck-hint">arrow keys · esc to close</p>';
    document.body.appendChild(deckEl);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => deckEl.classList.add('is-open'));

    const paint = () => {
      $('#deckQ').textContent = film.questions[deckIndex];
      $('#deckCount').textContent = (deckIndex + 1) + ' / ' + film.questions.length;
    };
    const step = (d) => { deckIndex = (deckIndex + d + film.questions.length) % film.questions.length; paint(); };
    const close = () => {
      deckEl.classList.remove('is-open');
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      setTimeout(() => { deckEl.remove(); deckEl = null; }, 260);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); step(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    };
    $('#deckNext').addEventListener('click', () => step(1));
    $('#deckPrev').addEventListener('click', () => step(-1));
    $('#deckClose').addEventListener('click', close);
    deckEl.addEventListener('click', (e) => { if (e.target === deckEl) close(); });
    document.addEventListener('keydown', onKey);
    paint();
  }

  /* ── tasks ────────────────────────────────────────────── */

  function gapRow(g, i) {
    const parts = g.line.split('___');
    const width = Math.max(80, Math.min(220, String(g.answer).length * 11 + 34));
    return `<div class="gap-row" data-i="${i}">
      <span class="gap-n">${(i + 1)}</span>
      <div>
        <div class="gap-line">${esc(parts[0])}<input type="text" data-gap="${i}" style="width:${width}px" autocomplete="off" spellcheck="false" aria-label="Missing word ${i + 1}">${esc(parts[1] || '')}${g.adapted ? '<span class="gap-hint">adapted line</span>' : ''}</div>
        <div class="gap-fb" data-fb="${i}"></div>
      </div>
    </div>`;
  }

  function tasksHTML(total) {
    return `
    <div class="score-bar">
      <span class="num">Language tasks <b id="scoreNum">0/${total}</b></span>
      <div class="track"><i id="scoreBar"></i></div>
      <button class="btn btn-quiet btn-sm" id="btnReset" type="button">Reset</button>
    </div>

    <div class="task-block">
      <div class="task-head"><h2>Fill the gap</h2><button class="btn btn-ghost btn-sm" id="btnCheckAll" type="button">Check all</button></div>
      <div class="task-body" id="gaps">${film.gaps.map(gapRow).join('')}</div>
    </div>

    <div class="task-block" style="margin-top:16px">
      <div class="task-head"><h2>Who says it?</h2><span class="hint">one click · no undo</span></div>
      <div class="task-body" id="quotes">
        ${film.quotes.map((q, i) => `<div class="quote-card" data-i="${i}">
          <p class="quote-text">${esc(q.quote)}</p>
          <div class="opt-list">${q.options.map((o, oi) => `<button class="opt" type="button" data-q="${i}" data-o="${oi}"><span class="key">${'ABC'[oi]}</span>${esc(o)}</button>`).join('')}</div>
          <div class="fb-line" data-fb="${i}"></div>
        </div>`).join('')}
      </div>
    </div>

    <div class="task-block" style="margin-top:16px">
      <div class="task-head"><h2>Did you catch that?</h2><span class="hint">comprehension</span></div>
      <div class="task-body" id="quiz">
        ${film.quiz.map((q, i) => `<div class="quiz-card" data-i="${i}">
          <p class="quiz-q"><span class="n">${(i + 1)}</span><span>${esc(q.q)}</span></p>
          <div class="opt-list">${q.options.map((o, oi) => `<button class="opt" type="button" data-z="${i}" data-o="${oi}"><span class="key">${'ABC'[oi]}</span>${esc(o)}</button>`).join('')}</div>
          <div class="fb-line" data-fb="${i}"></div>
        </div>`).join('')}
      </div>
    </div>

    <div class="task-block" style="margin-top:16px">
      <div class="task-head"><h2>Match the word</h2><span class="hint">6 pairs · word, then meaning</span></div>
      <div class="task-body">
        <div class="match-grid">
          <div class="match-col" id="matchWords"></div>
          <div class="match-col" id="matchDefs"></div>
        </div>
      </div>
    </div>

    <div class="task-block" style="margin-top:16px">
      <div class="task-head"><h2>Put the scene in order</h2><span class="hint">4 moments</span></div>
      <div class="task-body">
        <p class="drill-lede">Click the four moments in the order they happen in the film.</p>
        <div class="order-chips" id="orderChips"></div>
        <div class="order-line" id="orderLine"></div>
      </div>
    </div>

    <div class="task-block" style="margin-top:16px">
      <div class="task-head"><h2>Rebuild the line</h2><span class="hint">2 lines</span></div>
      <div class="task-body" id="scrambleBox"></div>
    </div>`;
  }

  function bindTasks() {
    const p = RT.progress.get(film.id);

    RT.$$('input[data-gap]').forEach((input) => {
      const i = +input.dataset.gap;
      if (p.gaps && p.gaps[i] === true) { input.value = film.gaps[i].answer; markGap(i, true); }
      else if (p.gaps && p.gaps[i] === false) { input.classList.add('bad'); }
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); checkGap(i); } });
      input.addEventListener('blur', () => checkGap(i));
    });

    if ($('#btnCheckAll')) $('#btnCheckAll').addEventListener('click', () => {
      film.gaps.forEach((_, i) => checkGap(i));
      updateScore();
    });

    RT.$$('button[data-q]').forEach((btn) => {
      const i = +btn.dataset.q;
      if (p.quotes && p.quotes[i] != null) paintQuote(i, p.quotes[i], true);
      btn.addEventListener('click', () => answerQuote(i, +btn.dataset.o));
    });

    RT.$$('button[data-z]').forEach((btn) => {
      const i = +btn.dataset.z;
      if (p.quiz && p.quiz[i] != null) paintQuiz(i, p.quiz[i], true);
      btn.addEventListener('click', () => answerQuiz(i, +btn.dataset.o));
    });

    if ($('#btnReset')) $('#btnReset').addEventListener('click', () => {
      RT.progress.save(film.id, { gaps: {}, quotes: {}, quiz: {}, vocab: [], order: false, scramble: {} });
      renderPanels();
      showTab('tasks', true);
      RT.toast('Tasks reset');
    });

    bindDrills();
    updateScore();
  }

  function markGap(i, ok) {
    const input = $(`input[data-gap="${i}"]`);
    const fb = $(`[data-fb="${i}"]`);
    input.classList.toggle('ok', ok);
    input.classList.toggle('bad', !ok);
    fb.className = 'gap-fb ' + (ok ? 'ok' : 'bad');
    fb.textContent = ok ? '✓ correct' : '✗ not yet — hint: ' + film.gaps[i].hint;
  }

  function checkGap(i) {
    const input = $(`input[data-gap="${i}"]`);
    if (!input || !input.value.trim()) return;
    const ok = RT.norm(input.value) === RT.norm(film.gaps[i].answer);
    const p = RT.progress.get(film.id);
    p.gaps = p.gaps || {};
    p.gaps[i] = ok;
    RT.progress.save(film.id, { gaps: p.gaps });
    markGap(i, ok);
    updateScore();
  }

  function answerQuote(i, choice) {
    const q = film.quotes[i];
    if (RT.progress.get(film.id).quotes[i] != null) return;
    const p = RT.progress.get(film.id);
    p.quotes = p.quotes || {};
    p.quotes[i] = choice;
    RT.progress.save(film.id, { quotes: p.quotes });
    paintQuote(i, choice, false);
    updateScore();
  }

  function paintQuote(i, choice, silent) {
    const q = film.quotes[i];
    const card = $(`#quotes .quote-card[data-i="${i}"]`);
    if (!card) return;
    RT.$$('.opt', card).forEach((b) => {
      b.disabled = true;
      const o = +b.dataset.o;
      if (o === q.answer) b.classList.add('ok');
      else if (o === choice) b.classList.add('bad');
    });
    const fb = $('.fb-line', card);
    fb.className = 'fb-line ' + (choice === q.answer ? 'ok' : 'bad');
    fb.innerHTML = (choice === q.answer ? '✓ ' : '✗ It was “' + esc(q.options[q.answer]) + '”. ') +
      '<span class="why">' + esc(q.note || '') + '</span>';
  }

  function answerQuiz(i, choice) {
    if (RT.progress.get(film.id).quiz[i] != null) return;
    const p = RT.progress.get(film.id);
    p.quiz = p.quiz || {};
    p.quiz[i] = choice;
    RT.progress.save(film.id, { quiz: p.quiz });
    paintQuiz(i, choice, false);
    updateScore();
  }

  function paintQuiz(i, choice, silent) {
    const q = film.quiz[i];
    const card = $(`#quiz .quiz-card[data-i="${i}"]`);
    if (!card) return;
    RT.$$('.opt', card).forEach((b) => {
      b.disabled = true;
      const o = +b.dataset.o;
      if (o === q.answer) b.classList.add('ok');
      else if (o === choice) b.classList.add('bad');
    });
    const fb = $('.fb-line', card);
    fb.className = 'fb-line ' + (choice === q.answer ? 'ok' : 'bad');
    fb.innerHTML = (choice === q.answer ? '✓ ' : '✗ ') + '<span class="why">' + esc(q.why || '') + '</span>';
  }

  function updateScore() {
    const s = RT.progress.score(film);
    const num = $('#scoreNum');
    const bar = $('#scoreBar');
    if (num) num.textContent = s.done + '/' + s.total;
    if (bar) bar.style.width = s.pct + '%';
    refreshProgress();
  }

  /* ── extra drills: match, order, scramble ─────────────── */

  function seededShuffle(arr, seed) {
    const a = arr.slice();
    let x = seed;
    for (let i = a.length - 1; i > 0; i--) {
      x = (x * 9301 + 49297) % 233280;
      const j = Math.floor((x / 233280) * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function bindDrills() {
    const p = RT.progress.get(film.id);

    /* vocabulary match */
    const wordsBox = $('#matchWords');
    const defsBox = $('#matchDefs');
    if (!wordsBox) return;
    let donePairs = Array.isArray(p.vocab) ? p.vocab.slice() : [];
    const defs = seededShuffle(film.words.map((w, i) => ({ i, def: w.def })), 5 + film.title.length);
    wordsBox.innerHTML = film.words.map((w, i) =>
      `<button class="match-item" type="button" data-w="${i}">${esc(w.w)}</button>`).join('');
    defsBox.innerHTML = defs.map((d) =>
      `<button class="match-item" type="button" data-d="${d.i}">${esc(d.def)}</button>`).join('');
    donePairs.forEach((i) => {
      const w = $(`[data-w="${i}"]`);
      const d = $(`[data-d="${i}"]`);
      if (w) w.classList.add('is-done');
      if (d) d.classList.add('is-done');
    });
    let picked = null;
    RT.$$('#matchWords [data-w]').forEach((b) => b.addEventListener('click', () => {
      if (b.classList.contains('is-done')) return;
      RT.$$('#matchWords .match-item').forEach((x) => x.classList.remove('is-picked'));
      b.classList.add('is-picked');
      picked = +b.dataset.w;
    }));
    RT.$$('#matchDefs [data-d]').forEach((b) => b.addEventListener('click', () => {
      if (b.classList.contains('is-done') || picked == null) return;
      if (+b.dataset.d === picked) {
        b.classList.add('is-done');
        const w = $(`#matchWords [data-w="${picked}"]`);
        if (w) { w.classList.add('is-done'); w.classList.remove('is-picked'); }
        if (donePairs.indexOf(picked) < 0) donePairs.push(picked);
        RT.progress.save(film.id, { vocab: donePairs });
        if (donePairs.length === film.words.length) RT.toast('All six pairs matched', 'good');
        picked = null;
        updateScore();
      } else {
        b.classList.add('is-wrong');
        setTimeout(() => b.classList.remove('is-wrong'), 500);
      }
    }));

    /* scene order */
    const chips = $('#orderChips');
    const line = $('#orderLine');
    const orderIdx = seededShuffle(film.scenes.map((_, i) => i), 9 + film.title.length);
    let seq = [];
    if (p.order) {
      chips.innerHTML = '<p class="drill-ok">✓ Scene order solved</p>';
      line.innerHTML = '';
    } else {
      chips.innerHTML = orderIdx.map((i) => `<button class="order-chip" type="button" data-o="${i}">${esc(film.scenes[i].title)}</button>`).join('');
      RT.$$('#orderChips [data-o]').forEach((b) => b.addEventListener('click', () => {
        if (b.classList.contains('is-used')) return;
        b.classList.add('is-used');
        seq.push(+b.dataset.o);
        paintOrder();
      }));
    }
    function paintOrder() {
      line.innerHTML = seq.map((i) => `<span class="order-step">${esc(film.scenes[i].title)}</span>`).join('<span class="order-arrow">→</span>');
      if (seq.length < film.scenes.length) return;
      const ok = seq.every((v, k) => v === k);
      if (ok) {
        RT.progress.save(film.id, { order: true });
        line.innerHTML = '<p class="drill-ok">✓ That is the right order</p>';
        chips.innerHTML = '';
        updateScore();
      } else {
        line.innerHTML = '<p class="drill-bad">✗ Not quite — reset and try again. Start with the moment that comes first.</p>';
        setTimeout(() => {
          seq = [];
          RT.$$('#orderChips .order-chip').forEach((b) => b.classList.remove('is-used'));
          paintOrder();
        }, 1400);
      }
    }

    /* rebuild the line */
    const box = $('#scrambleBox');
    const drills = film.gaps.slice(0, 2).map((g, i) => {
      const full = g.line.replace('___', g.answer);
      return { i, full, words: seededShuffle(full.split(' '), 11 + i * 7 + film.title.length) };
    });
    const solved = p.scramble || {};
    box.innerHTML = drills.map((d) => `<div class="scramble" data-s="${d.i}">
        <p class="scramble-hint">${solved[d.i] ? '✓ Rebuilt' : 'Put the words back in order.'}</p>
        <div class="scramble-answer" data-ans="${d.i}"></div>
        <div class="scramble-words">${d.words.map((w, k) => `<button class="word-chip" type="button" data-s="${d.i}" data-k="${k}">${esc(w)}</button>`).join('')}</div>
        <div class="scramble-actions"><button class="btn btn-ghost btn-sm" type="button" data-check="${d.i}" ${solved[d.i] ? 'disabled' : ''}>Check</button><button class="btn btn-quiet btn-sm" type="button" data-reset="${d.i}" ${solved[d.i] ? 'disabled' : ''}>Reset</button></div>
      </div>`).join('');

    const answers = { 0: [], 1: [] };
    RT.$$('.scramble').forEach((card) => {
      const si = +card.dataset.s;
      const ansBox = $('[data-ans]', card);
      const paint = () => {
        ansBox.innerHTML = answers[si].map((k) => `<span class="word-chip is-placed">${esc(drills[si].words[k])}</span>`).join('');
        RT.$$('.scramble-words .word-chip', card).forEach((b) => {
          b.classList.toggle('is-hidden', answers[si].indexOf(+b.dataset.k) >= 0);
        });
      };
      RT.$$('.scramble-words .word-chip', card).forEach((b) => b.addEventListener('click', () => {
        if (solved[si]) return;
        answers[si].push(+b.dataset.k);
        paint();
      }));
      $('[data-reset]', card).addEventListener('click', () => { answers[si] = []; paint(); });
      $('[data-check]', card).addEventListener('click', () => {
        const built = answers[si].map((k) => drills[si].words[k]).join(' ');
        if (RT.norm(built) === RT.norm(drills[si].full)) {
          solved[si] = true;
          RT.progress.save(film.id, { scramble: solved });
          $('.scramble-hint', card).textContent = '✓ Rebuilt';
          updateScore();
          RT.toast('Line rebuilt', 'good');
        } else {
          $('.scramble-hint', card).innerHTML = '<span class="drill-bad">Not yet — compare it with the film’s line.</span>';
        }
      });
      paint();
    });
  }

  /* ── act it out ───────────────────────────────────────── */

  function actHTML() {
    const rp = film.roleplay;
    const improv = film.scenes.filter((s) => s.type === 'speak' || s.type === 'think' || s.type === 'predict');
    const extras = (improv.length ? improv : film.scenes).slice(0, 2);
    return `
    <div class="block-head"><h2>Act the scene</h2><span class="mono-note">2–3 minutes · no props</span></div>
    <p class="block-lede">The film has just ended and the room is still in it. Put the language in their mouths before it cools.</p>

    <div class="roleplay">
      <div class="rp-top">
        <p class="kicker" style="margin-bottom:10px">Role-play card</p>
        <h2>${esc(rp.title)}</h2>
        <p class="rp-setting">${esc(rp.setting)}</p>
      </div>
      <div class="rp-roles">
        ${rp.roles.map((r) => `<div class="rp-role"><span class="role-name">${esc(r.role)}</span><p class="role-brief">${esc(r.brief)}</p></div>`).join('')}
      </div>
      <div class="rp-bottom">
        <p class="rp-challenge"><b>Challenge:</b> ${esc(rp.challenge)}</p>
        <a class="btn btn-ghost btn-sm" href="print.html#/ws/${film.id}/roles">Print role cards</a>
      </div>
    </div>

    <div class="run-steps">
      <div class="run-step"><div class="k">Step 1 · 2 min</div><h4>Read your card</h4><p>Everyone reads only their own brief. No rehearsal yet — the first try is the honest one.</p></div>
      <div class="run-step"><div class="k">Step 2 · 3 min</div><h4>Plan one move</h4><p>Each player chooses one thing they want from the scene. Write it down in one sentence.</p></div>
      <div class="run-step"><div class="k">Step 3 · 3 min</div><h4>Play it</h4><p>Start from the setting line, not from “hello”. The scene ends when someone gets what they want — or fails.</p></div>
      <div class="run-step"><div class="k">Step 4 · 2 min</div><h4>Rewind</h4><p>Replay the last thirty seconds with one line changed. What changes in the room?</p></div>
    </div>

    <div class="block-head" style="margin-top:36px"><h2>Scenes to improvise</h2><span class="mono-note">from the cue list</span></div>
    <div class="cue-list">
      ${extras.map((s) => `<div class="cue-item"><div class="t">≈ ${esc(s.at)}<small>improv</small></div><div><h3>${esc(s.title)}</h3><p>Pause at the cue. Act out what the characters say next — in English, in character, for ninety seconds.</p></div><span class="cue-type">${esc(s.type)}</span></div>`).join('')}
    </div>`;
  }

  function bindAct() {}

  /* ── quest ────────────────────────────────────────────── */

  function questHTML() {
    return `
    <div class="block-head">
      <div><h2>Four QR stations</h2><p class="block-lede" style="margin:6px 0 0">Print the cards, hide them round the room, let teams scan and answer. Every answer is checked against the film.</p></div>
      <a class="btn btn-ghost btn-sm" href="quest.html#/build/${film.id}">Open the quest builder</a>
    </div>
    <div class="station-grid">
      ${film.quest.map((q, i) => {
        const url = RT.abs('quest.html?room=' + RT.questRoom(film.id) + '#/s/' + film.id + '/' + i);
        return `<div class="station">
          <div>
            <h3>${esc(q.title.replace(/^\s*Station\s*\d+\s*[·:—-]\s*/i, ''))}</h3>
            <p>${esc(q.task)}</p>
            <div class="pts">${q.points || 10} points · station ${i + 1}</div>
            <button class="btn btn-quiet btn-sm" type="button" data-reveal-answer="${i}" style="padding-left:0">Reveal answer</button>
            <div class="station-answer" data-answer="${i}"><b>Answer:</b> ${esc(q.answer)}</div>
          </div>
          <div class="qr-box" aria-label="QR code for station ${i + 1}">${RT.qr(url, 5)}</div>
        </div>`;
      }).join('')}
    </div>
    <div class="side-card" style="margin-top:20px">
      <h3>How to run it</h3>
      <p style="font-size:14px;color:var(--muted);line-height:1.6">Four teams, four stations, one phone per team. Each station page opens on the phone with the task and an answer box — teams type, check, and collect the points. The teacher keeps the scoreboard on the projector.</p>
      <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
        <a class="btn btn-ghost btn-sm" href="quest.html#/build/${film.id}">Teams &amp; scoreboard</a>
        <a class="btn btn-ghost btn-sm" href="print.html#/quest/${film.id}">Print station cards</a>
      </div>
    </div>`;
  }

  function bindQuest() {
    RT.$$('[data-reveal-answer]').forEach((b) => b.addEventListener('click', () => {
      const box = $(`[data-answer="${b.dataset.revealAnswer}"]`);
      box.classList.toggle('is-on');
      b.textContent = box.classList.contains('is-on') ? 'Hide answer' : 'Reveal answer';
    }));
  }

  /* ── teacher ──────────────────────────────────────────── */

  function teacherHTML() {
    const planA = buildPlan([
      ['Welcome · first reactions', 10],
      ['Question deck · eight questions', 25],
      ['Language tasks · gaps, quotes, quiz', 20],
      ['Act the scene', 15],
      ['Team quest · four stations', 15],
      ['Wrap-up · pick the next film', 5]
    ]);
    const p1 = Math.round(film.runtime * 0.45);
    const planB = buildPlan([
      ['Intro · prediction task', 5],
      ['Watch part 1', p1],
      ['Break · first reactions', 10],
      ['Watch part 2', film.runtime - p1],
      ['Debrief · three questions', 20],
      ['Close · one line each', 5]
    ]);

    return `
    <div class="block-head"><h2>Run of show</h2><span class="mono-note">two ways to run the night</span></div>

    <div class="cols">
      <div class="col-main">
        <div>
          <p class="plan-title">A · Film watched at home (90 min meeting)</p>
          <div class="plan">${planRows(planA)}</div>
        </div>
        <div style="margin-top:26px">
          <p class="plan-title">B · Screening night (${film.runtime + 40} min)</p>
          <div class="plan">${planRows(planB)}</div>
        </div>

        <div style="margin-top:30px">
          <p class="plan-title">Answer key</p>
          <div class="key-block">
            <h4 style="font-family:var(--mono);font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim);margin-bottom:10px">Fill the gap</h4>
            <ol class="key-list">
              ${film.gaps.map((g) => `<li><span class="kn">${(film.gaps.indexOf(g) + 1)}</span><span><b>${esc(g.answer)}</b> <span class="src">— “${esc(g.line.replace('___', '___'))}”</span></span></li>`).join('')}
            </ol>
          </div>
          <div class="key-block" style="margin-top:12px">
            <h4 style="font-family:var(--mono);font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim);margin-bottom:10px">Who says it / comprehension</h4>
            <ol class="key-list">
              ${film.quotes.map((q) => `<li><span class="kn">Q</span><span><b>${esc(q.options[q.answer])}</b> <span class="src">— “${esc(q.quote)}”</span></span></li>`).join('')}
              ${film.quiz.map((q) => `<li><span class="kn">C</span><span><b>${esc(q.options[q.answer])}</b> <span class="src">— ${esc(q.q)}</span></span></li>`).join('')}
            </ol>
          </div>
          <div class="key-block" style="margin-top:12px">
            <h4 style="font-family:var(--mono);font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--dim);margin-bottom:10px">Team quest</h4>
            <ol class="key-list">
              ${film.quest.map((q) => `<li><span class="kn">${(film.quest.indexOf(q) + 1)}</span><span><b>${esc(q.answer)}</b> <span class="src">— ${esc(q.title)}</span></span></li>`).join('')}
            </ol>
          </div>
        </div>
      </div>

      <aside class="col-side">
        <div class="side-card">
          <h3>Handouts</h3>
          <div style="display:grid;gap:8px">
            <a class="btn btn-ghost btn-block btn-sm" href="print.html#/ws/${film.id}">Student worksheet</a>
            <a class="btn btn-ghost btn-block btn-sm" href="print.html#/ws/${film.id}/key">Worksheet + answer key</a>
            <a class="btn btn-ghost btn-block btn-sm" href="print.html#/quest/${film.id}">QR station cards</a>
            <a class="btn btn-ghost btn-block btn-sm" href="print.html#/ws/${film.id}/roles">Role-play cards</a>
          </div>
        </div>
        <div class="side-card">
          <h3>Session brief</h3>
          <p style="font-size:13px;color:var(--muted);line-height:1.6">A plain-text version of this page for the chat group or a lesson plan document.</p>
          <button class="btn btn-ghost btn-block btn-sm" id="btnBrief" type="button" style="margin-top:12px">Copy the brief</button>
        </div>
        <div class="side-card">
          <h3>Before the bell</h3>
          <ul style="display:grid;gap:8px;font-size:13px;color:var(--muted);line-height:1.5">
            <li>Check where the film is available in your country.</li>
            <li>Open the watch room early and test the shared clock.</li>
            <li>Print one station card per team, not per student.</li>
            <li>Have the answer key open on a second screen.</li>
          </ul>
        </div>
      </aside>
    </div>`;
  }

  function planRows(items) {
    return '<div class="plan-row head"><span>Start</span><span>Block</span><span>Length</span></div>' +
      items.map((p) => `<div class="plan-row"><span class="t">${p.at}</span><span>${esc(p.title)}</span><span class="d">${p.min} min</span></div>`).join('');
  }

  function buildPlan(items) {
    let t = 0;
    return items.map(([title, min]) => {
      const row = { at: fmtClock(t), title, min };
      t += min;
      return row;
    });
  }

  function fmtClock(min) {
    const h = Math.floor(min / 60), m = min % 60;
    return h + ':' + (m < 10 ? '0' + m : m);
  }

  function bindTeacher() {
    $('#btnBrief').addEventListener('click', async () => {
      const brief = [
        'REEL TALK · ' + film.title + ' (' + film.year + ')',
        'Level ' + film.level + ' · ' + film.runtime + ' min · ' + film.director,
        '',
        'WHY THIS FILM: ' + film.why,
        '',
        'DISCUSSION QUESTIONS',
        ...film.questions.map((q, i) => (i + 1) + '. ' + q),
        '',
        'GAP-FILL',
        ...film.gaps.map((g, i) => (i + 1) + '. ' + g.line.replace('___', '[' + g.answer + ']')),
        '',
        'QUIZ ANSWERS',
        ...film.quiz.map((q, i) => (i + 1) + '. ' + q.options[q.answer]),
        '',
        'ROLE-PLAY: ' + film.roleplay.title + ' — ' + film.roleplay.setting,
        '',
        'TEAM QUEST ANSWERS',
        ...film.quest.map((q, i) => (i + 1) + '. ' + q.answer)
      ].join('\n');
      const ok = await RT.copy(brief);
      RT.toast(ok ? 'Session brief copied' : 'Could not copy', ok ? 'good' : 'bad');
    });
  }

  /* ── where to watch ───────────────────────────────────── */

  function showWhere() {
    const links = RT.watchLinks(film);
    RT.modal({
      title: 'Where to watch',
      sub: 'Reel Talk does not host ' + esc(film.title) + '. These are legal places to find it.',
      body: '<div class="link-list">' + links.map((l) =>
        `<a class="link-row" href="${l.url}" target="_blank" rel="noopener"><span class="lk-body"><strong>${esc(l.label)}</strong><span>${esc(l.note)}</span></span><span class="lk-arr">↗</span></a>`
      ).join('') + '</div>' +
        '<p style="font-size:12px;color:var(--dim);margin-top:14px">Availability depends on your country and on the platform. The watch room works with any of them — it only shares the clock.</p>',
      actions: '<a class="btn btn-primary btn-sm" href="watch.html#/w/' + film.id + '">Open the watch room</a>'
    });
  }
})();

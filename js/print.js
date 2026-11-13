/* Reel Talk — printable worksheet, answer key, role cards, QR station cards */
(function () {
  'use strict';
  const RT = window.RT;
  const $ = RT.$;
  const esc = RT.esc;

  RT.ready(() => {
    const route = parse();
    $('#btnPrint').addEventListener('click', () => window.print());
    if (!route.film) {
      $('#printRoot').innerHTML = '<div class="sheet"><p>Choose a film from the catalogue first.</p></div>';
      return;
    }
    const film = RT.byId(route.film);
    if (!film) return;
    document.title = film.title + ' — worksheet';
    $('#pbBack').href = 'film.html#/f/' + film.id;

    if (route.kind === 'quest') renderQuestCards(film);
    else if (route.mode === 'roles') renderRoleCards(film);
    else renderWorksheet(film, route.mode === 'key');
  });

  function parse() {
    const p = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    if (p[0] === 'ws') return { kind: 'ws', film: p[1], mode: p[2] || '' };
    if (p[0] === 'quest') return { kind: 'quest', film: p[1] };
    return {};
  }

  function seeded(arr, seed) {
    const a = arr.slice();
    let s = seed;
    for (let i = a.length - 1; i > 0; i--) {
      s = (s * 9301 + 49297) % 233280;
      const j = Math.floor((s / 233280) * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function head(film, kind, slim) {
    if (slim) {
      return `<header class="ws-head is-slim">
        <div class="ws-brandline"><span>Reel Talk · English film club</span><span>${kind}</span></div>
        <h1 class="ws-title">${esc(film.title)}</h1>
        <p class="ws-sub">${film.year} · ${film.level} · ${film.runtime} min</p>
      </header>`;
    }
    return `<header class="ws-head">
      <div class="ws-brandline"><span>Reel Talk · English film club</span><span>${kind}</span></div>
      <h1 class="ws-title">${esc(film.title)}</h1>
      <p class="ws-sub">${film.year} · directed by ${esc(film.director)} · ${film.runtime} min · level ${film.level} · ${esc(film.genres.join(' / '))}</p>
      <div class="ws-fields"><span>Name</span><span>Group</span><span>Date</span></div>
    </header>`;
  }

  function foot(film, page) {
    return `<div class="ws-foot"><span>Reel Talk · ${esc(film.title)} · ${film.level}</span><span>${page}</span></div>`;
  }

  function lines(n) {
    return '<div class="ws-lines">' + '<div class="ws-line"></div>'.repeat(n) + '</div>';
  }

  /* ── worksheet ────────────────────────────────────────── */

  function renderWorksheet(film, withKey) {
    const defs = seeded(film.words.map((w, i) => ({ def: w.def, i })), 7 + film.title.length);
    const letters = 'ABCDEF';

    const vocab = film.words.map((w, i) =>
      `<div class="row"><span>${i + 1}</span><span>${esc(w.w)}</span><span class="b"></span></div>`
    ).join('');

    const defsHtml = defs.map((d, k) =>
      `<div class="row"><span class="b" style="width:14px;border-bottom:1px solid #b8b2a6;height:12px"></span><span><b>${letters[k]}</b> ${esc(d.def)}</span></div>`
    ).join('');

    const gaps = film.gaps.map((g, i) =>
      `<div class="ws-gap"><span class="n">${i + 1}</span><span>${esc(g.line).replace('___', '<span class="blank"></span>')}</span></div>`
    ).join('');

    const quotes = film.quotes.map((q, i) =>
      `<div class="ws-q"><span class="qn">${i + 1}</span>“${esc(q.quote)}”<div class="ws-opts">${q.options.map((o) => `<span>${esc(o)}</span>`).join('')}</div></div>`
    ).join('');

    const quiz = film.quiz.map((q, i) =>
      `<div class="ws-q"><span class="qn">${i + 1}</span>${esc(q.q)}<div class="ws-opts">${q.options.map((o) => `<span>${esc(o)}</span>`).join('')}</div></div>`
    ).join('');

    const disc = film.questions.map((q, i) =>
      `<div class="q"><span class="n">${(i + 1)}</span><span>${esc(q)}</span></div>`
    ).join('');

    const rp = film.roleplay;

    const page1 = `<section class="sheet">
      ${head(film, 'Worksheet')}

      <section class="ws-sec">
        <h2>1 · Before you watch</h2>
        <div class="ws-prompts">
          <div class="ws-prompt"><span class="n">a</span><span>Look at the title and the year. What do you expect to see — place, people, mood?</span></div>
          <div class="ws-prompt"><span class="n">b</span><span>Read the logline: <i>${esc(film.logline)}</i> Write two questions you want the film to answer.</span></div>
          <div class="ws-prompt"><span class="n">c</span><span>Which word from the vocabulary box do you think you will hear first?</span></div>
        </div>
        ${lines(3)}
      </section>

      <section class="ws-sec">
        <h2>2 · Vocabulary <em>· match the word to its definition</em></h2>
        <div class="ws-vocab">${vocab}</div>
        <div class="ws-defs">${defsHtml}</div>
        <p class="ws-hint" style="margin-top:10px">Then use two of the words in sentences about your own life.</p>
        ${lines(2)}
      </section>

      <section class="ws-sec">
        <h2>3 · Fill the gap <em>· one word each</em></h2>
        <div class="ws-gaps">${gaps}</div>
      </section>

      ${foot(film, 'page 1')}
    </section>`;

    const page2 = `<section class="sheet">
      ${head(film, 'Worksheet · page 2', true)}

      <section class="ws-sec">
        <h2>4 · Who says it?</h2>
        <div class="ws-mcq">${quotes}</div>
      </section>

      <section class="ws-sec">
        <h2>5 · Did you catch that?</h2>
        <div class="ws-mcq">${quiz}</div>
      </section>

      <section class="ws-sec">
        <h2>6 · Talk about it</h2>
        <p class="ws-hint">Answer in full sentences. Give a moment from the film for each answer.</p>
        <div class="ws-disc">${disc}</div>
      </section>

      ${foot(film, 'page 2')}
    </section>`;

    const page3 = `<section class="sheet">
      ${head(film, 'Worksheet · page 3', true)}

      <section class="ws-sec">
        <h2>7 · Act the scene</h2>
        <div class="ws-rp">
          <h3>${esc(rp.title)}</h3>
          <p class="set">${esc(rp.setting)}</p>
          <div class="ws-roles">
            ${rp.roles.map((r) => `<div class="ws-role"><b>${esc(r.role)}</b>${esc(r.brief)}</div>`).join('')}
          </div>
          <p class="ws-hint" style="margin-top:8px">Challenge: ${esc(rp.challenge)}</p>
        </div>
      </section>

      <section class="ws-sec">
        <h2>8 · Team quest <em>· four stations, one phone per team</em></h2>
        <div class="ws-prompts">
          ${film.quest.map((q, i) => `<div class="ws-prompt"><span class="n">${i + 1}</span><span><b>${esc(q.title)}</b> — ${esc(q.task)} <span class="ws-hint">(${q.points || 10} pts)</span></span></div>`).join('')}
        </div>
      </section>

      <section class="ws-sec">
        <h2>9 · Write a short review <em>· 80–120 words</em></h2>
        <p class="ws-hint">One sentence on what it is about, one on what worked, one on what did not, and who should watch it.</p>
        ${lines(8)}
      </section>

      <section class="ws-sec">
        <h2>Notes <em>· new words, lines you liked, questions for the group</em></h2>
        ${lines(3)}
      </section>

      ${foot(film, 'page 3')}
    </section>`;

    const key = withKey ? `<section class="sheet key-sheet">
      ${head(film, 'Answer key · teacher')}
      <div class="key-grid">
        <div class="key-block">
          <h3>Vocabulary</h3>
          <ol>${film.words.map((w) => `<li><b>${esc(w.w)}</b> — <span>${esc(w.def)}</span></li>`).join('')}</ol>
        </div>
        <div class="key-block">
          <h3>Fill the gap</h3>
          <ol>${film.gaps.map((g) => `<li><b>${esc(g.answer)}</b> — <span>${esc(g.line.replace('___', '___'))}</span></li>`).join('')}</ol>
        </div>
        <div class="key-block">
          <h3>Who says it?</h3>
          <ol>${film.quotes.map((q) => `<li><b>${esc(q.options[q.answer])}</b> — “${esc(q.quote)}”</li>`).join('')}</ol>
        </div>
        <div class="key-block">
          <h3>Did you catch that?</h3>
          <ol>${film.quiz.map((q) => `<li><b>${esc(q.options[q.answer])}</b> — <span>${esc(q.why || '')}</span></li>`).join('')}</ol>
        </div>
        <div class="key-block">
          <h3>Team quest</h3>
          <ol>${film.quest.map((q) => `<li><b>${esc(q.answer)}</b> — <span>${esc(q.title)}</span></li>`).join('')}</ol>
        </div>
      </div>
      <p class="key-note">Scene cues in the watch room are approximate by a few seconds; capture the real time while hosting. Content note for this film: ${esc(film.content)}</p>
      ${foot(film, 'answer key')}
    </section>` : '';

    $('#printRoot').innerHTML = page1 + page2 + page3 + key;
  }

  /* ── role cards ───────────────────────────────────────── */

  function renderRoleCards(film) {
    const rp = film.roleplay;
    const cards = rp.roles.map((r, i) => `<div class="role-card">
      <div class="rc-top"><span>Reel Talk · role card</span><span>${i + 1} / ${rp.roles.length}</span></div>
      <span class="rc-role">${esc(r.role)}</span>
      <h3>${esc(film.title)}</h3>
      <p>${esc(r.brief)}</p>
      <p><b>Scene:</b> ${esc(rp.setting)}</p>
      <div class="rc-line">Do not show this card to the other players. You have two minutes to prepare one thing you want from this scene.</div>
      <div class="rc-line">${esc(film.title)} · ${film.level} · ${esc(rp.title)}</div>
    </div>`).join('');

    $('#printRoot').innerHTML = `<section class="sheet">
      ${head(film, 'Role-play cards · cut along the dashed lines')}
      <div class="cards">${cards}</div>
      <div class="ws-sec" style="margin-top:18px">
        <h2>The scene</h2>
        <p><b>${esc(rp.title)}.</b> ${esc(rp.setting)}</p>
        <p><b>Challenge:</b> ${esc(rp.challenge)}</p>
      </div>
      ${foot(film, 'role cards')}
    </section>`;
  }

  /* ── quest station cards ──────────────────────────────── */

  function renderQuestCards(film) {
    const cards = film.quest.map((q, i) => {
      const url = RT.abs('quest.html?room=' + RT.questRoom(film.id) + '#/s/' + film.id + '/' + i);
      return `<div class="q-card-print">
        <div>
          <div class="qc-num">Station ${(i + 1)} · ${q.points || 10} points</div>
          <h3>${esc(q.title)}</h3>
          <p>${esc(q.task)}</p>
          <div class="qc-foot"><span>Team ______________</span><span>${esc(film.title)} · ${film.level}</span></div>
        </div>
        <div class="qr-box">${RT.qr(url, 4)}</div>
      </div>`;
    }).join('');

    $('#printRoot').innerHTML = `<section class="sheet">
      ${head(film, 'Team quest · station cards')}
      <p class="ws-sub" style="margin-bottom:10px">Print, cut along the dashed lines, and hide the four cards around the room. One phone per team; the scoreboard lives on the teacher's screen.</p>
      <div class="quest-cards">${cards}</div>
      <div class="ws-sec">
        <h2>How to run it</h2>
        <p>Teams of three or four. Each team starts at a different station, scans the code, reads the task and types one answer. Correct answer: collect the points from the scorekeeper. The first team to collect all four stations wins — but only the scorekeeper decides what counts.</p>
      </div>
      ${foot(film, 'station cards')}
    </section>`;
  }
})();

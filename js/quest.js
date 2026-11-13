/* Reel Talk — team quest */
(function () {
  'use strict';
  const RT = window.RT;
  const $ = RT.$;
  const esc = RT.esc;
  const COLORS = ['#111111', '#e2231a', '#6f6f69', '#b3b3ad'];

  RT.ready(() => {
    RT.mountChrome('quest');
    const route = parse();
    if (route.kind === 'station') return stationPage(route);
    if (route.kind === 'build') return boardPage(route.filmId);
    return lobbyPage();
  });

  function parse() {
    const p = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    if (p[0] === 's') return { kind: 'station', filmId: p[1], idx: +p[2] || 0 };
    if (p[0] === 'build') return { kind: 'build', filmId: p[1] };
    return { kind: 'lobby' };
  }

  function cleanTitle(t) {
    return String(t || '').replace(/^\s*Station\s*\d+\s*[·:—-]\s*/i, '').trim();
  }

  function qkey(id) { return 'quest.' + id; }

  function stationUrl(film, i) {
    return RT.abs('quest.html?room=' + RT.questRoom(film.id) + '#/s/' + film.id + '/' + i);
  }
  function loadQuest(id) {
    const q = RT.store.get(qkey(id), null);
    if (q && q.teams) return q;
    return null;
  }
  function saveQuest(id, q) { RT.store.set(qkey(id), q); }

  /* ── lobby ────────────────────────────────────────────── */

  function lobbyPage() {
    const films = RT.films;
    $('#questHead').innerHTML = `
      <p class="kicker">Team quest · QR stations</p>
      <h1>Four stations.<br>One film. <em>No hiding.</em></h1>
      <p class="lede">Each film comes with four team tasks. Print the cards, hide them round the room, and let the scoreboard do the assessment.</p>`;

    $('#questApp').innerHTML = `
      <div class="lobby-card">
        <h2>Set up a quest</h2>
        <div class="lobby-two">
          <div class="lobby-row">
            <label for="qFilm">Film</label>
            <select id="qFilm">${films.map((f) => `<option value="${f.id}">${esc(f.title)} (${f.year}) · ${f.level}</option>`).join('')}</select>
          </div>
          <div class="lobby-row">
            <label for="qTeams">Teams</label>
            <select id="qTeams"><option value="2">Two teams</option><option value="3">Three teams</option><option value="4" selected>Four teams</option></select>
          </div>
        </div>
        <div class="lobby-row">
          <label>Team names</label>
          <div class="team-inputs" id="teamInputs"></div>
        </div>
        <div class="lobby-row">
          <label for="qTeacher">Scorekeeper</label>
          <input id="qTeacher" placeholder="Your name (optional)">
        </div>
        <p class="lobby-note">The quest runs in this browser — teams scan the cards with a phone, type the answer, then the scorekeeper awards the points on this screen. Nothing is uploaded and no accounts are needed.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-primary" id="qStart" type="button">Build the quest <span class="arr">→</span></button>
          <a class="btn btn-ghost" href="print.html">Print a blank worksheet</a>
        </div>
      </div>`;

    const paintTeams = () => {
      const n = +$('#qTeams').value;
      $('#teamInputs').innerHTML = Array.from({ length: n }, (_, i) =>
        `<input data-team="${i}" value="${['Team A', 'Team B', 'Team C', 'Team D'][i]}" maxlength="18" aria-label="Team ${i + 1} name">`
      ).join('');
    };
    $('#qTeams').addEventListener('change', paintTeams);
    paintTeams();

    $('#qStart').addEventListener('click', () => {
      const filmId = $('#qFilm').value;
      const teams = RT.$$('#teamInputs input').map((inp, i) => ({ name: inp.value.trim() || 'Team ' + (i + 1), score: 0, color: COLORS[i] }));
      saveQuest(filmId, { teams, awards: {}, started: Date.now(), teacher: $('#qTeacher').value.trim() });
      location.hash = '#/build/' + filmId;
    });
  }

  /* ── board ────────────────────────────────────────────── */

  function boardPage(filmId) {
    const film = RT.byId(filmId);
    if (!film) return lobbyPage();
    let q = loadQuest(filmId);
    if (!q) {
      q = { teams: [0, 1, 2, 3].map((i) => ({ name: ['Team A', 'Team B', 'Team C', 'Team D'][i], score: 0, color: COLORS[i] })), awards: {} };
      saveQuest(filmId, q);
    }
    document.title = 'Quest · ' + film.title;

    const maxPoints = film.quest.reduce((n, s) => n + (s.points || 10), 0);

    const head = () => {
      const total = q.teams.reduce((n, t) => n + t.score, 0);
      const pct = maxPoints ? Math.min(100, Math.round((total / maxPoints) * 100)) : 0;
      $('#questHead').innerHTML = `
        <div class="quest-top">
          <div>
            <p class="kicker">Team quest · ${esc(film.level)}</p>
            <h1>${esc(film.title)}</h1>
            <p class="lede">Four stations · ${maxPoints} points · ${q.teams.length} teams. Stations open on a phone by QR, answers are checked in the room.</p>
          </div>
          <div class="quest-actions">
            <button class="btn btn-ghost btn-sm" id="qRoom" type="button" title="Station answers land on this scoreboard">Scoring room ${RT.questRoom(film.id)}</button>
            <a class="btn btn-ghost btn-sm" href="print.html#/quest/${film.id}">Print station cards</a>
            <button class="btn btn-ghost btn-sm" id="qCopy" type="button">Copy student link</button>
            <button class="btn btn-ghost btn-sm" id="qReset" type="button">Reset scores</button>
          </div>
        </div>`;
      $('#qRoom').addEventListener('click', async () => {
        const ok = await RT.copy(RT.abs('quest.html?room=' + RT.questRoom(film.id) + '#/build/' + film.id));
        RT.toast(ok ? 'Scoreboard link copied' : 'Copy failed', ok ? 'good' : 'bad');
      });
      $('#qCopy').addEventListener('click', async () => {
        const ok = await RT.copy(stationUrl(film, 0));
        RT.toast(ok ? 'Student link copied' : 'Copy failed', ok ? 'good' : 'bad');
      });
      $('#qReset').addEventListener('click', () => {
        if (!confirm('Clear all scores and awards for this quest?')) return;
        q.teams.forEach((t) => (t.score = 0));
        q.awards = {};
        saveQuest(filmId, q);
        render();
      });
    };

    const render = () => {
      head();
      const total = q.teams.reduce((n, t) => n + t.score, 0);
      const pct = maxPoints ? Math.min(100, Math.round((total / maxPoints) * 100)) : 0;
      const doneCount = Object.keys(q.awards).length;

      $('#questApp').innerHTML = `
        <div class="quest-grid">
          <aside class="scoreboard">
            <div class="scoreboard-head"><h2>Scoreboard</h2><span>${doneCount} awarded</span></div>
            ${q.teams.map((t, i) => `
              <div class="team-row" style="--tc:${t.color}">
                <span class="team-dot"></span>
                <div><div class="team-name">${esc(t.name)}</div><div class="team-sub">team ${(i + 1)}</div></div>
                <div>
                  <div class="team-score" data-score="${i}">${t.score}</div>
                  <div class="team-plus">
                    <button type="button" data-adj="${i}" data-v="-5" aria-label="Remove five points">−5</button>
                    <button type="button" data-adj="${i}" data-v="5" aria-label="Add five points">+5</button>
                  </div>
                </div>
              </div>`).join('')}
            <div class="score-foot">
              <div class="bar"><i style="width:${pct}%"></i></div>
              <p>${total} of ${maxPoints} points played</p>
            </div>
          </aside>

          <section>
            <div class="station-cards">
              ${film.quest.map((s, i) => {
                const done = Object.keys(q.awards).some((k) => k.startsWith(i + ':'));
                return `<article class="st-card ${done ? 'is-done' : ''}" data-open="${i}" tabindex="0" role="button" aria-label="Open station ${i + 1}">
                  <div>
                    <div class="st-num">Station ${(i + 1)}</div>
                    <h3>${esc(cleanTitle(s.title))}</h3>
                    <p>${esc(s.task)}</p>
                    <div class="st-meta"><span>${s.points || 10} pts</span><span>·</span><span>${done ? 'awarded' : 'open'}</span></div>
                  </div>
                  <div class="qr-box">${RT.qr(stationUrl(film, i), 4)}</div>
                </article>`;
              }).join('')}
            </div>
            <div class="side-card" style="margin-top:16px">
              <h3>Run it in class</h3>
              <p style="font-size:13.5px;color:var(--muted);line-height:1.6">Print the four cards and put them in different corners. Teams scan, read, answer on one phone, and come back with the answer. Award the points here — the scoreboard is the only thing that needs to be on the projector.</p>
            </div>
          </section>
        </div>`;

      RT.$$('[data-open]').forEach((card) => {
        card.addEventListener('click', () => openStation(+card.dataset.open));
        card.addEventListener('keydown', (e) => { if (e.key === 'Enter') openStation(+card.dataset.open); });
      });
      RT.$$('[data-adj]').forEach((b) => b.addEventListener('click', () => {
        const i = +b.dataset.adj;
        q.teams[i].score = Math.max(0, q.teams[i].score + (+b.dataset.v));
        saveQuest(filmId, q);
        $(`[data-score="${i}"]`).textContent = q.teams[i].score;
      }));
    };

    function openStation(i) {
      const s = film.quest[i];
      const pts = s.points || 10;
      const m = RT.modal({
        title: 'Station ' + (i + 1) + ' · ' + cleanTitle(s.title),
        sub: pts + ' points · ' + film.title,
        body: `
          <div class="st-modal-top">
            <div class="qr-box">${RT.qr(stationUrl(film, i), 4)}</div>
            <div>
              <p class="st-modal-task">${esc(s.task)}</p>
              <button class="btn btn-quiet btn-sm" id="stReveal" type="button" style="padding-left:0;margin-top:8px">Reveal answer</button>
            </div>
          </div>
          <div class="st-answer" id="stAnswer"><b>Answer:</b> ${esc(s.answer)}</div>
          <p class="award-title">Award ${pts} points</p>
          <div class="award-grid">
            ${q.teams.map((t, ti) => {
              const key = i + ':' + ti;
              const given = !!q.awards[key];
              return `<button type="button" data-award="${ti}" ${given ? 'disabled' : ''} style="${given ? 'opacity:.45' : ''}">${esc(t.name)}${given ? ' ✓' : ''}</button>`;
            }).join('')}
          </div>`
      });
      $('#stReveal').addEventListener('click', () => {
        const box = $('#stAnswer');
        box.classList.toggle('is-on');
        $('#stReveal').textContent = box.classList.contains('is-on') ? 'Hide answer' : 'Reveal answer';
      });
      RT.$$('[data-award]').forEach((b) => b.addEventListener('click', () => {
        const ti = +b.dataset.award;
        q.teams[ti].score += pts;
        q.awards[i + ':' + ti] = true;
        saveQuest(filmId, q);
        m.close();
        render();
        RT.toast(q.teams[ti].name + ' +' + pts, 'good');
      }));
    }

    let rt = null;
    const room = RT.questRoom(film.id);
    const statePayload = () => ({ type: 'quest_state', film: film.id, teams: q.teams.map((t) => t.name) });

    function onScoreSignal(p) {
      if (!p || p.type !== 'score' || p.film !== film.id) return;
      let team = q.teams.find((t) => t.name.toLowerCase() === String(p.team || '').toLowerCase());
      if (!team) {
        team = { name: p.team || 'Team', score: 0, color: COLORS[q.teams.length % COLORS.length] };
        q.teams.push(team);
      }
      const ti = q.teams.indexOf(team);
      team.score += (+p.points || 0);
      q.awards[(+p.station) + ':' + ti] = true;
      saveQuest(filmId, q);
      render();
      RT.toast(team.name + ' +' + (+p.points || 0) + ' · station ' + ((+p.station) + 1), 'good');
    }

    rt = RT.Realtime({
      room,
      host: false,
      allowCloud: new URLSearchParams(location.search).get('relay') !== 'none',
      name: 'Scoreboard',
      onSignal: onScoreSignal,
      onHello: () => { if (rt) rt.signal(statePayload()); },
      onPresence: () => {}
    });
    rt.start().then(() => setTimeout(() => { if (rt) rt.signal(statePayload()); }, 900));

    render();
  }

  /* ── station page (phone) ─────────────────────────────── */

  function stationPage(route) {
    const film = RT.byId(route.filmId);
    if (!film) return lobbyPage();
    const i = Math.max(0, Math.min(film.quest.length - 1, route.idx));
    const s = film.quest[i];
    document.title = 'Station ' + (i + 1) + ' · ' + film.title;

    $('#questHead').innerHTML = '';
    $('#questApp').innerHTML = `
      <div class="station-page">
        <div class="station-card">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
            <span class="film-line">Reel Talk · ${esc(film.title)} · ${film.level}</span>
            <span class="pts">${s.points || 10} pts</span>
          </div>
          <h1>Station ${i + 1}</h1>
          <p class="film-line" style="color:var(--amber);letter-spacing:.14em">${esc(cleanTitle(s.title))}</p>
          <p class="task">${esc(s.task)}</p>
          <form class="station-answer-form" id="stForm">
            <input id="stInput" placeholder="Type the answer…" autocomplete="off" maxlength="200" aria-label="Your answer">
            <button class="btn btn-primary" type="submit">Check the answer</button>
          </form>
          <div class="station-result" id="stResult"></div>
          <div id="teamPick" hidden>
            <p class="film-line" style="margin-bottom:8px">Which team gets the points?</p>
            <div class="award-grid" id="teamBtns"></div>
          </div>
          <div class="station-foot">
            <span>Station ${i + 1} of ${film.quest.length}</span>
            <a href="#/build/${film.id}" style="color:var(--amber)">Scoreboard →</a>
          </div>
        </div>
      </div>`;

    const room = new URLSearchParams(location.search).get('room');
    const pts = s.points || 10;
    let teams = [];
    let rt = null;

    if (room) {
      rt = RT.Realtime({
        room,
        host: false,
        allowCloud: new URLSearchParams(location.search).get('relay') !== 'none',
        name: 'Station ' + (i + 1),
        onSignal: (p) => {
          if (p && p.type === 'quest_state' && p.film === film.id) {
            teams = (p.teams || []).filter(Boolean);
            paintTeams();
          }
        },
        onPresence: () => {}
      });
      rt.start();
    }

    function sendScore(name) {
      if (!rt) return;
      rt.signal({ type: 'score', film: film.id, station: i, team: name, points: pts });
      $('#teamPick').innerHTML = '<p style="color:var(--green);font-size:14px">✓ Sent to the scoreboard — <b>' + esc(name) + ' +' + pts + '</b></p>';
    }

    function paintTeams() {
      const wrap = $('#teamBtns');
      const box = $('#teamPick');
      if (!wrap || !box) return;
      if (teams.length) {
        wrap.innerHTML = teams.map((t) => '<button type="button" data-team="' + esc(t) + '">' + esc(t) + ' · +' + pts + '</button>').join('');
        RT.$$('[data-team]').forEach((b) => b.addEventListener('click', () => sendScore(b.dataset.team)));
      } else {
        wrap.innerHTML = '<input id="teamName" placeholder="Team name" maxlength="18" style="height:38px;padding:0 10px;border:1px solid var(--line);border-radius:8px;background:rgba(0,0,0,.3)">' +
          '<button type="button" id="teamSend">Send</button>';
        $('#teamSend').addEventListener('click', () => {
          const v = ($('#teamName').value || '').trim();
          if (v) sendScore(v);
        });
      }
    }

    $('#stForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const val = $('#stInput').value.trim();
      if (!val) return;
      const ok = matchAnswer(val, s.answer);
      const box = $('#stResult');
      box.className = 'station-result is-on ' + (ok ? 'ok' : 'bad');
      box.innerHTML = ok
        ? '✓ Correct. Collect <b>' + pts + ' points</b> — pick the team below.'
        : '✗ Not quite. Read the task again — or ask the scorekeeper for a hint.';
      if (!ok) box.innerHTML += '<br><span style="color:var(--dim);font-size:12.5px">The scorekeeper has the answer key on the board.</span>';
      if (ok) {
        $('#teamPick').hidden = false;
        paintTeams();
      }
    });
  }

  function matchAnswer(given, expected) {
    const a = RT.norm(given);
    const b = RT.norm(expected);
    if (!a) return false;
    if (a === b) return true;
    const bt = b.split(' ').filter((w) => w.length > 3);
    if (!bt.length) return false;
    const hits = bt.filter((w) => a.includes(w)).length;
    return hits / bt.length >= 0.6;
  }
})();

/* Reel Talk — watch party room */
(function () {
  'use strict';
  const RT = window.RT;
  const $ = RT.$;
  const esc = RT.esc;

  const S = {
    film: null,
    room: '',
    isHost: false,
    rt: null,
    playing: false,
    t0: 0,
    pos: 0,
    cd: 0,
    cdFrom: 0,
    seq: 0,
    duration: 0,
    source: null,
    video: null,
    cueIdx: -1,
    lastCuePop: 0,
    lastSync: 0,
    questionIdx: 0,
    unread: 0,
    chatting: false,
    poll: null,
    myVote: null,
    pollVotes: {},
    taster: null
  };

  RT.ready(() => {
    RT.mountChrome('watch');
    if (!window.FILM_DATA || !RT.films.length) return;

    const q = new URLSearchParams(location.search);
    const filmId = parseFilmId();
    S.room = (q.get('room') || '').toUpperCase();
    S.isHost = q.get('host') === '1';

    if (!filmId) return showLobby();

    S.film = RT.byId(filmId);
    if (!S.film) return showLobby();

    if (!S.room) {
      S.room = RT.roomCode();
      S.isHost = true;
    }
    if (!q.get('room')) {
      q.set('room', S.room);
      if (S.isHost) q.set('host', '1');
      history.replaceState(null, '', location.pathname + '?' + q.toString() + location.hash);
    }

    start();
  });

  function parseFilmId() {
    const p = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    return p[0] === 'w' ? p[1] : p[0] || '';
  }

  /* ── lobby ────────────────────────────────────────────── */

  function showLobby() {
    const films = RT.films;
    $('#wTitle').textContent = 'Start a watch party';
    $('#wMeta').textContent = 'Pick a film · open a room · share the code';
    $('#roomCode').textContent = '—';
    RT.$$('.controls, .rail, .screen-bar').forEach((el) => el && (el.style.display = 'none'));
    $('#hostHint').textContent = 'A room is a shared clock, a chat and a cue list. Nothing is uploaded and no film is hosted here.';
    $('#stageEmpty').innerHTML = `
      <p class="kicker">Lobby</p>
      <h2>What are we watching?</h2>
      <p class="stage-lede">Choose a film, then invite the club with a code or a QR. Everyone plays their own legal copy — or one of the open-screen titles that streams inside the room.</p>
      <div class="lobby-form">
        <select id="lobbyFilm" aria-label="Film">${films.map((f) => `<option value="${f.id}">${esc(f.title)} (${f.year}) · ${f.level}${f.free ? ' · free here' : ''}</option>`).join('')}</select>
        <button class="btn btn-primary" id="lobbyGo" type="button">Open a room <span class="arr">→</span></button>
      </div>
      <p class="stage-fine">Films are not streamed by Reel Talk except the public-domain titles in Open Screen.</p>`;
    $('#lobbyGo').addEventListener('click', () => {
      const id = $('#lobbyFilm').value;
      location.href = 'watch.html?new=1#/w/' + id;
    });
  }

  /* ── start ────────────────────────────────────────────── */

  function start() {
    document.title = S.film.title + ' — watch party';
    $('#wTitle').textContent = S.film.title;
    const lv = RT.level(S.film.level);
    $('#wMeta').innerHTML = `watch party · ${S.film.year} · <span style="color:${lv.color}">${S.film.level}</span> · ${RT.duration(S.film.runtime)} · room ${S.room}`;
    $('#backFilm').href = 'film.html#/f/' + S.film.id;
    $('#backFilm').textContent = '← ' + S.film.title;
    $('#roomCode').textContent = S.room;
    $('#roomBig').textContent = S.room;
    $('#roomQr').innerHTML = RT.qr(inviteUrl(), 6);
    $('#btnWhere2').href = '#';
    $('#btnWhere2').addEventListener('click', (e) => { e.preventDefault(); showWhere(); });

    S.duration = S.film.free && S.film.free.duration ? S.film.free.duration : S.film.runtime * 60;
    const savedSource = RT.store.get('source.' + S.film.id, null);
    S.source = savedSource || defaultSource(S.film);

    buildCues();
    buildTicks();
    paintQuestion();
    setRoleUI();
    renderStage();
    renderPeople([]);
    setTransport('connecting');

    connect();
    renderAsk();
    renderChatEmpty();
    if (new URLSearchParams(location.search).get('demo') === 'poll' && S.isHost) {
      setTimeout(() => { launchPoll(S.film.quiz[0]); S.poll.total = 7; S.poll.counts = [4, 2, 1]; renderPoll(); }, 1200);
    }
    if (new URLSearchParams(location.search).get('taster') === '1' && S.isHost) {
      setTimeout(() => { if (!S.taster) openTaster(); }, 1400);
    }
    tick();
    setInterval(tick, 250);

    window.addEventListener('beforeunload', () => { if (S.rt) S.rt.close(); });
    document.addEventListener('keydown', onKey);
    bindControls();
  }

  function defaultSource(film) {
    if (film.youtube && film.youtube.id) {
      return { type: 'youtube', videoId: film.youtube.id, url: 'https://www.youtube.com/watch?v=' + film.youtube.id, label: 'YouTube · ' + (film.youtube.channel || 'free upload') };
    }
    if (film.free && film.free.mp4) {
      return { type: 'mp4', url: film.free.mp4, label: 'Internet Archive · public domain' };
    }
    return { type: 'none', url: '', label: 'External player' };
  }

  function inviteUrl() {
    return location.origin + location.pathname + '?room=' + S.room + '#/w/' + S.film.id;
  }

  /* ── realtime ─────────────────────────────────────────── */

  function connect() {
    const relayAllowed = new URLSearchParams(location.search).get('relay') !== 'none';
    S.rt = RT.Realtime({
      room: S.room,
      host: S.isHost,
      allowCloud: relayAllowed,
      name: RT.store.get('name', ''),
      onState: applyRemote,
      onChat: addChat,
      onPresence: renderPeople,
      onSignal: onSignal,
      onStatus: setConn,
      onFallback: () => {
        setTransport('local');
        RT.toast('Relay unreachable — the room is on this device only', 'bad');
      }
    });
    S.rt.start().then((mode) => {
      setTransport(mode);
      if (S.isHost && S.source) setTimeout(() => publish(true), 600);
    });
  }

  function applyRemote(st) {
    if (!st) return;
    const seqChanged = (st.seq || 0) !== S.seq;
    S.seq = st.seq || 0;
    S.playing = !!st.playing;
    S.t0 = st.t0 || 0;
    S.pos = st.pos || 0;
    S.cd = st.cd || 0;
    if (st.source && JSON.stringify(st.source) !== JSON.stringify(S.source)) {
      S.source = st.source;
      renderStage();
      paintSource();
    }
    if (seqChanged && !S.isHost) hardSync();
    paintControls();
    tick();
  }

  function publish(bumpSeq) {
    if (!S.isHost || !S.rt) return;
    if (bumpSeq) S.seq += 1;
    const p = pos();
    if (S.playing) S.t0 = Date.now() - p * 1000;
    else S.pos = p;
    S.rt.setState({
      playing: S.playing,
      t0: S.t0,
      pos: p,
      dur: S.duration,
      seq: S.seq,
      source: S.source,
      cd: S.cd,
      cue: S.cueIdx,
      at: Date.now()
    });
  }

  function hardSync() {
    const target = positionFromState();
    S.pos = target;
    if (S.cd > 0) return;
    if (S.video) {
      S.video.currentTime = target;
      if (S.playing) S.video.play().catch(showTapToJoin);
      else S.video.pause();
    } else if (S.source && S.source.type === 'youtube') {
      ytCmd('seekTo', [target, true]);
      ytCmd(S.playing ? 'playVideo' : 'pauseVideo');
    }
  }

  function positionFromState() {
    return S.playing ? Math.max(0, (Date.now() - S.t0) / 1000) : S.pos;
  }

  function setConn(state, detail) {
    const el = $('#conn');
    if (!el) return;
    el.className = 'conn ' + (state === 'live' ? 'is-live' : state === 'offline' ? 'is-offline' : '');
    el.querySelector('span').textContent = state === 'live' ? (detail === 'this device' ? 'local' : 'live')
      : state === 'connecting' ? 'connecting' : state === 'reconnecting' ? 'reconnecting' : 'offline';
    el.title = detail ? 'Connection: ' + state + ' (' + detail + ')' : 'Connection';
  }

  function setTransport(mode) {
    const el = $('#transportLine');
    if (!el) return;
    const map = {
      server: 'Club server — realtime, everyone follows the host',
      cloud: 'Public relay — realtime across devices (no server needed)',
      local: 'This device only — tabs on one browser',
      connecting: 'Connecting…'
    };
    el.textContent = map[mode] || mode;
    setConn(mode === 'connecting' ? 'connecting' : 'live', mode === 'local' ? 'this device' : mode);
  }

  /* ── player ───────────────────────────────────────────── */

  function renderStage() {
    const box = $('#stageVideo');
    const empty = $('#stageEmpty');
    if (S.source && S.source.type === 'page') {
      box.hidden = true;
      box.innerHTML = '';
      S.video = null;
      empty.hidden = false;
      empty.innerHTML =
        '<p class="kicker">External player</p>' +
        '<h2>' + esc(S.film.title) + '</h2>' +
        '<p class="stage-lede">Open the film on the site you use, then start the clock here. Everyone in the room follows the same second — pause, jump and cues stay in sync even though each screen plays its own copy.</p>' +
        '<div class="stage-actions">' +
        '<a class="btn btn-primary" href="' + esc(S.source.url) + '" target="_blank" rel="noopener">Open the film ↗</a>' +
        '<button class="btn btn-ghost" id="btnSource" type="button">Change link</button>' +
        '</div>' +
        '<p class="stage-fine">The link is remembered on this device. It never leaves the room.</p>';
      paintSource();
      return;
    }
    if (!S.source || S.source.type === 'none') {
      box.hidden = true;
      box.innerHTML = '';
      S.video = null;
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    box.hidden = false;
    if (S.source.type === 'youtube') {
      S.video = null;
      const id = S.source.videoId;
      box.innerHTML = `<iframe src="https://www.youtube.com/embed/${id}?enablejsapi=1&rel=0&modestbranding=1&playsinline=1" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen title="Film"></iframe>`;
    } else {
      box.classList.remove('is-ready');
      box.innerHTML = `<div class="video-ph"><span>${esc(S.film.title)}</span><small>loading the source…</small></div>` +
        `<video src="${esc(S.source.url)}" playsinline preload="metadata" crossorigin="anonymous"></video>`;
      S.video = box.querySelector('video');
      S.video.addEventListener('loadeddata', () => {
        box.classList.add('is-ready');
        const ph = box.querySelector('.video-ph');
        if (ph) ph.remove();
      });
      S.video.addEventListener('loadedmetadata', () => {
        if (S.video.duration && isFinite(S.video.duration)) {
          S.duration = S.video.duration;
          paintControls();
        }
      });
      S.video.addEventListener('error', () => {
        RT.toast('That video will not play here — check the link or use the external clock', 'bad');
      });
      S.video.addEventListener('play', () => onNativePlay());
      S.video.addEventListener('pause', () => onNativePause());
      S.video.addEventListener('seeked', () => onNativeSeek());
    }
    paintSource();
  }

  let applying = false;

  function onNativePlay() {
    if (!S.isHost || applying) return;
    if (S.playing) return;
    S.playing = true;
    S.t0 = Date.now() - S.video.currentTime * 1000;
    publish(true);
    paintControls();
  }
  function onNativePause() {
    if (!S.isHost || applying) return;
    if (!S.playing) return;
    S.pos = S.video.currentTime;
    S.playing = false;
    publish(true);
    paintControls();
  }
  function onNativeSeek() {
    if (!S.isHost || applying) return;
    S.pos = S.video.currentTime;
    S.t0 = Date.now() - S.pos * 1000;
    publish(true);
  }

  function pos() {
    if (S.video) return S.video.currentTime || 0;
    return positionFromState();
  }

  function hostPlay() {
    if (!S.isHost) { nudgeHost(); return; }
    const p = pos();
    S.playing = true;
    S.t0 = Date.now() - p * 1000;
    S.pos = p;
    applying = true;
    if (S.video) S.video.play().catch(showTapToJoin);
    if (S.source && S.source.type === 'youtube') ytCmd('playVideo');
    setTimeout(() => { applying = false; }, 300);
    publish(true);
    paintControls();
  }

  function hostPause() {
    if (!S.isHost) { nudgeHost(); return; }
    const p = pos();
    S.playing = false;
    S.pos = p;
    applying = true;
    if (S.video) S.video.pause();
    if (S.source && S.source.type === 'youtube') ytCmd('pauseVideo');
    setTimeout(() => { applying = false; }, 300);
    publish(true);
    paintControls();
  }

  function hostSeek(t) {
    if (!S.isHost) { nudgeHost(); return; }
    t = Math.max(0, Math.min(S.duration || 1e9, t));
    S.pos = t;
    S.t0 = Date.now() - t * 1000;
    applying = true;
    if (S.video) S.video.currentTime = t;
    if (S.source && S.source.type === 'youtube') ytCmd('seekTo', [t, true]);
    setTimeout(() => { applying = false; }, 300);
    publish(true);
    paintControls();
    hideCuePop();
  }

  function nudgeHost() {
    RT.toast('Only the host drives the clock — ask them, or take over in the Room tab');
  }

  function showTapToJoin() {
    const ov = $('#overlay');
    ov.hidden = false;
    ov.innerHTML = `<div><button class="overlay-play" id="tapPlay" aria-label="Play">${playSvg()}</button><p class="overlay-note">Tap to join playback</p></div>`;
    $('#tapPlay').addEventListener('click', () => {
      ov.hidden = true;
      if (S.video) S.video.play().catch(() => {});
    });
  }

  function togglePlay() {
    if (!S.isHost) return nudgeHost();
    if (S.playing) hostPause();
    else hostPlay();
  }

  function onKey(e) {
    if (e.target.matches('input, textarea, select')) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); S.isHost ? hostSeek(pos() + 10) : nudgeHost(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); S.isHost ? hostSeek(pos() - 10) : nudgeHost(); }
    if (e.key.toLowerCase() === 'c' && S.isHost) capture();
  }

  /* ── tick ─────────────────────────────────────────────── */

  function tick() {
    if (document.hidden) return;
    const p = pos();
    const dur = S.duration || 1;

    $('#tc').textContent = RT.clock(p);
    $('#dur').textContent = RT.clock(dur);
    $('#scrubFill').style.width = Math.min(100, (p / dur) * 100) + '%';
    if (!S.dragging) $('#seek').value = Math.min(1000, Math.round((p / dur) * 1000));

    // countdown overlay
    if (S.cd > 0) {
      const left = Math.ceil((S.cd - Date.now()) / 1000);
      if (left > 0) showCountdown(left);
      else {
        hideOverlay();
        if (S.isHost) {
          S.cd = 0;
          S.playing = true;
          S.t0 = Date.now() - S.cdFrom * 1000;
          S.pos = S.cdFrom;
          if (S.video) S.video.play().catch(showTapToJoin);
          if (S.source && S.source.type === 'youtube') ytCmd('playVideo');
          publish(true);
        }
      }
    }

    // cue detection
    const idx = cueAt(p);
    if (idx !== S.cueIdx) {
      const prev = S.cueIdx;
      S.cueIdx = idx;
      paintCues();
      if (idx >= 0 && prev >= 0) showCuePop(S.film.scenes[idx]);
      else if (idx >= 0 && p > 5) showCuePop(S.film.scenes[idx]);
    }

    // client drift correction
    if (!S.isHost && S.playing && S.video && Date.now() - S.lastSync > 2600 && S.cd <= 0) {
      const target = positionFromState();
      if (Math.abs(S.video.currentTime - target) > 1.8) S.video.currentTime = target;
      if (S.video.paused) S.video.play().catch(() => {});
      S.lastSync = Date.now();
    }

    // host soft heartbeat
    if (S.isHost && S.playing && Date.now() - S.lastHeartbeat > (S.rt && S.rt.mode === 'server' ? 10000 : 120000)) {
      S.lastHeartbeat = Date.now();
      publish(false);
    }

    paintNow(p);
    tasterTick();
  }
  S.lastHeartbeat = 0;

  function cueAt(p) {
    let idx = -1;
    (S.film.scenes || []).forEach((s, i) => { if (p >= RT.parseCue(s.at)) idx = i; });
    return idx;
  }

  /* ── painting ─────────────────────────────────────────── */

  function paintControls() {
    const playing = S.playing;
    const icon = $('#playIcon');
    if (icon) icon.innerHTML = playing
      ? '<rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor"/>'
      : '<path d="M8 5.5v13l11-6.5-11-6.5Z" fill="currentColor"/>';
    const badge = $('#stageBadge');
    if (badge) {
      badge.hidden = false;
      badge.innerHTML = `<i></i>${S.isHost ? 'you are hosting' : 'following the host'} · ${RT.clock(pos())}`;
    }
  }

  function paintNow(p) {
    const box = $('#nowCue');
    if (!box) return;
    const idx = cueAt(p);
    if (idx < 0) {
      box.className = 'now-cue is-idle';
      box.innerHTML = '<h3>Nothing on the clock yet</h3><p>The first cue lands a few minutes in. Press play when the room is ready.</p>';
      return;
    }
    const s = S.film.scenes[idx];
    box.className = 'now-cue';
    box.innerHTML = `<span class="t">≈ ${RT.cue(s.at)} · cue ${(idx + 1)}</span><h3>${esc(s.title)}</h3><p>${esc(s.task)}</p>`;
  }

  function showCuePop(s) {
    const el = $('#cuePop');
    el.hidden = false;
    el.innerHTML = `<div class="k">cue ${esc(s.at)}</div><div class="n">${esc(s.title)}</div><div class="d">${esc(s.task)}</div>`;
    clearTimeout(S.cueTimer);
    S.cueTimer = setTimeout(hideCuePop, 8000);
    paintNow(pos());
  }
  function hideCuePop() { const el = $('#cuePop'); if (el) el.hidden = true; }

  function buildCues() {
    const list = $('#cueList');
    list.innerHTML = (S.film.scenes || []).map((s, i) =>
      `<button class="cue-mini" type="button" data-cue="${i}"><span class="t">${RT.cue(s.at)}</span><span>${esc(s.title)}</span></button>`
    ).join('');
    RT.$$('.cue-mini').forEach((b) => b.addEventListener('click', () => {
      const i = +b.dataset.cue;
      if (S.isHost) hostSeek(RT.parseCue(S.film.scenes[i].at));
      else {
        const s = S.film.scenes[i];
        showCuePop(s);
        RT.toast('Cue ' + (i + 1) + ' · ' + s.title);
      }
    }));
  }

  function buildTicks() {
    const ticks = $('#scrubTicks');
    const dur = S.duration || S.film.runtime * 60;
    ticks.innerHTML = (S.film.scenes || []).map((s) =>
      `<span style="left:${Math.min(99.5, (RT.parseCue(s.at) / dur) * 100)}%"></span>`
    ).join('');
  }

  function paintCues() {
    RT.$$('.cue-mini').forEach((b) => {
      const i = +b.dataset.cue;
      b.classList.toggle('is-on', i === S.cueIdx);
      b.classList.toggle('is-past', i < S.cueIdx);
    });
  }

  function paintQuestion() {
    const p = $('#nowQuestion p');
    if (p) p.textContent = S.film.questions[S.questionIdx];
  }

  function paintSource() {
    const line = $('#sourceLine');
    if (!line) return;
    line.textContent = !S.source || S.source.type === 'none'
      ? 'External player — the clock is shared, the film is yours'
      : S.source.label || S.source.url;
  }

  function setRoleUI() {
    const tag = $('#roleTag');
    tag.textContent = S.isHost ? 'you are the host' : 'guest — host controls the clock';
    tag.classList.toggle('is-host', S.isHost);
    $('#btnCountdown').disabled = !S.isHost;
    $('#btnSync').disabled = !S.isHost;
    $('#btnCapture').disabled = !S.isHost;
    $('#btnSource2').disabled = !S.isHost;
    $('#hostHint').innerHTML = S.isHost
      ? 'You are the host. <b>Start in 10s</b> gives the room a countdown; <b>Sync everyone</b> pulls every player back to your second; <b>Capture moment</b> drops a timestamp into the chat.'
      : 'Follow the host’s clock. If nobody is driving, take over in the <b>Room</b> tab — the room is just a shared clock, so it costs nothing to move it.';
    if (S.isHost) $('#btnTakeHost').disabled = true;
  }

  /* ── countdown / overlay ──────────────────────────────── */

  function startCountdown() {
    if (!S.isHost) return nudgeHost();
    S.cdFrom = pos();
    S.cd = Date.now() + 10000;
    publish(true);
    showCountdown(10);
  }

  function showCountdown(n) {
    const ov = $('#overlay');
    ov.hidden = false;
    ov.innerHTML = `<div><div class="countdown">${n}</div><p class="overlay-note">${S.isHost ? 'press play on your player' : 'the room starts together'}</p></div>`;
  }

  function hideOverlay() {
    const ov = $('#overlay');
    ov.hidden = true;
    ov.innerHTML = '';
  }

  /* ── capture / chat ───────────────────────────────────── */

  function capture() {
    if (!S.isHost) return nudgeHost();
    const p = pos();
    const idx = cueAt(p);
    const title = idx >= 0 ? S.film.scenes[idx].title : 'Moment';
    const text = `⏱ ${RT.clock(p)} — ${title}`;
    if (S.rt) S.rt.chat(text);
    addChat({ id: RT.rid(6), name: 'You', text, ts: Date.now(), cue: true }, true);
    RT.toast('Moment pinned at ' + RT.clock(p), 'good');
  }

  function addChat(msg, mine) {
    if (!msg) return;
    const log = $('#chatLog');
    const empty = $('#chatEmpty');
    if (empty) empty.remove();
    const isMe = mine || (S.rt && msg.name === S.rt.me.name);
    const el = document.createElement('div');
    el.className = 'msg' + (isMe ? ' is-me' : '') + (msg.cue ? ' is-cue' : '');
    el.innerHTML = `<span class="who">${esc(msg.name || 'Guest')}</span><span class="txt">${esc(msg.text)}</span>`;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    if (!isMe && !$('.rail-panel[data-panel="chat"]').classList.contains('is-on')) {
      S.unread += 1;
      const b = $('#chatBadge');
      b.hidden = false;
      b.textContent = S.unread;
    }
  }

  function renderChatEmpty() {
    const log = $('#chatLog');
    log.innerHTML = `<div class="chat-empty" id="chatEmpty"><p>The chat is the back channel — spoilers, guesses, “wait, who is that?”. Messages stay in this room only.</p></div>`;
  }

  function renderPeople(people) {
    let list = (people || []).slice();
    const meId = S.rt ? S.rt.me.id : 'me';
    if (!list.some((p) => p.id === meId)) {
      list.unshift({ id: meId, name: (S.rt && S.rt.me.name) || 'You', host: S.isHost });
    }
    $('#peopleCount').textContent = list.length + ' here';
    const box = $('#peopleList');
    if (!box) return;
    box.innerHTML = list.map((p) => {
      const me = S.rt && p.id === S.rt.me.id;
      return `<div class="person"><span class="pd"></span>${esc(p.name)}${p.host ? '<span class="ph">host</span>' : ''}${me ? '<span class="me">you</span>' : ''}</div>`;
    }).join('') || '<p class="room-note">Just you so far.</p>';
  }

  /* ── source modal ─────────────────────────────────────── */

  function openSource() {
    if (!S.isHost) { nudgeHost(); return; }
    const m = RT.modal({
      title: 'Add a source',
      sub: 'Paste the page where you watch the film — or a direct video / YouTube link to play it inside the room.',
      body: `
        <label class="field" style="margin-bottom:12px"><span>Video URL</span>
          <input id="srcUrl" placeholder="https://archive.org/download/... .mp4  ·  https://youtu.be/…" value="${S.source && S.source.type !== 'none' ? esc(S.source.url || '') : ''}">
        </label>
        <p style="font-size:12.5px;color:var(--muted);line-height:1.6">A page link (any film site) opens in a new tab and the room keeps the clock. A direct <b>.mp4</b> or a <b>YouTube</b> link plays inside the room. Reel Talk does not host or copy the film.</p>
        <p style="font-size:12px;color:var(--dim);margin-top:10px">Reel Talk never hosts or copies a film. A link stays in this room only.</p>`,
      actions: `<button class="btn btn-ghost btn-sm" id="srcNone" type="button">Use external clock</button>
                <button class="btn btn-primary btn-sm" id="srcSave" type="button">Use this source</button>`
    });
    $('#srcNone').addEventListener('click', () => {
      S.source = { type: 'none', url: '', label: 'External player' };
      RT.store.del('source.' + S.film.id);
      renderStage(); publish(true); m.close(); RT.toast('External clock — everyone plays their own copy');
    });
    $('#srcSave').addEventListener('click', () => {
      const url = $('#srcUrl').value.trim();
      if (!url) return;
      const src = detectSource(url);
      if (!src) { RT.toast('That link is not a video file or a YouTube link', 'bad'); return; }
      S.source = src;
      RT.store.set('source.' + S.film.id, src);
      renderStage();
      publish(true);
      m.close();
      RT.toast('Source saved for this film', 'good');
    });
  }

  function detectSource(url) {
    const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/i);
    if (yt) return { type: 'youtube', videoId: yt[1], url, label: 'YouTube · ' + yt[1] };
    if (/^https?:\/\/.+\.(mp4|webm|ogg|m4v)(\?.*)?$/i.test(url)) return { type: 'mp4', url, label: 'Direct video' };
    if (/^https?:\/\//i.test(url)) return { type: 'page', url, label: 'External player' };
    return null;
  }

  function ytCmd(func, args) {
    const iframe = $('#stageVideo iframe');
    if (!iframe || !iframe.contentWindow) return;
    iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args: args || [] }), '*');
  }

  /* ── where to watch ───────────────────────────────────── */

  function showWhere() {
    RT.modal({
      title: 'Where to watch',
      sub: 'Legal sources for ' + esc(S.film.title) + '. The room does not need any of them to work.',
      body: '<div class="link-list">' + RT.watchLinks(S.film).map((l) =>
        `<a class="link-row" href="${l.url}" target="_blank" rel="noopener"><span class="lk-body"><strong>${esc(l.label)}</strong><span>${esc(l.note)}</span></span><span class="lk-arr">↗</span></a>`
      ).join('') + '</div>'
    });
  }

  /* ── bindings ─────────────────────────────────────────── */

  function bindControls() {
    $('#btnPlay').addEventListener('click', togglePlay);
    $('#btnBack').addEventListener('click', () => S.isHost ? hostSeek(pos() - 10) : nudgeHost());
    $('#btnFwd').addEventListener('click', () => S.isHost ? hostSeek(pos() + 10) : nudgeHost());
    $('#btnCountdown').addEventListener('click', startCountdown);
    $('#btnSync').addEventListener('click', () => { publish(true); RT.toast('Everyone pulled to ' + RT.clock(pos()), 'good'); });
    $('#btnCapture').addEventListener('click', capture);
    $('#btnTaster').addEventListener('click', openTaster);
    document.addEventListener('click', (e) => {
      if (e.target.closest('#btnSource')) { e.preventDefault(); openSource(); }
    });
    $('#btnSource2').addEventListener('click', openSource);
    $('#btnNextQuestion').addEventListener('click', () => {
      S.questionIdx = (S.questionIdx + 1) % S.film.questions.length;
      paintQuestion();
    });

    const seek = $('#seek');
    seek.addEventListener('input', () => {
      S.dragging = true;
      const dur = S.duration || 1;
      $('#tc').textContent = RT.clock((seek.value / 1000) * dur);
      $('#scrubFill').style.width = (seek.value / 10) + '%';
    });
    seek.addEventListener('change', () => {
      S.dragging = false;
      const t = (seek.value / 1000) * (S.duration || 1);
      if (S.isHost) hostSeek(t);
      else { seek.value = Math.round((pos() / (S.duration || 1)) * 1000); nudgeHost(); }
    });
    seek.disabled = false;

    $('#btnFull').addEventListener('click', () => {
      const shell = $('.screen-shell');
      if (!document.fullscreenElement) shell.requestFullscreen && shell.requestFullscreen().catch(() => {});
      else document.exitFullscreen();
    });

    $('#roomChip').addEventListener('click', async () => {
      const ok = await RT.copy(inviteUrl());
      RT.toast(ok ? 'Invite link copied' : inviteUrl(), ok ? 'good' : '');
    });
    $('#btnInvite').addEventListener('click', async () => {
      const ok = await RT.copy(inviteUrl());
      RT.toast(ok ? 'Invite link copied' : 'Copy failed', ok ? 'good' : 'bad');
    });
    $('#btnRoomInfo').addEventListener('click', () => {
      railTab('room');
      RT.modal({
        title: 'Room ' + S.room,
        sub: 'Scan to join on a phone — or read the code out loud.',
        body: `<div class="qr-box big" style="margin:8px auto">${RT.qr(inviteUrl(), 7)}</div>
               <p style="text-align:center;font-family:var(--mono);letter-spacing:.3em;color:var(--amber);font-size:20px">${S.room}</p>
               <p style="text-align:center;font-size:12px;color:var(--dim);margin-top:10px">${esc(inviteUrl())}</p>`
      });
    });

    $('#railTabs').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-rt]');
      if (b) railTab(b.dataset.rt);
    });

    $('#chatForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('#chatInput');
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      if (S.rt) S.rt.chat(text);
      addChat({ id: RT.rid(6), name: (S.rt && S.rt.me.name) || 'You', text, ts: Date.now() }, true);
    });

    $('#nameInput').addEventListener('change', (e) => {
      const name = e.target.value.trim().slice(0, 24) || 'Guest';
      RT.store.set('name', name);
      if (S.rt) { S.rt.me.name = name; S.rt.setName(name); }
      RT.toast('You are ' + name);
    });
    const stored = RT.store.get('name', '');
    if (stored) $('#nameInput').value = stored;

    $('#btnTakeHost').addEventListener('click', () => {
      S.isHost = true;
      if (S.rt) { S.rt.me.host = true; S.rt.becomeHost(); }
      const u = new URL(location.href);
      u.searchParams.set('host', '1');
      history.replaceState(null, '', u.toString());
      setRoleUI();
      publish(true);
      RT.toast('You are the host now', 'good');
    });

    $('#btnLocalOnly').addEventListener('click', () => {
      if (!S.rt) return;
      S.rt.useLocal();
      setTransport('local');
      RT.toast('This device only');
    });
  }

  /* ── live polls ───────────────────────────────────────── */

  function renderAsk() {
    const box = $('#askList');
    if (!box) return;
    if (!S.isHost) {
      box.innerHTML = '<p class="room-note">The host can launch a quiz question from the film. It appears here and on the big screen.</p>';
      renderPoll();
      return;
    }
    const quiz = (S.film.quiz || []).map((q, i) =>
      `<button class="ask-item" type="button" data-poll="${i}"><span class="k">Poll · quiz ${(i + 1)}</span>${esc(q.q)}</button>`
    ).join('');
    const qs = (S.film.questions || []).map((q, i) =>
      `<button class="ask-item" type="button" data-prompt="${i}"><span class="k">Show on screen · ${(i + 1)}</span>${esc(q)}</button>`
    ).join('');
    box.innerHTML = '<div style="display:grid;gap:6px">' + quiz + '</div>' +
      '<p class="rail-kicker" style="margin:16px 0 8px">Discussion prompts</p>' +
      '<div style="display:grid;gap:6px">' + qs + '</div>';
    RT.$$('[data-poll]').forEach((b) => b.addEventListener('click', () => launchPoll(S.film.quiz[+b.dataset.poll])));
    RT.$$('[data-prompt]').forEach((b) => b.addEventListener('click', () => {
      const text = S.film.questions[+b.dataset.prompt];
      showPrompt(text);
      if (S.rt) S.rt.signal({ type: 'prompt', text });
    }));
    renderPoll();
  }

  function launchPoll(q) {
    if (!S.isHost) return nudgeHost();
    S.poll = { id: RT.rid(6), q: q.q, options: q.options.slice(), answer: q.answer, counts: [0, 0, 0], total: 0, revealed: false, closed: false };
    S.pollVotes = {};
    S.myVote = null;
    if (S.rt) S.rt.signal({ type: 'poll', poll: { id: S.poll.id, q: S.poll.q, options: S.poll.options, counts: S.poll.counts, total: 0 } });
    railTab('ask');
    renderPoll();
    RT.toast('Poll live on every screen', 'good');
  }

  function votePoll(choice) {
    if (!S.poll || S.poll.closed || S.myVote != null) return;
    S.myVote = choice;
    if (S.isHost) {
      S.pollVotes[S.rt ? S.rt.me.id : 'me'] = choice;
      recountPoll();
      broadcastPoll();
    } else if (S.rt) {
      S.rt.signal({ type: 'vote', pollId: S.poll.id, choice });
    }
    renderPoll();
  }

  function recountPoll() {
    const counts = new Array((S.poll.options || []).length).fill(0);
    Object.keys(S.pollVotes).forEach((k) => {
      const c = S.pollVotes[k];
      if (counts[c] != null) counts[c] += 1;
    });
    S.poll.counts = counts;
    S.poll.total = counts.reduce((a, b) => a + b, 0);
  }

  function broadcastPoll() {
    if (!S.isHost || !S.rt || !S.poll) return;
    S.rt.signal({ type: 'pollcount', pollId: S.poll.id, counts: S.poll.counts, total: S.poll.total });
  }

  function revealPoll() {
    if (!S.poll || !S.isHost) return;
    S.poll.revealed = !S.poll.revealed;
    if (S.rt) S.rt.signal({ type: 'pollreveal', pollId: S.poll.id, answer: S.poll.revealed ? S.poll.answer : -1 });
    renderPoll();
  }

  function closePoll() {
    if (!S.poll || !S.isHost) return;
    S.poll.closed = true;
    if (S.rt) S.rt.signal({ type: 'pollclose', pollId: S.poll.id });
    renderPoll();
  }

  function renderPoll() {
    const box = $('#pollBox');
    const banner = $('#pollBanner');
    const state = $('#askState');
    if (!box) return;
    if (!S.poll) {
      box.innerHTML = '<p class="room-note">No poll yet. ' + (S.isHost ? 'Pick a quiz question below to launch one.' : 'The host can launch one at any time.') + '</p>';
      if (banner) banner.hidden = true;
      const st = $('#stage');
      if (st) st.classList.remove('polling');
      if (state) state.textContent = 'no poll';
      return;
    }
    const p = S.poll;
    const voted = S.myVote != null;
    const showBars = voted || p.closed || p.revealed || S.isHost;
    const pct = (i) => (p.total ? Math.round((p.counts[i] / p.total) * 100) : 0);

    box.innerHTML = `<div class="poll-card">
      <p class="poll-q">${esc(p.q)}</p>
      <div style="display:grid;gap:6px">
        ${p.options.map((o, i) => `<button class="poll-opt ${S.myVote === i ? 'is-mine' : ''} ${p.revealed && p.answer === i ? 'is-right' : ''}" type="button" data-vote="${i}" ${voted || p.closed ? 'disabled' : ''}>
          <span class="fill" style="width:${showBars ? pct(i) : 0}%"></span>
          <span class="k">${'ABC'[i]}</span><span class="t">${esc(o)}</span>
          <span class="n">${showBars ? p.counts[i] : ''}</span>
        </button>`).join('')}
      </div>
      <div class="poll-foot">
        <span>${p.total} ${p.total === 1 ? 'vote' : 'votes'}${p.closed ? ' · closed' : ''}</span>
        ${S.isHost ? `<span style="display:flex;gap:6px"><button class="btn btn-ghost btn-sm" type="button" data-reveal>${p.revealed ? 'Hide' : 'Reveal'}</button><button class="btn btn-quiet btn-sm" type="button" data-close>Close</button></span>` : ''}
      </div>
    </div>`;

    RT.$$('[data-vote]').forEach((b) => b.addEventListener('click', () => votePoll(+b.dataset.vote)));
    const rev = $('[data-reveal]', box);
    if (rev) rev.addEventListener('click', revealPoll);
    const cl = $('[data-close]', box);
    if (cl) cl.addEventListener('click', closePoll);
    if (state) state.textContent = p.closed ? 'closed' : p.total + ' votes';

    const stageEl = $('#stage');
    if (stageEl) stageEl.classList.toggle('polling', !!S.poll);
    if (banner) {
      banner.hidden = false;
      banner.innerHTML = `<div class="pb-head"><span class="pb-k">Live poll</span><span class="pb-n">${p.total} ${p.total === 1 ? 'vote' : 'votes'}${p.closed ? ' · closed' : ''}</span></div>
        <p class="pq">${esc(p.q)}</p>
        <div class="poll-rows">
          ${p.options.map((o, i) => `<div class="poll-row ${p.revealed && p.answer === i ? 'is-right' : ''} ${S.myVote === i ? 'is-mine' : ''}">
            <span class="fill" style="width:${pct(i)}%"></span>
            <span class="k">${'ABC'[i]}</span><span class="t">${esc(o)}</span><span class="n">${p.counts[i]}</span>
          </div>`).join('')}
        </div>`;
    }
  }

  function onSignal(payload) {
    if (!payload) return;
    if (payload.type === 'poll') {
      if (S.poll && S.poll.id === payload.poll.id) return;
      S.poll = Object.assign({ counts: [0, 0, 0], total: 0, revealed: false, closed: false }, payload.poll);
      S.myVote = null;
      S.pollVotes = {};
      railTab('ask');
      renderAsk();
      renderPoll();
      if (!S.isHost) RT.toast('The host started a poll');
    } else if (payload.type === 'vote') {
      if (!S.isHost || !S.poll || payload.pollId !== S.poll.id) return;
      if (S.pollVotes[payload.from] == null) {
        S.pollVotes[payload.from] = payload.choice;
        recountPoll();
        broadcastPoll();
        renderPoll();
      }
    } else if (payload.type === 'pollcount') {
      if (!S.poll || payload.pollId !== S.poll.id) return;
      S.poll.counts = payload.counts;
      S.poll.total = payload.total;
      renderPoll();
    } else if (payload.type === 'pollreveal') {
      if (!S.poll || payload.pollId !== S.poll.id) return;
      S.poll.revealed = payload.answer >= 0;
      S.poll.answer = payload.answer;
      renderPoll();
    } else if (payload.type === 'pollclose') {
      if (!S.poll || payload.pollId !== S.poll.id) return;
      S.poll.closed = true;
      renderPoll();
    } else if (payload.type === 'prompt') {
      showPrompt(payload.text);
    }
  }

  function showPrompt(text) {
    const el = $('#promptPop');
    if (!el || !text) return;
    el.hidden = false;
    el.textContent = text;
    clearTimeout(S.promptTimer);
    S.promptTimer = setTimeout(() => { el.hidden = true; }, 25000);
  }

  /* ── 20-minute taster ─────────────────────────────────── */

  function openTaster() {
    if (!S.isHost) return nudgeHost();
    const items = (S.film.scenes || []).slice(0, 3).map((s) => ({
      start: Math.max(0, RT.parseCue(s.at) - 15),
      len: 150,
      title: s.title,
      task: s.task
    }));
    const m = RT.modal({
      title: '20-minute taster',
      sub: 'Three clips of two and a half minutes, one question after each. The room pauses itself.',
      body: `<div style="display:grid;gap:10px">
        ${items.map((it, i) => `<div style="display:grid;grid-template-columns:24px 1fr auto;gap:10px;align-items:start;border-top:1px solid var(--line);padding-top:9px">
          <span class="mono" style="font-size:10px;color:var(--dim)">${(i + 1)}</span>
          <div><b style="font-size:13.5px">${esc(it.title)}</b><p style="font-size:12.5px;color:var(--muted);margin-top:2px;line-height:1.5">${esc(it.task)}</p></div>
          <span class="mono" style="font-size:10px;color:var(--amber)">${RT.clock(it.start)}</span>
        </div>`).join('')}
      </div>
      <p style="font-size:12.5px;color:var(--dim);margin-top:14px;line-height:1.6">${S.film.free ? 'This film streams in the room.' : 'Everyone plays their own legal copy — the shared clock keeps you together.'} A half-hour class gets a real film, without watching two hours.</p>`,
      actions: `<button class="btn btn-ghost btn-sm" id="tasterCancel" type="button">Cancel</button>
                <button class="btn btn-primary btn-sm" id="tasterGo" type="button">Start the taster</button>`
    });
    $('#tasterCancel').addEventListener('click', m.close);
    $('#tasterGo').addEventListener('click', () => { m.close(); startTaster(items); });
  }

  function startTaster(items) {
    if (!S.isHost) return nudgeHost();
    S.taster = { items, idx: 0, active: true };
    railTab('now');
    hostSeek(items[0].start);
    setTimeout(() => hostPlay(), 320);
    RT.toast('Taster started · clip 1 of ' + items.length, 'good');
  }

  function tasterTick() {
    if (!S.taster || !S.taster.active || !S.playing) return;
    const it = S.taster.items[S.taster.idx];
    if (!it) return;
    if (pos() >= it.start + it.len) {
      hostPause();
      showTasterCard();
    }
  }

  function showTasterCard() {
    const el = $('#tasterCard');
    const t = S.taster;
    if (!el || !t) return;
    const it = t.items[t.idx];
    el.hidden = false;
    el.innerHTML = `<span class="tk">Taster · clip ${t.idx + 1} of ${t.items.length} ended</span>
      <h4>${esc(it.title)}</h4>
      <p class="task">${esc(it.task)}</p>
      <div class="row">
        <button class="btn btn-primary btn-sm" id="tasterNext" type="button">${t.idx + 1 < t.items.length ? 'Next clip' : 'Finish'}</button>
        <button class="btn btn-ghost btn-sm" id="tasterEnd" type="button">End the taster</button>
      </div>`;
    $('#tasterNext').addEventListener('click', () => { el.hidden = true; advanceTaster(); });
    $('#tasterEnd').addEventListener('click', () => { el.hidden = true; S.taster = null; RT.toast('Taster ended'); });
  }

  function advanceTaster() {
    const t = S.taster;
    if (!t) return;
    t.idx += 1;
    if (t.idx >= t.items.length) {
      S.taster = null;
      RT.toast('Taster complete — over to the discussion', 'good');
      return;
    }
    hostSeek(t.items[t.idx].start);
    setTimeout(() => hostPlay(), 280);
  }

  function railTab(name) {
    RT.$$('#railTabs button').forEach((b) => b.classList.toggle('is-on', b.dataset.rt === name));
    RT.$$('.rail-panel').forEach((p) => {
      p.hidden = false;
      p.classList.toggle('is-on', p.dataset.panel === name);
    });
    if (name === 'chat') {
      S.unread = 0;
      $('#chatBadge').hidden = true;
      const log = $('#chatLog');
      log.scrollTop = log.scrollHeight;
    }
  }

  function playSvg() {
    return '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5-11-6.5Z" fill="currentColor"/></svg>';
  }
})();

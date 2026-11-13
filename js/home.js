/* Reel Talk — home page */
(function () {
  'use strict';
  const RT = window.RT;
  const $ = RT.$;

  RT.ready(() => {
    RT.mountChrome('films');
    if (!window.FILM_DATA) return;

    const films = RT.films;
    const featured = pickFeatured(films);
    renderHeroStats(films);
    renderScreen(featured);
    renderTonight(featured, films);
    renderLevels(films);
    renderOpen(films);
    initCatalogue(films);
  });

  function pickFeatured(films) {
    const now = new Date();
    const week = Math.floor((now - new Date(now.getFullYear(), 0, 1)) / 604800000);
    const core = films.filter((f) => f.runtime >= 80);
    return core[RT.hash('reel-' + now.getFullYear() + '-' + week) % core.length];
  }

  function renderHeroStats(films) {
    const tasks = films.reduce((n, f) => n + f.gaps.length + f.quotes.length + f.quiz.length + f.quest.length, 0);
    const minutes = films.reduce((n, f) => n + f.runtime, 0);
    $('#heroStats').innerHTML = [
      ['Films', films.length],
      ['Levels', 'A1–C2'],
      ['Ready tasks', tasks],
      ['Screen time', Math.round(minutes / 60) + 'h']
    ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  }

  function renderScreen(f) {
    $('#heroTitle').textContent = f.title;
    $('#heroSub').textContent = `${f.year} · ${f.level} · ${RT.duration(f.runtime)}`;
    $('#heroBadge').textContent = f.free ? 'Plays right here' : 'Screening ' + ((RT.hash(f.id) % 40) + 1);
    $('#heroMeta').textContent = f.director;
    $('#heroPlay').href = 'watch.html#/w/' + f.id;
    $('#heroCaption').textContent = f.free
      ? 'Free to stream in the watch room — no account needed'
      : 'Open a room, invite the club, press play together';
  }

  function renderTonight(f, films) {
    $('#tonightPoster').innerHTML = RT.poster(f);
    $('#tonightTitle').textContent = f.title;
    $('#tonightLogline').textContent = f.logline;
    $('#tonightMeta').innerHTML = [
      `<span class="lvl" style="--lv:${RT.level(f.level).color}">${f.level} · ${RT.level(f.level).name}</span>`,
      `<span class="chip">${f.year}</span>`,
      `<span class="chip">${f.runtime} min</span>`,
      `<span class="chip">${f.genres.join(' / ')}</span>`,
      RT.ageChip(f.age)
    ].join('');
    const level = RT.level(f.level);
    $('#tonightNote').innerHTML =
      `<strong style="color:var(--ink-soft);font-weight:600">Why it works at ${f.level}:</strong> ${RT.esc(f.why)}`;
    $('#tonightWatch').href = 'watch.html#/w/' + f.id;
    $('#tonightFilm').href = 'film.html#/f/' + f.id;

    // tonight's free alternative
    const free = films.find((x) => x.free);
    if (free) {
      const row = document.createElement('a');
      row.className = 'chip chip-free';
      row.href = 'watch.html#/w/' + free.id;
      row.style.marginTop = '4px';
      row.innerHTML = '▶ Also tonight: ' + RT.esc(free.title) + ' — free in the room';
      $('#tonightNote').insertAdjacentElement('afterend', row);
    }
  }

  function renderLevels(films) {
    $('#levelList').innerHTML = RT.LEVELS.map((lv) => {
      const list = films.filter((f) => f.level === lv.id);
      return (
        `<a class="level-row" href="#catalogue" data-level="${lv.id}" style="--lv:${lv.color}">` +
        `<span class="level-tag">${lv.id}</span>` +
        `<span class="level-name"><strong>${lv.name}</strong><span>${lv.tag}</span></span>` +
        `<span class="level-count">${list.length} films</span>` +
        `<span class="level-arrow">→</span>` +
        `</a>`
      );
    }).join('');
    RT.$$('.level-row').forEach((row) => {
      row.addEventListener('click', () => {
        const btn = RT.$(`#levelSeg button[data-level="${row.dataset.level}"]`);
        if (btn) setTimeout(() => btn.click(), 380);
      });
    });
  }

  function renderOpen(films) {
    const free = films.filter((f) => f.free);
    $('#openGrid').innerHTML = free.map((f) =>
      `<a class="open-card" href="watch.html#/w/${f.id}">` +
      RT.poster(f) +
      `<div class="open-body">` +
      `<span class="open-tag">Public domain · streams here</span>` +
      `<h3>${RT.esc(f.title)}</h3>` +
      `<p>${f.year} · ${f.runtime} min · ${f.level}. ${RT.esc(f.logline)}</p>` +
      `<span class="open-play">Watch in the room →</span>` +
      `</div></a>`
    ).join('');
  }

  /* ---------------- catalogue ---------------- */

  function initCatalogue(films) {
    const state = { q: '', level: 'all', genre: 'all', sort: 'level', free: false, series: false };
    const grid = $('#grid');
    const countEl = $('#catalogueCount');
    const empty = $('#empty');

    const genres = Array.from(new Set(films.flatMap((f) => f.genres))).sort();
    $('#genre').innerHTML = '<option value="all">All genres</option>' +
      genres.map((g) => `<option value="${g}">${g[0].toUpperCase() + g.slice(1)}</option>`).join('');

    function apply() {
      let list = films.slice();
      if (state.level !== 'all') list = list.filter((f) => f.level === state.level);
      if (state.genre !== 'all') list = list.filter((f) => f.genres.includes(state.genre));
      if (state.free) list = list.filter((f) => f.free);
      if (state.series) list = list.filter((f) => f.kind === 'series');
      if (state.q) {
        const q = state.q.toLowerCase();
        list = list.filter((f) =>
          [f.title, f.director, f.year, f.logline, f.country, ...f.genres, ...(f.words || []).map((w) => w.w)]
            .join(' ').toLowerCase().includes(q)
        );
      }
      const lvIndex = (f) => RT.LEVELS.findIndex((l) => l.id === f.level);
      const sorters = {
        level: (a, b) => lvIndex(a) - lvIndex(b) || a.title.localeCompare(b.title),
        'level-desc': (a, b) => lvIndex(b) - lvIndex(a) || a.title.localeCompare(b.title),
        year: (a, b) => b.year - a.year,
        'year-asc': (a, b) => a.year - b.year,
        short: (a, b) => a.runtime - b.runtime,
        rated: (a, b) => (RT.ratings.get(b.id).avg || 0) - (RT.ratings.get(a.id).avg || 0) || RT.ratings.get(b.id).count - RT.ratings.get(a.id).count,
        az: (a, b) => a.title.localeCompare(b.title)
      };
      list.sort(sorters[state.sort]);

      grid.innerHTML = list.map((f) =>
        `<a class="film-card" href="film.html#/f/${f.id}" aria-label="${RT.esc(f.title)} (${f.year}), level ${f.level}, ${f.runtime} minutes">` +
        RT.poster(f) +
        `<span class="film-card-open">→</span>` +
        `</a>`
      ).join('');

      countEl.textContent = list.length + (list.length === 1 ? ' film' : ' films') +
        (state.level !== 'all' ? ' · ' + state.level : '') +
        (state.free ? ' · free to stream' : '') +
        (state.series ? ' · series' : '');
      empty.hidden = list.length > 0;
    }

    $('#q').addEventListener('input', RT.debounce((e) => { state.q = e.target.value.trim(); apply(); }, 140));
    $('#levelSeg').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-level]');
      if (!btn) return;
      RT.$$('#levelSeg button').forEach((b) => b.classList.toggle('is-on', b === btn));
      state.level = btn.dataset.level;
      apply();
    });
    $('#genre').addEventListener('change', (e) => { state.genre = e.target.value; apply(); });
    $('#sort').addEventListener('change', (e) => { state.sort = e.target.value; apply(); });
    $('#freeOnly').addEventListener('change', (e) => { state.free = e.target.checked; apply(); });
    $('#seriesOnly').addEventListener('change', (e) => { state.series = e.target.checked; apply(); });

    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'SELECT') {
        e.preventDefault();
        $('#q').focus();
      }
    });

    apply();
    RT.ratings.load().then(() => { if (state.sort === 'rated') apply(); });
  }
})();

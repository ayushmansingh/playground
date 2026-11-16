(function () {
  'use strict';

  const Ops = window.AudioOps;
  const $ = (sel, root = document) => root.querySelector(sel);

  const WAVE_H = 120;
  const MAX_WAVE_PX = 30000; // keep canvases under browser size limits
  const MAX_PPS = 8000; // max zoom, pixels per second
  const EMPTY_TRACK_PX = 240;
  const MAX_HISTORY = 40;
  const DRAG_THRESHOLD_PX = 3;

  /*
   * Tracks hold immutable channel data, so undo snapshots are cheap shallow
   * copies. `sel` is {a, b} in samples or null; `cursor` is a sample index.
   */
  const state = {
    tracks: [],
    activeId: null,
    clipboard: null,
    pps: null, // null = fit to width
    history: [],
    future: [],
  };
  let audioCtx = null;
  let nextId = 1;
  let playback = null;
  const views = new Map();

  // ---------- helpers ----------

  function ctx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      $('#rate-info').textContent = ` · working at ${audioCtx.sampleRate / 1000} kHz`;
    }
    return audioCtx;
  }
  const rate = () => ctx().sampleRate;
  const len = (t) => Ops.length(t.channels);
  const getTrack = (id) => state.tracks.find((t) => t.id === id);
  const active = () => getTrack(state.activeId);

  function makeTrack(name, channels) {
    return { id: nextId++, name, channels, sel: null, cursor: 0, include: true };
  }

  function fmtTime(samples) {
    const s = samples / rate();
    const m = Math.floor(s / 60);
    const rest = s - m * 60;
    return `${m}:${rest.toFixed(3).padStart(6, '0')}`;
  }

  function fmtDur(samples) {
    const s = samples / rate();
    return s < 60 ? `${s.toFixed(2)} s` : fmtTime(samples);
  }

  function channelLabel(n) {
    return n === 1 ? 'mono' : n === 2 ? 'stereo' : `${n} ch`;
  }

  function toast(msg, kind) {
    const el = document.createElement('div');
    el.className = 'toast-item' + (kind ? ' ' + kind : '');
    el.textContent = msg;
    const box = $('#toast');
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.remove(), kind === 'error' ? 5000 : 2400);
  }

  // ---------- history ----------

  function snapshot() {
    return {
      tracks: state.tracks.map((t) => ({ ...t, sel: t.sel && { ...t.sel } })),
      activeId: state.activeId,
    };
  }

  function commit() {
    state.history.push(snapshot());
    if (state.history.length > MAX_HISTORY) state.history.shift();
    state.future = [];
  }

  function restore(snap) {
    stop();
    state.tracks = snap.tracks;
    state.activeId = snap.activeId;
    render();
  }

  function undo() {
    if (!state.history.length) return;
    state.future.push(snapshot());
    restore(state.history.pop());
  }

  function redo() {
    if (!state.future.length) return;
    state.history.push(snapshot());
    restore(state.future.pop());
  }

  // ---------- zoom ----------

  function maxDuration() {
    return state.tracks.reduce((m, t) => Math.max(m, len(t) / rate()), 0);
  }

  function availableWidth() {
    const first = $('.wave-scroll');
    if (first) return first.clientWidth - 2;
    return Math.max(200, $('#tracks').clientWidth - 48);
  }

  function capPps(pps, dur) {
    pps = Math.min(pps, MAX_PPS);
    if (dur > 0) pps = Math.min(pps, MAX_WAVE_PX / dur);
    return pps;
  }

  function currentPps() {
    const dur = maxDuration();
    if (state.pps == null) return capPps(dur > 0 ? availableWidth() / dur : 100, dur);
    return capPps(state.pps, dur);
  }

  function zoom(factor) {
    const dur = maxDuration();
    const fit = capPps(dur > 0 ? availableWidth() / dur : 100, dur);
    const next = currentPps() * factor;
    state.pps = next <= fit ? null : next;
    render();
  }

  // ---------- rendering ----------

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function drawWave(v, t, pps) {
    const n = len(t);
    const width = n ? Math.max(1, Math.round((n / rate()) * pps)) : EMPTY_TRACK_PX;
    if (v.drawn && v.drawn.channels === t.channels && v.drawn.width === width && v.drawn.theme === themeVersion) {
      return;
    }
    v.drawn = { channels: t.channels, width, theme: themeVersion };
    v.wave.style.width = width + 'px';
    v.emptyHint.hidden = n > 0;

    const canvas = v.canvas;
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 32000 / width));
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(WAVE_H * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = WAVE_H + 'px';
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, canvas.width, canvas.height);

    const lanes = t.channels.length;
    const laneH = canvas.height / lanes;
    const cw = canvas.width;
    const midColor = cssVar('--midline');
    g.fillStyle = cssVar('--wave');

    for (let c = 0; c < lanes; c++) {
      const mid = laneH * c + laneH / 2;
      const amp = laneH / 2 - 2 * dpr;
      g.save();
      g.fillStyle = midColor;
      g.fillRect(0, Math.round(mid), cw, Math.max(1, Math.floor(dpr)));
      g.restore();
      if (!n) continue;
      const ch = t.channels[c];
      const spp = n / cw;
      for (let x = 0; x < cw; x++) {
        const s0 = Math.floor(x * spp);
        const s1 = Math.min(n, Math.max(s0 + 1, Math.floor((x + 1) * spp)) + 1);
        let lo = 1;
        let hi = -1;
        for (let s = s0; s < s1; s++) {
          const val = ch[s];
          if (val < lo) lo = val;
          if (val > hi) hi = val;
        }
        if (hi < lo) continue;
        const y = mid - Math.min(1, hi) * amp;
        const h = Math.max(dpr, (Math.min(1, hi) - Math.max(-1, lo)) * amp);
        g.fillRect(x, y, 1, h);
      }
    }
  }

  function updateOverlay(t) {
    const v = views.get(t.id);
    if (!v) return;
    const pps = currentPps();
    const toPx = (s) => (s / rate()) * pps;
    if (t.sel) {
      v.selEl.hidden = false;
      v.selEl.style.left = toPx(t.sel.a) + 'px';
      v.selEl.style.width = Math.max(1, toPx(t.sel.b - t.sel.a)) + 'px';
    } else {
      v.selEl.hidden = true;
    }
    v.cursorEl.style.left = toPx(t.cursor) + 'px';
    v.readout.textContent = t.sel
      ? `Selection ${fmtTime(t.sel.a)} – ${fmtTime(t.sel.b)}  (${fmtDur(t.sel.b - t.sel.a)})`
      : `Cursor ${fmtTime(t.cursor)}`;
  }

  function updateHead(v, t, i) {
    if (document.activeElement !== v.nameIn) v.nameIn.value = t.name;
    v.includeIn.checked = t.include;
    v.meta.textContent = `${fmtDur(len(t))} · ${channelLabel(t.channels.length)}`;
    v.el.querySelector('[data-act="up"]').disabled = i === 0;
    v.el.querySelector('[data-act="down"]').disabled = i === state.tracks.length - 1;
    v.el.classList.toggle('active', t.id === state.activeId);
    const playing = playback && playback.id === t.id;
    v.playBtn.textContent = playing ? '■' : '▶';
    v.playBtn.title = playing ? 'Stop' : 'Play this track';
    v.playBtn.disabled = !len(t);
  }

  function render() {
    const list = $('#tracks');
    for (const [id, v] of views) {
      if (!getTrack(id)) {
        v.el.remove();
        views.delete(id);
      }
    }
    // Create views first so fit-to-width can measure a real track.
    state.tracks.forEach((t) => {
      if (!views.has(t.id)) views.set(t.id, createView(t));
      list.appendChild(views.get(t.id).el);
    });
    const pps = currentPps();
    state.tracks.forEach((t, i) => {
      const v = views.get(t.id);
      updateHead(v, t, i);
      drawWave(v, t, pps);
      updateOverlay(t);
    });
    $('#empty').hidden = state.tracks.length > 0;
    updateToolbar();
  }

  function updateToolbar() {
    const t = active();
    const hasSel = !!(t && t.sel);
    for (const id of ['cut', 'copy', 'delete', 'crop', 'silence', 'fade-in', 'fade-out']) {
      $('#' + id).disabled = !hasSel;
    }
    $('#paste').disabled = !t || !state.clipboard;
    $('#paste-new').disabled = !state.clipboard;
    $('#undo').disabled = !state.history.length;
    $('#redo').disabled = !state.future.length;
    $('#play').disabled = !(t && len(t)) && !playback;
    $('#play').textContent = playback ? 'Stop' : 'Play';
    const checked = state.tracks.filter((x) => x.include && len(x)).length;
    $('#merge').disabled = checked < 2;
    $('#merge').textContent = checked >= 2 ? `Merge ${checked} checked` : 'Merge checked';
    $('#merge-spacing').disabled = $('#merge-mode').value === 'mix';
    $('#zoom-out').disabled = state.pps == null;
    $('#zoom-fit').disabled = state.pps == null;
    $('#zoom-in').disabled = !state.tracks.length;
    $('#active-name').textContent = t ? t.name || 'Untitled' : 'none';
    $('#clip-info').textContent = state.clipboard
      ? `${fmtDur(Ops.length(state.clipboard))} ${channelLabel(state.clipboard.length)}`
      : 'empty';
  }

  function setActive(id) {
    if (state.activeId === id) return;
    state.activeId = id;
    state.tracks.forEach((t, i) => updateHead(views.get(t.id), t, i));
    updateToolbar();
  }

  // ---------- track view ----------

  function createView(t) {
    const el = document.createElement('section');
    el.className = 'track';
    el.innerHTML = `
      <div class="track-head">
        <input type="checkbox" class="include" title="Include in merge" aria-label="Include in merge">
        <input class="name" type="text" aria-label="Track name" spellcheck="false">
        <span class="meta"></span>
        <div class="track-actions">
          <button class="btn" data-act="play" aria-label="Play or stop this track">▶</button>
          <button class="btn" data-act="up" title="Move up" aria-label="Move up">↑</button>
          <button class="btn" data-act="down" title="Move down" aria-label="Move down">↓</button>
          <button class="btn" data-act="dup" title="Duplicate track">Duplicate</button>
          <button class="btn" data-act="export" title="Download as WAV">Export WAV</button>
          <button class="btn" data-act="remove" title="Remove track" aria-label="Remove track">✕</button>
        </div>
      </div>
      <div class="wave-scroll">
        <div class="wave">
          <canvas></canvas>
          <div class="empty-hint">Empty track: click here, then paste</div>
          <div class="sel" hidden></div>
          <div class="cursor"></div>
          <div class="playhead" hidden></div>
        </div>
      </div>
      <div class="readout"></div>`;

    const v = {
      id: t.id,
      el,
      wave: $('.wave', el),
      canvas: $('canvas', el),
      selEl: $('.sel', el),
      cursorEl: $('.cursor', el),
      playheadEl: $('.playhead', el),
      emptyHint: $('.empty-hint', el),
      readout: $('.readout', el),
      nameIn: $('.name', el),
      includeIn: $('.include', el),
      meta: $('.meta', el),
      playBtn: $('[data-act="play"]', el),
      drawn: null,
    };
    const track = () => getTrack(v.id);

    el.addEventListener('pointerdown', () => setActive(v.id));
    el.addEventListener('focusin', () => setActive(v.id));

    v.nameIn.addEventListener('input', () => {
      track().name = v.nameIn.value;
      updateToolbar();
    });
    v.nameIn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'Escape') v.nameIn.blur();
    });
    v.includeIn.addEventListener('change', () => {
      track().include = v.includeIn.checked;
      updateToolbar();
    });

    el.querySelector('.track-actions').addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const t = track();
      const i = state.tracks.indexOf(t);
      switch (btn.dataset.act) {
        case 'play':
          togglePlay(t);
          break;
        case 'up':
        case 'down': {
          const j = btn.dataset.act === 'up' ? i - 1 : i + 1;
          if (j < 0 || j >= state.tracks.length) return;
          commit();
          [state.tracks[i], state.tracks[j]] = [state.tracks[j], state.tracks[i]];
          render();
          break;
        }
        case 'dup': {
          commit();
          const copy = makeTrack(`${t.name} copy`, t.channels);
          state.tracks.splice(i + 1, 0, copy);
          state.activeId = copy.id;
          render();
          break;
        }
        case 'export':
          exportTrack(t);
          break;
        case 'remove':
          if (playback && playback.id === t.id) stop();
          commit();
          state.tracks.splice(i, 1);
          if (state.activeId === t.id) {
            const next = state.tracks[i] || state.tracks[i - 1];
            state.activeId = next ? next.id : null;
          }
          render();
          toast(`Removed “${t.name}”. Undo with Ctrl+Z.`);
          break;
      }
    });

    // Selection: click sets cursor, drag selects, shift+click extends.
    let drag = null;
    const sampleAt = (e) => {
      const rect = v.wave.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const s = Math.round((x / currentPps()) * rate());
      return Math.max(0, Math.min(len(track()), s));
    };
    const applyDrag = (s, force) => {
      const t = track();
      const px = (Math.abs(s - drag.anchor) / rate()) * currentPps();
      if (!force && px < DRAG_THRESHOLD_PX) {
        t.sel = null;
        t.cursor = drag.anchor;
      } else {
        const a = Math.min(s, drag.anchor);
        const b = Math.max(s, drag.anchor);
        t.sel = b > a ? { a, b } : null;
        t.cursor = a;
      }
      updateOverlay(t);
      updateToolbar();
    };
    v.wave.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      setActive(v.id);
      const t = track();
      const s = sampleAt(e);
      if (e.shiftKey) {
        let anchor = t.cursor;
        if (t.sel) anchor = Math.abs(s - t.sel.a) < Math.abs(s - t.sel.b) ? t.sel.b : t.sel.a;
        drag = { anchor, shift: true };
        applyDrag(s, true);
      } else {
        drag = { anchor: s, shift: false };
        applyDrag(s, false);
      }
      v.wave.setPointerCapture(e.pointerId);
    });
    v.wave.addEventListener('pointermove', (e) => {
      if (drag) applyDrag(sampleAt(e), drag.shift);
    });
    const end = () => {
      drag = null;
    };
    v.wave.addEventListener('pointerup', end);
    v.wave.addEventListener('pointercancel', end);

    return v;
  }

  // ---------- editing ----------

  function edit(fn) {
    const t = active();
    if (!t) return;
    stop();
    commit();
    fn(t);
    render();
  }

  function cut() {
    const t = active();
    if (!t || !t.sel) return;
    const { a, b } = t.sel;
    state.clipboard = Ops.slice(t.channels, a, b);
    edit((t) => {
      t.channels = Ops.remove(t.channels, a, b);
      t.sel = null;
      t.cursor = a;
    });
    toast(`Cut ${fmtDur(b - a)}`);
  }

  function copy() {
    const t = active();
    if (!t || !t.sel) return;
    state.clipboard = Ops.slice(t.channels, t.sel.a, t.sel.b);
    updateToolbar();
    toast(`Copied ${fmtDur(t.sel.b - t.sel.a)} from “${t.name}”`);
  }

  function paste() {
    const clip = state.clipboard;
    const t = active();
    if (!clip || !t) return;
    edit((t) => {
      const at = t.sel ? t.sel.a : t.cursor;
      t.channels = t.sel ? Ops.replace(t.channels, t.sel.a, t.sel.b, clip) : Ops.insert(t.channels, at, clip);
      const k = Ops.length(clip);
      t.sel = k ? { a: at, b: at + k } : null;
      t.cursor = at;
    });
    toast(`Pasted ${fmtDur(Ops.length(clip))} into “${t.name}”`);
  }

  function pasteAsNewTrack() {
    if (!state.clipboard) return;
    stop();
    commit();
    const t = makeTrack('Clip', state.clipboard);
    state.tracks.push(t);
    state.activeId = t.id;
    render();
    views.get(t.id).el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function deleteSel() {
    const t = active();
    if (!t || !t.sel) return;
    const { a, b } = t.sel;
    edit((t) => {
      t.channels = Ops.remove(t.channels, a, b);
      t.sel = null;
      t.cursor = a;
    });
  }

  function crop() {
    const t = active();
    if (!t || !t.sel) return;
    const { a, b } = t.sel;
    edit((t) => {
      t.channels = Ops.slice(t.channels, a, b);
      t.sel = null;
      t.cursor = 0;
    });
  }

  function processSel(fn) {
    const t = active();
    if (!t || !t.sel) return;
    const { a, b } = t.sel;
    edit((t) => {
      t.channels = fn(t.channels, a, b);
    });
  }

  function selectAll() {
    const t = active();
    if (!t || !len(t)) return;
    t.sel = { a: 0, b: len(t) };
    t.cursor = 0;
    updateOverlay(t);
    updateToolbar();
  }

  function clearSel() {
    const t = active();
    if (!t || !t.sel) return;
    t.sel = null;
    updateOverlay(t);
    updateToolbar();
  }

  function newEmptyTrack() {
    commit();
    const t = makeTrack('New track', Ops.empty(2, 0));
    state.tracks.push(t);
    state.activeId = t.id;
    render();
    views.get(t.id).el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function merge() {
    const picked = state.tracks.filter((t) => t.include && len(t));
    if (picked.length < 2) {
      toast('Check at least two non-empty tracks to merge.', 'error');
      return;
    }
    stop();
    const mode = $('#merge-mode').value;
    let channels;
    let note = '';
    if (mode === 'mix') {
      const res = Ops.mix(picked.map((t) => t.channels));
      channels = res.channels;
      if (res.scaled) note = ' (volume lowered to avoid clipping)';
    } else {
      const secs = parseFloat($('#merge-spacing').value) || 0;
      channels = Ops.concat(picked.map((t) => t.channels), Math.round(secs * rate()));
    }
    commit();
    const t = makeTrack(mode === 'mix' ? 'Mix' : 'Merged', channels);
    state.tracks.push(t);
    state.activeId = t.id;
    render();
    views.get(t.id).el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    toast(`${mode === 'mix' ? 'Mixed' : 'Joined'} ${picked.length} tracks into “${t.name}”${note}`);
  }

  // Inside the claude.ai viewer, pages can't start downloads themselves and
  // .wav isn't an allowed save type, so the WAV is offered inside a .zip.
  const inClaudeViewer = !!(window.claude && typeof window.claude.use === 'function');
  let downloadsPromise = null;
  function downloadsApi() {
    if (!downloadsPromise) downloadsPromise = window.claude.use('downloads').catch(() => null);
    return downloadsPromise;
  }

  async function exportTrack(t) {
    if (!len(t)) {
      toast('This track is empty.', 'error');
      return;
    }
    const base = (t.name || 'audio').replace(/[\\/:*?"<>|]+/g, '_');
    const wav = Ops.encodeWav(t.channels, rate());
    if (inClaudeViewer) {
      const dl = await downloadsApi();
      if (!dl) {
        toast('Saving files isn’t available in this view.', 'error');
        return;
      }
      try {
        const data = new Blob([Ops.zip([{ name: `${base}.wav`, data: new Uint8Array(wav) }])]);
        await dl.save({ filename: `${base}.zip`, data });
        toast(`Saved ${base}.zip (contains ${base}.wav)`);
      } catch (err) {
        const code = err && err.code;
        if (code === 'declined') return;
        toast(
          code === 'rate_limited' ? 'Another save is still open. Try again in a moment.' : 'Couldn’t save the file here.',
          'error'
        );
      }
      return;
    }
    const url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${base}.wav`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  // ---------- playback ----------

  function play(t) {
    stop();
    const n = len(t);
    if (!n) return;
    let a;
    let b;
    if (t.sel) {
      ({ a, b } = t.sel);
    } else {
      a = t.cursor >= n ? 0 : t.cursor;
      b = n;
    }
    const c = ctx();
    if (c.state === 'suspended') c.resume();
    const buf = c.createBuffer(t.channels.length, b - a, c.sampleRate);
    t.channels.forEach((ch, i) => buf.copyToChannel(ch.subarray(a, b), i));
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    const t0 = c.currentTime + 0.03;
    src.start(t0);
    playback = { id: t.id, src, t0, a, b, raf: 0 };
    src.onended = () => {
      if (playback && playback.src === src) stop();
    };
    const v = views.get(t.id);
    v.playheadEl.hidden = false;
    const tick = () => {
      if (!playback || playback.src !== src) return;
      const pos = Math.min(b, a + Math.max(0, c.currentTime - t0) * c.sampleRate);
      v.playheadEl.style.left = (pos / c.sampleRate) * currentPps() + 'px';
      playback.raf = requestAnimationFrame(tick);
    };
    tick();
    refreshPlayState();
  }

  function stop() {
    if (!playback) return;
    const p = playback;
    playback = null;
    cancelAnimationFrame(p.raf);
    try {
      p.src.stop();
    } catch (_) {
      /* already stopped */
    }
    const v = views.get(p.id);
    if (v) v.playheadEl.hidden = true;
    refreshPlayState();
  }

  function togglePlay(t) {
    if (playback && (!t || playback.id === t.id)) {
      stop();
      return;
    }
    t = t || active();
    if (t) play(t);
  }

  function refreshPlayState() {
    state.tracks.forEach((t, i) => {
      const v = views.get(t.id);
      if (v) updateHead(v, t, i);
    });
    updateToolbar();
  }

  // ---------- loading ----------

  async function addFiles(fileList) {
    const files = [...fileList];
    if (!files.length) return;
    const c = ctx();
    const added = [];
    if (files.length > 1 || files[0].size > 5e6) toast(`Decoding ${files.length} file${files.length > 1 ? 's' : ''}…`);
    for (const f of files) {
      try {
        const data = await f.arrayBuffer();
        const buf = await c.decodeAudioData(data);
        const channels = [];
        for (let i = 0; i < buf.numberOfChannels; i++) channels.push(buf.getChannelData(i));
        added.push(makeTrack(f.name.replace(/\.[^.]+$/, ''), channels));
      } catch (err) {
        toast(`Couldn’t decode “${f.name}”. Your browser may not support this format.`, 'error');
      }
    }
    if (!added.length) return;
    commit();
    state.tracks.push(...added);
    state.activeId = added[0].id;
    render();
  }

  // Two short synthesized clips so the editor opens with something to try.
  function exampleTracks() {
    const sr = rate();
    const notes = [220, 261.63, 329.63, 440, 329.63, 261.63, 196, 246.94];
    const step = Math.round(0.5 * sr);
    const melody = new Float32Array(step * notes.length);
    notes.forEach((f, k) => {
      for (let i = 0; i < step; i++) {
        const t = i / sr;
        const env = Math.exp(-t * 6) * Math.min(1, i / 200);
        melody[k * step + i] = 0.5 * env * (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t));
      }
    });

    const L = new Float32Array(sr * 4);
    const R = new Float32Array(sr * 4);
    let seed = 7;
    const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    const add = (start, secs, fn, panL, panR) => {
      for (let i = 0; i < Math.round(secs * sr); i++) {
        const v = fn(i / sr);
        L[start + i] += v * panL;
        R[start + i] += v * panR;
      }
    };
    for (let s = 0; s < 16; s++) {
      const start = Math.round(s * 0.25 * sr);
      if (s % 4 === 0 || s === 10) {
        let phase = 0;
        add(start, 0.25, (t) => {
          phase += (2 * Math.PI * (50 + 100 * Math.exp(-t * 30))) / sr;
          return 0.8 * Math.sin(phase) * Math.exp(-t * 9);
        }, 1, 1);
      }
      if (s === 4 || s === 12) {
        add(start, 0.18, (t) => (0.35 * noise() + 0.25 * Math.sin(2 * Math.PI * 180 * t)) * Math.exp(-t * 18), 0.9, 0.9);
      }
      if (s % 2 === 1) add(start, 0.06, (t) => 0.22 * noise() * Math.exp(-t * 60), 0.5, 1);
    }
    return [makeTrack('Example: arpeggio', [melody]), makeTrack('Example: drum loop', [L, R])];
  }

  // ---------- wiring ----------

  let themeVersion = 0;

  function init() {
    $('#file-input').addEventListener('change', (e) => {
      addFiles(e.target.files);
      e.target.value = '';
    });
    $('#new-track').addEventListener('click', newEmptyTrack);
    $('#play').addEventListener('click', () => togglePlay());
    $('#cut').addEventListener('click', cut);
    $('#copy').addEventListener('click', copy);
    $('#paste').addEventListener('click', paste);
    $('#paste-new').addEventListener('click', pasteAsNewTrack);
    $('#delete').addEventListener('click', deleteSel);
    $('#crop').addEventListener('click', crop);
    $('#silence').addEventListener('click', () => processSel(Ops.silence));
    $('#fade-in').addEventListener('click', () => processSel((c, a, b) => Ops.fade(c, a, b, 'in')));
    $('#fade-out').addEventListener('click', () => processSel((c, a, b) => Ops.fade(c, a, b, 'out')));
    $('#undo').addEventListener('click', undo);
    $('#redo').addEventListener('click', redo);
    $('#zoom-in').addEventListener('click', () => zoom(1.6));
    $('#zoom-out').addEventListener('click', () => zoom(1 / 1.6));
    $('#zoom-fit').addEventListener('click', () => {
      state.pps = null;
      render();
    });
    $('#merge').addEventListener('click', merge);
    $('#merge-mode').addEventListener('change', updateToolbar);

    // Drag and drop files anywhere.
    let dragDepth = 0;
    const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    document.addEventListener('dragenter', (e) => {
      if (!hasFiles(e)) return;
      dragDepth++;
      document.body.classList.add('dragging');
    });
    document.addEventListener('dragleave', (e) => {
      if (!hasFiles(e)) return;
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) document.body.classList.remove('dragging');
    });
    document.addEventListener('dragover', (e) => {
      if (hasFiles(e)) e.preventDefault();
    });
    document.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth = 0;
      document.body.classList.remove('dragging');
      addFiles(e.dataTransfer.files);
    });

    document.addEventListener('keydown', (e) => {
      const tg = e.target;
      const typing =
        tg.tagName === 'TEXTAREA' ||
        tg.tagName === 'SELECT' ||
        (tg.tagName === 'INPUT' && !['checkbox', 'button', 'file'].includes(tg.type));
      if (typing) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      const t = active();
      if (mod && k === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if (mod && k === 'y') {
        e.preventDefault();
        redo();
      } else if (mod && k === 'x' && t && t.sel) {
        e.preventDefault();
        cut();
      } else if (mod && k === 'c' && t && t.sel) {
        e.preventDefault();
        copy();
      } else if (mod && k === 'v' && t && state.clipboard) {
        e.preventDefault();
        paste();
      } else if (mod && k === 'a' && t) {
        e.preventDefault();
        selectAll();
      } else if (!mod && e.key === ' ') {
        e.preventDefault();
        togglePlay();
      } else if (!mod && (e.key === 'Delete' || e.key === 'Backspace') && t && t.sel) {
        e.preventDefault();
        deleteSel();
      } else if (e.key === 'Escape') {
        clearSel();
      }
    });

    let resizeTimer = 0;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(render, 120);
    });
    const retheme = () => {
      themeVersion++;
      render();
    };
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', retheme);
    new MutationObserver(retheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    if (inClaudeViewer) downloadsApi();
    state.tracks.push(...exampleTracks());
    state.activeId = state.tracks[0].id;
    render();
  }

  init();
})();

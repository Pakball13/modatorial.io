/* ============================================================
 * buildings.js — core client feature  v2.0
 *
 * Draws three circular buttons (🏭 ⚓ 🏙️) directly on the
 * canvas, anchored under your name badge — exactly like the
 * emoji reactions row. Click one to enter placement mode,
 * then click your land to place.
 *
 * Every 2+ buildings auto-connect by rail. A train tours the
 * loop and drops 💰 income at every stop.
 *
 * No HTML panel — everything is rendered inside the game canvas.
 * ============================================================ */
(function (global) {
  'use strict';

  const API = global.TerritorialMods;
  if (!API) {
    console.warn('[Buildings] TerritorialMods not loaded — buildings.js will not run');
    return;
  }

  const log  = (...a) => console.log ('%c[Buildings]', 'color:#ff8;font-weight:bold', ...a);

  /* ══════════════════════════════════════════════════════════
     CONFIG
     ══════════════════════════════════════════════════════════ */
  const TYPES = {
    factory: { icon: '🏭', value: 3, color: '#ff8844', label: 'Factory', cost: 300 },
    port:    { icon: '⚓', value: 8, color: '#4dd0e1', label: 'Port',    cost: 600 },
    city:    { icon: '🏙️', value: 5, color: '#c9f',    label: 'City',    cost: 450 }
  };
  const ORDER = ['factory', 'port', 'city'];

  /* Canvas button geometry (px) */
  const BTN_RADIUS = 20;
  const BTN_GAP    = 8;
  const LABEL_OFFSET_Y = 52;   /* distance below the name badge */

  const SETTINGS_KEY = 'tt-buildings-settings';

  const settings = Object.assign({
    freePlacement: false,
    factoryCost: 300,
    portCost: 600,
    cityCost: 450,
    trainSpeed: 0.5,
    enabled: true
  }, safeJSON(localStorage.getItem(SETTINGS_KEY)) || {});

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
  }
  function safeJSON(s) { try { return JSON.parse(s); } catch { return null; } }

  /* ══════════════════════════════════════════════════════════
     STATE
     ══════════════════════════════════════════════════════════ */
  const state = {
    buildings: [],
    trains:    [],
    railLoop:  [],
    railLength: 0,
    placementMode: null,
    previewTile:   null,
    incomePopups:  [],
    wasInMatch:    false,
    _zoom: 1,
    _zoomCaptured: false,
    _lastTick: 0,
    _lastPanelUpdate: 0,
    /* Mouse tracking for button hover + click */
    _mouseX: -1,
    _mouseY: -1,
    _hoverBtn: null,   /* 'factory' | 'port' | 'city' | null */
    /* Cached screen positions of the three buttons this frame */
    _btnPositions: {}  /* type -> { sx, sy } */
  };

  /* ══════════════════════════════════════════════════════════
     ZOOM / CAMERA
     ══════════════════════════════════════════════════════════ */
  API.addHook('preUpdate', () => { state._zoomCaptured = false; });
  API.addHook('preRender', ctx => {
    if (state._zoomCaptured) return;
    const t = ctx.getTransform();
    if (Math.abs(t.b) < 0.001 && Math.abs(t.c) < 0.001 &&
        t.a > 0.05 && t.a < 100) {
      state._zoom = t.a;
      state._zoomCaptured = true;
    }
  });

  function getCam() {
    const TT = API.getGame();
    if (!TT || !TT.aT) return null;
    return {
      camX: typeof TT.aT.a0L === 'function' ? TT.aT.a0L() : 0,
      camY: typeof TT.aT.a0M === 'function' ? TT.aT.a0M() : 0
    };
  }

  function screenToWorld(sx, sy) {
    const cam = getCam();
    if (!cam) return null;
    return {
      wx: sx / state._zoom + cam.camX,
      wy: sy / state._zoom + cam.camY
    };
  }

  function worldToScreen(wx, wy) {
    const cam = getCam();
    if (!cam) return null;
    return {
      sx: (wx - cam.camX) * state._zoom,
      sy: (wy - cam.camY) * state._zoom
    };
  }

  function worldToTile(wx, wy) {
    const TT = API.getGame();
    if (!TT || !TT.bV) return null;
    const mx = Math.floor(wx);
    const my = Math.floor(wy);
    if (mx < 1 || my < 1 || mx >= TT.bV.fk - 1 || my >= TT.bV.fl - 1) return null;
    return { mx, my, byteOffset: (my * TT.bV.fk + mx) * 4 };
  }

  function isPlayerTile(byteOffset) {
    const TT = API.getGame();
    if (!TT || !TT.ad || !TT.aE) return false;
    return !!TT.ad.a0F(TT.aE.fJ, byteOffset);
  }

  function isWaterTile(byteOffset) {
    const TT = API.getGame();
    if (!TT || !TT.ad) return false;
    return !!TT.ad.fQ(byteOffset);
  }

  function isNearWater(mx, my) {
    const TT = API.getGame();
    if (!TT || !TT.bV) return false;
    const fk = TT.bV.fk;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = mx + dx, y = my + dy;
        if (x < 0 || y < 0 || x >= fk) continue;
        const off = (y * fk + x) * 4;
        if (isWaterTile(off)) return true;
      }
    }
    return false;
  }

  function hasBuildingAt(mx, my) {
    return state.buildings.some(b => b.mx === mx && b.my === my);
  }

  /* ══════════════════════════════════════════════════════════
     PLAYER LABEL POSITION — anchor point for the buttons
     ══════════════════════════════════════════════════════════ */
  function getPlayerAnchor() {
    const TT = API.getGame();
    if (!TT || !TT.aE || !TT.ah) return null;
    if (TT.aE.a2G !== 1) return null;
    const me = TT.aE.fJ;
    if (TT.ah.nU[me] === 0) return null;

    /* Center of the player's bounding box, converted to screen */
    const mx = (TT.ah.jS[me] + TT.ah.jT[me] + 1) / 2;
    const my = (TT.ah.jU[me] + TT.ah.jV[me] + 1) / 2;
    const s = worldToScreen(mx, my);
    if (!s) return null;
    return s;
  }

  function computeButtonPositions() {
    const anchor = getPlayerAnchor();
    if (!anchor) { state._btnPositions = {}; return; }

    const totalW = ORDER.length * (BTN_RADIUS * 2) + (ORDER.length - 1) * BTN_GAP;
    const startX = anchor.sx - totalW / 2 + BTN_RADIUS;
    const cy = anchor.sy + LABEL_OFFSET_Y;

    state._btnPositions = {};
    ORDER.forEach((type, i) => {
      state._btnPositions[type] = {
        sx: startX + i * (BTN_RADIUS * 2 + BTN_GAP),
        sy: cy
      };
    });
  }

  function hitTestButton(sx, sy) {
    for (const type of ORDER) {
      const p = state._btnPositions[type];
      if (!p) continue;
      const dx = sx - p.sx;
      const dy = sy - p.sy;
      if (dx * dx + dy * dy <= (BTN_RADIUS + 2) * (BTN_RADIUS + 2)) return type;
    }
    return null;
  }

  /* ══════════════════════════════════════════════════════════
     COST / PAYMENT
     ══════════════════════════════════════════════════════════ */
  function getCost(type) {
    if (settings.freePlacement) return 0;
    const key = { factory: 'factoryCost', port: 'portCost', city: 'cityCost' }[type];
    return Math.max(0, Number(settings[key]) || 0);
  }

  function tryPay(type) {
    const cost = getCost(type);
    if (cost === 0) return true;
    const TT = API.getGame();
    if (!TT || !TT.ah || !TT.aE) return false;
    const me = TT.aE.fJ;
    const gold = TT.ah.hb[me] | 0;
    if (gold < cost) {
      API.showToast('❌ Need 💰' + cost + ' (you have ' + gold + ')');
      return false;
    }
    TT.ah.hb[me] = gold - cost;
    return true;
  }

  /* ══════════════════════════════════════════════════════════
     PLACEMENT
     ══════════════════════════════════════════════════════════ */
  function placeBuilding(type, mx, my) {
    const TT = API.getGame();
    if (!TT || !TT.aE) return;

    state.buildings.push({
      type,
      mx, my,
      wx: mx + 0.5,
      wy: my + 0.5,
      owner: TT.aE.fJ,
      placed: performance.now()
    });

    recomputeRail();
    const t = TYPES[type];
    API.showToast(t.icon + ' ' + t.label + ' placed');
  }

  /* ══════════════════════════════════════════════════════════
     RAIL LOOP
     ══════════════════════════════════════════════════════════ */
  function recomputeRail() {
    const n = state.buildings.length;
    if (n < 2) { state.railLoop = []; state.railLength = 0; state.trains = []; return; }

    const used = new Array(n).fill(false);
    const order = [0];
    used[0] = true;
    for (let step = 1; step < n; step++) {
      const last = order[order.length - 1];
      let best = -1, bestD = Infinity;
      for (let i = 0; i < n; i++) {
        if (used[i]) continue;
        const dx = state.buildings[i].wx - state.buildings[last].wx;
        const dy = state.buildings[i].wy - state.buildings[last].wy;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = i; }
      }
      if (best < 0) break;
      order.push(best);
      used[best] = true;
    }
    state.railLoop = order;

    state.railLength = 0;
    for (let i = 0; i < order.length; i++) {
      const a = state.buildings[order[i]];
      const b = state.buildings[order[(i + 1) % order.length]];
      state.railLength += Math.hypot(a.wx - b.wx, a.wy - b.wy);
    }

    if (!state.trains.length) state.trains.push({ dist: 0, visited: new Set() });
    for (const tr of state.trains) { tr.dist = 0; tr.visited = new Set(); }
  }

  /* ══════════════════════════════════════════════════════════
     TRAIN
     ══════════════════════════════════════════════════════════ */
  function updateTrains(dt) {
    if (state.railLength <= 0 || state.railLoop.length < 2) return;
    const speed = Math.max(0.05, Number(settings.trainSpeed) || 0.5);
    const pxPerSec = 30 * speed;

    for (const tr of state.trains) {
      tr.dist += (dt / 1000) * pxPerSec;
      if (tr.dist >= state.railLength) { tr.dist -= state.railLength; tr.visited.clear(); }

      let acc = 0;
      for (let i = 0; i < state.railLoop.length; i++) {
        const a = state.buildings[state.railLoop[i]];
        const b = state.buildings[state.railLoop[(i + 1) % state.railLoop.length]];
        const segLen = Math.hypot(a.wx - b.wx, a.wy - b.wy);
        if (tr.dist >= acc && tr.dist < acc + segLen) {
          const arrive = tr.dist >= acc + segLen * 0.95;
          if (arrive && !tr.visited.has(i + 1)) {
            tr.visited.add(i + 1);
            deliverIncome(state.railLoop[(i + 1) % state.railLoop.length]);
          }
          break;
        }
        acc += segLen;
      }
    }
  }

  function trainPosition(tr) {
    if (!state.railLoop.length) return null;
    let acc = 0;
    for (let i = 0; i < state.railLoop.length; i++) {
      const a = state.buildings[state.railLoop[i]];
      const b = state.buildings[state.railLoop[(i + 1) % state.railLoop.length]];
      const segLen = Math.hypot(a.wx - b.wx, a.wy - b.wy);
      if (tr.dist >= acc && tr.dist < acc + segLen) {
        const t = segLen > 0 ? (tr.dist - acc) / segLen : 0;
        return { wx: a.wx + (b.wx - a.wx) * t, wy: a.wy + (b.wy - a.wy) * t };
      }
      acc += segLen;
    }
    return { wx: state.buildings[state.railLoop[0]].wx,
             wy: state.buildings[state.railLoop[0]].wy };
  }

  function deliverIncome(buildingIndex) {
    const b = state.buildings[buildingIndex];
    if (!b) return;
    const totalValue = state.buildings.reduce((s, x) => s + TYPES[x.type].value, 0);
    const income = Math.max(1, Math.floor(totalValue / 2));
    const TT = API.getGame();
    if (!TT || !TT.ah || !TT.aE) return;
    const me = TT.aE.fJ;
    TT.ah.hb[me] = (TT.ah.hb[me] | 0) + income;
    state.incomePopups.push({ wx: b.wx, wy: b.wy, amount: income, born: performance.now() });
    if (state.incomePopups.length > 30) state.incomePopups.shift();
  }

  /* ══════════════════════════════════════════════════════════
     CANVAS INPUT
     ══════════════════════════════════════════════════════════ */
  function attachCanvasHandlers() {
    const canvas = document.getElementById('canvasA');
    if (!canvas || canvas.__ttBuildingsHooked) return;
    canvas.__ttBuildingsHooked = true;

    canvas.addEventListener('mousemove', e => {
      const rect = canvas.getBoundingClientRect();
      state._mouseX = e.clientX - rect.left;
      state._mouseY = e.clientY - rect.top;
      state._hoverBtn = hitTestButton(state._mouseX, state._mouseY);

      if (state.placementMode) {
        const world = screenToWorld(state._mouseX, state._mouseY);
        state.previewTile = world ? worldToTile(world.wx, world.wy) : null;
      }
    });

    /* Capture phase so we beat the game's own handlers */
    canvas.addEventListener('mousedown', e => {
      if (!state.placementMode) {
        /* Regular click — check for button hit */
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const hit = hitTestButton(mx, my);
        if (hit) {
          state.placementMode = hit;
          e.preventDefault();
          e.stopImmediatePropagation();
          API.showToast('Click your land to place ' + TYPES[hit].label);
        }
        return;
      }

      /* Placement click */
      if (e.button !== 0) return;
      const rect = canvas.getBoundingClientRect();
      const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      if (!world) return;
      const tile = worldToTile(world.wx, world.wy);
      if (!tile) { API.showToast('❌ Outside the map'); return; }
      if (!isPlayerTile(tile.byteOffset)) { API.showToast('❌ Must be on your own land'); return; }
      if (hasBuildingAt(tile.mx, tile.my)) { API.showToast('❌ Already a building here'); return; }
      if (state.placementMode === 'port' && !isNearWater(tile.mx, tile.my)) {
        API.showToast('❌ Port must be near water'); return;
      }
      if (!tryPay(state.placementMode)) return;

      placeBuilding(state.placementMode, tile.mx, tile.my);
      state.placementMode = null;
      state.previewTile = null;

      e.preventDefault();
      e.stopImmediatePropagation();
    }, { capture: true });

    canvas.addEventListener('contextmenu', e => {
      if (!state.placementMode) return;
      state.placementMode = null;
      e.preventDefault();
    });
  }

  /* ══════════════════════════════════════════════════════════
     DRAWING — one postUpdate hook does everything
     ══════════════════════════════════════════════════════════ */
  API.addHook('postUpdate', () => {
    const TT = API.getGame();
    if (!TT || !TT.aE) return;
    if (TT.aE.a2G !== 1) return;
    if (!settings.enabled) return;

    const inMatch = true;
    if (inMatch && !state.wasInMatch) {
      state.wasInMatch = true;
      state.buildings = [];
      state.trains = [];
      state.railLoop = [];
      state.railLength = 0;
      state.placementMode = null;
      attachCanvasHandlers();
      log('Match started');
    }

    const ctx = API.getGameContext();
    if (!ctx) return;

    /* Trains */
    const now = performance.now();
    const dt = state._lastTick ? (now - state._lastTick) : 16;
    state._lastTick = now;
    updateTrains(dt);

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    drawRail(ctx);
    drawBuildings(ctx);
    drawTrains(ctx);
    drawPreview(ctx);
    drawIncomePopups(ctx);

    /* Compute button positions on every frame */
    computeButtonPositions();
    drawBuildingButtons(ctx);

    ctx.restore();

    /* Leaving match */
    if (!TT.aE.a2G && state.wasInMatch) {
      state.wasInMatch = false;
      state.placementMode = null;
      document.body.style.cursor = '';
    }
  });

  /* ── Rail ────────────────────────────────────────────────── */
  function drawRail(ctx) {
    if (state.railLoop.length < 2) return;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    for (let i = 0; i < state.railLoop.length; i++) {
      const a = state.buildings[state.railLoop[i]];
      const b = state.buildings[state.railLoop[(i + 1) % state.railLoop.length]];
      const sa = worldToScreen(a.wx, a.wy);
      const sb = worldToScreen(b.wx, b.wy);
      if (!sa || !sb) continue;
      if (i === 0) ctx.moveTo(sa.sx, sa.sy);
      ctx.lineTo(sb.sx, sb.sy);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /* ── Buildings ───────────────────────────────────────────── */
  function drawBuildings(ctx) {
    if (!state.buildings.length) return;
    ctx.font = 'bold 22px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const W = ctx.canvas.width, H = ctx.canvas.height;
    for (const b of state.buildings) {
      const s = worldToScreen(b.wx, b.wy);
      if (!s) continue;
      if (s.sx < -30 || s.sy < -30 || s.sx > W + 30 || s.sy > H + 30) continue;
      const t = TYPES[b.type];
      ctx.beginPath();
      ctx.arc(s.sx, s.sy, 16, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fill();
      ctx.strokeStyle = t.color;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillText(t.icon, s.sx, s.sy + 1);
    }
  }

  /* ── Train ───────────────────────────────────────────────── */
  function drawTrains(ctx) {
    if (!state.trains.length) return;
    ctx.font = 'bold 20px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const tr of state.trains) {
      const pos = trainPosition(tr);
      if (!pos) continue;
      const s = worldToScreen(pos.wx, pos.wy);
      if (!s) continue;
      ctx.beginPath();
      ctx.arc(s.sx, s.sy, 14, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(20,20,20,0.85)';
      ctx.fill();
      ctx.strokeStyle = '#ffcc44';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillText('🚂', s.sx, s.sy + 1);
    }
  }

  /* ── Preview ─────────────────────────────────────────────── */
  function drawPreview(ctx) {
    if (!state.placementMode || !state.previewTile) return;
    const tile = state.previewTile;
    const valid =
      isPlayerTile(tile.byteOffset) &&
      !hasBuildingAt(tile.mx, tile.my) &&
      (state.placementMode !== 'port' || isNearWater(tile.mx, tile.my));
    const s = worldToScreen(tile.mx + 0.5, tile.my + 0.5);
    if (!s) return;
    ctx.beginPath();
    ctx.arc(s.sx, s.sy, 18, 0, 2 * Math.PI);
    ctx.fillStyle = valid ? 'rgba(0,245,212,0.20)' : 'rgba(255,60,60,0.20)';
    ctx.fill();
    ctx.strokeStyle = valid ? '#00F5D4' : '#ff4444';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = 'bold 20px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(TYPES[state.placementMode].icon, s.sx, s.sy + 1);
  }

  /* ── Income popups ───────────────────────────────────────── */
  function drawIncomePopups(ctx) {
    const now = performance.now();
    const DURATION = 1400;
    for (let i = state.incomePopups.length - 1; i >= 0; i--) {
      if (now - state.incomePopups[i].born > DURATION) state.incomePopups.splice(i, 1);
    }
    if (!state.incomePopups.length) return;
    ctx.font = 'bold 16px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of state.incomePopups) {
      const t = (now - p.born) / DURATION;
      const alpha = 1 - t * t;
      const rise = 40 * t;
      const s = worldToScreen(p.wx, p.wy);
      if (!s) continue;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,' + (alpha * 0.85) + ')';
      ctx.strokeText('+💰' + p.amount, s.sx, s.sy - 24 - rise);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#ffd75e';
      ctx.fillText('+💰' + p.amount, s.sx, s.sy - 24 - rise);
    }
    ctx.globalAlpha = 1;
  }

  /* ── On-canvas building buttons ──────────────────────────── */
  function drawBuildingButtons(ctx) {
    const positions = state._btnPositions;
    if (!positions || !positions.factory) return;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ORDER.forEach(type => {
      const pos = positions[type];
      if (!pos) return;
      const t = TYPES[type];
      const isHover = state._hoverBtn === type;
      const isActive = state.placementMode === type;

      /* Shadow */
      ctx.beginPath();
      ctx.arc(pos.sx, pos.sy + 1.5, BTN_RADIUS + 1, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fill();

      /* Filled circle */
      ctx.beginPath();
      ctx.arc(pos.sx, pos.sy, BTN_RADIUS, 0, 2 * Math.PI);
      ctx.fillStyle = isActive
        ? 'rgba(0,245,212,0.85)'
        : isHover ? 'rgba(30,30,30,0.92)' : 'rgba(15,17,23,0.85)';
      ctx.fill();

      /* Ring */
      ctx.lineWidth = isActive ? 3 : 2;
      ctx.strokeStyle = isActive ? '#00F5D4' : t.color;
      ctx.stroke();

      /* Icon */
      ctx.font = 'bold 20px system-ui';
      ctx.fillStyle = '#fff';
      ctx.fillText(t.icon, pos.sx, pos.sy + 1);

      /* Small value chip under the button */
      ctx.font = '600 10px system-ui';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText('+' + t.value, pos.sx, pos.sy + BTN_RADIUS + 9);
    });
  }

  /* Escape cancels placement */
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && state.placementMode) {
      state.placementMode = null;
      state.previewTile = null;
    }
  });

  /* ══════════════════════════════════════════════════════════
     PUBLIC API
     ══════════════════════════════════════════════════════════ */
  global.Buildings = {
    get settings() { return settings; },
    get list()     { return state.buildings.slice(); },
    get rail()     { return state.railLoop.map(i => state.buildings[i]); },
    setMode(type) {
      state.placementMode = TYPES[type] ? type : null;
    },
    clear() {
      state.buildings = [];
      state.trains = [];
      state.railLoop = [];
      state.railLength = 0;
    },
    enable(on = true) { settings.enabled = !!on; saveSettings(); },
    disable() { settings.enabled = false; saveSettings(); },
    setSetting(k, v) { settings[k] = v; saveSettings(); }
  };

  log('Buildings & Railways v2.0 — canvas buttons ready');
  log('Buttons appear under your name badge during a match');

})(window);
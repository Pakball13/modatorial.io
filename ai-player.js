/* ============================================================
 * ai-player.js — rule-based AI player (v2.1)
 *   • certain-rules.ai  → opening book (spawn + early game)
 *   • ai-rules.logic    → per-tick decision rules
 * Console: AIPlayer.toggle() · .context() · .why() · .reloadRules()
 * ============================================================ */
(function (global) {
  'use strict';

  const RULES_URL   = 'mods/bots-are-getting-smarter/ai-rules.logic';
  const CERTAIN_URL = 'mods/bots-are-getting-smarter/certain-rules.ai';

  const TAG = '%c[AIPlayer]';
  const STY = 'color:#00F5D4;font-weight:bold';
  const log  = (...a) => console.log(TAG, STY, ...a);
  const warn = (...a) => console.warn(TAG, STY, ...a);
  const err  = (...a) => console.error(TAG, STY, ...a);

  /* ---------- state ---------- */
  let rules        = [];
  let certain      = null;   // parsed certain-rules.ai
  let settings     = { decisionIntervalMs: 400, debugLog: true, logEveryDecision: false };
  let enabled      = true;
  let loaded       = false;
  let lastDecision = 0;
  let lastFiredRule = '';

  // startup book state
  let startupFired = Object.create(null);  // id -> count
  let livesLeft    = 3;
  let wasInMatch   = false;
  let didSpawn     = false;

  /* ---------- loaders ---------- */
  function loadCertain() {
    return fetch(CERTAIN_URL, { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(json => {
        certain = json;
        livesLeft = (json.lives && json.lives.total) || 3;
        log('Loaded certain-rules.ai —', (json.startup || []).length, 'startup actions ·', livesLeft, 'lives');
      })
      .catch(e => warn('certain-rules.ai failed:', e.message));
  }

  function loadRules() {
    return fetch(RULES_URL, { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(json => {
        settings = Object.assign(settings, json.settings || {});
        rules = compileRules(json.rules || []);
        log('Loaded ai-rules.logic —', rules.length, 'rules');
      })
      .catch(e => warn('ai-rules.logic failed:', e.message));
  }

  Promise.all([loadCertain(), loadRules()]).then(() => { loaded = true; });

  function compileRules(raw) {
    const out = [];
    for (const r of raw) {
      if (!r.if || !r.then) continue;
      try {
        const fn = new Function('ctx', 'return (' + r.if + ');');
        out.push(Object.assign({}, r, { _test: fn }));
      } catch (e) { warn('Rule syntax error in "' + (r.name || '?') + '":', e.message); }
    }
    out.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    return out;
  }

  /* ---------- context ---------- */
  function buildContext(TT) {
    const { ah, aE, ad, bQ } = TT;
    const me = aE.fJ;

    const myTerritory = ah.hN[me] | 0;
    const myEconomy   = ah.hb[me] | 0;
    const alive       = ah.nU[me] !== 0;

    const fb = ad.fb;
    const borderList = (ah.hG[me] && ah.hG[me].length) ? ah.hG[me] : (ah.hF[me] || []);
    const neighborTiles = new Map();
    const neutralSeen   = new Set();

    for (let i = 0; i < borderList.length; i++) {
      const b = borderList[i];
      for (let d = 0; d < 4; d++) {
        const adj = b + fb[d];
        if (ad.fQ(adj)) neutralSeen.add(adj);
        else if (ad.h9(adj)) {
          const owner = ad.fR(adj);
          if (owner !== me && owner < aE.fW) {
            neighborTiles.set(owner, (neighborTiles.get(owner) || 0) + 1);
          }
        }
      }
    }

    const neighbors = [];
    for (const [id, count] of neighborTiles) {
      if (ah.nU[id] === 0) continue;
      neighbors.push({
        id,
        name: ah.a0j[id] || ('Player ' + id),
        territory: ah.hN[id] | 0,
        economy:   ah.hb[id] | 0,
        adjacentTiles: count,
        isHuman: id < aE.ku,
        isBot:   id >= aE.ku && id < aE.fW,
      });
    }

    let weakestNeighbor = null, strongestNeighbor = null;
    for (const n of neighbors) {
      if (!weakestNeighbor   || n.economy < weakestNeighbor.economy)   weakestNeighbor   = n;
      if (!strongestNeighbor || n.economy > strongestNeighbor.economy) strongestNeighbor = n;
    }

    let enemyShipCount = 0;
    if (bQ && bQ.z && bQ.z.mk) {
      for (let i = 0; i < bQ.z.mk; i++) {
        const owner = bQ.z.mo[i] >> 3;
        if (owner !== me && owner < aE.fW && ah.nU[owner] !== 0) enemyShipCount++;
      }
    }

    return {
      me,
      myName: ah.a0j[me] || '?',
      myTerritory,
      myEconomy,
      alive,
      neighbors, neighborCount: neighbors.length,
      neutralAdjacent: neutralSeen.size,
      weakestNeighbor, strongestNeighbor,
      enemyShipCount, hasIncomingShip: enemyShipCount > 0,
      humanCount: aE.ku, totalPlayers: aE.fW, gameMode: aE.lC,
      livesLeft,
      inSpawnPhase: !!aE.hx,
      matchStart: false,
    };
  }

  /* ---------- helpers ---------- */
  const clampPct = p => Math.max(0, Math.min(100, Number(p) || 0));

  function resolveTarget(t, ctx) {
    if (t == null) return null;
    if (typeof t === 'number') return t;
    if (t === 'weakestNeighbor')   return ctx.weakestNeighbor   ? ctx.weakestNeighbor.id   : null;
    if (t === 'strongestNeighbor') return ctx.strongestNeighbor ? ctx.strongestNeighbor.id : null;
    if (t === 'neutral')           return ctx.TT.aE.fW;
    return null;
  }

  function executeAction(action, ctx, TT) {
    const { bB, aE } = TT;
    if (!action || !action.action) return 'no-action';
    if (action.action === 'idle')   return 'idle';
    if (action.action === 'defend') return 'defending (holding troops)';

    if (action.action === 'expand') {
      const pct = clampPct(action.percent);
      const amount = Math.floor(pct * 1023 / 100);
      try { bB.hz.i6(amount, aE.fW); return 'expand ' + pct + '% → neutral'; }
      catch (e) { warn('expand failed:', e.message); return 'expand-failed'; }
    }

    if (action.action === 'attack') {
      const target = resolveTarget(action.target, ctx);
      if (target == null || target < 0 || target >= aE.fW) return 'no-target';
      const pct = clampPct(action.percent);
      const amount = Math.floor(pct * 1023 / 100);
      try { bB.hz.i6(amount, target); return 'attack ' + pct + '% → player ' + target; }
      catch (e) { warn('attack failed:', e.message); return 'attack-failed'; }
    }

    return 'unknown-action:' + action.action;
  }

  /* ---------- POINT NEMO — spawn farthest from all players ---------- */
  function findPointNemo(TT) {
    const { ah, aE, ad, bV, bu } = TT;
    const fk = bV.fk, fl = bV.fl;
    const params = (certain && certain.startup && certain.startup.find(s => s.id === 'point-nemo')?.params) || {};
    const minEdge = params.minDistanceFromEdge || 8;
    const step    = params.scanStep || 3;

    // centroids of every other alive player
    const others = [];
    for (let i = 0; i < aE.fW; i++) {
      if (i === aE.fJ) continue;
      if (ah.nU[i] === 0) continue;
      const cx = (ah.jS[i] + ah.jT[i]) / 2;
      const cy = (ah.jU[i] + ah.jV[i]) / 2;
      if (cx > 0 && cy > 0) others.push([cx, cy]);
    }
    if (others.length === 0) return null;

    let best = -1, bestDist = -1;
    for (let y = minEdge; y < fl - minEdge; y += step) {
      for (let x = minEdge; x < fk - minEdge; x += step) {
        const fL = y * fk + x;
        // must be a valid spawn candidate (via game's own check)
        if (bu.hy(fL) === -1) continue;

        let minD2 = Infinity;
        for (const [bx, by] of others) {
          const dx = x - bx, dy = y - by;
          const d2 = dx * dx + dy * dy;
          if (d2 < minD2) minD2 = d2;
        }
        if (minD2 > bestDist) { bestDist = minD2; best = fL; }
      }
    }
    if (best < 0) return null;
    return best;
  }

  function doPointNemo(TT) {
    const fL = findPointNemo(TT);
    if (fL < 0 || fL == null) { warn('Point Nemo: no valid spawn found'); return false; }
    try {
      TT.bB.hz.i0(fL);
      log('🗺️ Point Nemo — spawning at tile', fL);
      return true;
    } catch (e) { warn('Point Nemo failed:', e.message); return false; }
  }

  /* ---------- STARTUP BOOK ---------- */
  function runStartup(ctx, TT) {
    if (!certain || !Array.isArray(certain.startup)) return false;

    // spawn phase: only handle "spawn" phase actions
    if (ctx.inSpawnPhase) {
      const spawnRule = certain.startup.find(s => s.phase === 'spawn');
      if (spawnRule && !startupFired[spawnRule.id]) {
        if (spawnRule.action === 'spawnFarthestFromPlayers') {
          if (doPointNemo(TT)) {
            startupFired[spawnRule.id] = 1;
            return true;
          }
        }
      }
      return false;
    }

    // early-game phase
    const early = certain.startup
      .filter(s => s.phase === 'earlyGame')
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));

    const now = performance.now();

    for (const s of early) {
      const times = startupFired[s.id] || 0;
      if (s.maxTimes && times >= s.maxTimes) continue;

      // delay between repeats
      if (s.delayMs && times > 0) {
        const key = '_last_' + s.id;
        if (!startupFired[key]) startupFired[key] = now;
        if (now - startupFired[key] < s.delayMs) continue;
        startupFired[key] = now;
      }

      // condition
      if (s.condition) {
        try {
          if (!(new Function('ctx', 'return (' + s.condition + ');'))(ctx)) continue;
        } catch (e) { continue; }
      }

      const result = executeAction(s, ctx, TT);
      startupFired[s.id] = times + 1;
      log('📖', s.name, '→', result, '(' + startupFired[s.id] + '/' + (s.maxTimes || 1) + ')');
      return true;
    }
    return false;
  }

  /* ---------- MAIN LOOP ---------- */
  function decide() {
    if (!enabled || !loaded) return;
    const TT = global.__TT__;
    if (!TT) return;
    const { aE, ah, bB } = TT;
    if (!aE || !ah || !bB) return;

    // spawn phase — no in-match flag yet
    const inMatch = aE.a2G === 1;
    const inSpawn = !!aE.hx;

    // detect death
    if (wasInMatch && inMatch && ah.nU[aE.fJ] === 0) {
      if (!startupFired['_dead']) {
        startupFired['_dead'] = 1;
        livesLeft--;
        log('💀 died — lives left:', livesLeft);
        if (certain && certain.lives) {
          if (livesLeft <= (certain.lives.giveUpWhenLives || 0)) {
            log('☠️ out of lives — disabling');
            enabled = false;
          }
        }
      }
    } else if (inMatch && ah.nU[aE.fJ] !== 0) {
      delete startupFired['_dead'];
    }

    // detect match start
    const justStarted = inMatch && !wasInMatch;
    if (justStarted) {
      startupFired = Object.create(null);
      log('🎬 match start — running startup book');
    }
    wasInMatch = inMatch;

    // spawn phase: run startup (Point Nemo)
    if (inSpawn) {
      const ctx = buildContext(TT);
      ctx.TT = TT;
      runStartup(ctx, TT);
      return;
    }

    if (!inMatch) return;
    if (ah.nU[aE.fJ] === 0) return;

    const now = performance.now();
    if (now - lastDecision < settings.decisionIntervalMs) return;
    lastDecision = now;

    let ctx;
    try { ctx = buildContext(TT); } catch (e) { warn('context failed:', e.message); return; }
    ctx.TT = TT;
    ctx.matchStart = justStarted;

    // 1. Startup book first
    if (runStartup(ctx, TT)) return;

    // 2. Then normal .logic rules
    for (const rule of rules) {
      let matched = false;
      try { matched = !!rule._test(ctx); }
      catch (e) { warn('rule "' + rule.name + '" threw:', e.message); continue; }
      if (!matched) continue;

      const result = executeAction(rule.then, ctx, TT);
      if (settings.logEveryDecision || lastFiredRule !== rule.name) {
        log('▶', rule.name, '→', result);
        lastFiredRule = rule.name;
      }
      return;
    }

    if (lastFiredRule !== '(none)') {
      log('▶ no rule matched — idling');
      lastFiredRule = '(none)';
    }
  }

  /* ---------- boot ---------- */
  function boot() {
    const API = global.TerritorialMods;
    if (API && API.addHook) {
      API.addHook('postUpdate', decide);
      log('Hooked postUpdate');
    } else {
      const raf = window.requestAnimationFrame.bind(window);
      (function loop() { decide(); raf(loop); })();
      log('Hooked rAF');
    }
  }

  /* ---------- public ---------- */
  global.AIPlayer = {
    enable()  { enabled = true;  log('ON');  },
    disable() { enabled = false; log('OFF'); },
    toggle()  { enabled = !enabled; log(enabled ? 'ON' : 'OFF'); },
    isEnabled: () => enabled,
    isReady:   () => loaded,
    rules:     () => rules.slice(),
    certain:   () => certain,
    lives:     () => livesLeft,
    resetLives(n) { livesLeft = n || 3; startupFired['_dead'] = 0; log('lives reset to', livesLeft); },

    context() {
      const TT = global.__TT__; if (!TT) return null;
      const ctx = buildContext(TT); ctx.TT = TT; return ctx;
    },

    why() {
      const ctx = this.context(); if (!ctx) return 'no TT';
      if (ctx.inSpawnPhase) return { phase: 'spawn', next: 'point-nemo' };
      if (certain && certain.startup) {
        for (const s of certain.startup.filter(x => x.phase === 'earlyGame').sort((a,b)=>(b.priority||0)-(a.priority||0))) {
          const t = startupFired[s.id] || 0;
          if (s.maxTimes && t >= s.maxTimes) continue;
          return { phase: 'startup', rule: s.name, fired: t + '/' + (s.maxTimes||1), ctx };
        }
      }
      for (const r of rules) {
        try { if (r._test(ctx)) return { phase: 'normal', rule: r.name, priority: r.priority, then: r.then, ctx }; }
        catch {}
      }
      return { phase: 'normal', rule: '(none matched)', ctx };
    },

    reloadRules() {
      loaded = false;
      return Promise.all([loadCertain(), loadRules()]).then(() => { loaded = true; log('reloaded'); });
    },

    _forceAttack(t, p) { const TT = global.__TT__; if (!TT) return warn('no TT');
      const amt = Math.floor(clampPct(p||50) * 1023 / 100); TT.bB.hz.i6(amt, t||1); log('force attack', p+'%', '→', t); },
    _forceExpand(p)    { const TT = global.__TT__; if (!TT) return warn('no TT');
      const amt = Math.floor(clampPct(p||100) * 1023 / 100); TT.bB.hz.i6(amt, TT.aE.fW); log('force expand', p+'%'); },
    _pointNemo()       { const TT = global.__TT__; if (!TT) return warn('no TT'); return doPointNemo(TT); },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  log('Ready · certain:', CERTAIN_URL, '· rules:', RULES_URL);
  log('Commands: .toggle() .why() .context() .lives() .reloadRules() ._pointNemo()');
})(window);
/* ============================================================
 * Bots Are Getting Smarter — v2
 * 4-layer neural network, trains in the browser.
 * ============================================================ */

/* ────────────────────────────────────────────────────────────
 * SECTION 1 — MLP (4-layer, ReLU hidden, sigmoid output)
 * ──────────────────────────────────────────────────────────── */
class MLP {
  constructor(inputSize, layerSizes) {
    /* layerSizes = [128, 128, 64, 2] → 4 weight layers */
    this.sizes = [inputSize, ...layerSizes];
    this.L = layerSizes.length;

    this.W = [];
    this.b = [];
    for (let i = 0; i < this.L; i++) {
      const inS  = this.sizes[i];
      const outS = this.sizes[i + 1];
      const scale = Math.sqrt(2 / inS);
      const w = new Float32Array(inS * outS);
      for (let k = 0; k < w.length; k++) {
        /* Box-Muller for normal init */
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
        w[k] = g * scale;
      }
      this.W.push(w);
      this.b.push(new Float32Array(outS));
    }
  }

  /* Forward pass — returns { acts, zs } for backprop reuse */
  forward(x) {
    const acts = [x];
    const zs   = [];
    for (let i = 0; i < this.L; i++) {
      const inS  = this.sizes[i];
      const outS = this.sizes[i + 1];
      const w = this.W[i];
      const b = this.b[i];
      const aIn = acts[i];
      const z = new Float32Array(outS);
      const a = new Float32Array(outS);
      const isLast = i === this.L - 1;
      for (let j = 0; j < outS; j++) {
        let sum = b[j];
        const base = j * inS;
        for (let k = 0; k < inS; k++) sum += aIn[k] * w[base + k];
        z[j] = sum;
        a[j] = isLast ? (1 / (1 + Math.exp(-sum))) : (sum > 0 ? sum : 0);
      }
      zs.push(z);
      acts.push(a);
    }
    return { acts, zs };
  }

  /* Inference only (fast path) */
  predict(x) {
    let a = x;
    for (let i = 0; i < this.L; i++) {
      const inS  = this.sizes[i];
      const outS = this.sizes[i + 1];
      const w = this.W[i], b = this.b[i];
      const out = new Float32Array(outS);
      const isLast = i === this.L - 1;
      for (let j = 0; j < outS; j++) {
        let sum = b[j];
        const base = j * inS;
        for (let k = 0; k < inS; k++) sum += a[k] * w[base + k];
        out[j] = isLast ? (1 / (1 + Math.exp(-sum))) : (sum > 0 ? sum : 0);
      }
      a = out;
    }
    return a;
  }

  /* One mini-batch SGD step with BCE loss. Returns average loss. */
  trainBatch(samples, lr) {
    const dW = this.W.map(w => new Float32Array(w.length));
    const db = this.b.map(b => new Float32Array(b.length));
    let totalLoss = 0;

    for (const s of samples) {
      const { acts, zs } = this.forward(s.x);
      const aOut = acts[this.L];

      /* BCE loss for two heads */
      const targets = [s.attack, s.amount];
      const delta = new Float32Array(2);
      for (let j = 0; j < 2; j++) {
        const a = Math.max(Math.min(aOut[j], 1 - 1e-7), 1e-7);
        const y = targets[j];
        totalLoss += -(y * Math.log(a) + (1 - y) * Math.log(1 - a));
        delta[j] = a - y;
      }

      /* Backprop */
      let d = delta;
      for (let i = this.L - 1; i >= 0; i--) {
        const inS  = this.sizes[i];
        const outS = this.sizes[i + 1];
        const aIn  = acts[i];
        const dWi = dW[i];
        const dbi = db[i];
        for (let j = 0; j < outS; j++) {
          const dj = d[j];
          if (dj === 0) continue;
          dbi[j] += dj;
          const base = j * inS;
          for (let k = 0; k < inS; k++) dWi[base + k] += dj * aIn[k];
        }
        if (i > 0) {
          const zPrev = zs[i - 1];
          const dPrev = new Float32Array(inS);
          const Wi = this.W[i];
          for (let k = 0; k < inS; k++) {
            let sum = 0;
            for (let j = 0; j < outS; j++) sum += d[j] * Wi[j * inS + k];
            dPrev[k] = zPrev[k] > 0 ? sum : 0;
          }
          d = dPrev;
        }
      }
    }

    /* Average and apply */
    const scale = lr / samples.length;
    for (let i = 0; i < this.L; i++) {
      const w = this.W[i], dWi = dW[i];
      for (let k = 0; k < w.length; k++) w[k] -= dWi[k] * scale;
      const b = this.b[i], dbi = db[i];
      for (let k = 0; k < b.length; k++) b[k] -= dbi[k] * scale;
    }
    return totalLoss / samples.length;
  }

  toWeights() {
    return {
      sizes: this.sizes.slice(),
      W: this.W.map(w => Array.from(w)),
      b: this.b.map(b => Array.from(b))
    };
  }

  static fromWeights(obj) {
    if (!obj || !obj.sizes || !obj.W || !obj.b) {
      throw new Error('invalid weights object');
    }
    const m = Object.create(MLP.prototype);
    m.sizes = obj.sizes.slice();
    m.L = m.sizes.length - 1;
    m.W = obj.W.map(a => new Float32Array(a));
    m.b = obj.b.map(a => new Float32Array(a));
    return m;
  }
}

/* ────────────────────────────────────────────────────────────
 * SECTION 2 — State
 * ──────────────────────────────────────────────────────────── */
const DEFAULT_CONFIG = {
  network:  { inputSize: 48, layers: [128, 128, 64, 2] },
  training: { learningRate: 0.003, batchSize: 64,
              minBufferBeforeTrain: 200, trainIntervalMs: 400,
              bufferMaxSize: 20000 }
};

let CONFIG = DEFAULT_CONFIG;
let NET    = null;

const STORAGE = {
  policy: 'tt-bot-ai-policy',
  buffer: 'tt-bot-ai-buffer',
  stats:  'tt-bot-ai-stats'
};

const state = {
  buffer: [],
  step: 0,
  loss: null,
  lossHistory: [],
  patched: false,
  lastSaveBuffer: 0,
  lastSavePolicy: 0
};

/* ────────────────────────────────────────────────────────────
 * SECTION 3 — Feature extraction (48 features)
 * ──────────────────────────────────────────────────────────── */
const MAX_NEIGHBORS = 8;

function readGameState(player) {
  const TT = api.getGame();
  if (!TT || !TT.ah || !TT.aE || !TT.ad) return null;
  if (TT.aE.a2G !== 1) return null;

  const ah = TT.ah, aE = TT.aE, ad = TT.ad;
  if (!ah.nU[player] || !ah.hN[player]) return null;

  const myS = ah.hb[player];
  const myT = ah.hN[player];

  const neighbors = [];
  const hF = ah.hF[player];
  if (hF && hF.length) {
    const seen = new Set();
    const border = ad.fb;
    const maxScan = Math.min(hF.length, 200);
    for (let i = 0; i < maxScan && neighbors.length < MAX_NEIGHBORS * 2; i++) {
      for (let k = 0; k < 4; k++) {
        const nb = hF[i] + border[k];
        if (!ad.h9(nb)) continue;
        const owner = ad.fR(nb);
        if (owner === player || owner >= aE.fW) continue;
        if (seen.has(owner)) continue;
        seen.add(owner);
        neighbors.push(owner);
      }
    }
  }

  const neighborData = neighbors
    .map(id => ({
      id,
      strength: ah.hb[id] || 0,
      territory: ah.hN[id] || 0,
      isHuman: id < aE.ku,
      sameTeam: TT.bj ? TT.bj.fX[id] === TT.bj.fX[player] : false
    }))
    .sort((a, b) => (b.strength / Math.max(myS, 1)) - (a.strength / Math.max(myS, 1)))
    .slice(0, MAX_NEIGHBORS);

  let difficulty = 0;
  try { difficulty = TT.aF ? TT.aF.iI[player] : 0; } catch {}

  return {
    myS, myT, neighbors: neighborData, difficulty,
    isHuman: player < aE.ku,
    sameTeamCount: aE.zS,
    aliveCount: aE.a2J,
    playerCount: aE.fW,
    humanCount: aE.ku,
    gameMode: aE.lC
  };
}

function buildFeatures(s) {
  const my = Math.max(s.myS, 1);
  const f = new Float32Array(48);
  let i = 0;
  f[i++] = s.myS / 1e6;
  f[i++] = s.myT / Math.max(s.playerCount, 1);
  f[i++] = s.difficulty / 6;
  f[i++] = s.isHuman ? 1 : 0;
  for (let n = 0; n < MAX_NEIGHBORS; n++) {
    const nb = s.neighbors[n];
    if (nb) {
      f[i++] = nb.strength / my;
      f[i++] = nb.territory / 1e4;
      f[i++] = nb.isHuman ? 1 : 0;
      f[i++] = nb.sameTeam ? 1 : 0;
      f[i++] = 1;
    } else {
      f[i++] = 0; f[i++] = 0; f[i++] = 0; f[i++] = 0; f[i++] = 0;
    }
  }
  f[i++] = s.aliveCount / Math.max(s.playerCount, 1);
  f[i++] = s.humanCount / Math.max(s.playerCount, 1);
  f[i++] = s.sameTeamCount / 7;
  f[i++] = s.gameMode / 10;
  return f;
}

/* ────────────────────────────────────────────────────────────
 * SECTION 4 — Config + policy load
 * ──────────────────────────────────────────────────────────── */
async function loadConfig() {
  try {
    const c = await api.readModFile(mod, 'training/config.json', 'json');
    if (c && c.network && c.training) {
      CONFIG = c;
      api.log('📄 Loaded training/config.json —',
        CONFIG.network.inputSize, '→', CONFIG.network.layers.join(' → '));
      return;
    }
  } catch (e) {
    api.warn('training/config.json not found, using defaults');
  }
  CONFIG = DEFAULT_CONFIG;
}

async function loadPolicy() {
  /* 1. Try training/policy.json on disk */
  try {
    const p = await api.readModFile(mod, 'training/policy.json', 'json');
    if (p && p.trained && p.weights && p.weights.W && p.weights.W.length) {
      NET = MLP.fromWeights(p.weights);
      state.step = p.step || 0;
      state.loss = p.loss ?? null;
      api.log('🧠 Loaded trained policy from training/policy.json');
      api.log('   step=' + state.step + ' loss=' + (state.loss?.toFixed(4) ?? '—'));
      return;
    }
  } catch (e) {
    /* file missing or malformed — fall through */
  }

  /* 2. Try localStorage */
  const saved = localStorage.getItem(STORAGE.policy);
  if (saved) {
    try {
      const p = JSON.parse(saved);
      if (p.weights && p.weights.W && p.weights.W.length) {
        NET = MLP.fromWeights(p.weights);
        state.step = p.step || 0;
        state.loss = p.loss ?? null;
        api.log('🧠 Loaded policy from localStorage (step ' + state.step + ')');
        return;
      }
    } catch {}
  }

  /* 3. Random init */
  NET = new MLP(CONFIG.network.inputSize, CONFIG.network.layers);
  api.log('🎲 Random network (' +
    CONFIG.network.inputSize + ' → ' + CONFIG.network.layers.join(' → ') + ')');
}

function loadBuffer() {
  try {
    const raw = localStorage.getItem(STORAGE.buffer);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return;
    state.buffer = arr.map(s => ({
      x: new Float32Array(s.x),
      attack: s.attack,
      amount: s.amount
    }));
    api.log('📦 Restored ' + state.buffer.length + ' training samples');
  } catch {}
}

function saveBuffer(force) {
  const now = performance.now();
  if (!force && now - state.lastSaveBuffer < 5000) return;
  state.lastSaveBuffer = now;
  try {
    const arr = state.buffer.map(s => ({
      x: Array.from(s.x),
      attack: s.attack,
      amount: s.amount
    }));
    localStorage.setItem(STORAGE.buffer, JSON.stringify(arr));
  } catch (e) { api.warn('saveBuffer failed:', e); }
}

function savePolicy(force) {
  const now = performance.now();
  if (!force && now - state.lastSavePolicy < 3000) return;
  state.lastSavePolicy = now;
  try {
    const p = {
      version: 2,
      trained: state.step > 0,
      step: state.step,
      loss: state.loss,
      weights: NET.toWeights()
    };
    localStorage.setItem(STORAGE.policy, JSON.stringify(p));
  } catch (e) { api.warn('savePolicy failed:', e); }
}

/* ────────────────────────────────────────────────────────────
 * SECTION 5 — Training loop
 * ──────────────────────────────────────────────────────────── */
function trainOneBatch() {
  if (!mod.settings.trainEnabled) return;
  if (state.buffer.length < (CONFIG.training.minBufferBeforeTrain || 200)) return;

  const B = CONFIG.training.batchSize || 64;
  const lr = (mod.settings.learningRate || 3) * 0.001;

  /* Random mini-batch from buffer */
  const batch = [];
  for (let i = 0; i < B; i++) {
    batch.push(state.buffer[(Math.random() * state.buffer.length) | 0]);
  }

  try {
    const loss = NET.trainBatch(batch, lr);
    state.loss = loss;
    state.step++;
    state.lossHistory.push(loss);
    if (state.lossHistory.length > 200) state.lossHistory.shift();

    if (state.step % 25 === 0) {
      savePolicy();
      api.log('🧠 step=' + state.step + '  loss=' + loss.toFixed(4) +
              '  buffer=' + state.buffer.length);
    }
  } catch (e) {
    api.warn('train step failed:', e);
  }
}

/* ────────────────────────────────────────────────────────────
 * SECTION 6 — Hook ap.jh.kX
 * ──────────────────────────────────────────────────────────── */
function getGameContext() {
  const TT = api.getGame();
  if (!TT || !TT.aE) return null;
  return {
    TT,
    humanIndex: TT.aE.fJ,
    humanCount: TT.aE.ku,
    inMatch: TT.aE.a2G === 1
  };
}

function patchAi() {
  const TT = api.getGame();
  if (!TT || !TT.ap || !TT.ap.jh) return false;
  if (TT.ap.jh.__smarterPatched) return true;

  const jh = TT.ap.jh;
  const origKx = jh.kX.bind(jh);

  jh.kX = function (player, amount) {
    try {
      const ctx = getGameContext();
      if (!ctx || !ctx.inMatch) return origKx(player, amount);

      const isBot = player >= ctx.humanCount;
      if (!isBot) return origKx(player, amount);

      /* --- CAPTURE --- */
      if (mod.settings.captureEnabled !== false) {
        const s = readGameState(player);
        if (s) {
          const x = buildFeatures(s);
          state.buffer.push({
            x,
            attack: amount > 0 ? 1 : 0,
            amount: Math.min(amount / Math.max(s.myS, 1), 1)
          });
          if (state.buffer.length > (CONFIG.training.bufferMaxSize || 20000)) {
            state.buffer.shift();
          }
          if (state.buffer.length % 500 === 0) saveBuffer(true);
        }
      }

      /* --- APPLY POLICY --- */
      if (mod.settings.applyPolicy) {
        const s = readGameState(player);
        if (s) {
          const x = buildFeatures(s);
          const out = NET.predict(x);
          const pAttack = out[0];
          const pAmount = out[1];

          if (pAttack < 0.5) return;  /* bot decides NOT to attack */
          const newAmount = Math.max(1, Math.round(pAmount * s.myS * 0.6));
          return origKx(player, newAmount);
        }
      }
    } catch (e) {
      api.warn('AI patch error:', e);
    }

    return origKx(player, amount);
  };

  TT.ap.jh.__smarterPatched = true;
  state.patched = true;
  api.log('🧠 ap.jh.kX hooked (4-layer net)');
  return true;
}

/* ────────────────────────────────────────────────────────────
 * SECTION 7 — HUD
 * ──────────────────────────────────────────────────────────── */
let hudEl = null;

function buildHud() {
  if (hudEl) return;
  hudEl = document.createElement('div');
  hudEl.id = 'tt-smarter-hud';
  Object.assign(hudEl.style, {
    position: 'fixed',
    top: '52px',
    left: '12px',
    background: 'rgba(15, 23, 42, 0.9)',
    color: '#e6edf3',
    border: '1px solid #00F5D4',
    padding: '10px 14px',
    borderRadius: '8px',
    font: '600 11px ui-monospace, Menlo, monospace',
    zIndex: 99997,
    pointerEvents: 'none',
    lineHeight: '1.65',
    display: 'none',
    minWidth: '220px'
  });
  document.body.appendChild(hudEl);
  setInterval(updateHud, 500);
}

function updateHud() {
  if (!hudEl) return;
  if (mod.settings.showHud === false) { hudEl.style.display = 'none'; return; }
  const ctx = getGameContext();
  const inMatch = ctx && ctx.inMatch;
  hudEl.style.display = inMatch ? 'block' : 'none';
  if (!inMatch) return;

  const shape = NET ? NET.sizes.join(' → ') : '?';
  const lossStr = state.loss != null ? state.loss.toFixed(4) : '—';
  const ready = state.buffer.length >= (CONFIG.training.minBufferBeforeTrain || 200);
  const mode = mod.settings.applyPolicy ? 'ACTIVE' : 'capture';
  const modeColor = mod.settings.applyPolicy ? '#10B981' : '#6366F1';

  hudEl.innerHTML =
    '<div style="color:#00F5D4;font-weight:800;margin-bottom:4px">🧠 Bot AI · ' +
      '<span style="color:' + modeColor + '">' + mode + '</span></div>' +
    '<div style="opacity:.7;font-size:10px">net: ' + shape + '</div>' +
    '<div>step: <span style="color:#10B981">' + state.step + '</span></div>' +
    '<div>loss: <span style="color:#00F5D4">' + lossStr + '</span></div>' +
    '<div>buffer: ' + state.buffer.length +
      (ready ? '' : ' <span style="color:#d29922">(need ' +
        (CONFIG.training.minBufferBeforeTrain || 200) + ')</span>') + '</div>';
}

/* ────────────────────────────────────────────────────────────
 * SECTION 8 — Public API
 * ──────────────────────────────────────────────────────────── */
window.BotTrainer = {
  stats: () => ({
    step: state.step,
    loss: state.loss,
    buffer: state.buffer.length,
    shape: NET ? NET.sizes : null,
    trained: state.step > 0,
    ready: state.buffer.length >= (CONFIG.training.minBufferBeforeTrain || 200)
  }),
  lossHistory: () => state.lossHistory.slice(),

  exportPolicy: () => {
    if (state.step === 0) {
      api.showToast('⚠️ Train at least a few steps first');
      return;
    }
    const p = {
      version: 2,
      trained: true,
      step: state.step,
      loss: state.loss,
      shape: NET.sizes,
      exportedAt: new Date().toISOString(),
      weights: NET.toWeights()
    };
    downloadJson(p, 'policy.json');
    api.showToast('📥 Exported policy.json (' + state.step + ' steps)');
    api.log('Drop policy.json into mods/bots-are-getting-smarter/training/');
  },

  exportBuffer: () => {
    const p = {
      version: 2,
      exportedAt: new Date().toISOString(),
      samples: state.buffer.map(s => ({
        x: Array.from(s.x),
        attack: s.attack,
        amount: s.amount
      }))
    };
    downloadJson(p, 'buffer.json');
    api.showToast('📥 Exported buffer.json (' + state.buffer.length + ' samples)');
  },

  reset: () => {
    if (!confirm('Reset the network weights AND the training buffer?')) return;
    NET = new MLP(CONFIG.network.inputSize, CONFIG.network.layers);
    state.buffer = [];
    state.step = 0;
    state.loss = null;
    state.lossHistory = [];
    localStorage.removeItem(STORAGE.policy);
    localStorage.removeItem(STORAGE.buffer);
    api.showToast('🧠 Network reset');
  },

  /* For advanced users: inject a hand-crafted policy */
  importPolicy: (json) => {
    try {
      const obj = typeof json === 'string' ? JSON.parse(json) : json;
      NET = MLP.fromWeights(obj.weights);
      state.step = obj.step || 0;
      state.loss = obj.loss ?? null;
      savePolicy(true);
      api.showToast('🧠 Imported policy');
    } catch (e) {
      api.showToast('❌ Import failed: ' + e.message);
    }
  }
};

function downloadJson(obj, filename) {
  const text = JSON.stringify(obj, null, 2);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ────────────────────────────────────────────────────────────
 * SECTION 9 — Settings hook
 * ──────────────────────────────────────────────────────────── */
api.on('modSettingsChanged', (modId, key) => {
  if (modId !== mod.id) return;
  if (key === 'resetNetwork') {
    /* The setting button fires here when clicked */
    setTimeout(() => {
      if (confirm('Reset network weights and buffer?')) {
        window.BotTrainer.reset();
      }
    }, 50);
  }
});

/* ────────────────────────────────────────────────────────────
 * SECTION 10 — Boot
 * ──────────────────────────────────────────────────────────── */
(async () => {
  await loadConfig();
  await loadPolicy();
  loadBuffer();

  /* Poll for game init */
  let tries = 0;
  const iv = setInterval(() => {
    tries++;
    if (patchAi()) {
      clearInterval(iv);
      api.log('🧠 Ready — buffer: ' + state.buffer.length +
              ' samples, step: ' + state.step);
    } else if (tries > 200) {
      clearInterval(iv);
      api.warn('AI patch failed — ap.jh.kX never appeared');
    }
  }, 100);

  /* Training interval */
  const trainIntervalMs = CONFIG.training.trainIntervalMs || 400;
  setInterval(trainOneBatch, trainIntervalMs);

  /* Re-patch on screen change */
  api.on('screenChanged', () => {
    const TT = api.getGame();
    if (TT && TT.ap && TT.ap.jh) delete TT.ap.jh.__smarterPatched;
    state.patched = false;
    patchAi();
    saveBuffer(true);
    savePolicy(true);
  });

  /* Save on unload */
  window.addEventListener('beforeunload', () => {
    saveBuffer(true);
    savePolicy(true);
  });

  if (mod.settings.showHud !== false) buildHud();

  /* Add quick export buttons in the top-right stack */
  setTimeout(() => {
    if (api.addButton) {
      api.addButton('📥 Export policy', () => window.BotTrainer.exportPolicy());
      api.addButton('📦 Reset AI', () => window.BotTrainer.reset());
    }
  }, 2000);

  api.log('🧠 Bots Are Getting Smarter v2 loaded');
  api.log('   net: ' + CONFIG.network.inputSize + ' → ' +
          CONFIG.network.layers.join(' → '));
  api.log('   BotTrainer.stats() · BotTrainer.exportPolicy() · BotTrainer.reset()');
})();
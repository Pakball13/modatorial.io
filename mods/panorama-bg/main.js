/* ============================================================
 * Panorama Background  v1.0.0
 *  • Loads a user image (png/jpg/webp/exr)
 *  • OR uses the game's own map as a scrolling panorama
 *  • Offers saved black, white, or custom-gradient fallback choices
 *  • Draws INSIDE the menu render pass so nothing covers it
 * ============================================================ */

let pano     = null;       // HTMLImageElement or HTMLCanvasElement
let panoPath = null;       // human-readable source
let enabled  = true;
let cropBand = 0.30;       // fraction of source height to use

let targetX  = 0;          // smoothed mouse X (0..1)
let currentX = 0.5;
const FALLBACK_KEY = 'tt-pano-fallback';

/* ============================================================
 * INPUT
 * ============================================================ */
api.addHook('mouseMove', e => { targetX = e.clientX / window.innerWidth; });
api.addHook('mouseDown', e => { targetX = e.clientX / window.innerWidth; });

function makeFallbackPano(W, H, choice) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  if (choice.type === 'black' || choice.type === 'white') {
    g.fillStyle = choice.type === 'black' ? '#000000' : '#ffffff';
    g.fillRect(0, 0, W, H);
  } else {
    const gradient = g.createLinearGradient(0, 0, W, H);
    gradient.addColorStop(0, choice.start);
    gradient.addColorStop(1, choice.end);
    g.fillStyle = gradient;
    g.fillRect(0, 0, W, H);
  }
  return c;
}

function readFallbackChoice() {
  try {
    const choice = JSON.parse(localStorage.getItem(FALLBACK_KEY) || 'null');
    if (!choice || !['black', 'white', 'gradient', 'map'].includes(choice.type)) return null;
    if (choice.type === 'gradient' &&
        (!/^#[\da-f]{6}$/i.test(choice.start) || !/^#[\da-f]{6}$/i.test(choice.end))) return null;
    return choice;
  } catch (error) {
    api.warn('Could not read saved panorama choice:', error);
    return null;
  }
}

function createFallbackPano(choice) {
  pano = makeFallbackPano(2048, 512, choice);
  panoPath = choice.type === 'gradient' ? '<custom gradient>' : `<${choice.type}>`;
  api.showToast(`🌄 Panorama: ${panoPath}`, 2500);
}

async function chooseFallbackPano() {
  const saved = readFallbackChoice();
  if (saved && saved.type !== 'map') {
    createFallbackPano(saved);
    return true;
  }
  if (saved && saved.type === 'map') {
    const map = await tryCaptureGameMap(6000);
    if (map) {
      pano = map;
      panoPath = '<game map>';
      return true;
    }
    try { localStorage.removeItem(FALLBACK_KEY); }
    catch (error) { api.warn('Could not clear unavailable game-map choice:', error); }
  }

  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.id = 'tt-pano-picker';
    overlay.dataset.ttOur = '1';
    overlay.innerHTML =
      '<div class="tt-pano-panel" role="dialog" aria-modal="true" aria-labelledby="tt-pano-title">' +
        '<h2 id="tt-pano-title">🌌 Choose a panorama</h2>' +
        '<p>No panorama image was found. Pick a background for your game menu.</p>' +
        '<div class="tt-pano-options">' +
          '<button type="button" data-pano-choice="black">Black</button>' +
          '<button type="button" data-pano-choice="white">White</button>' +
          '<button type="button" data-pano-choice="map">Use game map</button>' +
        '</div>' +
        '<div class="tt-pano-gradient">' +
          '<label>Custom gradient <input type="color" data-gradient-start value="#0f172a" aria-label="Gradient start color">' +
          '<input type="color" data-gradient-end value="#00f5d4" aria-label="Gradient end color"></label>' +
          '<button type="button" data-pano-choice="gradient">Apply gradient</button>' +
        '</div>' +
        '<div class="tt-pano-error" aria-live="polite"></div>' +
      '</div>';
    document.body.appendChild(overlay);

    const error = overlay.querySelector('.tt-pano-error');
    const buttons = [...overlay.querySelectorAll('[data-pano-choice]')];
    let busy = false;
    buttons.forEach(button => button.addEventListener('click', async () => {
      if (busy) return;
      const type = button.dataset.panoChoice;
      if (type === 'map') {
        busy = true;
        buttons.forEach(item => { item.disabled = true; });
        error.textContent = 'Waiting for the game map…';
        const map = await tryCaptureGameMap(6000);
        if (!map) {
          error.textContent = 'The game map is not ready yet. Choose a color or try again.';
          busy = false;
          buttons.forEach(item => { item.disabled = false; });
          return;
        }
        try { localStorage.setItem(FALLBACK_KEY, JSON.stringify({ type: 'map' })); }
        catch (storageError) { api.warn('Could not save game-map choice:', storageError); }
        pano = map;
        panoPath = '<game map>';
      } else if (type === 'gradient') {
        const start = overlay.querySelector('[data-gradient-start]').value;
        const end = overlay.querySelector('[data-gradient-end]').value;
        const choice = { type, start, end };
        try { localStorage.setItem(FALLBACK_KEY, JSON.stringify(choice)); }
        catch (storageError) { api.warn('Could not save gradient choice:', storageError); }
        createFallbackPano(choice);
      } else {
        const choice = { type };
        try { localStorage.setItem(FALLBACK_KEY, JSON.stringify(choice)); }
        catch (storageError) { api.warn('Could not save panorama choice:', storageError); }
        createFallbackPano(choice);
      }

      overlay.remove();
      resolve(true);
    }));
    buttons[0].focus();
  });
}

/* ============================================================
 * CAPTURE THE GAME'S OWN MAP AS A PANORAMA SOURCE
 * ============================================================ */
function captureGameMap() {
  const c = api.getGameCanvas();
  if (!c || c.width < 200 || c.height < 200) return null;
  const cap = document.createElement('canvas');
  cap.width = c.width;
  cap.height = c.height;
  const g = cap.getContext('2d');
  g.drawImage(c, 0, 0);
  return cap;
}

async function tryCaptureGameMap(maxWaitMs = 10000) {
  const start = performance.now();
  while (performance.now() - start < maxWaitMs) {
    /* Only capture when the main menu is actually showing */
    if (api.isInLobby()) {
      const cap = captureGameMap();
      if (cap) {
        api.log('🎬 Captured game map for panorama');
        return cap;
      }
    }
    await new Promise(r => setTimeout(r, 250));
  }
  return null;
}

/* ============================================================
 * LOAD PANORAMA
 * ============================================================ */
async function loadPanorama() {
  pano = null;
  panoPath = null;

  /* ---- 1. User image ---- */
  const rasters = [
    'assets/panorama.png',
    'assets/panorama.jpg',
    'assets/panorama.jpeg',
    'assets/panorama.webp'
  ];
  for (const p of rasters) {
    try {
      const img = await api.readModFile(mod, p, 'image');
      pano = img;
      panoPath = p;
      api.log(`🌄 Loaded user image: ${p} (${img.width}×${img.height})`);
      api.showToast(`🌄 Panorama: ${p}`, 2000);
      return true;
    } catch (e) {
      api.log(`Skipped ${p} (${e.message || e})`);
    }
  }

  /* ---- 2. EXR (via three.js from CDN) ---- */
  try {
    const head = await fetch(mod.basePath + 'assets/panorama.exr', { method: 'HEAD', cache: 'no-store' });
    if (head.ok) {
      api.log('🧪 Decoding EXR via three.js…');
      await import('https://esm.sh/three@0.160.0');
      const { EXRLoader } = await import('https://esm.sh/three@0.160.0/examples/jsm/loaders/EXRLoader.js');
      const canvas = await new Promise((resolve, reject) => {
        new EXRLoader().load(mod.basePath + 'assets/panorama.exr', tex => {
          try {
            const { width, height, data } = tex.image;
            const c = document.createElement('canvas');
            c.width = width; c.height = height;
            const g = c.getContext('2d');
            const id = g.createImageData(width, height);
            const out = id.data;
            for (let i = 0, n = width * height; i < n; i++) {
              let r = data[i * 4], gg = data[i * 4 + 1], b = data[i * 4 + 2];
              r = Math.pow(r / (1 + r), 1 / 2.2);
              gg = Math.pow(gg / (1 + gg), 1 / 2.2);
              b = Math.pow(b / (1 + b), 1 / 2.2);
              out[i * 4] = Math.min(255, r * 255) | 0;
              out[i * 4 + 1] = Math.min(255, gg * 255) | 0;
              out[i * 4 + 2] = Math.min(255, b * 255) | 0;
              out[i * 4 + 3] = 255;
            }
            g.putImageData(id, 0, 0);
            resolve(c);
          } catch (e) { reject(e); }
        }, undefined, err => reject(err));
      });
      pano = canvas;
      panoPath = 'assets/panorama.exr';
      api.log(`🌄 EXR decoded ${canvas.width}×${canvas.height}`);
      api.showToast('🌄 Panorama: EXR', 2500);
      return true;
    }
  } catch (e) { api.warn('EXR load failed:', e); }

  /* ---- 3. User-selected fallback ---- */
  api.warn('No panorama image found. Waiting for a fallback choice.');
  return chooseFallbackPano();
}

loadPanorama();

/* ============================================================
 * DRAW — registered as the menu background
 * Runs INSIDE the game's menu render (via setMenuBackground)
 * ============================================================ */
api.setMenuBackground((g, W, H) => {
  if (!enabled || !pano) return;

  /* Smooth easing toward mouse target */
  currentX += (targetX - currentX) * 0.08;

  /* Vertical crop of the source */
  const bandH  = Math.max(1, pano.height * cropBand);
  const bandY0 = (pano.height - bandH) / 2;

  /* Cover-fit the band to the screen */
  const srcAspect = pano.width / bandH;
  const dstAspect = W / H;
  let drawW, drawH;
  if (srcAspect >= dstAspect) {
    drawH = H;
    drawW = H * srcAspect;
  } else {
    drawW = W;
    drawH = W / srcAspect;
  }
  const offsetY = (H - drawH) / 2;

  /* Horizontal scroll from smoothed mouse X */
  const maxScroll = Math.max(0, drawW - W);
  const scrollX = currentX * maxScroll;

  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(pano, 0, bandY0, pano.width, bandH, -scrollX, offsetY, drawW, drawH);
  /* Dim overlay so UI is readable */
  if (panoPath !== '<white>') {
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, 0, W, H);
  }
  g.restore();
});

/* ============================================================
 * PUBLIC API
 * ============================================================ */
mod.setEnabled = v => {
  enabled = !!v;
  api.showToast(`🌄 Panorama ${enabled ? 'enabled' : 'disabled'}`);
};
mod.reload = () => loadPanorama();
mod.info = () => ({ enabled, panoPath, cropBand });
mod.setCropBand = v => {
  cropBand = Math.max(0.05, Math.min(1, +v || 0.3));
  api.showToast(`🌄 cropBand = ${cropBand}`);
};

api.log('🌄 Panorama Background v1.0 ready');
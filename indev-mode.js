/* ============================================================
 * indev-mode.js — hidden "developer mode" toggle  v1.0
 *
 * ── SECRET ──────────────────────────────────────────────────
 * The avatar picker gets one extra ⭐ tile appended to the end
 * of the emoji grid. It looks identical to the existing star.
 *
 *   • normal click  → sets ⭐ as your avatar (like any emoji)
 *   • LONG-PRESS    → 700ms hold toggles indev mode
 *
 * ── INDEV MODE EFFECTS ──────────────────────────────────────
 *   • hides the Modatorial chrome bar
 *   • hides the Mods / Store / Appearance menu buttons
 *   • disables css/themes.css and css/client.css
 *   • removes the active theme
 *   • shows a small magenta "INDEV" badge
 *
 * ── EXIT ────────────────────────────────────────────────────
 * Click the INDEV badge 5× within 1.2 seconds,
 * or run `Indev.disable()` in the console.
 * ============================================================ */
(function (global) {
  'use strict';

  const INDEV_KEY     = 'tt-indev-mode';
  const CHROME_KEY    = 'tt-chrome-hidden';
  const LONG_PRESS_MS = 700;
  const SECRET_EMOJI  = '⭐';

  /* DOM ids to keep hidden while indev mode is on */
  const HIDE_IDS = [
    'tt-chrome',
    'tt-mods-btn',
    'tt-store-btn',
    'tt-appearance-btn',
    'tt-transition'
  ];

  const log = (...a) => console.log('%c[Indev]', 'color:#f0f;font-weight:bold', ...a);

  /* ── State ─────────────────────────────────────────────── */
  function isActive() {
    try { return localStorage.getItem(INDEV_KEY) === '1'; }
    catch { return false; }
  }

  /* ── Effects ───────────────────────────────────────────── */
  function hideEl(id) {
    const el = document.getElementById(id);
    if (el) el.style.setProperty('display', 'none', 'important');
  }

  function disableSheets(disabled) {
    document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
      const href = link.href || '';
      if (href.indexOf('themes.css') !== -1 ||
          href.indexOf('client.css') !== -1) {
        link.disabled = disabled;
      }
    });
  }

  function applyEffects() {
    if (!isActive()) return;

    document.documentElement.setAttribute('data-tt-indev', '1');

    /* Strip the Modatorial skin */
    disableSheets(true);

    /* No theme attribute — pure unstyled */
    try { document.documentElement.removeAttribute('data-tt-theme'); } catch {}

    /* Hide chrome + injected buttons */
    HIDE_IDS.forEach(hideEl);

    ensureBadge();

    log('INDEV MODE active');
  }

  function removeEffects() {
    document.documentElement.removeAttribute('data-tt-indev');
    disableSheets(false);

    ['tt-mods-btn', 'tt-store-btn', 'tt-appearance-btn', 'tt-transition'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = '';
    });

    try { localStorage.removeItem(CHROME_KEY); } catch {}
    const chrome = document.getElementById('tt-chrome');
    if (chrome) chrome.style.display = '';

    const badge = document.getElementById('tt-indev-badge');
    if (badge) badge.remove();

    log('INDEV MODE off');
  }

  /* ── Toggle ────────────────────────────────────────────── */
  function enable(opts) {
    opts = opts || {};
    try {
      localStorage.setItem(INDEV_KEY, '1');
      localStorage.setItem(CHROME_KEY, '1');
      if (opts.disableMods) {
        const ids = (global.TerritorialMods && global.TerritorialMods.mods)
          ? [...global.TerritorialMods.mods.keys()] : [];
        localStorage.setItem('tt-disabled-mods', JSON.stringify(ids));
      }
    } catch {}
    applyEffects();
    /* Reload so the whole client boots without the chrome/skin */
    setTimeout(() => location.reload(), 400);
  }

  function disable() {
    try {
      localStorage.removeItem(INDEV_KEY);
      localStorage.removeItem(CHROME_KEY);
    } catch {}
    removeEffects();
    setTimeout(() => location.reload(), 400);
  }

  function toggle() { if (isActive()) disable(); else enable(); }

  /* ── INDEV badge (escape hatch) ────────────────────────── */
  function ensureBadge() {
    if (document.getElementById('tt-indev-badge')) return;

    const b = document.createElement('div');
    b.id = 'tt-indev-badge';
    b.textContent = 'INDEV';
    b.title = 'Click 5× quickly to exit indev mode';
    Object.assign(b.style, {
      position: 'fixed', top: '8px', left: '8px',
      padding: '4px 10px',
      background: 'rgba(255,0,255,.14)',
      border: '1px solid #f0f',
      color: '#f0f',
      font: '700 10px system-ui',
      letterSpacing: '1px',
      borderRadius: '4px',
      zIndex: 2147483000,
      cursor: 'pointer',
      userSelect: 'none'
    });

    let clicks = 0, timer = null;
    b.onclick = () => {
      clicks++;
      clearTimeout(timer);
      timer = setTimeout(() => { clicks = 0; }, 1200);
      if (clicks >= 5) { clicks = 0; disable(); }
    };

    document.body.appendChild(b);
  }

  /* ── MutationObserver — keep things hidden ─────────────── */
  function startHideObserver() {
    const obs = new MutationObserver(() => {
      if (!isActive()) return;
      HIDE_IDS.forEach(hideEl);
      if (!document.getElementById('tt-indev-badge')) ensureBadge();
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  /* ── Secret tile in the avatar picker ──────────────────── */
  function injectSecretTile(modal) {
    /* Try both known ids (new avatars.js + old avatar-picker.js) */
    const grid =
      modal.querySelector('#tt-avatar-emoji') ||
      modal.querySelector('#tt-avatar-emojis') ||
      [...modal.querySelectorAll('.grid')].pop();
    if (!grid) return;
    if (grid.querySelector('[data-tt-secret="1"]')) return;

    const t = document.createElement('button');
    t.className = 'tile';
    t.dataset.ttSecret = '1';
    t.textContent = SECRET_EMOJI;
    t.title = '';   /* look normal */

    let pressTimer = null;
    let justLongPressed = false;

    const startPress = () => {
      justLongPressed = false;
      clearTimeout(pressTimer);
      pressTimer = setTimeout(() => {
        justLongPressed = true;
        /* visual flash so the user knows they hit something */
        t.style.transition = 'border-color .15s, box-shadow .15s';
        t.style.borderColor = '#f0f';
        t.style.boxShadow = '0 0 0 2px rgba(255,0,255,.45), 0 0 16px rgba(255,0,255,.45)';
        setTimeout(() => {
          t.style.borderColor = '';
          t.style.boxShadow = '';
        }, 700);
        log('Secret tile fired — toggling indev mode');
        toggle();
      }, LONG_PRESS_MS);
    };

    const cancelPress = () => clearTimeout(pressTimer);

    t.addEventListener('mousedown',  startPress);
    t.addEventListener('mouseup',    cancelPress);
    t.addEventListener('mouseleave', cancelPress);
    t.addEventListener('touchstart', startPress, { passive: true });
    t.addEventListener('touchend',   cancelPress);
    t.addEventListener('touchcancel',cancelPress);

    /* Normal click → sets ⭐ as your avatar. Suppressed after a
       long press so both actions don't fire on the same gesture. */
    t.addEventListener('click', e => {
      if (justLongPressed) {
        e.stopPropagation();
        e.preventDefault();
        justLongPressed = false;
        return;
      }
      if (global.Avatars && global.Avatars.set) {
        const svg =
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">' +
            '<rect width="128" height="128" fill="#0d1117"/>' +
            '<text x="64" y="100" font-size="96" text-anchor="middle">' +
              SECRET_EMOJI +
            '</text>' +
          '</svg>';
        global.Avatars.set('data:image/svg+xml;utf8,' + encodeURIComponent(svg))
          .catch(err => console.warn('[Indev] set avatar failed:', err));
      }
    });

    grid.appendChild(t);
  }

  function startAvatarWatcher() {
    const obs = new MutationObserver(() => {
      const modal = document.getElementById('tt-avatar-modal');
      if (!modal) return;
      if (modal.dataset.ttSecretInjected === '1') return;
      modal.dataset.ttSecretInjected = '1';
      /* let the emoji grid finish rendering first */
      setTimeout(() => injectSecretTile(modal), 0);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  /* ── Boot ──────────────────────────────────────────────── */
  function boot() {
    const existingModal = document.getElementById('tt-avatar-modal');
    if (existingModal) {
      existingModal.dataset.ttSecretInjected = '1';
      injectSecretTile(existingModal);
    }

    startAvatarWatcher();

    if (isActive()) {
      applyEffects();
      startHideObserver();
    }

    log('Ready — long-press the extra ⭐ in the avatar picker');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* ── Public API ───────────────────────────────────────── */
  global.Indev = {
    isActive,
    enable,
    disable,
    toggle,
    /* manual trigger — same as long-press */
    trigger: toggle
  };
})(window);
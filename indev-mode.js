/* ============================================================
 * indev-mode.js — hidden "raw HTML" trigger  v3.0
 *
 * ── SECRET ──────────────────────────────────────────────────
 * The avatar picker gets one extra ⭐ tile. It looks identical
 * to the existing star.
 *
 *   • normal click  → sets ⭐ as your avatar
 *   • LONG-PRESS    → 700ms hold toggles raw theme
 *
 * ── RAW THEME ───────────────────────────────────────────────
 * Sets <html data-tt-theme="raw"> which activates css/raw.css.
 * The whole client is restyled as plain, unstyled HTML.
 *
 * ── EXIT ────────────────────────────────────────────────────
 * Click the INDEV badge 5× within 1.2 seconds,
 * or run `Indev.disable()` in the console.
 * ============================================================ */
(function (global) {
  'use strict';

  const LONG_PRESS_MS = 700;
  const SECRET_EMOJI  = '⭐';
  const RAW_THEME     = 'raw';
  const PREV_KEY      = 'tt-indev-prev-theme';

  const log = (...a) => console.log('%c[Indev]', 'color:#f0f;font-weight:bold', ...a);

  /* ── Is raw theme on? ─────────────────────────────────── */
  function isActive() {
    return document.documentElement.getAttribute('data-tt-theme') === RAW_THEME;
  }

  /* ── Enable / disable ─────────────────────────────────── */
  function enable() {
    /* Remember whatever theme was active before, so we can restore it */
    try {
      const current = localStorage.getItem('tt-theme') || 'modatorial';
      if (current !== RAW_THEME) localStorage.setItem(PREV_KEY, current);
    } catch {}

    if (global.TerritorialMods && global.TerritorialMods.setTheme) {
      global.TerritorialMods.setTheme(RAW_THEME);
    } else {
      document.documentElement.setAttribute('data-tt-theme', RAW_THEME);
      try { localStorage.setItem('tt-theme', RAW_THEME); } catch {}
    }

    ensureBadge();
    log('Raw theme active — click the INDEV badge 5× to exit');
  }

  function disable() {
    let prev = 'modatorial';
    try {
      prev = localStorage.getItem(PREV_KEY) || 'modatorial';
      localStorage.removeItem(PREV_KEY);
    } catch {}

    if (global.TerritorialMods && global.TerritorialMods.setTheme) {
      global.TerritorialMods.setTheme(prev);
    } else {
      document.documentElement.setAttribute('data-tt-theme', prev);
      try { localStorage.setItem('tt-theme', prev); } catch {}
    }

    const badge = document.getElementById('tt-indev-badge');
    if (badge) badge.remove();
    log('Exited raw theme → back to ' + prev);
  }

  function toggle() { isActive() ? disable() : enable(); }

  /* ── INDEV escape badge ───────────────────────────────── */
  function ensureBadge() {
    if (document.getElementById('tt-indev-badge')) return;

    const b = document.createElement('div');
    b.id = 'tt-indev-badge';
    b.textContent = 'INDEV';
    b.title = 'Click 5× quickly to exit raw mode';

    let clicks = 0, timer = null;
    b.onclick = () => {
      clicks++;
      clearTimeout(timer);
      timer = setTimeout(() => { clicks = 0; }, 1200);
      if (clicks >= 5) { clicks = 0; disable(); }
    };

    document.body.appendChild(b);
  }

  /* ── Secret tile inside the avatar picker ─────────────── */
  function injectSecretTile(modal) {
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

    let pressTimer = null;
    let justLongPressed = false;

    const startPress = () => {
      justLongPressed = false;
      clearTimeout(pressTimer);
      pressTimer = setTimeout(() => {
        justLongPressed = true;
        t.style.borderColor = '#f0f';
        t.style.boxShadow = '0 0 0 2px rgba(255,0,255,.45), 0 0 16px rgba(255,0,255,.45)';
        setTimeout(() => {
          t.style.borderColor = '';
          t.style.boxShadow = '';
        }, 700);
        log('Secret tile fired — switching to raw theme');
        toggle();
      }, LONG_PRESS_MS);
    };
    const cancelPress = () => clearTimeout(pressTimer);

    t.addEventListener('mousedown',   startPress);
    t.addEventListener('mouseup',     cancelPress);
    t.addEventListener('mouseleave',  cancelPress);
    t.addEventListener('touchstart',  startPress, { passive: true });
    t.addEventListener('touchend',    cancelPress);
    t.addEventListener('touchcancel', cancelPress);

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
      setTimeout(() => injectSecretTile(modal), 0);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  /* ── Boot ─────────────────────────────────────────────── */
  function boot() {
    const existingModal = document.getElementById('tt-avatar-modal');
    if (existingModal) {
      existingModal.dataset.ttSecretInjected = '1';
      injectSecretTile(existingModal);
    }
    startAvatarWatcher();

    /* If the page already booted into raw theme, make sure the
       badge is present so the user can escape. */
    if (isActive()) ensureBadge();

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
    trigger: toggle
  };
})(window);
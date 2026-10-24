/* ============================================================
 * hide-clutter.js — core client feature  v1.0
 *
 * Hides three specific pieces of the game's menu UI:
 *   • Store badges   (Google Play / App Store)   — class `bb`
 *   • Bottom timeline bars                       — class `aU`
 *   • Team Contest countdown timer               — class `aP`
 *
 * Works by FREEZING each object's `wr()` (render) method with
 * Object.defineProperty so any later reassignment silently fails.
 * ============================================================ */
(function (global) {
  'use strict';

  const API = global.TerritorialMods;
  if (!API) {
    console.warn('[HideClutter] TerritorialMods not loaded — run after modLoader.js');
    return;
  }

  const log  = (...a) => console.log ('%c[HideClutter]', 'color:#8cf;font-weight:bold', ...a);
  const warn = (...a) => console.warn('%c[HideClutter]', 'color:#f0883e;font-weight:bold', ...a);

  /* Freeze a method in place. Returns true if the freeze succeeded. */
  function freezeMethod(obj, name) {
    if (!obj || typeof obj[name] !== 'function') return false;
    if (obj['__ttFrozen_' + name]) return true;

    try {
      Object.defineProperty(obj, name, {
        value: function () { /* no-op */ },
        writable: false,
        configurable: false,
        enumerable: false
      });
      obj['__ttFrozen_' + name] = true;
      return true;
    } catch (e) {
      warn(`Could not freeze ${name}:`, e.message);
      return false;
    }
  }

  /* Apply the hides. Returns true when everything is patched. */
  function applyHides() {
    const TT = API.getGame();
    if (!TT) return false;

    let allDone = true;
    let logMsgs = [];

    /* ── 1. Store badges (Google Play / App Store) ── */
    if (TT.bb) {
      if (freezeMethod(TT.bb, 'wr')) logMsgs.push('store badges');
      else allDone = false;

      /* Belt and braces: also kill the flag array */
      if (Array.isArray(TT.bb.gM)) {
        for (let i = 0; i < TT.bb.gM.length; i++) TT.bb.gM[i] = false;
      }
      /* And the "interactive lock" gate */
      try { TT.bb.iL = () => false; } catch (e) {}
    } else allDone = false;

    /* ── 2. Bottom timeline bars ── */
    if (TT.aU && typeof TT.aU.wr === 'function') {
      if (freezeMethod(TT.aU, 'wr')) logMsgs.push('timeline');
      else allDone = false;
    } else allDone = false;

    /* ── 3. Team Contest countdown ── */
    if (TT.aP && typeof TT.aP.wr === 'function') {
      if (freezeMethod(TT.aP, 'wr')) logMsgs.push('countdown');
      else allDone = false;
    } else allDone = false;

    if (logMsgs.length && allDone) {
      log('Frozen: ' + logMsgs.join(', '));
    }

    return allDone;
  }

  /* Try now, then keep trying until it works */
  if (!applyHides()) {
    let attempts = 0;
    const iv = setInterval(() => {
      attempts++;
      if (applyHides()) {
        clearInterval(iv);
      } else if (attempts === 120) {
        clearInterval(iv);
        warn('Gave up after 30 s — some hides may not have applied');
      }
    }, 250);
  }

  /* Re-apply on screen changes, in case the game swaps objects */
  API.on('screenChanged', () => setTimeout(applyHides, 100));

  /* Public API for manual control */
  global.HideClutter = {
    apply: applyHides,
    /** Reveal the hidden UI again (requires a page reload — the
     *  frozen methods cannot be un-frozen from JS). */
    restore: () => {
      if (!confirm('Reveal the hidden menu UI? This reloads the page.')) return;
      location.reload();
    },
    /** Check what's currently frozen */
    status: () => {
      const TT = API.getGame();
      if (!TT) return { ok: false, reason: 'no __TT__' };
      return {
        storeBadges: !!(TT.bb && TT.bb.__ttFrozen_wr),
        timeline:    !!(TT.aU && TT.aU.__ttFrozen_wr),
        countdown:   !!(TT.aP && TT.aP.__ttFrozen_wr)
      };
    }
  };

  log('ready — watching for game objects');
})(window);

/* Mega Bots — expands the player cap above the game's hardcoded 512.
   Experimental. Toggle off if the match behaves strangely. */
(function () {
  'use strict';

  const MIN_CAP = 128;

  function expandAh(ah, size) {
    if (!ah) return;
    if (ah.a0j && ah.a0j.length >= size) return;

    /* Dynamic arrays — plain JS arrays */
    ah.a2w = new Array(size);
    ah.a0j = new Array(size);
    ah.h1  = new Array(size);
    ah.hF  = new Array(size);
    ah.hG  = new Array(size);
    ah.fy  = new Array(size);

    /* Typed arrays */
    ah.a5a = new Uint8Array(size);
    ah.nU  = new Uint8Array(size);
    ah.jS  = new Uint16Array(size);
    ah.jU  = new Uint16Array(size);
    ah.jT  = new Uint16Array(size);
    ah.jV  = new Uint16Array(size);
    ah.hN  = new Uint32Array(size);
    ah.zp  = new Uint32Array(size);
    ah.hb  = new Uint32Array(size);
    ah.rj  = new Uint16Array(size);
    ah.jx  = new Uint16Array(size);
    ah.jy  = new Uint16Array(size);
    ah.a2r = new Uint16Array(size);
    ah.a2p = new Uint8Array(size);
    ah.a5j = new Uint16Array(size);

    /* Fill arrays-of-arrays with empty children */
    for (let i = 0; i < size; i++) {
      if (!Array.isArray(ah.h1[i])) ah.h1[i] = [];
      if (!Array.isArray(ah.hF[i])) ah.hF[i] = [];
      if (!Array.isArray(ah.hG[i])) ah.hG[i] = [];
      if (!Array.isArray(ah.fy[i])) ah.fy[i] = [];
    }
  }

  function expandAux(TT, size) {
    /* aF holds per-bot difficulty — expand its iI if reachable */
    if (TT.aF && TT.aF.iI && TT.aF.iI.length < size) {
      const newI = new Uint8Array(size);
      newI.set(TT.aF.iI);
      TT.aF.iI = newI;
    }
  }

  let hooked = false;

  function hook() {
    const TT = api.getGame();
    if (!TT || !TT.aE || !TT.ah) return false;
    if (TT.aE.__megaBotsHooked) return true;

    const aE = TT.aE;
    const origA6m = aE.a6m.bind(aE);

    aE.a6m = function () {
      const total = Math.max(MIN_CAP, Number(api.getSetting('mega-bots', 'total')) || 1024);
      const enabled = api.getSetting('mega-bots', 'enabled') !== false;

      if (enabled) {
        /* Expand the shared player arrays */
        expandAh(TT.ah, total);
        expandAux(TT, total);

        /* Raise the cap */
        aE.fW = total;
        if (aE.data) {
          aE.data.playerCount = total;
          /* Team / mode rules that depended on 512 */
          if (aE.data.teamPlayerCount && aE.data.teamPlayerCount.length < total) {
            const tpc = new Uint16Array(Math.max(9, total));
            tpc.set(aE.data.teamPlayerCount);
            aE.data.teamPlayerCount = tpc;
          }
        }
        api.log(`🚀 Mega Bots — expanding to ${total} players`);
      }

      return origA6m();
    };

    aE.__megaBotsHooked = true;
    hooked = true;
    api.log('🚀 Mega Bots ready — will apply on next match start');
    return true;
  }

  if (!hook()) {
    const iv = setInterval(() => { if (hook()) clearInterval(iv); }, 200);
    setTimeout(() => clearInterval(iv), 30000);
  }

  api.on('modSettingsChanged', (id) => {
    if (id === 'mega-bots') {
      api.showToast('🚀 Mega Bots setting saved — start a new match to apply');
    }
  });
})();
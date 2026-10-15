/* Zoom-Level Indicator — shows zoom % and world coords */
(function () {
  'use strict';

  const chip = document.createElement('div');
  chip.id = 'tt-zoom-ind';
  Object.assign(chip.style, {
    position: 'fixed',
    left: '12px',
    bottom: '66px',
    padding: '4px 10px',
    background: 'rgba(0,0,0,0.55)',
    color: '#00F5D4',
    font: '600 11px ui-monospace, Menlo, Consolas, monospace',
    borderRadius: '6px',
    border: '1px solid rgba(0,245,212,0.35)',
    pointerEvents: 'none',
    zIndex: 9990,
    whiteSpace: 'nowrap'
  });
  chip.textContent = '100%  ·  0, 0';
  document.body.appendChild(chip);

  let zoom   = 1;
  let worldX = 0;
  let worldY = 0;
  let capturedThisFrame = false;

  /* Every frame: reset the "captured" flag in preUpdate, then take
     the first preRender (which is the map draw) as the true zoom. */
  api.addHook('preUpdate', () => { capturedThisFrame = false; });

  api.addHook('preRender', ctx => {
    if (capturedThisFrame) return;
    const t = ctx.getTransform();
    /* The map is drawn with no rotation and no skew: b and c ≈ 0 */
    if (Math.abs(t.b) < 0.001 && Math.abs(t.c) < 0.001 &&
        t.a > 0.05 && t.a < 100) {
      zoom = t.a;
      capturedThisFrame = true;
    }
  });

  /* World coordinates come straight from the game's zoom helper */
  setInterval(() => {
    const TT = api.getGame();
    if (TT && TT.aT && typeof TT.aT.a0L === 'function') {
      worldX = TT.aT.a0L();
      worldY = TT.aT.a0M();
    }
    chip.textContent =
      Math.round(zoom * 100) + '%  ·  ' +
      Math.round(worldX) + ', ' + Math.round(worldY);
  }, 80);

  api.log('🔎 Zoom-Level Indicator ready');
})();
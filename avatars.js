/* ============================================================
 * avatars.js — core profile picture system  v1.0
 *
 * Essential client module. Ships with the game — NOT a mod.
 *
 * Public API:
 *   Avatars.open()             → opens the picker modal
 *   Avatars.set(url)           → saves an avatar URL (or null to reset)
 *   Avatars.get()              → returns current user's avatar URL
 *   Avatars.defaults()         → array of bundled default paths
 *   Avatars.emojis()           → array of emoji characters
 *
 * Saves to Firestore: users/{uid}.photoURL
 * Also updates Firebase Auth's own photoURL (bonus).
 *
 * Fires events:
 *   window 'tt-avatar-change' { detail: { url } }
 * ============================================================ */
(function (global) {
  'use strict';

  const log  = (...a) => console.log ('%c[Avatars]', 'color:#c9f;font-weight:bold', ...a);
  const warn = (...a) => console.warn('%c[Avatars]', 'color:#f0883e;font-weight:bold', ...a);

  /* ═══════════════════════════════════════════════════════════
     DEFAULT AVATARS — bundled with the client
     Add / remove entries to match the files in avatars/
     ═══════════════════════════════════════════════════════════ */
  const DEFAULTS = [
    'avatars/meme-1.png',   // smirk
    'avatars/meme-2.png',   // crying duo
    'avatars/meme-3.png',   // staring pair
    'avatars/meme-4.png',   // pug lollipop
    'avatars/meme-5.png',   // dog side-eye
    'avatars/meme-6.png',   // cat thinking
    'avatars/meme-7.png',   // screaming sand
    'avatars/meme-8.png',   // soldier stare
    'avatars/meme-9.png',   // shrek side-eye
  ];

  /* Emoji pool — always available, zero files needed */
  const EMOJI = [
    '🐶','🐱','🐭','🦊','🐻','🐼','🐨','🐯','🦁','🐮',
    '🐷','🐸','🐵','🐔','🐧','🦄','🐉','👑','🎮','⚔️',
    '🛡️','🔥','💎','⭐','🌟','🍕','🍔','🌈','🎯','🎲',
    '😎','😈','🤡','👻','👽','🤖','👾','🎃','💀','🦅'
  ];

  const MAX_UPLOAD_DIM = 256;
  const JPEG_QUALITY   = 0.82;
  const MAX_UPLOAD_MB  = 3;

  /* ═══════════════════════════════════════════════════════════
     UTILITIES
     ═══════════════════════════════════════════════════════════ */
  function emojiToDataURL(ch) {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">' +
        '<rect width="128" height="128" fill="#0d1117"/>' +
        '<text x="64" y="100" font-size="96" text-anchor="middle">' + ch + '</text>' +
      '</svg>';
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  function fileToAvatarDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Not a valid image'));
        img.onload = () => {
          const scale = Math.min(1, MAX_UPLOAD_DIM / Math.max(img.width, img.height));
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          cv.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(cv.toDataURL('image/jpeg', JPEG_QUALITY));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* ═══════════════════════════════════════════════════════════
     SAVE / READ
     ═══════════════════════════════════════════════════════════ */
  function getCurrent() {
    const u = global.Auth && global.Auth.current && global.Auth.current();
    return u ? (u.photoURL || null) : null;
  }

  async function setAvatar(url) {
    const user = global.Auth && global.Auth.current && global.Auth.current();
    if (!user) throw new Error('Sign in first');

    /* 1. Write to Firestore via the Auth facade */
    if (global.Auth.updateProfile) {
      await global.Auth.updateProfile({ photoURL: url || null });
    } else if (global.firebase && firebase.firestore) {
      const db = firebase.firestore();
      await db.collection('users').doc(user.uid).update({
        photoURL: url || null,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } else {
      throw new Error('Auth.updateProfile unavailable');
    }

    /* 2. Mutate the cached user object so UIs refresh immediately */
    user.photoURL = url || null;

    /* 3. Also update Firebase Auth's own photoURL (bonus — some
          browsers show this in the native account picker) */
    try {
      const fbUser = firebase.auth && firebase.auth().currentUser;
      if (fbUser && fbUser.updateProfile) {
        await fbUser.updateProfile({ photoURL: url || null });
      }
    } catch (e) { warn('Auth.updateProfile failed (non-fatal):', e.message); }

    /* 4. Fire events */
    try {
      global.dispatchEvent(new CustomEvent('tt-avatar-change', { detail: { url } }));
    } catch {}
    if (global.Auth.emit) {
      try { global.Auth.emit(); } catch {}
    }
  }

  /* ═══════════════════════════════════════════════════════════
     MODAL
     ═══════════════════════════════════════════════════════════ */
  let modalEl = null;

  function injectStyles() {
    if (document.getElementById('tt-avatar-style')) return;
    const s = document.createElement('style');
    s.id = 'tt-avatar-style';
    s.textContent = `
      #tt-avatar-modal {
        position: fixed; inset: 0; z-index: 2147483000;
        background: rgba(0,0,0,.88); backdrop-filter: blur(6px);
        display: flex; align-items: center; justify-content: center;
        font-family: system-ui, -apple-system, sans-serif;
        padding: 20px; box-sizing: border-box;
      }
      #tt-avatar-modal .box {
        width: 100%; max-width: 560px; max-height: 88vh;
        background: #16181d; border: 1px solid #262a31;
        border-radius: 14px; color: #e6edf3;
        display: flex; flex-direction: column; overflow: hidden;
        box-shadow: 0 20px 60px rgba(0,0,0,.7);
      }
      #tt-avatar-modal .head {
        display: flex; align-items: center; justify-content: space-between;
        padding: 16px 22px; border-bottom: 1px solid #262a31;
      }
      #tt-avatar-modal .head h2 { margin: 0; font-size: 17px; font-weight: 700; }
      #tt-avatar-modal .head button {
        background: transparent; border: 0; color: #8b949e;
        font: 600 20px system-ui; cursor: pointer; padding: 4px 10px;
      }
      #tt-avatar-modal .head button:hover { color: #e6edf3; }
      #tt-avatar-modal .body {
        padding: 18px 22px; overflow-y: auto; flex: 1 1 auto;
      }
      #tt-avatar-modal .section-title {
        font: 700 11px system-ui; text-transform: uppercase;
        letter-spacing: 1px; color: #58a6ff; margin: 0 0 10px;
      }
      #tt-avatar-modal .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
        gap: 8px; margin-bottom: 22px;
      }
      #tt-avatar-modal .tile {
        aspect-ratio: 1;
        background: #0d1117; border: 2px solid #262a31;
        border-radius: 10px; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        font-size: 32px; overflow: hidden;
        transition: border-color .12s, transform .08s;
        user-select: none; padding: 0;
      }
      #tt-avatar-modal .tile img {
        width: 100%; height: 100%; object-fit: cover; display: block;
      }
      #tt-avatar-modal .tile:hover { border-color: #3fb950; transform: scale(1.04); }
      #tt-avatar-modal .tile.active {
        border-color: #00F5D4;
        box-shadow: 0 0 0 2px rgba(0,245,212,.35), 0 0 16px rgba(0,245,212,.35);
      }
      #tt-avatar-modal .tile.upload,
      #tt-avatar-modal .tile.remove {
        flex-direction: column; gap: 4px;
        font-size: 11px; color: #8b949e; font-weight: 600;
        border-style: dashed;
      }
      #tt-avatar-modal .tile.upload::before { content: '📁'; font-size: 22px; }
      #tt-avatar-modal .tile.remove::before { content: '↩︎'; font-size: 22px; }
      #tt-avatar-modal .footer {
        padding: 14px 22px; border-top: 1px solid #262a31;
        display: flex; justify-content: space-between; align-items: center;
        gap: 10px;
      }
      #tt-avatar-modal .status { font-size: 12px; color: #8b949e; flex: 1; }
      #tt-avatar-modal .status.ok  { color: #3fb950; }
      #tt-avatar-modal .status.err { color: #f85149; }
      #tt-avatar-modal .btn {
        padding: 9px 18px; border-radius: 8px;
        font: 600 13px system-ui; cursor: pointer;
        border: 1px solid #30363d; background: transparent;
        color: #e6edf3;
      }
      #tt-avatar-modal .btn:hover { filter: brightness(1.15); }
      #tt-avatar-modal .btn.primary {
        background: #238636; border-color: #2ea043; color: #fff;
      }
    `;
    document.head.appendChild(s);
  }

  function open() {
    injectStyles();

    if (!global.Auth || !global.Auth.current || !global.Auth.current()) {
      alert('Sign in first to change your avatar.');
      return;
    }

    if (modalEl) {
      modalEl.style.display = 'flex';
      refreshModal();
      return;
    }

    modalEl = document.createElement('div');
    modalEl.id = 'tt-avatar-modal';
    modalEl.innerHTML =
      '<div class="box">' +
        '<div class="head">' +
          '<h2>🎨 Choose your avatar</h2>' +
          '<button id="tt-avatar-close">✕</button>' +
        '</div>' +
        '<div class="body">' +
          '<div class="section-title">Bundled</div>' +
          '<div class="grid" id="tt-avatar-defaults"></div>' +
          '<div class="section-title">Emoji</div>' +
          '<div class="grid" id="tt-avatar-emoji"></div>' +
        '</div>' +
        '<div class="footer">' +
          '<div class="status" id="tt-avatar-status"></div>' +
          '<button class="btn" id="tt-avatar-cancel">Close</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modalEl);

    /* Bundled defaults */
    const defGrid = modalEl.querySelector('#tt-avatar-defaults');
    DEFAULTS.forEach(url => {
      const t = document.createElement('button');
      t.className = 'tile';
      t.dataset.url = url;
      t.innerHTML = '<img src="' + url + '" alt="" loading="lazy">';
      t.onclick = () => pickAndSave(url);
      defGrid.appendChild(t);
    });

    /* Upload tile */
    const up = document.createElement('button');
    up.className = 'tile upload';
    up.textContent = 'Upload';
    up.onclick = onUpload;
    defGrid.appendChild(up);

    /* Reset tile */
    const rm = document.createElement('button');
    rm.className = 'tile remove';
    rm.textContent = 'Reset';
    rm.onclick = () => pickAndSave(null);
    defGrid.appendChild(rm);

    /* Emoji grid */
    const emojiGrid = modalEl.querySelector('#tt-avatar-emoji');
    EMOJI.forEach(ch => {
      const url = emojiToDataURL(ch);
      const t = document.createElement('button');
      t.className = 'tile';
      t.dataset.url = url;
      t.textContent = ch;
      t.onclick = () => pickAndSave(url);
      emojiGrid.appendChild(t);
    });

    /* Close wiring */
    modalEl.querySelector('#tt-avatar-close').onclick = close;
    modalEl.querySelector('#tt-avatar-cancel').onclick = close;
    modalEl.addEventListener('click', e => {
      if (e.target === modalEl) close();
    });

    refreshModal();
  }

  function close() {
    if (modalEl) modalEl.style.display = 'none';
  }

  function refreshModal() {
    if (!modalEl) return;
    const cur = getCurrent();
    modalEl.querySelectorAll('.tile').forEach(t => {
      t.classList.toggle('active', !!t.dataset.url && t.dataset.url === cur);
    });
  }

  function setStatus(text, kind) {
    const el = modalEl && modalEl.querySelector('#tt-avatar-status');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
  }

  async function pickAndSave(url) {
    setStatus('Saving…');
    try {
      await setAvatar(url);
      setStatus(url ? '✅ Avatar updated' : '↩︎ Reset to default', 'ok');
      refreshModal();
      setTimeout(close, 600);
    } catch (e) {
      warn('Save failed:', e);
      setStatus('❌ ' + (e.message || String(e)), 'err');
    }
  }

  function onUpload() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml';
    inp.onchange = async () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      if (f.size > MAX_UPLOAD_MB * 1024 * 1024) {
        setStatus('❌ Image too big (max ' + MAX_UPLOAD_MB + ' MB)', 'err');
        return;
      }
      setStatus('Processing…');
      try {
        const url = await fileToAvatarDataURL(f);
        await pickAndSave(url);
      } catch (e) {
        setStatus('❌ ' + e.message, 'err');
      }
    };
    inp.click();
  }

  /* ═══════════════════════════════════════════════════════════
     RENDER HELPERS
     Used by client-features.js and account.html.
     ═══════════════════════════════════════════════════════════ */

  /* Returns an HTML string for a circular avatar.
     opts:
       size     number, default 64
       user     { photoURL, displayName, email }
       clickable boolean, default false → adds data-tt-avatar-open */
  function html(user, opts) {
    opts = opts || {};
    const size = opts.size || 64;
    const clickable = !!opts.clickable;
    const initial = ((user && (user.displayName || user.email || '?'))[0] || '?').toUpperCase();
    const clickAttr = clickable ? ' data-tt-avatar-open="1" title="Click to change avatar"' : '';
    const cursor = clickable ? 'cursor:pointer;' : '';
    const inner = (user && user.photoURL)
      ? '<img src="' + user.photoURL.replace(/"/g, '&quot;') + '" alt="" ' +
        'style="width:100%;height:100%;object-fit:cover;display:block;">'
      : initial;
    return '<div' + clickAttr + ' ' +
      'style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;' +
      'background:linear-gradient(135deg,#238636,#3fb950);' +
      'display:flex;align-items:center;justify-content:center;' +
      'font:700 ' + Math.round(size * 0.38) + 'px system-ui;color:#fff;' +
      'flex-shrink:0;overflow:hidden;' + cursor + '">' +
      inner + '</div>';
  }

  /* Wire up every [data-tt-avatar-open] element inside `root`
     (or document.body) to open the picker on click. */
  function wireClicks(root) {
    root = root || document.body;
    root.querySelectorAll('[data-tt-avatar-open]').forEach(el => {
      if (el.dataset.ttAvatarWired === '1') return;
      el.dataset.ttAvatarWired = '1';
      el.addEventListener('click', e => {
        e.stopPropagation();
        open();
      });
    });
  }

  /* ═══════════════════════════════════════════════════════════
     CHROME BAR SYNC
     Replaces the 👤 emoji in the top-right account button with
     the user's actual avatar whenever one is set.
     ═══════════════════════════════════════════════════════════ */
  function refreshChromeAvatar() {
    const chrome = document.getElementById('tt-chrome');
    if (!chrome) return;
    const user = global.Auth && global.Auth.current && global.Auth.current();

    const btns = chrome.querySelectorAll('button');
    for (const b of btns) {
      const firstSpan = b.querySelector('span:first-child');
      if (!firstSpan) continue;
      const t = (firstSpan.textContent || '').trim();
      if (t !== '👤' && t !== '👥' && !firstSpan.querySelector('img')) continue;

      if (user && user.photoURL) {
        if (firstSpan.dataset.ttAvatarSrc !== user.photoURL) {
          firstSpan.innerHTML =
            '<img src="' + user.photoURL.replace(/"/g, '&quot;') + '" alt="" ' +
            'style="width:20px;height:20px;border-radius:50%;' +
            'object-fit:cover;display:block;">';
          firstSpan.dataset.ttAvatarSrc = user.photoURL;
        }
      } else if (firstSpan.dataset.ttAvatarSrc) {
        firstSpan.textContent = '👤';
        delete firstSpan.dataset.ttAvatarSrc;
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════
     PUBLIC API
     ═══════════════════════════════════════════════════════════ */
  global.Avatars = {
    open,
    close,
    get:        getCurrent,
    set:        setAvatar,
    defaults:   () => DEFAULTS.slice(),
    emojis:     () => EMOJI.slice(),
    html,
    wireClicks
  };

  /* Backwards-compat alias in case anything else references the
     old name from the earlier draft. */
  global.AvatarPicker = global.Avatars;

  /* ═══════════════════════════════════════════════════════════
     BOOT
     ═══════════════════════════════════════════════════════════ */
  function boot() {
    /* Wire any avatars already in the DOM */
    wireClicks(document.body);

    /* Chrome bar avatar sync */
    refreshChromeAvatar();
    setInterval(refreshChromeAvatar, 1500);

    /* React to auth changes */
    if (global.Auth && global.Auth.onChange) {
      global.Auth.onChange(() => {
        setTimeout(refreshChromeAvatar, 200);
      });
    }

    /* React to our own change events */
    global.addEventListener('tt-avatar-change', refreshChromeAvatar);

    /* Watch the DOM for new [data-tt-avatar-open] elements so
       the account modal keeps working even if it rebuilds. */
    const obs = new MutationObserver(() => wireClicks(document.body));
    obs.observe(document.body, { childList: true, subtree: true });

    log('Core avatar system ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);

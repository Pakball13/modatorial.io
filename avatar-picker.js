/* ============================================================
 * avatar-picker.js — profile picture chooser  v1.0
 *
 * Auto-wires itself:
 *   • account.html  → adds a "🎨 Change Avatar" button to the
 *                     profile card, and makes the avatar clickable
 *   • #tt-chrome    → shows the user's chosen avatar instead of
 *                     the default 👤 emoji
 *
 * Saves to Firestore: users/{uid}.photoURL
 *
 * Depends on: auth.js (window.Auth), Firestore
 * Safe if Auth isn't ready — it just waits.
 * ============================================================ */
(function (global) {
  'use strict';

  const log  = (...a) => console.log ('%c[Avatar]', 'color:#c9f;font-weight:bold', ...a);
  const warn = (...a) => console.warn('%c[Avatar]', 'color:#f0883e;font-weight:bold', ...a);

  /* ═══════════════════════════════════════════════════════════
     DEFAULT AVATARS
     Add/remove entries here to match the files in avatars/.
     Use forward slashes even on Windows.
     ═══════════════════════════════════════════════════════════ */
  const DEFAULTS = [
    'avatars/meme-1.png',   // smirk guy
    'avatars/wallahi-im-done.png',   // crying duo
    'avatars/are-you-sure.png',   // staring pair
    'avatars/happy.png',   // pug lollipop
    'avatars/sus-stare.png',   // dog side-eye
    'avatars/lemme-think.png',   // cat thinking
    'avatars/fahh.png',   // screaming sand
    'avatars/....png',   // soldier stare
    'avatars/uh-oh.png',   // shrek side-eye
    'avatars/ez-kid.png',   // cat
  ];

  /* Emoji avatars — always available, no files needed */
  const EMOJI = [
    '🐶','🐱','🐭','🦊','🐻','🐼','🐨','🐯','🦁','🐮',
    '🐷','🐸','🐵','🐔','🐧','🦄','🐉','👑','🎮','⚔️',
    '🛡️','🔥','💎','⭐','🌟','🍕','🍔','🌈','🎯','🎲',
    '😎','😈','🤡','👻','👽','🤖','👾','🎃','💀','🦅'
  ];

  /* Uploaded images are downscaled to this max dimension */
  const MAX_UPLOAD_DIM = 256;
  const JPEG_QUALITY   = 0.82;

  /* ═══════════════════════════════════════════════════════════
     HELPERS
     ═══════════════════════════════════════════════════════════ */
  function emojiToDataURL(ch) {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">' +
        '<rect width="128" height="128" fill="#0d1117"/>' +
        '<text x="64" y="100" font-size="96" text-anchor="middle">' + ch + '</text>' +
      '</svg>';
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  async function fileToAvatarDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Not a valid image'));
        img.onload = () => {
          const { width, height } = img;
          const scale = Math.min(1, MAX_UPLOAD_DIM / Math.max(width, height));
          const w = Math.round(width * scale);
          const h = Math.round(height * scale);
          const cv = document.createElement('canvas');
          cv.width = w; cv.height = h;
          const ctx = cv.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          resolve(cv.toDataURL('image/jpeg', JPEG_QUALITY));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* ═══════════════════════════════════════════════════════════
     STATE + SAVE
     ═══════════════════════════════════════════════════════════ */
  function currentURL() {
    const u = global.Auth && global.Auth.current && global.Auth.current();
    return u && u.photoURL ? u.photoURL : null;
  }

  async function saveAvatar(url) {
    const user = global.Auth && global.Auth.current && global.Auth.current();
    if (!user) throw new Error('Not signed in');

    /* 1. Write to Firestore via the Auth facade */
    if (global.Auth.updateProfile) {
      await global.Auth.updateProfile({ photoURL: url || null });
    } else {
      /* Fallback — direct Firestore write */
      const db = firebase.firestore();
      await db.collection('users').doc(user.uid).update({
        photoURL: url || null,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    /* 2. Update the cached user object so UIs refresh immediately */
    user.photoURL = url || null;

    /* 3. Also update the Firebase Auth profile (nice to have) */
    try {
      const fbUser = firebase.auth && firebase.auth().currentUser;
      if (fbUser && fbUser.updateProfile) {
        await fbUser.updateProfile({ photoURL: url || null });
      }
    } catch (e) { warn('Auth.updateProfile failed (non-fatal):', e.message); }

    /* 4. Fire events so listening UIs redraw */
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
      #tt-avatar-modal .tile.upload {
        flex-direction: column; gap: 4px;
        font-size: 11px; color: #8b949e; font-weight: 600;
        border-style: dashed;
      }
      #tt-avatar-modal .tile.upload::before {
        content: '📁'; font-size: 22px;
      }
      #tt-avatar-modal .tile.remove {
        flex-direction: column; gap: 4px;
        font-size: 11px; color: #8b949e; font-weight: 600;
        border-style: dashed;
      }
      #tt-avatar-modal .tile.remove::before {
        content: '↩︎'; font-size: 22px;
      }
      #tt-avatar-modal .footer {
        padding: 14px 22px; border-top: 1px solid #262a31;
        display: flex; justify-content: space-between; align-items: center;
        gap: 10px;
      }
      #tt-avatar-modal .status {
        font-size: 12px; color: #8b949e; flex: 1;
      }
      #tt-avatar-modal .status.ok  { color: #3fb950; }
      #tt-avatar-modal .status.err { color: #f85149; }
      #tt-avatar-modal .btn {
        padding: 9px 18px; border-radius: 8px;
        font: 600 13px system-ui; cursor: pointer;
        border: 1px solid #30363d; background: transparent;
        color: #e6edf3; transition: filter .12s;
      }
      #tt-avatar-modal .btn:hover { filter: brightness(1.15); }
      #tt-avatar-modal .btn.primary {
        background: #238636; border-color: #2ea043; color: #fff;
      }
      #tt-avatar-modal .btn:disabled {
        opacity: .5; cursor: not-allowed;
      }
      /* Avatar shown inside the account page */
      #tt-profile-avatar-wrap {
        position: relative; width: 64px; height: 64px; flex: 0 0 64px;
      }
      #tt-profile-avatar-wrap .avatar-change-hint {
        position: absolute; inset: auto 0 -6px 0;
        text-align: center;
        font: 700 9px system-ui;
        background: #238636; color: #fff;
        padding: 2px 0; border-radius: 0 0 4px 4px;
        opacity: 0; transition: opacity .15s;
        pointer-events: none;
      }
      #tt-profile-avatar-wrap:hover .avatar-change-hint { opacity: 1; }
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
    modalEl.innerHTML = `
      <div class="box">
        <div class="head">
          <h2>🎨 Choose your avatar</h2>
          <button id="tt-avatar-close">✕</button>
        </div>
        <div class="body">
          <div class="section-title">Memes</div>
          <div class="grid" id="tt-avatar-defaults"></div>
          <div class="section-title">Emoji</div>
          <div class="grid" id="tt-avatar-emoji"></div>
        </div>
        <div class="footer">
          <div class="status" id="tt-avatar-status"></div>
          <button class="btn" id="tt-avatar-cancel">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(modalEl);

    /* Fill defaults */
    const defGrid = modalEl.querySelector('#tt-avatar-defaults');
    DEFAULTS.forEach(url => {
      const t = document.createElement('button');
      t.className = 'tile';
      t.dataset.url = url;
      t.innerHTML = `<img src="${url}" alt="" loading="lazy">`;
      t.onclick = () => pickAndSave(url);
      defGrid.appendChild(t);
    });

    /* Upload tile */
    const up = document.createElement('button');
    up.className = 'tile upload';
    up.textContent = 'Upload';
    up.title = 'Upload your own image';
    up.onclick = onUpload;
    defGrid.appendChild(up);

    /* Remove tile */
    const rm = document.createElement('button');
    rm.className = 'tile remove';
    rm.textContent = 'Reset';
    rm.title = 'Go back to default (initial letter)';
    rm.onclick = () => pickAndSave(null);
    defGrid.appendChild(rm);

    /* Fill emoji */
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

    /* Wire close */
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
    const cur = currentURL();
    modalEl.querySelectorAll('.tile').forEach(t => {
      t.classList.toggle('active', t.dataset.url && t.dataset.url === cur);
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
      await saveAvatar(url);
      setStatus(url ? '✅ Avatar updated' : '↩︎ Reset to default', 'ok');
      refreshModal();
      setTimeout(close, 600);
    } catch (e) {
      warn('Save failed:', e);
      setStatus('❌ ' + (e.message || String(e)), 'err');
    }
  }

  async function onUpload() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml';
    inp.onchange = async () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      if (f.size > 3 * 1024 * 1024) {
        setStatus('❌ Image too big (max 3 MB)', 'err');
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
     CHROME BAR INTEGRATION
     Replaces the 👤 emoji in the top-right account button
     with the user's actual avatar whenever one is set.
     ═══════════════════════════════════════════════════════════ */
  function refreshChromeAvatar() {
    const chrome = document.getElementById('tt-chrome');
    if (!chrome) return;
    const user = global.Auth && global.Auth.current && global.Auth.current();
    if (!user) return;

    const btns = chrome.querySelectorAll('button');
    for (const b of btns) {
      const firstSpan = b.querySelector('span:first-child');
      if (!firstSpan) continue;
      const t = (firstSpan.textContent || '').trim();
      /* Match either the signed-out or signed-in account button */
      if (t !== '👤' && t !== '👥') continue;

      if (user.photoURL) {
        /* Replace emoji with avatar image (once) */
        if (firstSpan.dataset.ttAvatarSrc !== user.photoURL) {
          firstSpan.innerHTML =
            `<img src="${user.photoURL}" alt="" ` +
            `style="width:20px;height:20px;border-radius:50%;` +
            `object-fit:cover;display:block;">`;
          firstSpan.dataset.ttAvatarSrc = user.photoURL;
        }
      } else if (firstSpan.dataset.ttAvatarSrc) {
        /* User removed their avatar — restore the emoji */
        firstSpan.textContent = '👤';
        delete firstSpan.dataset.ttAvatarSrc;
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════
     ACCOUNT PAGE INTEGRATION
     Detects the profile card on account.html and adds a
     "Change Avatar" button, plus makes the avatar clickable.
     ═══════════════════════════════════════════════════════════ */
  function attachToAccountPage() {
    const profileInfo = document.getElementById('profile-info');
    if (!profileInfo) return;

    /* 1. Add a Change Avatar button next to "Attach Phone" if it exists */
    const attachBtn = document.getElementById('btn-attach-phone');
    if (attachBtn && !document.getElementById('btn-change-avatar')) {
      const b = document.createElement('button');
      b.id = 'btn-change-avatar';
      b.className = 'btn-green';
      b.textContent = '🎨 Change Avatar';
      b.onclick = open;
      attachBtn.parentNode.insertBefore(b, attachBtn);
    }

    /* 2. Make the avatar clickable */
    const avatarEl = profileInfo.querySelector('.profile-avatar');
    if (avatarEl && !avatarEl.dataset.ttClickable) {
      avatarEl.dataset.ttClickable = '1';
      avatarEl.style.cursor = 'pointer';
      avatarEl.title = 'Click to change avatar';
      /* Wrap in a positioned container so we can show a hint */
      const wrap = document.createElement('div');
      wrap.id = 'tt-profile-avatar-wrap';
      avatarEl.parentNode.insertBefore(wrap, avatarEl);
      wrap.appendChild(avatarEl);
      const hint = document.createElement('div');
      hint.className = 'avatar-change-hint';
      hint.textContent = 'EDIT';
      wrap.appendChild(hint);
      wrap.addEventListener('click', open);
    }

    /* 3. Re-render the profile avatar whenever it changes */
    const repaintAvatar = () => {
      const user = global.Auth && global.Auth.current && global.Auth.current();
      if (!user) return;
      const avatarEl = profileInfo.querySelector('.profile-avatar');
      if (!avatarEl) return;
      const initial = ((user.displayName || user.email || '?')[0] || '?').toUpperCase();
      if (user.photoURL) {
        avatarEl.innerHTML = `<img src="${user.photoURL}" alt="" ` +
                             `style="width:100%;height:100%;object-fit:cover;">`;
      } else if (!avatarEl.querySelector('img') ||
                 avatarEl.querySelector('img').src !== user.photoURL) {
        avatarEl.textContent = initial;
      }
    };

    global.addEventListener('tt-avatar-change', repaintAvatar);
    /* Also fire once in case page already had one */
    setTimeout(repaintAvatar, 400);
  }

  /* ═══════════════════════════════════════════════════════════
     BOOT
     ═══════════════════════════════════════════════════════════ */
  function boot() {
    attachToAccountPage();
    refreshChromeAvatar();

    /* Keep the chrome bar avatar in sync */
    setInterval(refreshChromeAvatar, 1200);

    /* React to auth changes */
    if (global.Auth && global.Auth.onChange) {
      global.Auth.onChange(() => {
        setTimeout(() => {
          refreshChromeAvatar();
          attachToAccountPage();
        }, 200);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* ═══════════════════════════════════════════════════════════
     PUBLIC
     ═══════════════════════════════════════════════════════════ */
  global.AvatarPicker = {
    open,
    close,
    current: currentURL,
    set: saveAvatar,
    defaults: DEFAULTS.slice(),
    emojis: EMOJI.slice()
  };

  log('Profile picture picker ready — call AvatarPicker.open()');
})(window);
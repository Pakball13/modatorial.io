# Modatorial.io — Modding Guide

> Version 3.0 · Game r25 · Client v1.11.0

Everything you need to build, ship, and debug mods for the Modatorial.io client — plus documentation for every bundled client feature, the mod loader's public API, and the `.ttmod` file format.

---

## Table of Contents

1. [What this is](#1-what-this-is)
2. [Folder layout](#2-folder-layout)
3. [Script load order](#3-script-load-order)
4. [Your first mod](#4-your-first-mod)
5. [Mod anatomy](#5-mod-anatomy)
   - [`mod.json`](#51-modjson)
   - [`main.js`](#52-mainjs)
   - [Assets & subfolders](#53-assets--subfolders)
6. [The mod API](#6-the-mod-api)
   - [Lifecycle & metadata](#61-lifecycle--metadata)
   - [Events](#62-events)
   - [Hooks](#63-hooks)
   - [UI helpers](#64-ui-helpers)
   - [Game access](#65-game-access)
   - [File access](#66-file-access)
   - [Deep internals (`__TT__`)](#67-deep-internals-__tt__)
7. [The `.ttmod` format](#7-the-ttmod-format)
8. [Client modules (bundled, not mods)](#8-client-modules)
   - [`client-features.js`](#81-client-featuresjs)
   - [`buildings.js`](#82-buildingsjs)
   - [`hide-clutter.js`](#83-hide-clutterjs)
   - [`avatars.js`](#84-avatarsjs)
   - [`auth.js`](#85-authjs)
9. [Bundled mods](#9-bundled-mods)
10. [Secrets & hidden features](#10-secrets--hidden-features)
11. [Multiplayer & offline mode](#11-multiplayer--offline-mode)
12. [Debugging](#12-debugging)
13. [Common recipes](#13-common-recipes)
14. [Appendix A — Full API reference](#appendix-a--full-api-reference)
15. [Appendix B — Full hook reference](#appendix-b--full-hook-reference)
16. [Appendix C — Troubleshooting](#appendix-c--troubleshooting)

---

## 1. What this is

Modatorial.io is a **client-side modding layer** for [territorial.io](https://territorial.io). It runs before the game's main script, wraps the browser APIs the game uses (`WebSocket`, `requestAnimationFrame`, `CanvasRenderingContext2D`, DOM input events), and exposes a stable API (`window.TerritorialMods`) that mods and client modules share.

Nothing in the game's minified code is edited. If you delete the `mods/` folder and the loader scripts, territorial.io behaves exactly as shipped.

---

## 2. Folder layout

```text
your-territorial-folder/
├── index.html ← splash / main menu
├── game.html ← main game (client + game script)
├── account.html
├── login.html
├── signup.html
├── mod-store.html
├── modding-guide.html
├── MODDING.md ← this file
├── README.md
├── CHANGELOG.md
│
├── firebase-config.js ← your Firebase project config
├── auth.js ← Firebase auth wrapper (window.Auth)
├── ttmod-translator.js ← parses .ttmod files
├── ttmod-maker.js ← visual .ttmod editor
├── modLoader.js ← THE core loader
├── client-features.js ← chrome bar, themes, achievements
├── account.js ← match stats tracker
├── appearance.js ← theme + layout picker modal
├── sounds.js ← synthesized audio
├── promo-codes.js
├── moddables.js ← in-game currency
├── mod-store.js
├── store-plus.js
├── version-hider.js
├── avatars.js ← profile picture picker
├── buildings.js ← factories / ports / cities + railways
├── hide-clutter.js ← removes stray menu UI
├── indev-mode.js ← secret "raw theme" toggle
│
├── css/
│   ├── themes.css
│   ├── client.css
│   ├── splash.css
│   └── raw.css ← raw HTML theme
│
├── assets/
│   └── icons/
│       ├── swords.svg
│       ├── key.svg
│       ├── menu.svg
│       ├── mods.svg
│       ├── store.svg
│       ├── appearance.svg
│       └── user.svg
│
└── mods/
    ├── manifest.json ← list of enabled folder mods
    ├── example-mod/
    ├── zoom-indicator/
    ├── grid-overlay/
    ├── damage-popups/
    ├── cinematic-mode/
    ├── mega-bots/
    ├── panorama-bg/
    └── ttmods/
        ├── manifest.json ← list of .ttmod files
        └── *.ttmod ← single-file bundles
```

---

## 3. Script load order

**Order matters.** The loader must run *before* `game.js`, and any client module that uses `window.TerritorialMods` must run *after* the loader.

The bottom of `game.html` should look exactly like this:

```html
<!-- ── Firebase FIRST ── -->
<script src="firebase-config.js"></script>
<script src="auth.js" defer></script>

<!-- ── Game utilities ── -->
<script src="ttmod-translator.js"></script>
<script src="ttmod-maker.js"></script>

<!-- ── THE LOADER — must come before anything that uses its API ── -->
<script src="modLoader.js"></script>

<!-- ── Client modules that consume the loader API ── -->
<script src="sounds.js"></script>
<script src="moddables.js"></script>
<script src="promo-codes.js"></script>
<script src="mod-store.js"></script>
<script src="client-features.js"></script>
<script src="account.js"></script>
<script src="appearance.js"></script>
<script src="avatars.js"></script>
<script src="buildings.js"></script>
<script src="hide-clutter.js"></script>
<script src="indev-mode.js"></script>
<script src="version-hider.js"></script>

<!-- ── The game itself, last ── -->
<script src="game.js"></script>
```

Any module placed before `modLoader.js` will log `[Module] TerritorialMods not loaded` and refuse to run.

---

## 4. Your first mod

Create `mods/hello-world/mod.json`:

```json
{
  "name": "Hello World",
  "version": "1.0.0",
  "author": "You",
  "description": "Shows a toast when the game loads.",
  "main": "main.js"
}
```

And `mods/hello-world/main.js`:

```js
api.showToast('👋 Hello from my first mod!');
api.addHook('keyDown', e => {
  if (e.code === 'KeyH') {
    api.showToast('H key pressed');
  }
});
api.log('Hello World ready');
```

Add `"hello-world"` to `mods/manifest.json`:

```json
{ "mods": ["hello-world"] }
```

Hard reload `game.html`. Console shows:

```text
[ModLoader] ✅ Loaded: Hello World (hello-world) v1.0.0
```

And a toast appears.

---

## 5. Mod anatomy

### 5.1 `mod.json`

Every folder-based mod needs this file. Fields:

| Field | Type | Required | Notes |
| :--- | :--- | :--- | :--- |
| `name` | string | ✅ | Display name, ≤ 40 chars |
| `version` | string | ✅ | Semver (`1.0.0`) |
| `author` | string | ✅ | Your handle |
| `description` | string | ❌ | Short blurb for the F10 menu |
| `icon` | string | ❌ | Path inside the mod folder (`icon.png`) |
| `main` | string \| false | ❌ | JS entry point (default `main.js`) |
| `gameVersion` | number | ❌ | Game r-version (25) |
| `enabled` | boolean | ❌ | Set `false` to ship disabled |
| `settings` | array | ❌ | Auto-generated settings schema (see below) |

#### Settings schema
Declare this to get a settings modal in the F10 menu:

```json
{
  "settings": [
    {
      "id": "speed",
      "label": "Train speed",
      "type": "slider",
      "min": 0.2, "max": 2, "step": 0.1,
      "default": 0.5
    },
    {
      "id": "color",
      "label": "Line color",
      "type": "color",
      "default": "#00F5D4"
    },
    {
      "id": "enabled",
      "label": "Enable feature",
      "type": "toggle",
      "default": true
    },
    {
      "id": "mode",
      "label": "Render mode",
      "type": "select",
      "options": ["Fast", "Quality"],
      "default": "Fast"
    },
    {
      "id": "label",
      "label": "Custom text",
      "type": "text",
      "default": "Hello"
    },
    {
      "id": "reset",
      "label": "Reset to default",
      "type": "button",
      "buttonLabel": "Reset now"
    }
  ]
}
```

Read a setting from code:

```js
const speed = api.getSetting('my-mod-id', 'speed');
```

Listen for changes:

```js
api.on('modSettingsChanged', (modId, settingId, value) => {
  if (modId === 'my-mod-id' && settingId === 'speed') {
    // handle change
  }
});
```

Button clicks fire a different event:

```js
api.on('modSettingsAction', (modId, settingId, meta) => {
  if (modId === 'my-mod-id' && settingId === 'reset') {
    // do something
  }
});
```

### 5.2 `main.js`

The loader wraps this file in a function:

```js
function (api, mod) {
  "use strict";
  // ← your code
}
```

Two variables are injected:
- `api` — the shared `window.TerritorialMods` object
- `mod` — this mod's metadata (`mod.id`, `mod.name`, `mod.basePath`, `mod.settings`)

You can return an object at the end — it becomes `mod.exports` and other mods can read it.

### 5.3 Assets & subfolders

```text
mods/my-mod/
├── mod.json
├── main.js
├── icon.png
├── assets/
│   ├── sounds/
│   │   └── ding.ogg
│   └── sprites/
│       └── crosshair.svg
└── locales/
    └── en.json
```

Load assets via `api.readModFile`:

```js
const sprite = await api.readModFile(mod, 'assets/sprites/crosshair.svg', 'image');
const sound  = await api.readModFile(mod, 'assets/sounds/ding.ogg', 'blob');
const strs   = await api.readModFile(mod, 'locales/en.json', 'json');
```

The second argument is relative to the mod folder. `as` can be `'text'` (default), `'json'`, `'blob'`, or `'image'`.

---

## 6. The mod API

### 6.1 Lifecycle & metadata

```js
api.version             // "1.11.0"
api.gameVersion         // 25
api.mods                // Map<id, meta>
api.offlineMode         // boolean — blocks WS to territorial.io
```

### 6.2 Events

```js
const off = api.on('modLoaded', meta => { /* ... */ });
off();                         // unsubscribe
api.off('modLoaded', fn);      // same thing
api.emit('my-event', 1, 2, 3); // fire a custom event
```

Loader-emitted events:

| Event | Payload | When |
| :--- | :--- | :--- |
| `modLoaded` | meta | Each mod finishes loading |
| `modsLoaded` | meta[] | All mods loaded |
| `ready` | meta[] | Loader boot complete |
| `modToggled` | id, disabled | Mod enabled/disabled in the F10 menu |
| `screenChanged` | `'menu' \| 'game'` | Menu ↔ match transitions |
| `modSettingsChanged` | modId, settingId, value, meta | A setting changed |
| `modSettingsAction` | modId, settingId, meta | A settings "button" was clicked |
| `keydown` / `keyup` | KeyboardEvent | Raw DOM events (all forwarded) |
| `mousedown` / `mouseup` / `mousemove` | MouseEvent | Raw DOM events |
| `wheel` | WheelEvent | Raw DOM events |
| `touchstart` / `touchend` | TouchEvent | Raw DOM events |

### 6.3 Hooks

Hooks are called by the game, not by you. Register with `api.addHook(name, fn)`.

| Hook | Arguments | When |
| :--- | :--- | :--- |
| `preUpdate` | t | Before each requestAnimationFrame tick |
| `postUpdate` | t | After each tick |
| `preRender` | ctx | Before every `ctx.drawImage()` call |
| `postRender` | ctx | After every `ctx.drawImage()` call |
| `netSend` | data, ws, url | Before the game sends a WS message |
| `netRecv` | data, ws, url | After a WS message arrives |
| `keyDown` / `keyUp` | KeyboardEvent | Any key |
| `mouseDown` / `mouseUp` / `mouseMove` | MouseEvent | Mouse |
| `wheel` | WheelEvent | Scroll |
| `touchStart` / `touchEnd` | TouchEvent | Touch |

Hooks are wrapped in try/catch — a throwing mod won't crash the game.

*Tip:* the `preRender` hook fires many times per frame (once per `drawImage`). To run something once per frame, set a flag in `preUpdate`:

```js
let ranThisFrame = false;
api.addHook('preUpdate', () => { ranThisFrame = false; });
api.addHook('preRender', ctx => {
  if (ranThisFrame) return;
  ranThisFrame = true;
  // one-shot per frame
});
```

### 6.4 UI helpers

```js
api.showToast('Saved!', 3000);

// Top-right floating button, returns the DOM node
const btn = api.addButton('⚔️ Attack', () => doAttack());

// Fixed-position element added to the top-right stack
api.addToTopRight(myElement);

// Get the container for stacking your own UI
const stack = api.getTopRightStack('my-slot');
```

### 6.5 Game access

```js
api.getGameCanvas()      // <canvas id="canvasA">
api.getGameContext()     // CanvasRenderingContext2D
api.getGameSize()        // { width, height }
api.isInLobby()          // true if the menu is visible
api.isVisible(el)        // is element actually rendered?
```

### 6.6 File access

Covered in §5.3.

### 6.7 Deep internals (`__TT__`)

The game exposes a read-mostly view of its own closure under `window.__TT__`. `api.getGame()` returns the same object.

| Property | What it is |
| :--- | :--- |
| `TT.aE` | Game state: `fJ` (your player id), `fW` (total slots), `ku` (human count), `a2G` (0 = menu, 1 = match, 2 = ended), `a2L` (match outcome: 1=win, 0=loss, 2=stalemate) |
| `TT.ah` | Player arrays: `a0j[i]` (name), `a2w[i]` (tag), `nU[i]` (alive), `hN[i]` (tiles), `hb[i]` (gold), `a5a[i]` (0 = human, 2 = bot), `jS`/`jT`/`jU`/`jV[i]` (bounding box) |
| `TT.ad` | Map data — `a0F(player, byteOffset)` checks ownership; `fQ(byteOffset)` checks water; `fR(byteOffset)` returns owner id |
| `TT.bV` | Canvas sizing: `fk` (width in tiles), `fl` (height) |
| `TT.aT` | Camera: `a0L()` returns left offset, `a0M()` returns top offset |
| `TT.aj` | Name generator. Override `aj.a8()` to rename bots |
| `TT.bb` | Store badge object |
| `TT.aU` | Bottom timeline bars |
| `TT.aP` | Team contest countdown |
| `TT.bm` | Buffer / settings object |

*Warning:* game updates rename internals. Wrap any access in try/catch and feature-detect.

---

## 7. The `.ttmod` format

A `.ttmod` file is a plain UTF-8 text file with three tags:

```text
<ttmod>{
  "id": "my-mod",
  "name": "My Mod",
  "version": "1.0.0",
  "author": "You",
  "description": "What it does",
  "gameVersion": 25,
  "config": {
    "userName": "CoolPlayer",
    "userColor": "#00F5D4",
    "theme": { "accent": "#00F5D4", "background": "#0F172A" },
    "layout": "sidebar",
    "hideMultiplayer": true,
    "hideVersion": true,
    "showFps": true,
    "showClock": true,
    "panorama": "panorama.png",
    "watermark": "Made by You",
    "watermarkPosition": "bottom-right",
    "buttons": [
      { "label": "Discord", "url": "https://discord.gg/…" },
      { "label": "Hello", "toast": "Hi!" }
    ],
    "flags": ["🇵🇰", "🔥"],
    "confirmExit": true,
    "customCss": "body { color: red; }"
  },
  "assets": {
    "panorama.png": "data:image/png;base64,...",
    "icon.png": "data:image/png;base64,..."
  }
}</ttmod>
<script>
// Optional raw JavaScript with full api.* access
api.log('Custom script running');
</script>
```

The translator parses the JSON config and emits equivalent calls (`api.setTheme`, `api.addButton`, ...). The `<script>` block runs as-is.

If a `.ttmod` has only a `<script>` block and no config, the script runs directly.

Load a `.ttmod` at runtime:

```js
await TerritorialMods.importTtmodFile(file);   // File object
await TerritorialMods.importTtmodBundle(bundle); // or a JS object
```

Export the currently-loaded mod as a `.ttmod`:

```js
await TerritorialMods.exportModAsTtmod('my-mod-id');
```

---

## 8. Client modules

These are not mods. They live in the project root, load via `<script>` in `game.html`, and run as part of the client.

### 8.1 `client-features.js`

Owns the chrome bar and everything inside it.

Public API (via `window.ClientFeatures`):

```js
ClientFeatures.VERSION
ClientFeatures.Theme
ClientFeatures.Audio
ClientFeatures.Achievements
ClientFeatures.Speedrun
ClientFeatures.Screenshot
ClientFeatures.Stats
ClientFeatures.Accounts
ClientFeatures.Sidebar
ClientFeatures.Toast
ClientFeatures.openAccount()
ClientFeatures.openProfileEditor()
```

Chrome bar button order (left → right):  
⬢ Modatorial · layout toggle · theme · Store · Mods · 🔌 Offline / 🌐 Online toggle · 🔊 mute · 👤 account · ✕ hide.

Press `Ctrl+Shift+B` to restore a hidden chrome bar.

### 8.2 `buildings.js`

Adds three placeable buildings — 🏭 Factory, ⚓ Port, 🏙️ City — drawn as circular buttons under your name badge when you're in a match. Every 2+ buildings auto-connect by rail. A 🚂 train tours the loop and drops passive income at every stop.

#### Controls
- Click a building circle → enter placement mode
- Click on your own territory → place
- Right-click or Esc → cancel

#### Cost (deducted from your in-game gold):

| Building | Cost | Income |
| :--- | :--- | :--- |
| 🏭 Factory | 300 | +3 |
| ⚓ Port | 600 | +8 (needs water nearby) |
| 🏙️ City | 450 | +5 |

Income per train stop = `floor(totalBuildingValue / 2)`. Place 3 factories, 1 port, 2 cities → `floor((9+8+10)/2) = 13` per stop.

Public API (via `window.Buildings`):

```js
Buildings.settings          // mutable settings object
Buildings.list              // array of placed buildings
Buildings.rail              // array of buildings in tour order
Buildings.setMode('factory') // force placement mode
Buildings.clear()           // remove all buildings
Buildings.enable()          // on
Buildings.disable()         // off
Buildings.setSetting('trainSpeed', 1.5)
```

Configure via localStorage key `tt-buildings-settings`:

```json
{
  "freePlacement": false,
  "factoryCost": 300,
  "portCost": 600,
  "cityCost": 450,
  "trainSpeed": 0.5,
  "enabled": true
}
```

### 8.3 `hide-clutter.js`

Removes three pieces of the game's menu UI:
- Google Play / App Store badges (top-left)
- Bottom timeline bars
- Team contest countdown (rotated, right side)

It works by freezing each object's `.wr()` render method with `Object.defineProperty(..., { writable: false })`, so re-assignment by the game silently fails.

Public API (via `window.HideClutter`):

```js
HideClutter.apply()     // re-run the freeze (idempotent)
HideClutter.status()    // returns { storeBadges, timeline, countdown }
HideClutter.restore()   // reloads the page without the freeze
```

### 8.4 `avatars.js`

Profile picture picker. Opens as a modal from the account card avatar, chrome bar account button, or via `Avatars.open()`.

Public API (via `window.Avatars`):

```js
Avatars.open()              // show the picker
Avatars.close()
Avatars.get()               // current user's photoURL
Avatars.set(urlOrNull)      // save a new avatar
Avatars.defaults()          // array of bundled avatar paths
Avatars.emojis()            // array of emoji characters
Avatars.html(user, opts)    // returns avatar HTML
Avatars.wireClicks(root)    // makes [data-tt-avatar-open] clickable
```

Saves to Firestore at `users/{uid}.photoURL`. Emits window event `tt-avatar-change` when it changes.

The picker accepts three kinds of avatars:
- Bundled (paths in `DEFAULT_AVATARS` array at the top of `avatars.js`)
- Emoji (rendered as inline SVG data URLs)
- Uploaded (downscaled to 256×256 JPEG, saved as a data URL)

### 8.5 `auth.js`

Firebase Auth wrapper. Exposes `window.Auth`.

```js
Auth.ready                   // true once Firebase is attached
Auth.current()               // { uid, email, username, displayName, photoURL, phone, ... } | null
Auth.onChange(fn)            // subscribe to auth state changes
Auth.login(email, pw)
Auth.signup(email, pw, username, displayName)
Auth.logout()
Auth.resetPassword(email)
Auth.profile(uid)
Auth.profileByUsername(username)
Auth.setPhone(phone)         // writes to /users/{uid}.phone
Auth.updateProfile(fields)   // writes to /users/{uid} with { merge: true }
Auth.openUI()                // shows the modal
```

*Fix note (v2.0.4):* `updateProfile()` uses `set(patch, { merge: true })` instead of `update(patch)`, so it auto-creates the `/users/{uid}` document if it's missing. This fixes the `No document to update` error when you try to save an avatar or phone number on a freshly-signed-in account.

---

## 9. Bundled mods

These mods ship in the project's `mods/` folder:

| ID | What it does |
| :--- | :--- |
| `example-mod` | Minimal demo — logs to console |
| `zoom-indicator` | Bottom-left chip: zoom %, camera coords |
| `grid-overlay` | Draws a tactical grid over the map (configurable) |
| `damage-popups` | Floating -N numbers when your attacks land |
| `cinematic-mode` | Press C → hide UI, letterbox bars, record-ready |
| `mega-bots` | Raise the match player count to 1024 (experimental) |
| `panorama-bg` | Loads a custom panorama image on the menu |
| `simple-name-bots` | Renames bots to bob / john / ur mom / … |
| `ttmods/` | Single-file `.ttmod` bundles loaded at boot |

Enable/disable any of them from the F10 menu (⚙️ opens per-mod settings, if it has any).

---

## 10. Secrets & hidden features

### Indev mode (raw HTML theme)
Long-press the extra ⭐ in the avatar picker for ~700 ms. The theme switches to Raw HTML — the entire client is restyled as unstyled HTML (Times New Roman, blue links, default buttons).

Exit by clicking the small INDEV badge in the top-left corner 5 times quickly, or run:

```js
Indev.disable()
```

### Offline / Online toggle
The chrome bar has a 🔌 Offline / 🌐 Online button that controls whether connections to `wss://territorial.io/…` are blocked. Default is Offline (blocked) so local dev doesn't spam the console.

```js
TerritorialMods.setOfflineMode(false)   // allow connections
TerritorialMods.getOfflineMode()        // read current
```

### Skip-auth dev bypass
On localhost or 127.0.0.1, add `?skipauth` to any page URL to bypass the Firebase auth gate:

```text
http://127.0.0.1:5500/game.html?skipauth
```

---

## 11. Multiplayer & offline mode

The loader blocks all WebSocket connections to territorial.io by default so your local dev environment doesn't spam failed handshakes.

To enable real multiplayer:
1. Click 🔌 Offline in the chrome bar → it flips to 🌐 Online
2. Reload the page
3. Click Multiplayer on the main menu

Console will show `Connection to Server 0` and the game connects like the official client.

#### Caveats:
- Cloudflare Turnstile can't load from a non-official origin, so some lobbies may kick you. Others don't.
- Real ban risk if you run automation mods. Disable anything that sends packets automatically (F10 → toggle off) before playing online.
- Visual mods (buildings, damage popups, grid, zoom indicator) only affect your local view and are safe.

**Persistence:** offline mode is stored in localStorage under `tt-offline-mode`. Set once and it survives reloads.

---

## 12. Debugging

Turn on verbose logging:

```js
TerritorialMods.debug = true;
```

List every loaded mod:

```js
console.table([...TerritorialMods.mods.values()].map(m => ({
  id: m.id, status: m.status, v: m.version
})));
```

Force a theme:

```js
TerritorialMods.setTheme('modatorial')
```

Force a layout:

```js
TerritorialMods.setLayout('sidebar')
```

Inspect the game internals:

```js
const TT = TerritorialMods.getGame();
console.log('state:', TT.aE);
console.log('players:', TT.ah);
console.log('map size:', TT.bV.fk, '×', TT.bV.fl);
```

Trigger a settings change manually (useful for testing):

```js
TerritorialMods.setSetting('my-mod-id', 'speed', 1.5);
```

Check offline mode:

```js
console.log({
  offline: TerritorialMods.getOfflineMode(),
  hosts:   TerritorialMods.blockedHosts
});
```

Check what hide-clutter froze:

```js
HideClutter.status()
```

Check what buildings are placed:

```js
Buildings.list
Buildings.rail
```

---

## 13. Common recipes

### Rename all bots

```js
const NAMES = ['bob', 'john', 'ur mom', 'zack', 'bobir'];
function tryPatch() {
  const TT = window.__TT__;
  if (!TT?.aj || TT.aj.__patched) return !!TT?.aj?.__patched;
  const orig = TT.aj.a8.bind(TT.aj);
  TT.aj.a8 = function () {
    orig();
    const { ah, aE } = TT;
    if (!ah || !aE) return;
    for (let i = aE.ku; i < aE.fW; i++) {
      if (ah.nU[i] === 0) continue;
      const n = NAMES[i % NAMES.length];
      ah.a0j[i] = n;
      ah.a2w[i] = n;
    }
  };
  TT.aj.__patched = true;
  return true;
}
if (!tryPatch()) {
  const iv = setInterval(() => { if (tryPatch()) clearInterval(iv); }, 100);
}
```

### Draw a HUD in the corner

```js
let fps = 0, frames = 0, last = performance.now();
api.addHook('postUpdate', () => {
  frames++;
  const now = performance.now();
  if (now - last >= 1000) { fps = frames; frames = 0; last = now; }
});
api.addHook('postRender', ctx => {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = 'bold 14px system-ui';
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(8, 8, 90, 26);
  ctx.fillStyle = '#3fb950';
  ctx.fillText(`${fps} FPS`, 16, 26);
  ctx.restore();
});
```

### Read attack packets (without modifying them)

```js
api.addHook('netSend', data => {
  const bytes = data instanceof ArrayBuffer
    ? new Uint8Array(data)
    : data.buffer ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    : data;
  if ((bytes[0] & 0xF8) === 0x88) {
    const amount = ((bytes[0] & 0x07) << 7) | ((bytes[1] >> 1) & 0x7F);
    console.log('Attack for', amount);
  }
});
```

### Configurable hotkey

```js
api.addHook('keyDown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.code === 'KeyG') api.showToast('GG!');
});
```

---

## Appendix A — Full API reference

| Method | Returns | Description |
| :--- | :--- | :--- |
| `api.on(evt, fn)` | unsubscribe fn | Subscribe to event |
| `api.off(evt, fn)` | void | Unsubscribe |
| `api.emit(evt, ...args)` | void | Fire custom event |
| `api.addHook(name, fn)` | void | Register game hook |
| `api.showToast(msg, ms)` | void | Bottom-center toast |
| `api.addButton(text, cb)` | HTMLButtonElement | Top-right floating button |
| `api.addToTopRight(el)` | el | Add DOM element to top-right stack |
| `api.getTopRightStack(slot)` | HTMLElement | The stacking container |
| `api.getGame()` | Object | `window.__TT__` |
| `api.getGameCanvas()` | HTMLCanvasElement | |
| `api.getGameContext()` | Canvas2D | |
| `api.getGameSize()` | `{ width, height }` | |
| `api.isInLobby()` | boolean | |
| `api.isVisible(el)` | boolean | |
| `api.readModFile(mod, path, as)` | Promise | Load a file from a mod |
| `api.isModDisabled(id)` | boolean | |
| `api.setModDisabled(id, on)` | boolean | |
| `api.toggleMod(id)` | boolean | |
| `api.disableAllMods()` | void | |
| `api.enableAllMods()` | void | |
| `api.resetModState()` | void | (reloads) |
| `api.reloadPage()` | void | |
| `api.setOfflineMode(on)` | boolean | Block / allow territorial.io WS |
| `api.getOfflineMode()` | boolean | |
| `api.setSidebarCollapsed(on)` | boolean | |
| `api.toggleSidebar()` | boolean | |
| `api.getSidebarCollapsed()` | boolean | |
| `api.setTheme(name)` | name | |
| `api.getTheme()` | string | |
| `api.getThemes()` | array | |
| `api.openSettings(id)` | void | Opens mod settings modal |
| `api.getSetting(modId, k)` | any | |
| `api.setSetting(modId, k, v)` | boolean | |
| `api.importTtmodFile(file, silent)` | Promise | |
| `api.importTtmodBundle(bundle)` | Promise | |
| `api.exportTtmodBundle(id)` | boolean | |
| `api.exportModAsTtmod(id)` | Promise | |
| `api.setLayout(mode)` | boolean | `sidebar` \| `grid` \| `circles` |
| `api.getLayout()` | string | |
| `api.setChrome(on)` | boolean | |
| `api.setHideMenuButtons(on)` | boolean | |
| `api.setHideLogo(on)` | boolean | |
| `api.setHideVersion(on)` | boolean | |
| `api.setHideMultiplayer(on)` | boolean | |
| `api.getClient()` | object | All client flags |
| `api.setMenuBackground(fn)` | void | Custom canvas menu bg |

---

## Appendix B — Full hook reference

| Hook | Args | Fires |
| :--- | :--- | :--- |
| `preUpdate` | `t` | Before each rAF tick |
| `postUpdate` | `t` | After each rAF tick |
| `preRender` | `ctx` | Before every drawImage |
| `postRender` | `ctx` | After every drawImage |
| `netSend` | `data, ws, url` | Before `ws.send()` |
| `netRecv` | `data, ws, url` | After a message arrives |
| `keyDown` | `KeyboardEvent` | Any key pressed |
| `keyUp` | `KeyboardEvent` | Any key released |
| `mouseDown` | `MouseEvent` | Mouse button down |
| `mouseUp` | `MouseEvent` | Mouse button up |
| `mouseMove` | `MouseEvent` | Mouse moved |
| `wheel` | `WheelEvent` | Scroll |
| `touchStart` | `TouchEvent` | Touch begin |
| `touchEnd` | `TouchEvent` | Touch end |

---

## Appendix C — Troubleshooting

#### `avatars.js:1 404 (Not Found)`
You have a `<script src="avatars.js">` tag but the file is named differently. Either rename the file or remove the tag.

#### `TerritorialMods not loaded`
A client module is loaded before `modLoader.js`. Re-order the scripts per §3.

#### `No document to update: users/{uid}`
Your Firestore user doc doesn't exist. Update `auth.js` so `updateProfile()` uses `set(patch, { merge: true })` instead of `update(patch)` — that auto-creates the doc.

#### Multiplayer button missing
Two fixes:
1. Make sure `modLoader.js` is v1.11+ (with fixed CLIENT default flags).
2. Clear the hide flag:
```js
localStorage.removeItem('tt-hidemulti');
localStorage.removeItem('tt-hidemenu');
location.reload();
```

#### Green bar below the name input
The color swatch got stolen by the layout engine. Make sure `modLoader.js` is v1.10.3+ (with `cachedColorBtn` and the `ttColorButton` check inside `getMainMenuButtons`).

#### Mod loads but does nothing
Three possibilities:
1. Missing entry in `mods/manifest.json`
2. Syntax error in `main.js` — check DevTools → Console
3. Hook fires in a state that never happens (e.g. `preRender` doesn't run on the main menu)

#### `ttmod: JSON invalid — Unexpected token 'J'`
The `.ttmod` file has the literal text `JSON` inside its `<ttmod>` block instead of a real JSON object. Open the file and fix it, or delete the mod from `mods/ttmods/manifest.json`.

#### Store badges / timeline / contest countdown visible
Run `hide-clutter.js` — it freezes the render methods. If they reappear, check `HideClutter.status()` and paste the result.

#### Buildings buttons don't appear
They only appear during a match (after you spawn in). If they still don't show, open DevTools and check:
```js
const TT = TerritorialMods.getGame();
console.log('match state:', TT.aE.a2G);   // should be 1
console.log('your tile count:', TT.ah.hN[TT.aE.fJ]);
console.log('Buildings loaded:', !!window.Buildings);
```

---

Modatorial.io — maintained by the community. Report bugs or share your mods on the Discord.

🛠️ Modatorial.io Wiki
Welcome to the Modatorial.io wiki. Your one-stop shop for modding territorial.io.

💬 Community
Join us on Discord: discord.gg/5y8bE2hYSY

The Discord has dedicated channels for help, bug reports, mod showcases, and feature requests.

🔗 Quick links
Mod Store — press F8 in-game
Report a bug
Download the latest release
📖 Table of Contents
Click to expand
🎯 What is Modatorial.io?
Modatorial.io is a drop-in modding layer for the browser game territorial.io. It runs entirely in your browser, requires zero modifications to the original game source, and lets you:

🎨 Reskin the UI with themes
🤖 Automate boring stuff (auto-click, bot renaming)
📊 Add HUDs, overlays, and stat trackers
🌐 Intercept and inspect network traffic
🖼️ Draw on the game canvas
🧩 Install community mods with one click from a built-in store
🚀 Publish your own mods for others to enjoy
It works by wrapping the browser APIs the game already uses — WebSocket, requestAnimationFrame, CanvasRenderingContext2D, and DOM input events — and exposing a stable, documented API surface (window.TerritorialMods) plus a read-mostly view of the game's own internals (window.__TT__).

Nothing about the original game is patched or decompiled. If you delete Modatorial.io, territorial.io behaves exactly as it did before.

✨ Features
Client features (chrome bar)
Button	Hotkey	What it does
📦 Store	F8	Opens the community mod store
🔧 Mods	F10	Opens the local mod manager
🎨 Theme	F9	Cycles through 5 built-in themes
📸 Screenshot	F2	Saves a PNG of the canvas
⏱ Speedrun	—	Live timer with PB tracking
🏆 Achievements	—	10 unlockable badges
🔊 Audio	—	Volume slider, mute toggle
👤 Account	—	Login, stats, profile
◀ / ▶	—	Collapse / expand sidebar
✕	—	Hide the whole chrome bar
Modding features
📂 Folder-based mods — drop a folder in mods/ and it works
🧾 .ttmod single-file format — bundle metadata + script + assets into one file
🎣 Twelve lifecycle hooks — netSend, netRecv, preUpdate, postUpdate, preRender, postRender, keyDown, keyUp, mouseDown, mouseUp, mouseMove, wheel
📡 Event pub/sub — modLoaded, modsLoaded, ready, and custom events
🧩 Dependency graph — mods declare requires / conflictsWith
🔢 Semver compatibility — checks minimumClientVersion and compatibleGameVersions
♻️ Automatic cleanup — hook subscriptions, timers, DOM nodes, and event listeners registered through the API are torn down on unload
📝 Scoped logging — api.log() prefixes each line with [mod:id]
🌐 Deep internals — read window.__TT__.ah, .aE, .ad, .aj, bm for player names, game state, map data, and the name generator
🎨 Theme engine — override --accent, --background, --text with CSS variables applied globally
💾 Persistent config — every mod gets its own namespaced localStorage bucket at tt-mod:<id>:*
Store features
🔍 Full-text search
🏷️ Tag filtering
⬇️ One-click install
⬆️ One-click publish (as a .ttmod)
🔒 Author attribution
📊 Download counters
🌐 Backed by Cloud Firestore
📸 Screenshots
Screenshots live in docs/img/.

Store	Mods Manager	Chrome Bar
Store	Mods	Chrome
🚀 Installation
Requirements
A modern desktop browser (Chrome 90+, Edge 90+, Firefox 90+, Safari 15+)
Python 3 (or Node.js) for serving files locally
~5 MB of disk space
Optional: a Firebase project (only if you want to fork the store)
Download
git clone https://github.com/Pakball13/modatorial.io.git
cd modatorial.io
Or download a ZIP release.

Run it locally
The mod loader uses fetch(), which browsers block on file:// URLs. You need a tiny HTTP server:

Python 3

python3 -m http.server 8000
# then open http://localhost:8000/index.html
Node.js

npx serve .
# or
npx http-server . -p 8000
VS Code

Install the Live Server extension → right-click index.html → Open with Live Server.

💡 Pro tip: hard-reload (Ctrl+Shift+R) after installing or removing mods, otherwise the browser may serve cached JSON.

Host it publicly
Because Modatorial.io is 100% static files, any static host works:

GitHub Pages — push to gh-pages branch, enable Pages in repo settings
Netlify — drag the folder onto app.netlify.com/drop
Vercel — vercel --prod after vercel link
Cloudflare Pages — connect the repo, set build output to .
Any VPS — nginx / Caddy / Apache all work
The only requirement: HTTPS (or localhost). Mixed content will break the mod store's Firestore connection.

⚡ Quick Start
Launch the game — open index.html in your browser.
Open the store — press F8 or click 📦 in the chrome bar.
Install a mod — click any card's Install button.
It just works — the mod is applied live, no reload needed.
Manage mods — press F10 to see installed mods, toggle them on/off, or uninstall.
That's it. You've modded territorial.io.

📁 Folder Structure
modatorial.io/
├── index.html              ← game shell (unmodified)
├── modLoader.js            ← the loader (patches browser APIs)
├── version-hider.js        ← optional: hides "DD Mon YYYY [x.y.z]"
├── client-features.js      ← chrome bar, sidebar, achievements, speedrun
├── mod-store.js            ← Firestore-backed store
├── account.js              ← login / profile module
├── sounds.js               ← code-generated audio
├── style.css               ← global styles
├── README.md               ← you are here
├── CHANGELOG.md
├── LICENSE
├── docs/
│   ├── img/                ← screenshots
│   └── modding-guide.pdf   ← printable guide (see modding-guide.html)
├── mods/
│   ├── manifest.json       ← list of locally-installed mods
│   ├── example-mod/
│   │   ├── mod.json
│   │   ├── main.js
│   │   ├── icon.png
│   │   └── assets/
│   │       └── greeting.txt
│   └── simple-name-bots/
│       ├── mod.json
│       └── main.js
└── .gitignore
📦 The Mod Store
Browsing
Press F8. You'll see a grid of cards. Each card shows:

Cover image (or a placeholder if the mod has no icon)
Name
Author
Version
Description
Install / Uninstall button
Search narrows by name + author + description. Tag chips filter by hud, theme, utility, cosmetic, fun, ui, chat, pvp, etc.

Installing
Click Install on any card. The store:

Fetches the .ttmod payload from Firestore
Parses it client-side
Saves it to localStorage under tt-imported-mods
Reloads the mod
The mod stays installed across page reloads.

Uploading your own
Open the store, click ⬆ Upload .ttmod, and select a file. Or publish programmatically:

await ModStore.publish({
  name:        'My Cool Mod',
  author:      'YourName',
  description: 'Does something cool.',
  version:     '1.0.0',
  icon:        '<data-url-or-null>',
  ttmod:       '<full .ttmod file contents as string>',
  tags:        ['hud', 'utility']
});
Rate limits: 10 uploads per hour per browser fingerprint. Don't spam.

🧪 Making Your First Mod
The 30-second mod
Create a folder mods/hello-world/ with two files:

mods/hello-world/mod.json

{
  "name": "Hello World",
  "version": "1.0.0",
  "author": "You",
  "description": "Shows a toast on load.",
  "main": "main.js"
}
mods/hello-world/main.js

api.showToast('Hello, world!');
Add "hello-world" to mods/manifest.json:

{ "mods": ["hello-world"] }
Hard-reload. You should see a toast pop up at the bottom of the screen.

A real mod
Let's build a mod that draws a live kill counter in the top-left corner:

mods/kill-counter/mod.json

{
  "name": "Kill Counter",
  "version": "1.0.0",
  "author": "You",
  "description": "Tracks how many players you've eliminated this match.",
  "icon": "icon.png",
  "main": "main.js",
  "gameVersion": 25,
  "tags": ["hud", "pvp"]
}
mods/kill-counter/main.js

let kills = 0;

// Watch the canvas: whenever a player vanishes and we caused it, count it.
api.addHook('postUpdate', () => {
  const TT = api.getGame();
  if (!TT || !TT.aE) return;
  // TT.aE.fJ is the local player index
  const me = TT.aE.fJ;
  // TT.ah holds per-player stats; TT.ah.a2Z[i] is the kill count for player i
  const ah = TT.ah;
  if (ah && ah.a2Z) {
    kills = ah.a2Z[me] || 0;
  }
});

api.addHook('preRender', ctx => {
  ctx.save();
  ctx.font = 'bold 20px system-ui';
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(12, 12, 130, 34);
  ctx.fillStyle = '#3fb950';
  ctx.fillText(`Kills: ${kills}`, 22, 36);
  ctx.restore();
});
mods/kill-counter/icon.png — any 512×512 image (or omit the field).

Add "kill-counter" to the manifest, hard-reload, and play a match. You'll see a green counter appear in the corner that tracks your kills.

🧬 Mod Anatomy
mod.json
Every mod must have a mod.json (or an equivalent <ttmod> block inside a .ttmod file). The full schema:

{
  // ── Required ─────────────────────────────────────────────
  "name":        "My Mod",              // Display name
  "version":     "1.0.0",                // Semver
  "author":      "YourName",             // Credit line

  // ── Optional but recommended ────────────────────────────
  "description": "Short blurb shown in the store card.",
  "icon":        "icon.png",             // Relative to mod folder
  "main":        "main.js",              // JS entry point
  "gameVersion": 25,                     // territorial.io r-version

  // ── Advanced ────────────────────────────────────────────
  "enabled":         true,               // false to ship a disabled mod
  "minimumClientVersion": "2.0.0",       // semver range
  "compatibleGameVersions": [24, 25, 26],
  "requires":        ["core-hud"],       // hard dependencies
  "optionalDeps":    ["theme-engine"],   // soft dependencies
  "conflictsWith":   ["other-kill-counter"],
  "tags":            ["hud", "pvp"],
  "homepage":        "https://example.com",
  "license":         "MIT",
  "changelog":       "Initial release."
}
Notes on each field:

Field	Type	Notes
name	string	Shown everywhere. 1–40 chars.
version	string	Semver. "1.0.0", "0.3.2", etc.
author	string	Free text. Links to account if logged in.
description	string	≤ 200 chars for clean store cards.
icon	string	Path inside mod folder. Supports .png, .jpg, .webp, .gif, .svg.
main	string	Path to JS. Set false for data-only mods (themes, presets).
gameVersion	number	Matches the rXX value the game prints on load.
enabled	bool	Default true. Ship a disabled mod as a "templates".
minimumClientVersion	string	Loader refuses to run the mod below this.
compatibleGameVersions	number[]	Warns (not blocks) if mismatched.
requires	string[]	Mod IDs. Loaded first; missing = mod skipped.
optionalDeps	string[]	Loaded if present, no error if not.
conflictsWith	string[]	Loader refuses to load the mod if any conflict is enabled.
tags	string[]	Used by store filtering.
homepage	string	URL shown on the mod card.
license	string	SPDX identifier.
changelog	string	Short summary shown in the "What's new" fold.
main.js
The entry point. The loader wraps this file in a function:

function (api, mod) {
  "use strict";
  // ← your code goes here
}
Two variables are injected:

api — the global window.TerritorialMods object (same reference, so all mods share the same API)
mod — this specific mod's metadata, including mod.basePath (the URL prefix for loading assets) and mod.config (your config object from the store, if any)
The function may return an object — that becomes mod.exports and is accessible to other mods that depend on you.

icon.png
Optional but recommended. Square, ≥ 256×256, PNG or WebP. If omitted, the store shows a neutral placeholder. Icons are base64-inlined when you publish a .ttmod.

Other assets
Any file inside the mod folder is accessible via api.readModFile(mod, 'relative/path'). This includes subfolders:

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
Load them like so:

const ding = await api.readModFile(mod, 'assets/sounds/ding.ogg', 'blob');
const sprite = await api.readModFile(mod, 'assets/sprites/crosshair.svg', 'image');
const strings = await api.readModFile(mod, 'locales/en.json', 'json');
🧠 The Mod API
Everything a mod can do goes through the api object. Here's the complete surface.

Lifecycle
api.version           // "2.0.0" — client version
api.gameVersion       // 25 — detected territorial.io r-version
api.mods              // Map<id, meta> of every loaded mod
api.self              // this mod's meta (shorthand for `mod`)
Events
A tiny pub/sub.

const off = api.on('modLoaded', meta => { ... });
off();                          // unsubscribe
api.off('modLoaded', fn);       // equivalent
api.emit('my-event', 1, 2, 3);  // fire custom
Built-in events the loader emits:

Event	Payload	When
modLoaded	meta	Each mod finishes loading
modsLoaded	meta[]	All mods loaded
ready	meta[]	Loader boot complete
keydown	KeyboardEvent	Any key pressed
keyup	KeyboardEvent	Any key released
mousedown	MouseEvent	Mouse button down
mouseup	MouseEvent	Mouse button up
mousemove	MouseEvent	Mouse moved
wheel	WheelEvent	Scroll
touchstart	TouchEvent	Touch begin
touchend	TouchEvent	Touch end
focus	—	Window focused
blur	—	Window blurred
Hooks
Hooks are called by the game, not by you. Register one with api.addHook(name, fn):

api.addHook('preRender', ctx => {
  // ctx is the CanvasRenderingContext2D about to draw a frame
});
Hook	Arguments	When
preUpdate	t (DOMHighResTimeStamp)	Before each requestAnimationFrame callback
postUpdate	t	After each rAF callback
preRender	ctx	Before every ctx.drawImage() call
postRender	ctx	After every ctx.drawImage() call
netSend	data, ws, url	Before the game sends a WebSocket message
netRecv	data, ws, url	After a WebSocket message arrives
keyDown	KeyboardEvent	Any key pressed
keyUp	KeyboardEvent	Any key released
mouseDown	MouseEvent	Mouse button down
mouseUp	MouseEvent	Mouse button up
mouseMove	MouseEvent	Mouse moved
wheel	WheelEvent	Scroll
touchStart	TouchEvent	Touch begin
touchEnd	TouchEvent	Touch end
Hooks are called with try/catch — a throwing mod won't crash the game. Errors are logged with the mod's ID.

UI helpers
// Floating toast, bottom-center, auto-fades
api.showToast('Saved!', 3000);

// Fixed top-right button, returns the DOM node
const btn = api.addButton('⚔ Attack', () => doAttack());

// Inject arbitrary CSS scoped to your mod
api.addStyle(`
  .my-mod-thing { color: var(--accent); }
`);

// Create an element with the loader's preset classes
const panel = api.createElement('div', { class: 'tt-panel' }, 'Hello');

// Mount something into the loader's chrome bar
api.mountChrome({ id: 'my-widget', render: () => node });
Game access
The friendly API (works even if internals change):

api.getGameCanvas()      // <canvas id="canvasA">
api.getGameContext()     // its 2D context
api.getGameSize()        // { width, height }
api.isInLobby()          // true when the lobby input is visible
api.isInGame()           // true when a match is in progress
api.getPlayerName()      // your current display name
api.getPlayerColor()     // "#rrggbb"
api.getPlayerIndex()     // 0..N
api.getPlayerCount()     // total slots in this match
api.getHumanCount()      // how many are human
api.getLeaderboard()     // [{ name, color, territory, rank }]
File access
// Read a file from this mod's folder
const txt   = await api.readModFile(mod, 'assets/greeting.txt');
const json  = await api.readModFile(mod, 'config.json', 'json');
const img   = await api.readModFile(mod, 'icon.png',    'image');
const blob  = await api.readModFile(mod, 'sound.ogg',   'blob');
Deep internals
For advanced mods, the loader exposes a read-mostly view of the game's own closure:

const TT = api.getGame();

TT.ah   // "assignments" — per-player arrays (names, colors, scores, ...)
TT.aE   // game state — { data, fJ, fW, ku, a2G, ... }
TT.ad   // map / territory data
TT.aj   // name generator (a8 method assigns bot names)
TT.bm   // buffer / settings / live config
TT.ac   // image + asset cache
TT.b1   // network manager
TT.bD   // UI utilities
TT.aT   // ranking / leaderboard
TT.aS   // "shapes" — layout helper
You should treat these as unstable. They may be renamed by a territorial.io update. But for now they let mods do things the friendly API can't, like:

// Rename all bots mid-match
const { ah, aE } = api.getGame();
for (let i = aE.ku; i < aE.fW; i++) ah.a0j[i] = 'bob';
The full internal reference is in the printable PDF at docs/modding-guide.html.

📦 The .ttmod Format
A .ttmod file is a plain UTF-8 text file with this structure:

<ttmod>
{
  "name": "My Mod",
  "version": "1.0.0",
  "author": "You",
  "description": "…",
  "icon": null,
  "main": "main.js",
  "gameVersion": 25,
  "tags": ["hud"]
}
</ttmod>
<script>
// Your main.js contents go here
api.showToast('hi');
</script>
<assets>
{"icon.png": "data:image/png;base64,iVBORw0KG..."}
</assets>
The loader:

Splits on the three section tags.
Parses the JSON metadata.
Wraps the <script> body in (api, mod) => { … }.
Base64-decodes each asset entry into a Blob URL.
Calls api.readModFile — reads transparently hit the embedded assets.
You can hand-write a .ttmod in 30 seconds. Or generate one:

import { encodeTTMod } from './mod-store.js';

const ttmod = encodeTTMod({
  meta:   { name: 'My Mod', version: '1.0.0', author: 'You' },
  script: 'api.showToast("hi");',
  assets: { 'icon.png': someBlob }
});
🧩 Dependencies
Mods can depend on each other:

{
  "name": "Combo Mod",
  "requires": ["core-hud", "theme-engine"]
}
Behavior:

The loader topologically sorts mods by dependency order.
If a hard requirement is missing, the mod is skipped and a warning is logged.
If a soft requirement (optionalDeps) is missing, the mod still loads.
If two mods conflictsWith each other, the later one (alphabetically) is skipped and a warning is logged.
Dependents can read exports:

// In the parent mod
return { version: '1.0.0', getTheme() { ... } };

// In the child mod
const parent = api.mods.get('theme-engine');
const theme = parent?.exports?.getTheme();
🔢 Version Compatibility
The loader knows the client version (api.version) and the game version (api.gameVersion). A mod can declare:

{
  "minimumClientVersion": "2.0.0",
  "compatibleGameVersions": [24, 25, 26]
}
Below minimum client → mod skipped, warning in console
Outside compatible game versions → mod loads, but a yellow compatibility toast appears
No constraints → loads freely
Use window.TerritorialMods.checkCompatibility(meta) if you're writing your own installer.

🐛 Debugging
Turn on debug mode:

window.TerritorialMods.debug = true;
Now every hook, event, and mod load logs verbosely. Sample output:

[ModLoader] → hook netRecv   (mod: kill-counter,  3 listeners)
[ModLoader] → hook preRender (mod: kill-counter,  1 listener)
[ModLoader] ← emit modLoaded (kill-counter)
Common issues
Mod shows in the menu but does nothing
404 on mod.json
WebSocket spam in console
Mod store shows blank cards
"Cannot read property 'fillText' of undefined"
❓ FAQ
Is this allowed by territorial.io?
Does this work on mobile?
Can I use mods in multiplayer?
How do I uninstall a mod?
Where are mods stored?
Can I write a mod in TypeScript?
My mod upload fails with "permission-denied"
How do I update a published mod?
🤝 Contributing
We welcome PRs! See CONTRIBUTING.md for the full guidelines. TL;DR:

Fork the repo.
Create a feature branch: git checkout -b feat/your-thing.
Follow the existing code style (2-space indent, semicolons, single quotes).
Add tests if you touch the loader.
Open a PR with a clear description and screenshots if UI changes.
Good first issues
Add a new hook (beforeAttack, afterSpawn, ...)
Improve the store's search ranking
Write more example mods
Translate the README
Code of conduct
Be kind. This is a hobby project built by volunteers. See CODE_OF_CONDUCT.md.

📄 License
MIT © 2026 Pakball13 and contributors. See LICENSE for the full text.

📜 Changelog
See CHANGELOG.md. Highlights:

[2.0.0] — 2026-10-10
📦 Mod Store with 30+ community mods
🌐 Stable API facade (getPlayers, getMap, ...)
🧩 Dependency system
♻️ Automatic cleanup
🔊 Code-generated audio
🎨 5 themes
[1.11.1]
Restored menu-filter helpers
[1.0.0]
Initial mod loader
💚 Credits
Built by the Modatorial community.

Pakball13 — original idea, loader, store
Example Mod contributors — screenshots and early mods
territorial.io — the game that started it all
Inspired by Minecraft Forge, Fabric, and the early days of userscripts. Special thanks to everyone who reported a bug or published a mod.

Made with 💚 by the community, for the community.

⬆ Back to top
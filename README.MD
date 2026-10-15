# Modatorial.io — Modding Guide

> Version 3.0 · Game r25 · Client v1.11.0

Everything you need to build, ship, and debug mods for the
Modatorial.io client — plus documentation for every bundled client
feature, the mod loader's public API, and the `.ttmod` file format.

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

Modatorial.io is a **client-side modding layer** for
[territorial.io](https://territorial.io). It runs before the game's
main script, wraps the browser APIs the game uses (`WebSocket`,
`requestAnimationFrame`, `CanvasRenderingContext2D`, DOM input
events), and exposes a stable API (`window.TerritorialMods`) that
mods and client modules share.

Nothing in the game's minified code is edited. If you delete the
`mods/` folder and the loader scripts, territorial.io behaves
exactly as shipped.

---

## 2. Folder layout

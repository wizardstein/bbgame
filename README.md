# Beard Brothers — Brick Catcher 🧱

A catchy, shareable arcade game for the **Beard Brothers** NGO (Cluj-Napoca) promoting
its flagship campaign — the **Beard Brothers School in Florești**, built brick by brick
(https://scoala.beard-brothers.ro/ro).

**Core loop:** drag a wheelbarrow left/right along a perspective road to **catch falling
bricks** while **dodging grey boulders** labelled with the stereotypes the NGO fights
(*prejudecată, indiferență, birocrație, stereotip*). Catch a brick → points + combo. Miss
a brick or scoop a stereotype → a strike. **3 strikes and the wall collapses.** Roadside
**billboards** glide in and pause to showcase the NGO's 13 real campaigns. Game-over shows
a playful **rank** + a **"Buy a brick"** CTA and **Share**. Bilingual **RO / EN**.

This is a faithful implementation of the Claude Design handoff (2.5D pseudo-3D Canvas).

## Stack

- **Shell:** React 18 + Vite — menus, HUD, i18n, screen transitions.
- **Game core:** framework-agnostic vanilla `Canvas2D` engine in `src/game/GameEngine.js`
  (projection, spawning, physics, scoring, drawing). Dependency-free, 60fps on low-end phones.
- React mounts the engine onto a `<canvas>` and subscribes to `onScreen` / `onLang`
  callbacks. Hot per-frame values (score, lives, combo) are written **imperatively** to DOM
  nodes — kept out of React state to avoid re-render thrash.
- Fonts: **Baloo 2** + **Nunito** (Google Fonts).

## Development

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # output in dist/
npm run preview
```

## Deploy on Vercel

Vercel auto-detects Vite (Build: `npm run build`, Output: `dist`). Import the repo — no config.

## Tuning & content

- Gameplay constants (speed, spawn rates, difficulty, ranks) live in `GameEngine.js`
  (`_setup`, `_resetRun`, `_spawnItem`, `_update`). Props: `difficulty` (`easy|normal|hard`),
  `defaultLang` (`ro|en`) — set in `src/App.jsx`.
- Campaign billboard data: `CAMPS` in `GameEngine.js` (mirrors `campaigns.json` from the
  design bundle). **Verify all figures with the BB team before launch.**
- UI strings: `STR` in both `GameEngine.js` (canvas) and `BBWheelbarrow.jsx` (DOM overlays).

## Roadmap (from the design handoff)

1. Leaderboard (Supabase) with **server-side score validation** + name entry on game-over.
2. Analytics (PostHog/GA4): `game_start`, `game_over`, `buy_brick_click` (with UTM), `share_click`.
3. Dynamic OG share images (`/share/:score`) so shared links show the player's rank + bricks.
4. Billboard CMS so the BB team edits campaigns without a deploy.
5. Assets from BB: official logo + brand hex confirmation + optional real campaign photos.

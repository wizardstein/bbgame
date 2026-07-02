// Beard Brothers — "Brick Catcher" game engine.
// Ported from the Claude Design handoff (Brick Catcher.dc.html, `class Component`)
// into a framework-agnostic vanilla Canvas2D engine. The React shell (BBWheelbarrow.jsx)
// mounts it onto a <canvas>, feeds it HUD DOM nodes for imperative per-frame updates,
// and subscribes to onScreen / onLang / onBoard / onEvent callbacks.

import { Sfx } from "./Sfx.js";

// Copy text with a legacy fallback (lesson learned on the brickbybrick
// donation platform): navigator.clipboard is missing or throws inside in-app
// webviews (e.g. the Facebook/Instagram browser — exactly where a shared game
// link gets opened), where execCommand('copy') still works. Returns whether a
// copy succeeded.
async function copyText(value) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch (e) { /* fall through to the legacy path */ }
  try {
    // iOS Safari won't copy from a plain textarea.select() — it needs a
    // contentEditable element with an explicit Range selection.
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.contentEditable = "true";
    ta.readOnly = false;
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    const range = document.createRange();
    range.selectNodeContents(ta);
    const sel = window.getSelection();
    if (sel) { sel.removeAllRanges(); sel.addRange(range); }
    ta.setSelectionRange(0, value.length);
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch (e) {
    return false;
  }
}

// Romanian numeral–noun agreement (CLDR plurals): 1 cărămidă · 2–19 cărămizi ·
// 20+ DE cărămizi, with the x02–x19 exception (119 cărămizi, 120 de cărămizi).
function roBricks(n) {
  if (n === 1) return "1 cărămidă";
  const f = n % 100;
  return n === 0 || (f >= 2 && f <= 19) ? n + " cărămizi" : n + " de cărămizi";
}

export class GameEngine {
  constructor(opts = {}) {
    this.props = {
      difficulty: opts.difficulty || "normal",
      defaultLang: opts.defaultLang || "ro",
    };
    this.onScreen = opts.onScreen || (() => {});
    this.onLang = opts.onLang || (() => {});
    this.onBoard = opts.onBoard || (() => {});
    this.onEvent = opts.onEvent || (() => {}); // analytics hook (rank_up, …)
    this.sfx = new Sfx();
    // HUD DOM nodes are assigned by React via callback refs (same object reference).
    this.hud = { score: null, lives: [null, null, null], combo: null, mult: null, toast: null, rankBar: null, rankLabel: null, hint: null };

    this._lang = this.props.defaultLang === "en" ? "en" : "ro";
    let best = 0;
    try {
      best = parseInt(localStorage.getItem("bbwb_best_bricks") || "0", 10) || 0;
    } catch (e) {}
    this.best = best;

    // final-run snapshot (for share text)
    this.finalScore = 0;
    this.finalBricks = 0;
    this.finalCombo = 0;

    // Honor the OS "reduce motion" setting — screen shake & particle bursts are
    // gated on this for vestibular safety. Falls back to false if unsupported.
    this.reduceMotion = false;
    try { this.reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  }

  // ---- static content ----
  STR = {
    ro: { langBtn: "EN", title: "Construiește Școala", sub: "un joc Beard Brothers",
      how1: "Trage stânga–dreapta ca să prinzi cărămizile", how2: "Ferește roaba de prejudecată, indiferență, birocrație și stereotip", how3: "3 greșeli și zidul se prăbușește",
      play: "Joacă", hint: "trage cu degetul ca să muți roaba", scoreLabel: "puncte", yourRank: "Rangul tău",
      bricks: "cărămizi", bestCombo: "combo", again: "Încă o tură", buy: "Donează o cărămidă", share: "Distribuie",
      overNote: "Fiecare cărămidă reală ridică școala Beard Brothers, în Florești.", best: "Record", toastCopied: "Link copiat — distribuie!",
      shower: "Ploaie de cărămizi!", dodged: "evitat!" },
    en: { langBtn: "RO", title: "Build the School", sub: "a Beard Brothers game",
      how1: "Drag left–right to catch the bricks", how2: "Keep prejudice, indifference, red tape & stereotypes out", how3: "3 misses and the wall collapses",
      play: "Play", hint: "drag to move the wheelbarrow", scoreLabel: "points", yourRank: "Your rank",
      bricks: "bricks", bestCombo: "combo", again: "Play again", buy: "Donate a brick", share: "Share",
      overNote: "Every real brick raises the Beard Brothers school in Florești.", best: "Best", toastCopied: "Link copied — share it!",
      shower: "Brick shower!", dodged: "dodged!" },
  };
  // NOTE: `dro`/`den` descriptions are DRAFTS based on the official campaigns
  // page (beard-brothers.ro/campanii). Give them a final proofread with the BB
  // team before launch in case any detail was paraphrased imperfectly.
  CAMPS = [
    { c: "#C0512B", icon: "bag", ro: "Beard on! Pentru cei în nevoie", en: "Beard on! For those in need", sro: "40+ saci de haine", sen: "40+ bags of clothes",
      dro: "Am împărțit peste 40 de saci de haine și bunuri, plus mâncare de 1.500 lei, către oameni aflați în nevoie.", den: "We handed out 40+ bags of clothes and goods, plus 1,500 lei in food, to people in need." },
    { c: "#3E7C8C", icon: "house", ro: "Beard on! For Bărboși", en: "Beard on! For Bărboși", sro: "€3.000 · un sat ajutat", sen: "€3,000 · a village helped",
      dro: "Peste 100 de saci de haine și produse de igienă, plus 3.000 € în mâncare și lemne de foc, pentru un sat întreg.", den: "Over 100 bags of clothes and hygiene products, plus €3,000 in food and firewood, for an entire village." },
    { c: "#7A9A3B", icon: "heart", ro: "Beard On! For Eduard", en: "Beard On! For Eduard", sro: "€3.354 · o viață salvată", sen: "€3,354 · a life saved",
      dro: "Prin 7 evenimente de strângere de fonduri am adunat 3.354 € pentru Eduard — peste ținta de 3.000 €.", den: "Through 7 fundraising events we raised €3,354 for Eduard — beyond the €3,000 goal." },
    { c: "#C99A2E", icon: "leaf", ro: "Beard On! For România", en: "Beard On! For Romania", sro: "festivaluri ecologizate", sen: "festivals cleaned up",
      dro: "Voluntari bărboși au ecologizat festivaluri precum Electric Castle, Basm, Green Sensation și M.O.X.", den: "Bearded volunteers cleaned up festivals like Electric Castle, Basm, Green Sensation and M.O.X." },
    { c: "#D8643C", icon: "balloons", ro: "Catch A Smile Day", en: "Catch A Smile Day", sro: "110 orașe · 10.000 baloane", sen: "110 cities · 10,000 balloons",
      dro: "În fiecare 7 august, în 110 orașe: 10.000 de baloane, peste 40.000 de flori și 50.000 de acadele — o zi de zâmbete.", den: "Every August 7th, across 110 cities: 10,000 balloons, 40,000+ flowers and 50,000+ lollipops — a day of smiles." },
    { c: "#4E8C6A", icon: "bus", ro: "Beards in Schools", en: "Beards in Schools", sro: "€8.035 · un microbuz", sen: "€8,035 · a minibus",
      dro: "8.035 € strânși pentru un microbuz care duce copiii la școală.", den: "€8,035 raised for a minibus that gets kids to school." },
    { c: "#9C5BA0", icon: "medal", ro: "Rolling Beards", en: "Rolling Beards", sro: "€7.029 · 5 medalii", sen: "€7,029 · 5 medals",
      dro: "7.029 € strânși pentru a duce tineri patinatori la WIFSA World Open — și 5 medalii câștigate.", den: "€7,029 raised to send young skaters to the WIFSA World Open — and 5 medals won." },
    { c: "#2F6E8F", icon: "car", ro: "The Beard Mobile", en: "The Beard Mobile", sro: "€15.157 · taxi gratuit", sen: "€15,157 · free taxi",
      dro: "15.157 € pentru primul taxi comunitar din România — transport gratuit pentru persoane cu dizabilități.", den: "€15,157 for Romania's first community taxi — free rides for people with disabilities." },
    { c: "#B5572E", icon: "people", ro: "Multe fapte bune", en: "Many good deeds", sro: "5 cauze · 360 voluntari", sen: "5 causes · 360 volunteers",
      dro: "Cinci proiecte simultane — Feels Like Home, It's Up 2 You, Keep the Blood Flowing, How to Cluj și The Tutors — duse de 360 de voluntari.", den: "Five projects at once — Feels Like Home, It's Up 2 You, Keep the Blood Flowing, How to Cluj and The Tutors — powered by 360 volunteers." },
    { c: "#B23B3B", icon: "flame", ro: "Enough is Enough!", en: "Enough is Enough!", sro: "€30.973 · secția de arși", sen: "€30,973 · burn unit",
      dro: "30.973 € strânși pentru echipamente medicale la secția de arși a Spitalului de Urgență din Cluj.", den: "€30,973 raised for medical equipment at the Burns Unit of the Cluj Emergency Hospital." },
    { c: "#3F7FB0", icon: "paint", ro: "Paint the Future", en: "Paint the Future", sro: "€55.000 · spital de copii", sen: "€55,000 · kids hospital",
      dro: "55.000 € pentru renovarea secției Pediatrie III de la Spitalul de Copii din Cluj.", den: "€55,000 to renovate the Pediatrics III ward at the Cluj Children's Hospital." },
    { c: "#C0392B", icon: "ambulance", ro: "Wheels for Life", en: "Wheels for Life", sro: "€167.500 · 2 ambulanțe", sen: "€167,500 · 2 ambulances",
      dro: "167.500 € strânși pentru două ambulanțe SMURD Cluj (tip C și tip B) care salvează vieți.", den: "€167,500 raised for two SMURD Cluj ambulances (Type C and Type B) that save lives." },
    { c: "#C96A23", icon: "wall", ro: "Beard Brothers School", en: "Beard Brothers School", sro: "€302.540 · o școală", sen: "€302,540 · a school",
      dro: "302.540 € adunați cărămidă cu cărămidă pentru Școala Beard Brothers din Florești — un centru de formare profesională, acum în construcție.", den: "€302,540 raised brick by brick for the Beard Brothers School in Florești — a vocational training center, now under construction." },
  ];
  OBST = { ro: ["prejudecată", "indiferență", "birocrație", "stereotip"], en: ["prejudice", "indifference", "red tape", "stereotype"] };
  // Thresholds in bricks caught. Tuned so "legend" (~250) is a genuine achievement —
  // a relaxed run lands around 260, so legend should sit right about there.
  RANKS = [
    { min: 0, ro: ["Trecător curios", "Un început bun, continuă!"], en: ["Curious passer-by", "A good start — keep going!"] },
    { min: 45, ro: ["Voluntar nou", "Roaba începe să se umple."], en: ["Rookie volunteer", "The wheelbarrow is filling up."] },
    { min: 105, ro: ["De-ai noștri", "Zidul crește văzând cu ochii."], en: ["One of the crew", "The wall is rising fast."] },
    { min: 175, ro: ["Maistru de nădejde", "Școala se ridică datorită ție."], en: ["Trusted foreman", "The school is rising thanks to you."] },
    { min: 250, ro: ["Legendă Beard Brothers", "Bărboșii îți ridică pălăria."], en: ["Beard Brothers legend", "The bearded ones salute you."] },
  ];

  // ---- colors ----
  COL = { skyTop: "#9AD4F0", skyBot: "#CFF0FB", grass: "#7FBF52", grassDk: "#6BAA45", hill: "#8FC962",
    road: "#C7BAA0", roadEdge: "#E7DBC2", dash: "#F4ECD8", brick: "#C0512B", brickTop: "#D9693E", brickSide: "#9A3F20",
    gold: "#E8A825", goldTop: "#F6C64E", goldSide: "#B87F14",
    wb: "#EE8B3D", wbDk: "#C96A23", wbIn: "#B85F1F", wheel: "#34302C", obst: "#8E8B85", obstDk: "#6E6B66" };
  CONFETTI = ["#E0701F", "#F2C03D", "#7FBF52", "#3F8FD0", "#C0512B", "#FBF4E6"];

  mount(canvas, wrap) {
    this.canvas = canvas;
    this.wrap = wrap;
    this._setup();
    this._resize();
    try { this._draw(); } catch (e) {}
    this._onResize = () => { this._resize(); try { this._draw(); } catch (e) {} };
    window.addEventListener("resize", this._onResize);
    this._onKey = (e) => {
      const k = e.key;
      if (k === "ArrowLeft" || k === "a" || k === "A") this.keyDir = -1;
      else if (k === "ArrowRight" || k === "d" || k === "D") this.keyDir = 1;
      else if (k === "Escape" && this.paused) this.resumeBoard();
    };
    this._onKeyUp = (e) => {
      const k = e.key;
      if (k === "ArrowLeft" || k === "ArrowRight" || k === "a" || k === "A" || k === "d" || k === "D") this.keyDir = 0;
    };
    window.addEventListener("keydown", this._onKey);
    window.addEventListener("keyup", this._onKeyUp);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }
  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this._onResize);
    window.removeEventListener("keydown", this._onKey);
    window.removeEventListener("keyup", this._onKeyUp);
    clearTimeout(this._tt);
    this.sfx.dispose();
  }

  _setup() {
    this.zNear = 1; this.zFar = 16; this.roadHalf = 3; this.maxX = 2.15;
    this.player = { x: 0 }; this.targetX = 0; this.vx = 0; this.keyDir = 0;
    this.items = []; this.boards = []; this.particles = []; this.scenery = []; this.pops = [];
    this.dashPhase = 0; this.shake = 0; this.bob = 0;
    this.playing = false; this.paused = false; this.campIdx = 0; this.boardSide = 1;
    this.holdZ = 2.5; this.boardCooldown = 0.3;
    this.scenerySide = 1; this.sceneryTimer = 0.1;
    // slow drifting clouds (fractions of the viewport, resolution independent)
    this.clouds = [
      { fx: 0.16, fy: 0.30, s: 1.0, v: 0.006 },
      { fx: 0.55, fy: 0.14, s: 1.5, v: 0.004 },
      { fx: 0.86, fy: 0.42, s: 0.8, v: 0.008 },
    ];
    this._resetRun();
    // pre-seed a couple of drifting boards for the attract screen
    this.spawnTimer = 0.6; this.boardTimer = 0.2;
  }
  _resetRun() {
    const d = this.props.difficulty || "normal";
    this.diff = d;
    this.baseSpeed = d === "easy" ? 4.4 : d === "hard" ? 6.4 : 5.3;
    this.lives = d === "easy" ? 4 : 3; this.maxLives = this.lives;
    this.score = 0; this.combo = 0; this.comboMult = 1; this.bestCombo = 0; this.bricksCaught = 0;
    this.speed = this.baseSpeed; this.comboTimer = 0; this.player.x = 0; this.targetX = 0;
    this.items.length = 0; this.particles.length = 0; this.pops.length = 0;
    // juice / progression state
    this.elapsed = 0;          // run time — drives the difficulty ramp
    this.flash = 0;            // red damage vignette
    this.catchPulse = 0;       // barrow squash on catch
    this.dying = 0;            // slow-mo "wall collapses" beat before game-over
    this.showerT = 0;          // rank-up reward: seconds of brick-only rapid spawns
    this.banner = null;        // {t, rankIdx} — canvas rank-up banner
    this.runRankIdx = 0;       // last rank threshold crossed this run
    this._bricksSinceHeart = 0;
    this._lastSpawnX = 0; this._lastItv = 1; this._pat = null;
    this._hintGone = false; this._lastBarBricks = -1; this._lastBarLang = null;
  }

  _resize() {
    const c = this.canvas; if (!c) return;
    const r = c.getBoundingClientRect();
    this.W = r.width || c.clientWidth || 412;
    this.H = r.height || c.clientHeight || 732;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(this.W * dpr); c.height = Math.round(this.H * dpr);
    this.ctx = c.getContext("2d");
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cx = this.W / 2;
    // Portrait screens get a slightly higher horizon (less empty sky) so the
    // road + props fill more of the tall viewport and read closer.
    this.horizon = this.H * (this.W / this.H < 0.72 ? 0.28 : 0.32);
    // Cache the static sky gradient (only changes on resize) instead of rebuilding
    // it every frame in _draw.
    this._skyGrad = this.ctx.createLinearGradient(0, 0, 0, this.horizon + 40);
    this._skyGrad.addColorStop(0, this.COL.skyTop);
    this._skyGrad.addColorStop(1, this.COL.skyBot);
    // Aspect-aware zoom: on a tall phone, K = W*0.15 makes the whole world tiny & far.
    // Zoom portrait screens in and shorten the road so it reads close, like the wide
    // desktop view. To keep things on-screen at the bigger scale we tighten the player
    // travel (maxX) and the brick spawn band so nothing flies past the screen edges.
    const aspect = this.W / this.H;
    this.zoom = aspect < 0.72 ? Math.min(2.1, 1 + (0.72 - aspect) * 3.4) : 1;
    this.K = this.W * 0.15 * this.zoom;
    // Closeness comes from the zoom, not from a short road — keep items spawning far
    // (zFar) and draw the road all the way to the horizon (roadFar) so it converges to
    // a point instead of ending in an abrupt edge.
    this.zFar = 16;
    this.roadFar = 60;
    this.maxX = Math.min(2.15, (this.W * 0.46) / this.K);
    this._spawnHalf = Math.min(this.roadHalf - 0.55, (this.W * 0.5) / this.K - 0.15);
  }

  project(x, z, y) {
    const p = this.zNear / z;
    const gy = this.horizon + (this.H - this.horizon) * p;
    return { sx: this.cx + x * this.K * p, sy: gy - (y || 0) * this.K * p, p };
  }
  _scrToWorldX(clientX) {
    const r = this.canvas.getBoundingClientRect();
    const sx = clientX - r.left;
    return Math.max(-this.maxX, Math.min(this.maxX, (sx - this.cx) / this.K));
  }

  // ---- input ----
  onDown = (e) => {
    this.sfx.unlock(); // any first touch satisfies the autoplay policy
    if (this.paused || !this.playing || this.dying > 0) return;
    this.dragging = true; this._moved = false;
    this._downX = e.clientX; this._downY = e.clientY;
    this._dragStartClientX = e.clientX; this._dragStartTargetX = this.targetX;
  };
  onMove = (e) => {
    if (!this.dragging || !this.playing) return;
    if (Math.abs(e.clientX - this._downX) > 8 || Math.abs(e.clientY - this._downY) > 8) this._moved = true;
    // RELATIVE drag — the barrow follows how far the finger moves; it does NOT
    // jump to the finger. A plain tap (no movement) leaves it where it is.
    const dx = (e.clientX - this._dragStartClientX) / this.K;
    this.targetX = Math.max(-this.maxX, Math.min(this.maxX, this._dragStartTargetX + dx));
  };
  onUp = () => {
    const wasDrag = this._moved;
    this.dragging = false;
    if (!this.playing || this.paused || this.dying > 0) return;
    // a tap (no drag) on the billboard currently held in view opens it
    if (!wasDrag) {
      const b = this._heldBoardAt(this._downX, this._downY);
      if (b) this.openBoard(b);
    }
  };

  // ---- billboard tap-to-read (pause) ----
  _heldBoardAt(clientX, clientY) {
    if (!this.canvas) return null;
    const r = this.canvas.getBoundingClientRect();
    const x = clientX - r.left, y = clientY - r.top;
    // tappable whenever the panel is big enough to read (approaching, held or
    // leaving) — not just during the brief 2s hold.
    for (const b of this.boards) {
      if (!b._rect || b._rect.h < 44) continue;
      const q = b._rect;
      if (x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h) return b;
    }
    return null;
  }
  openBoard(b) {
    this.paused = true; this.dragging = false;
    this.sfx.board();
    this.onBoard(b.cm);
  }
  resumeBoard = () => {
    this.paused = false;
    this.sfx.ui();
    this.onBoard(null);
  };

  toggleLang = () => { this._lang = this._lang === "ro" ? "en" : "ro"; this.onLang(this._lang); };
  buyBrick = () => { window.open("https://scoala.beard-brothers.ro/ro", "_blank", "noopener,noreferrer"); };
  // Share flow hardened with the lessons learned on brickbybrick (see its
  // feat(share)/fix(share) history):
  // - navigator.share must be called synchronously in the tap — any await
  //   first consumes the user activation and iOS silently never opens the
  //   sheet ("3s then nothing").
  // - Share a CLEAN canonical URL: location.href carries ?fbclid/utm junk
  //   picked up from the very social apps shares travel through; origin+path
  //   also keeps preview-deploy shares pointing at that preview, not prod.
  // - The copy fallback must never feel dead: clipboard API fails silently in
  //   in-app webviews (FB/IG browser), so copyText has an execCommand path
  //   and we confirm with a toast on tap regardless.
  // - #ScoalaDeMeserii clusters game shares with the donation platform's.
  // - Romanian plural: "120 DE cărămizi", not "120 cărămizi" (roBricks).
  shareScore = () => {
    const L = this._lang;
    const n = this.finalBricks;
    const txt = L === "ro"
      ? `Am prins ${roBricks(n)} pentru Școala Beard Brothers din Florești! 🧱 Joacă și tu, cărămidă cu cărămidă. #ScoalaDeMeserii`
      : `I caught ${n} ${n === 1 ? "brick" : "bricks"} for the Beard Brothers School in Florești! 🧱 Play it, brick by brick. #ScoalaDeMeserii`;
    const url = location.origin + location.pathname;
    if (navigator.share) {
      navigator.share({ title: "Beard Brothers", text: txt, url }).catch((err) => {
        // user cancelling the sheet is fine; real failures fall back to copy
        if (!err || err.name !== "AbortError") this._copyShare(txt, url);
      });
    } else {
      this._copyShare(txt, url);
    }
  };
  _copyShare(txt, url) {
    copyText(txt + " " + url).then(() => this._toast(this.STR[this._lang].toastCopied));
  }
  _toast(msg) {
    const el = this.hud.toast; if (!el) return;
    el.textContent = msg; el.style.opacity = "1";
    clearTimeout(this._tt); this._tt = setTimeout(() => { el.style.opacity = "0"; }, 2200);
  }

  startGame = () => {
    this.sfx.unlock();
    this._resetRun();
    this.playing = true;
    this.spawnTimer = 0.5; this.boardTimer = 1.2;
    if (this.hud.hint) this.hud.hint.style.opacity = "1";
    this.onScreen("playing");
  };
  _gameOver() {
    this.playing = false;
    // pass the rank INDEX, not resolved strings, so the React shell can re-translate
    // the rank title/blurb live when the language is toggled on the game-over screen.
    let rkIdx = 0;
    for (let i = 0; i < this.RANKS.length; i++) if (this.bricksCaught >= this.RANKS[i].min) rkIdx = i;
    // Record is tracked in BRICKS so it matches the rank/share story (which both
    // speak in bricks), not in raw points.
    // A first-ever run only celebrates from 25 bricks up, so "record" keeps meaning.
    const isRecord = this.bricksCaught > this.best && (this.best > 0 || this.bricksCaught >= 25);
    const best = Math.max(this.best, this.bricksCaught);
    this.best = best;
    try { localStorage.setItem("bbwb_best_bricks", String(best)); } catch (e) {}
    this.finalScore = this.score; this.finalBricks = this.bricksCaught; this.finalCombo = this.bestCombo;
    if (isRecord) { this.sfx.record(); this._confetti(70); }
    this.onScreen("over", {
      finalScore: this.score, finalBricks: this.bricksCaught, finalCombo: this.bestCombo,
      rankIdx: rkIdx, best, isRecord,
    });
  }

  // ---- spawning ----
  // `itv` is the seconds until the NEXT spawn — items all fall at the same speed,
  // so it is also the arrival gap at the catch line. The next x is clamped to the
  // distance the barrow can actually cover in that gap, so the spawner can never
  // produce an unreachable brick (a "cheap" strike).
  _spawnItem(itv) {
    const half = this._spawnHalf || this.roadHalf - 0.55;
    const shower = this.showerT > 0;
    const obFreq = shower ? 0 : Math.min(0.16 + this.bricksCaught / 260, 0.32);
    const isOb = Math.random() < obFreq;

    // pattern generator: short designed sequences read better than pure noise
    if (!this._pat || this._pat.n <= 0) {
      const r = Math.random();
      if (r < 0.25) this._pat = { kind: "zig", dir: Math.random() < 0.5 ? 1 : -1, n: 3 + ((Math.random() * 2) | 0) };
      else if (r < 0.45) this._pat = { kind: "run", x: (Math.random() * 2 - 1) * half, n: 3 };
      else this._pat = { kind: "rnd", n: 2 + ((Math.random() * 3) | 0) };
    }
    const pat = this._pat; pat.n--;
    let x;
    if (pat.kind === "zig") { x = this._lastSpawnX + pat.dir * (1.0 + Math.random() * 0.8); pat.dir *= -1; }
    else if (pat.kind === "run") x = pat.x + (Math.random() * 0.6 - 0.3);
    else x = (Math.random() * 2 - 1) * half;

    // reachability clamp (~3 world units/s of realistic barrow travel)
    const reach = Math.max(1.1, 3.0 * (itv || 1));
    x = Math.max(this._lastSpawnX - reach, Math.min(this._lastSpawnX + reach, x));
    x = Math.max(-half, Math.min(half, x));
    this._lastSpawnX = x;

    // heart pickup: a comeback beat, only when hurt and earned (~25 bricks apart)
    if (!shower && this.lives < this.maxLives && this._bricksSinceHeart >= 22 &&
        !this.items.some((i) => i.heart) && Math.random() < 0.14) {
      this._bricksSinceHeart = 0;
      this.items.push({ x, z: this.zFar, heart: true, done: false, hop: Math.random() * 0.4 });
      return;
    }
    if (isOb) {
      const arr = this.OBST[this._lang];
      // store the obstacle INDEX, not the localized string, so the label
      // re-translates live if the player toggles language mid-run.
      this.items.push({ x, z: this.zFar, ob: true, obIdx: (Math.random() * arr.length) | 0, done: false, hop: 0 });
    } else {
      // golden brick: rare 5× jackpot once the player has found their feet
      const gold = this.bricksCaught >= 8 && Math.random() < (shower ? 0.1 : 0.06);
      this.items.push({ x, z: this.zFar, ob: false, gold, done: false, hop: Math.random() * 0.4 });
    }
  }
  _spawnScenery() {
    this.scenerySide *= -1;
    const off = this.roadHalf + 0.9 + Math.random() * 2.4;
    this.scenery.push({
      z: this.zFar + 2, side: this.scenerySide, off,
      kind: Math.random() < 0.4 ? "tree" : "bush",
      seed: Math.random(),
    });
    if (this.scenery.length > 40) this.scenery.shift();
  }
  _spawnBoard() {
    const cm = this.CAMPS[this.campIdx % this.CAMPS.length];
    this.campIdx++; this.boardSide *= -1;
    this.boards.push({ z: this.zFar, side: this.boardSide, cm, phase: "in", holdT: 0 });
  }

  // ---- loop ----
  loop = (ts) => {
    let dt = (ts - this.last) / 1000; this.last = ts;
    if (dt > 0.05) dt = 0.05;
    // Never let a single bad frame kill the rAF loop permanently.
    try { this._update(dt); this._draw(); } catch (e) {}
    this.raf = requestAnimationFrame(this.loop);
  };

  _update(dt) {
    if (this.paused) return; // frozen while a billboard is open for reading
    // slow-mo "wall collapses" beat: the world runs at 35% while the real-time
    // timer counts down, then the game-over screen lands.
    if (this.dying > 0) {
      this.dying -= dt;
      if (this.dying <= 0) { this.dying = 0; this._gameOver(); return; }
      dt *= 0.35;
    }
    // movement
    if (this.playing) {
      this.elapsed += dt;
      if (this.keyDir) {
        const kv = 4.2 * (this.speed / this.baseSpeed); // keyboard keeps pace late-game
        this.targetX = Math.max(-this.maxX, Math.min(this.maxX, this.targetX + this.keyDir * dt * kv));
      }
      const nx = this.player.x + (this.targetX - this.player.x) * Math.min(1, dt * 11);
      this.vx = (nx - this.player.x) / Math.max(dt, 0.001);
      this.player.x = nx;
      // Ramp by bricks + time, NOT score: combo multipliers inflate score, which
      // used to max the speed out ~40s into a run and then plateau. This curve
      // starts 12% gentler (first 12s) and keeps climbing to a higher ceiling.
      this.speed = this.baseSpeed * (0.88 + 0.12 * Math.min(1, this.elapsed / 12))
        + Math.min(this.bricksCaught * 0.10, 4.2)
        + Math.min(this.elapsed * 0.022, 1.9);
    }
    const spd = this.playing ? this.speed : this.baseSpeed * 0.7;
    this.dashPhase = (this.dashPhase + spd * dt) % 2.4;
    this.bob += dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 30);
    if (this.comboTimer > 0) this.comboTimer -= dt;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 1.8);
    if (this.catchPulse > 0) this.catchPulse = Math.max(0, this.catchPulse - dt * 5);
    if (this.showerT > 0) this.showerT -= dt;
    if (this.banner && (this.banner.t -= dt) <= 0) this.banner = null;

    // clouds drift with a whisper of the world speed
    for (const cl of this.clouds) { cl.fx += cl.v * dt * (0.4 + spd * 0.08); if (cl.fx > 1.18) cl.fx = -0.18; }
    // roadside scenery flows past (also on the attract screen — a living world)
    for (const s of this.scenery) s.z -= spd * dt;
    this.scenery = this.scenery.filter((s) => s.z > 0.4);
    this.sceneryTimer -= dt;
    if (this.sceneryTimer <= 0) { this._spawnScenery(); this.sceneryTimer = 0.55 + Math.random() * 0.5; }

    // boards: approach -> hold in full view 2s -> leave, one at a time
    for (const b of this.boards) {
      if (b.phase === "in") { b.z -= spd * dt; if (b.z <= this.holdZ) { b.z = this.holdZ; b.phase = "hold"; b.holdT = 2.0; } }
      else if (b.phase === "hold") { b.holdT -= dt; if (b.holdT <= 0) b.phase = "out"; }
      else { b.z -= spd * dt; }
    }
    this.boards = this.boards.filter((b) => b.z > 0.45);
    this.boardCooldown -= dt;
    const boardBusy = this.boards.some((b) => b.phase === "in" || b.phase === "hold");
    if (!boardBusy && this.boardCooldown <= 0) { this._spawnBoard(); this.boardCooldown = 0.9; }

    // items only in play
    if (this.playing) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        let itv = Math.max(0.48, 1.05 - this.bricksCaught * 0.004 - this.elapsed * 0.003);
        if (this.showerT > 0) itv = Math.max(0.26, itv * 0.45);
        // clamp reachability by the TIGHTER of the gap that just elapsed and the
        // next one (matters at shower boundaries, where the cadence jumps)
        this._spawnItem(Math.min(this._lastItv || itv, itv));
        this.spawnTimer = itv; this._lastItv = itv;
      }
      for (const it of this.items) {
        it.z -= this.speed * dt;
        // golden bricks trail sparkles on the way down
        if (it.gold && !it.done && !this.reduceMotion && Math.random() < 0.25) {
          const gp = this.project(it.x, it.z, 0.3);
          if (gp.p > 0.1) this.particles.push({
            x: gp.sx + (Math.random() - 0.5) * 14, y: gp.sy - Math.random() * 10,
            vx: (Math.random() - 0.5) * 24, vy: -18 - Math.random() * 30, g: 60,
            life: 0.35, c: "#F6C64E", s: 2.5 + Math.random() * 2,
          });
        }
        if (!it.done && it.z <= this.zNear + 0.05) {
          it.done = true;
          const reach = Math.abs(it.x - this.player.x) < 1.0;
          if (it.heart) {
            if (reach) {
              this.lives = Math.min(this.maxLives, this.lives + 1);
              this._pop(this.player.x, "+1 ♥", "#E0413B", 1.15);
              this._burst(this.player.x, "#E88579");
              this.sfx.heart(); this._vib(20);
            }
            // a missed heart costs nothing
          } else if (it.ob) {
            if (reach) { this._hit(); this._burst(it.x, "#8E8B85"); }
            else {
              this.score += 3;
              // near-miss → make the dodge reward felt, not silent
              if (Math.abs(it.x - this.player.x) < 1.9) { this._pop(it.x, "+3", "#77746D", 0.8); this.sfx.dodge(); }
            }
          } else {
            if (reach) {
              this.bricksCaught++; this.combo++; this._bricksSinceHeart++;
              this.bestCombo = Math.max(this.bestCombo, this.combo);
              const prevMult = this.comboMult;
              // multiplier = +1 every 4 consecutive catches, capped at ×10
              this.comboMult = Math.min(1 + Math.floor(this.combo / 4), 10);
              const gain = (it.gold ? 60 : 12) * this.comboMult;
              this.score += gain;
              this._pop(this.player.x, "+" + gain, it.gold ? "#D9910F" : "#E0701F", it.gold ? 1.3 : 1);
              this._burst(this.player.x, it.gold ? "#F6C64E" : "#E0701F");
              this.catchPulse = 1;
              if (it.gold) this.sfx.golden(); else this.sfx.pop(this.combo);
              this._vib(12);
              // pop the combo popup once per new multiplier tier, then let it fade
              // (don't keep re-triggering every catch, which made "x2" linger).
              if (this.comboMult > 1 && this.comboMult !== prevMult) { this.comboTimer = 1.1; this._showCombo(); }
              // rank threshold crossed → celebration + brick-shower reward
              const nr = this.runRankIdx + 1;
              if (nr < this.RANKS.length && this.bricksCaught >= this.RANKS[nr].min) { this.runRankIdx = nr; this._rankUp(nr); }
            } else { this._hit(); }
          }
        }
      }
      this.items = this.items.filter((it) => it.z > 0.5);
      // dust kicked up when the barrow zips sideways
      if (!this.reduceMotion && Math.abs(this.vx) > 3.5 && Math.random() < 0.3) {
        this.particles.push({
          x: this.cx + this.player.x * this.K - Math.sign(this.vx) * this.W * 0.06,
          y: this.H * 0.93 + Math.random() * 8,
          vx: -this.vx * 5 + (Math.random() - 0.5) * 30, vy: -40 - Math.random() * 50, g: 500,
          life: 0.4, c: "#D8CBB0", s: 3 + Math.random() * 3,
        });
      }
    }

    // particles (p.g lets confetti/dust fall slower than impact bursts)
    for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g == null ? 900 : p.g) * dt; p.life -= dt; }
    this.particles = this.particles.filter((p) => p.life > 0);
    // floating score popups
    for (const p of this.pops) { p.y += p.vy * dt; p.life -= dt; }
    this.pops = this.pops.filter((p) => p.life > 0);

    this._updateHud();
  }

  _hit() {
    if (this.dying > 0) return;
    this.lives--; this.combo = 0; this.comboMult = 1;
    if (this.lives <= 0) {
      this.lives = 0;
      this.shake = this.reduceMotion ? 0 : 16;
      this.flash = 0.55;
      this.sfx.death(); this._vib([60, 50, 90]);
      this.dying = 0.85; // slow-mo beat; _update fires _gameOver() when it runs out
    } else {
      this.shake = this.reduceMotion ? 0 : 9;
      this.flash = 0.35;
      this.sfx.thud(); this._vib(60);
    }
  }
  _rankUp(idx) {
    this.showerT = 4; // reward: 4s of rapid, boulder-free bricks
    this.banner = { t: 2.2, rankIdx: idx };
    this.sfx.rankUp(); this._vib([30, 40, 30]);
    this._confetti(36);
    this.onEvent("rank_up", { rank: this.RANKS[idx].en[0], bricks: this.bricksCaught });
  }
  _confetti(n) {
    if (this.reduceMotion) return;
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x: Math.random() * this.W, y: -12 - Math.random() * this.H * 0.25,
        vx: (Math.random() - 0.5) * 70, vy: 60 + Math.random() * 130, g: 260,
        life: 1.1 + Math.random() * 0.9, c: this.CONFETTI[(Math.random() * this.CONFETTI.length) | 0],
        s: 4 + Math.random() * 5,
      });
    }
  }
  _vib(pattern) {
    if (this.reduceMotion) return;
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {}
  }
  // floating score text at the catch line
  _pop(worldX, txt, c, scale = 1) {
    const p = this.project(worldX, this.zNear + 0.1, 0.6);
    this.pops.push({
      x: p.sx, y: p.sy, vy: this.reduceMotion ? 0 : -48,
      life: 0.9, max: 0.9, txt, c, sz: Math.max(15, this.W * 0.045) * scale,
    });
    if (this.pops.length > 12) this.pops.shift();
  }
  _burst(worldX, color) {
    if (this.reduceMotion) return;
    const p = this.project(worldX, this.zNear + 0.1, 0.3);
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 160;
      this.particles.push({ x: p.sx, y: p.sy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, life: 0.5 + Math.random() * 0.3, c: color, s: 4 + Math.random() * 5 });
    }
  }
  _showCombo() {
    const el = this.hud.combo; if (!el) return;
    el.textContent = "×" + this.comboMult;
  }
  _updateHud() {
    if (this.hud.score) this.hud.score.textContent = this.score;
    for (let i = 0; i < 3; i++) {
      const el = this.hud.lives[i]; if (!el) continue;
      const ok = i < this.lives;
      el.style.background = ok ? "#EE8B3D" : "#C9C2B4";
      el.style.opacity = ok ? "1" : "0.45";
      el.style.boxShadow = ok ? "inset 0 -2px 0 rgba(0,0,0,.18)" : "inset 0 -2px 0 rgba(0,0,0,.1)";
    }
    if (this.hud.combo) this.hud.combo.style.opacity = this.comboTimer > 0 ? String(Math.min(1, this.comboTimer * 2)) : "0";
    // persistent multiplier badge — stays visible for the whole active combo
    if (this.hud.mult) {
      if (this.comboMult > 1) { this.hud.mult.textContent = "×" + this.comboMult; this.hud.mult.style.opacity = "1"; }
      else this.hud.mult.style.opacity = "0";
    }
    // rank progress bar — imperative, only touched when the values change
    if (this.hud.rankBar && this.hud.rankLabel &&
        (this.bricksCaught !== this._lastBarBricks || this._lang !== this._lastBarLang)) {
      this._lastBarBricks = this.bricksCaught; this._lastBarLang = this._lang;
      const cur = this.RANKS[this.runRankIdx], next = this.RANKS[this.runRankIdx + 1];
      if (next) {
        const pct = Math.max(0, Math.min(1, (this.bricksCaught - cur.min) / (next.min - cur.min)));
        this.hud.rankBar.style.width = (pct * 100).toFixed(1) + "%";
        this.hud.rankLabel.textContent = "→ " + next[this._lang][0];
      } else {
        this.hud.rankBar.style.width = "100%";
        this.hud.rankLabel.textContent = "★ " + cur[this._lang][0];
      }
    }
    // retire the drag hint once the player clearly has the hang of it
    if (!this._hintGone && this.bricksCaught >= 3 && this.hud.hint) {
      this._hintGone = true;
      this.hud.hint.style.opacity = "0";
    }
  }

  // ---- drawing ----
  _draw() {
    const ctx = this.ctx; if (!ctx) return;
    const W = this.W, H = this.H;
    ctx.save();
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    // sky (gradient cached in _resize)
    ctx.fillStyle = this._skyGrad; ctx.fillRect(-20, -20, W + 40, this.horizon + 60);
    // sun with a soft halo
    const sunX = W * 0.14, sunY = this.horizon * 0.36, sunR = Math.max(16, W * 0.042);
    ctx.fillStyle = "rgba(255,241,178,.4)";
    ctx.beginPath(); ctx.arc(sunX, sunY, sunR * 1.9, 0, 7); ctx.fill();
    ctx.fillStyle = "#FFE9A8";
    ctx.beginPath(); ctx.arc(sunX, sunY, sunR, 0, 7); ctx.fill();
    // drifting clouds
    ctx.fillStyle = "rgba(255,255,255,.85)";
    for (const cl of this.clouds) {
      const ccx = cl.fx * W, ccy = cl.fy * this.horizon, cs = Math.max(13, W * 0.03) * cl.s;
      ctx.beginPath();
      ctx.ellipse(ccx, ccy, cs * 1.6, cs * 0.6, 0, 0, 7);
      ctx.ellipse(ccx - cs, ccy + cs * 0.2, cs * 0.9, cs * 0.48, 0, 0, 7);
      ctx.ellipse(ccx + cs, ccy + cs * 0.22, cs, cs * 0.52, 0, 0, 7);
      ctx.fill();
    }
    // grass
    ctx.fillStyle = this.COL.grass; ctx.fillRect(-20, this.horizon - 1, W + 40, H - this.horizon + 40);
    // distant hill band
    ctx.fillStyle = this.COL.hill;
    ctx.beginPath(); ctx.moveTo(-20, this.horizon);
    ctx.quadraticCurveTo(W * 0.3, this.horizon - 26, W * 0.55, this.horizon - 6);
    ctx.quadraticCurveTo(W * 0.8, this.horizon - 30, W + 20, this.horizon);
    ctx.lineTo(W + 20, this.horizon + 10); ctx.lineTo(-20, this.horizon + 10); ctx.closePath(); ctx.fill();

    this._drawRoad();
    // roadside scenery far->near (behind boards & items)
    const sc = this.scenery.slice().sort((a, b) => b.z - a.z);
    for (const s of sc) this._drawScenery(s);
    // boards far->near
    const bs = this.boards.slice().sort((a, b) => b.z - a.z);
    for (const b of bs) this._drawBoard(b);
    // items far->near
    const its = this.items.slice().sort((a, b) => b.z - a.z);
    for (const it of its) this._drawItem(it);
    this._drawWheelbarrow();
    // particles
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
      ctx.fillStyle = p.c; ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }
    ctx.globalAlpha = 1;
    // floating score popups
    if (this.pops.length) {
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (const p of this.pops) {
        ctx.globalAlpha = Math.max(0, Math.min(1, (p.life / p.max) * 1.6));
        ctx.font = "700 " + p.sz + "px 'Baloo 2', sans-serif";
        ctx.fillStyle = "rgba(43,42,40,.4)"; ctx.fillText(p.txt, p.x + 1.5, p.y + 2);
        ctx.fillStyle = p.c; ctx.fillText(p.txt, p.x, p.y);
      }
      ctx.globalAlpha = 1;
    }
    // rank-up banner (rank resolved at draw time so it re-translates live)
    if (this.banner) {
      const bn = this.banner, born = 2.2 - bn.t;
      const a = Math.min(1, born / 0.15, bn.t / 0.4);
      const s = this.reduceMotion ? 1 : 0.7 + 0.3 * Math.min(1, born / 0.22);
      const fs = Math.min(34, W * 0.082);
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      ctx.translate(this.cx, H * 0.3);
      ctx.scale(s, s);
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
      const title = this.RANKS[bn.rankIdx][this._lang][0] + "!";
      ctx.font = "700 " + fs + "px 'Baloo 2', sans-serif";
      ctx.lineWidth = fs * 0.18; ctx.strokeStyle = "rgba(43,42,40,.9)";
      ctx.strokeText(title, 0, 0);
      ctx.fillStyle = "#FFD98A";
      ctx.fillText(title, 0, 0);
      const sub = this.STR[this._lang].shower;
      ctx.font = "700 " + fs * 0.5 + "px 'Baloo 2', sans-serif";
      ctx.lineWidth = fs * 0.11;
      ctx.strokeText(sub, 0, fs * 0.98);
      ctx.fillStyle = "#fff";
      ctx.fillText(sub, 0, fs * 0.98);
      ctx.restore();
    }
    // damage vignette
    if (this.flash > 0) {
      ctx.fillStyle = "rgba(196,52,32," + (this.flash * 0.5).toFixed(3) + ")";
      ctx.fillRect(-30, -30, W + 60, H + 60);
    }
    ctx.restore();
  }
  _drawScenery(s) {
    const ctx = this.ctx;
    const base = this.project(s.side * s.off, s.z, 0);
    if (base.p <= 0.04) return;
    const k = this.K * base.p;
    const fade = Math.max(0, Math.min(1, (this.zFar + 2 - s.z) / 3));
    ctx.save();
    ctx.globalAlpha = fade;
    if (s.kind === "tree") {
      const th = k * (1.0 + s.seed * 0.5), tw = Math.max(1.5, k * 0.09);
      ctx.fillStyle = "#8A6A42";
      ctx.fillRect(base.sx - tw / 2, base.sy - th, tw, th);
      ctx.fillStyle = s.seed > 0.6 ? "#4E8C33" : "#5FA23E";
      ctx.beginPath();
      ctx.arc(base.sx, base.sy - th, k * 0.4, 0, 7);
      ctx.arc(base.sx - k * 0.25, base.sy - th + k * 0.17, k * 0.28, 0, 7);
      ctx.arc(base.sx + k * 0.25, base.sy - th + k * 0.17, k * 0.28, 0, 7);
      ctx.fill();
    } else {
      ctx.fillStyle = s.seed > 0.5 ? "#58983A" : "#63A843";
      ctx.beginPath();
      ctx.arc(base.sx - k * 0.16, base.sy - k * 0.1, k * 0.19, 0, 7);
      ctx.arc(base.sx + k * 0.15, base.sy - k * 0.12, k * 0.23, 0, 7);
      ctx.arc(base.sx, base.sy - k * 0.04, k * 0.21, 0, 7);
      ctx.fill();
    }
    ctx.restore();
  }

  _drawRoad() {
    const ctx = this.ctx;
    const far = this.roadFar || this.zFar;
    const nl = this.project(-this.roadHalf - 0.35, this.zNear, 0);
    const nr = this.project(this.roadHalf + 0.35, this.zNear, 0);
    const fl = this.project(-this.roadHalf - 0.35, far, 0);
    const fr = this.project(this.roadHalf + 0.35, far, 0);
    // verge / edge
    ctx.fillStyle = this.COL.roadEdge;
    ctx.beginPath(); ctx.moveTo(nl.sx, nl.sy); ctx.lineTo(nr.sx, nr.sy); ctx.lineTo(fr.sx, fr.sy); ctx.lineTo(fl.sx, fl.sy); ctx.closePath(); ctx.fill();
    // road
    const rl = this.project(-this.roadHalf, this.zNear, 0), rr = this.project(this.roadHalf, this.zNear, 0);
    const rfl = this.project(-this.roadHalf, far, 0), rfr = this.project(this.roadHalf, far, 0);
    ctx.fillStyle = this.COL.road;
    ctx.beginPath(); ctx.moveTo(rl.sx, rl.sy); ctx.lineTo(rr.sx, rr.sy); ctx.lineTo(rfr.sx, rfr.sy); ctx.lineTo(rfl.sx, rfl.sy); ctx.closePath(); ctx.fill();
    // dashes
    ctx.fillStyle = this.COL.dash;
    for (let zz = this.zNear + this.dashPhase; zz < far; zz += 2.4) {
      const a = this.project(0, zz, 0), b = this.project(0, Math.min(zz + 1.1, far), 0);
      const wa = 0.12 * this.K * a.p, wb = 0.12 * this.K * b.p;
      ctx.beginPath(); ctx.moveTo(a.sx - wa, a.sy); ctx.lineTo(a.sx + wa, a.sy); ctx.lineTo(b.sx + wb, b.sy); ctx.lineTo(b.sx - wb, b.sy); ctx.closePath(); ctx.fill();
    }
  }

  _drawBoard(b) {
    const ctx = this.ctx;
    const base = this.project(b.side * (this.roadHalf + 1.15), b.z, 0);
    if (base.p <= 0.05) return;
    const sc = this.K * base.p;
    const poleH = 1.5 * sc, bw = 2.55 * sc, bh = 1.7 * sc, pw = Math.max(2, 0.13 * sc);
    const topY = base.sy - poleH - bh;
    const left = base.sx - bw / 2;
    b._rect = { x: left, y: topY, w: bw, h: bh }; // hit-box for tap-to-read
    // pole
    ctx.fillStyle = "#7A5A3A";
    ctx.fillRect(base.sx - pw / 2, topY + bh, pw, base.sy - (topY + bh));
    // shadow + panel
    ctx.fillStyle = "rgba(0,0,0,.16)";
    ctx.fillRect(left + 3, topY + 4, bw, bh);
    ctx.fillStyle = "#FBF4E6";
    ctx.fillRect(left, topY, bw, bh);
    // header strip
    const head = bh * 0.21;
    ctx.fillStyle = b.cm.c;
    ctx.fillRect(left, topY, bw, head);
    ctx.strokeStyle = "rgba(0,0,0,.18)"; ctx.lineWidth = Math.max(1, sc * 0.03);
    ctx.strokeRect(left, topY, bw, bh);
    if (base.p < 0.13) return;
    const L = this._lang;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.font = "600 " + Math.max(7, head * 0.54) + "px 'Baloo 2', sans-serif";
    ctx.fillText("BEARD BROTHERS", base.sx, topY + head / 2);
    // body: icon column + text column
    const bodyY = topY + head, bodyH = bh - head, iconW = bw * 0.35;
    ctx.fillStyle = this._tint(b.cm.c, 0.84);
    ctx.fillRect(left, bodyY, iconW, bodyH);
    ctx.save();
    ctx.beginPath(); ctx.rect(left, bodyY, iconW, bodyH); ctx.clip();
    this._drawIcon(b.cm.icon, left + iconW / 2, bodyY + bodyH / 2, Math.min(iconW, bodyH) * 0.6, b.cm.c);
    ctx.restore();
    const colX = left + iconW, colW = bw - iconW, tx = colX + colW / 2, tw = colW - sc * 0.22;
    // title — auto-shrink the font so long names (e.g. "Beard on! Pentru cei
    // în nevoie") still fit within 2 lines instead of being clipped.
    ctx.fillStyle = "#2B2A28";
    let tsz = Math.max(8, bh * 0.135);
    ctx.font = "700 " + tsz + "px 'Baloo 2', sans-serif";
    let lines = this._wrap(ctx, b.cm[L], tw);
    while (lines.length > 2 && tsz > 7) {
      tsz -= 1;
      ctx.font = "700 " + tsz + "px 'Baloo 2', sans-serif";
      lines = this._wrap(ctx, b.cm[L], tw);
    }
    let ty = bodyY + bodyH * 0.33 - (lines.length > 1 ? tsz * 0.5 : 0);
    for (let i = 0; i < Math.min(lines.length, 2); i++) { ctx.fillText(lines[i], tx, ty); ty += tsz * 1.05; }
    // stat
    ctx.fillStyle = b.cm.c;
    const ssz = Math.max(7, bh * 0.11);
    ctx.font = "700 " + ssz + "px 'Nunito', sans-serif";
    const sl = this._wrap(ctx, b.cm["s" + L], tw);
    let sy = bodyY + bodyH * 0.73 - (sl.length > 1 ? ssz * 0.4 : 0);
    for (let i = 0; i < Math.min(sl.length, 2); i++) { ctx.fillText(sl[i], tx, sy); sy += ssz * 1.12; }
  }

  _tint(hex, t) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const m = (c) => Math.round(c + (255 - c) * t);
    return "rgb(" + m(r) + "," + m(g) + "," + m(b) + ")";
  }

  _drawIcon(type, x, y, s, color) {
    const ctx = this.ctx;
    ctx.save(); ctx.translate(x, y); ctx.lineJoin = "round"; ctx.lineCap = "round";
    const rr = (xx, yy, w, hh, r) => { ctx.beginPath(); ctx.moveTo(xx + r, yy); ctx.arcTo(xx + w, yy, xx + w, yy + hh, r); ctx.arcTo(xx + w, yy + hh, xx, yy + hh, r); ctx.arcTo(xx, yy + hh, xx, yy, r); ctx.arcTo(xx, yy, xx + w, yy, r); ctx.closePath(); };
    switch (type) {
      case "balloons": {
        const cols = ["#E0531F", "#F2C03D", "#3F8FD0"], off = [[-s * 0.22, -s * 0.06], [0, -s * 0.16], [s * 0.22, -s * 0.06]];
        ctx.strokeStyle = "#9A8C72"; ctx.lineWidth = Math.max(1, s * 0.03);
        off.forEach((o) => { ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(0, s * 0.36); ctx.stroke(); });
        off.forEach((o, i) => { ctx.fillStyle = cols[i]; ctx.beginPath(); ctx.ellipse(o[0], o[1], s * 0.16, s * 0.19, 0, 0, 7); ctx.fill(); });
        break; }
      case "house": {
        ctx.fillStyle = "#fff"; rr(-s * 0.32, -s * 0.04, s * 0.64, s * 0.46, s * 0.04); ctx.fill();
        ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(-s * 0.42, 0); ctx.lineTo(0, -s * 0.4); ctx.lineTo(s * 0.42, 0); ctx.closePath(); ctx.fill();
        rr(-s * 0.09, s * 0.14, s * 0.18, s * 0.28, s * 0.02); ctx.fill();
        break; }
      case "heart": {
        ctx.fillStyle = "#E0413B"; ctx.beginPath(); ctx.moveTo(0, s * 0.32);
        ctx.bezierCurveTo(-s * 0.5, -s * 0.04, -s * 0.18, -s * 0.4, 0, -s * 0.12);
        ctx.bezierCurveTo(s * 0.18, -s * 0.4, s * 0.5, -s * 0.04, 0, s * 0.32); ctx.closePath(); ctx.fill();
        break; }
      case "leaf": {
        ctx.fillStyle = "#5BA63C"; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.2, s * 0.38, Math.PI / 5, 0, 7); ctx.fill();
        ctx.strokeStyle = "#3F7C28"; ctx.lineWidth = Math.max(1, s * 0.035); ctx.beginPath(); ctx.moveTo(-s * 0.16, s * 0.26); ctx.lineTo(s * 0.14, -s * 0.28); ctx.stroke();
        break; }
      case "bus": {
        ctx.fillStyle = "#F2B33A"; rr(-s * 0.42, -s * 0.3, s * 0.84, s * 0.5, s * 0.07); ctx.fill();
        ctx.fillStyle = "#cfe9f5"; rr(-s * 0.34, -s * 0.22, s * 0.68, s * 0.18, s * 0.03); ctx.fill();
        ctx.fillStyle = "#3a3632"; ctx.beginPath(); ctx.arc(-s * 0.22, s * 0.24, s * 0.1, 0, 7); ctx.arc(s * 0.22, s * 0.24, s * 0.1, 0, 7); ctx.fill();
        break; }
      case "medal": {
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.moveTo(-s * 0.2, -s * 0.42); ctx.lineTo(-s * 0.02, -s * 0.04); ctx.lineTo(-s * 0.32, -s * 0.08); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(s * 0.2, -s * 0.42); ctx.lineTo(s * 0.02, -s * 0.04); ctx.lineTo(s * 0.32, -s * 0.08); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#F2C03D"; ctx.beginPath(); ctx.arc(0, s * 0.14, s * 0.25, 0, 7); ctx.fill();
        ctx.fillStyle = "#D9A21F"; ctx.beginPath(); ctx.arc(0, s * 0.14, s * 0.14, 0, 7); ctx.fill();
        break; }
      case "car": {
        ctx.fillStyle = "#3A6FB0"; rr(-s * 0.45, -s * 0.04, s * 0.9, s * 0.28, s * 0.07); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-s * 0.28, -s * 0.03); ctx.lineTo(-s * 0.16, -s * 0.3); ctx.lineTo(s * 0.2, -s * 0.3); ctx.lineTo(s * 0.32, -s * 0.03); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#3a3632"; ctx.beginPath(); ctx.arc(-s * 0.25, s * 0.24, s * 0.1, 0, 7); ctx.arc(s * 0.25, s * 0.24, s * 0.1, 0, 7); ctx.fill();
        break; }
      case "people": {
        const px = [-s * 0.27, 0, s * 0.27]; ctx.fillStyle = color;
        px.forEach((p) => { ctx.beginPath(); ctx.arc(p, -s * 0.14, s * 0.1, 0, 7); ctx.fill(); rr(p - s * 0.13, -s * 0.02, s * 0.26, s * 0.3, s * 0.06); ctx.fill(); });
        break; }
      case "flame": {
        ctx.fillStyle = "#E0531F"; ctx.beginPath(); ctx.moveTo(0, -s * 0.42);
        ctx.quadraticCurveTo(s * 0.32, -s * 0.02, s * 0.16, s * 0.2); ctx.quadraticCurveTo(s * 0.16, s * 0.4, 0, s * 0.4);
        ctx.quadraticCurveTo(-s * 0.16, s * 0.4, -s * 0.16, s * 0.2); ctx.quadraticCurveTo(-s * 0.3, -s * 0.04, 0, -s * 0.42); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#F2C03D"; ctx.beginPath(); ctx.moveTo(0, -s * 0.1);
        ctx.quadraticCurveTo(s * 0.13, s * 0.08, s * 0.06, s * 0.22); ctx.quadraticCurveTo(0, s * 0.32, -s * 0.06, s * 0.22);
        ctx.quadraticCurveTo(-s * 0.13, s * 0.08, 0, -s * 0.1); ctx.closePath(); ctx.fill();
        break; }
      case "paint": {
        ctx.fillStyle = color; rr(-s * 0.36, -s * 0.36, s * 0.6, s * 0.22, s * 0.04); ctx.fill();
        ctx.strokeStyle = "#7A6A52"; ctx.lineWidth = Math.max(1.5, s * 0.055);
        ctx.beginPath(); ctx.moveTo(s * 0.06, -s * 0.14); ctx.lineTo(s * 0.06, s * 0.04); ctx.lineTo(s * 0.22, s * 0.04); ctx.lineTo(s * 0.22, s * 0.4); ctx.stroke();
        break; }
      case "ambulance": {
        ctx.fillStyle = "#fff"; rr(-s * 0.45, -s * 0.2, s * 0.9, s * 0.42, s * 0.06); ctx.fill();
        ctx.strokeStyle = "#D23B3B"; ctx.lineWidth = Math.max(1, s * 0.025); ctx.strokeRect(-s * 0.45, -s * 0.2, s * 0.9, s * 0.42);
        ctx.fillStyle = "#D23B3B"; ctx.fillRect(-s * 0.05, -s * 0.12, s * 0.1, s * 0.26); ctx.fillRect(-s * 0.16, -s * 0.01, s * 0.32, s * 0.1);
        ctx.fillStyle = "#3a3632"; ctx.beginPath(); ctx.arc(-s * 0.24, s * 0.26, s * 0.1, 0, 7); ctx.arc(s * 0.24, s * 0.26, s * 0.1, 0, 7); ctx.fill();
        break; }
      case "bag": {
        ctx.fillStyle = "#C98A4A"; ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 0.08);
        ctx.quadraticCurveTo(-s * 0.42, s * 0.42, 0, s * 0.44); ctx.quadraticCurveTo(s * 0.42, s * 0.42, s * 0.3, -s * 0.08); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "#9A6A34"; ctx.lineWidth = Math.max(1.5, s * 0.06);
        ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 0.08); ctx.quadraticCurveTo(0, -s * 0.3, s * 0.3, -s * 0.08); ctx.stroke();
        break; }
      case "wall": default: {
        const bw2 = s * 0.27, bh2 = s * 0.16, gap = s * 0.025; ctx.fillStyle = color;
        for (let row = 0; row < 4; row++) {
          const yy = -s * 0.34 + row * (bh2 + gap), xoff = (row % 2) ? -bw2 * 0.5 : 0;
          for (let cx2 = -s * 0.42 + xoff; cx2 < s * 0.42; cx2 += bw2 + gap) rr(cx2, yy, bw2, bh2, s * 0.02), ctx.fill();
        }
        break; }
    }
    ctx.restore();
  }
  _wrap(ctx, text, maxw) {
    const words = text.split(" "); const lines = []; let cur = "";
    for (const w of words) {
      const t = cur ? cur + " " + w : w;
      if (ctx.measureText(t).width > maxw && cur) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  _drawItem(it) {
    const ctx = this.ctx;
    const hop = Math.abs(Math.sin((this.zFar - it.z) * 2 + it.hop * 6)) * 0.35;
    const pr = this.project(it.x, it.z, hop);
    if (pr.p <= 0.04) return;
    const sc = this.K * pr.p;
    // fade in over the first couple of world units so items emerge from the distance
    // instead of popping onto the road.
    const fade = Math.max(0, Math.min(1, (this.zFar - it.z) / 2));
    ctx.save();
    ctx.globalAlpha = fade;
    if (it.heart) {
      // life pickup — beating heart with a soft glow
      const hs = 0.5 * sc * (1 + Math.sin(this.bob * 6) * 0.08);
      const hx = pr.sx, hy = pr.sy - hs * 0.45;
      ctx.fillStyle = "rgba(0,0,0,.12)";
      ctx.beginPath(); ctx.ellipse(pr.sx, pr.sy + 2, hs * 0.6, hs * 0.22, 0, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(224,65,59,.18)";
      ctx.beginPath(); ctx.arc(hx, hy, hs * 0.85, 0, 7); ctx.fill();
      ctx.fillStyle = "#E0413B";
      ctx.beginPath();
      ctx.moveTo(hx, hy + hs * 0.34);
      ctx.bezierCurveTo(hx - hs * 0.52, hy - hs * 0.04, hx - hs * 0.19, hy - hs * 0.42, hx, hy - hs * 0.12);
      ctx.bezierCurveTo(hx + hs * 0.19, hy - hs * 0.42, hx + hs * 0.52, hy - hs * 0.04, hx, hy + hs * 0.34);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.4)";
      ctx.beginPath(); ctx.ellipse(hx - hs * 0.16, hy - hs * 0.16, hs * 0.1, hs * 0.06, -0.6, 0, 7); ctx.fill();
    } else if (it.ob) {
      // grey boulder of prejudice
      const r = 0.42 * sc;
      ctx.fillStyle = "rgba(0,0,0,.14)";
      ctx.beginPath(); ctx.ellipse(pr.sx, pr.sy + r * 0.1, r * 1.1, r * 0.4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = this.COL.obstDk;
      ctx.beginPath(); ctx.arc(pr.sx, pr.sy - r * 0.7, r, 0, 7); ctx.fill();
      ctx.fillStyle = this.COL.obst;
      ctx.beginPath(); ctx.arc(pr.sx - r * 0.18, pr.sy - r * 0.85, r * 0.82, 0, 7); ctx.fill();
      const label = this.OBST[this._lang][it.obIdx];
      if (pr.p > 0.22 && label) {
        ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.font = "800 " + Math.max(8, r * 0.42) + "px 'Nunito', sans-serif";
        ctx.fillText(label, pr.sx, pr.sy - r * 0.7);
      }
    } else {
      // isometric brick (golden variant is the 5× jackpot)
      const w = 0.62 * sc, h = 0.4 * sc, d = 0.28 * sc;
      const x = pr.sx, y = pr.sy;
      // shadow
      ctx.fillStyle = "rgba(0,0,0,.13)";
      ctx.beginPath(); ctx.ellipse(x, y + 2, w * 0.7, h * 0.28, 0, 0, 7); ctx.fill();
      // front
      ctx.fillStyle = it.gold ? this.COL.gold : this.COL.brick;
      ctx.fillRect(x - w / 2, y - h, w, h);
      // right side
      ctx.fillStyle = it.gold ? this.COL.goldSide : this.COL.brickSide;
      ctx.beginPath(); ctx.moveTo(x + w / 2, y - h); ctx.lineTo(x + w / 2 + d, y - h - d); ctx.lineTo(x + w / 2 + d, y - d); ctx.lineTo(x + w / 2, y); ctx.closePath(); ctx.fill();
      // top
      ctx.fillStyle = it.gold ? this.COL.goldTop : this.COL.brickTop;
      ctx.beginPath(); ctx.moveTo(x - w / 2, y - h); ctx.lineTo(x - w / 2 + d, y - h - d); ctx.lineTo(x + w / 2 + d, y - h - d); ctx.lineTo(x + w / 2, y - h); ctx.closePath(); ctx.fill();
      if (it.gold) {
        // moving glint stripe across the front face
        ctx.save();
        ctx.beginPath(); ctx.rect(x - w / 2, y - h, w, h); ctx.clip();
        const gx = x - w / 2 + ((this.bob * 40) % (w + 12)) - 6;
        ctx.fillStyle = "rgba(255,255,255,.55)";
        ctx.beginPath();
        ctx.moveTo(gx, y); ctx.lineTo(gx + w * 0.14, y);
        ctx.lineTo(gx + w * 0.3, y - h); ctx.lineTo(gx + w * 0.16, y - h);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  _drawWheelbarrow() {
    const ctx = this.ctx;
    const cxp = this.cx + this.player.x * this.K;
    const baseY = this.H * 0.9 + Math.sin(this.bob * 3) * 2;
    const ww = this.W * 0.36 * (this.zoom || 1), wh = ww * 0.42;
    const tilt = Math.max(-0.18, Math.min(0.18, -this.vx * 0.05));
    ctx.save();
    ctx.translate(cxp, baseY);
    ctx.rotate(tilt);
    // squash & stretch on catch
    if (this.catchPulse > 0) ctx.scale(1 + this.catchPulse * 0.05, 1 - this.catchPulse * 0.07);
    // ground shadow
    ctx.fillStyle = "rgba(0,0,0,.16)";
    ctx.beginPath(); ctx.ellipse(0, wh * 0.55, ww * 0.5, wh * 0.16, 0, 0, 7); ctx.fill();
    // handles (wood, splaying to viewer)
    ctx.strokeStyle = this.COL.wbDk; ctx.lineWidth = ww * 0.05; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-ww * 0.42, -wh * 0.3); ctx.lineTo(-ww * 0.56, wh * 0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ww * 0.42, -wh * 0.3); ctx.lineTo(ww * 0.56, wh * 0.5); ctx.stroke();
    // legs
    ctx.fillStyle = this.COL.wheel;
    ctx.fillRect(-ww * 0.34, wh * 0.28, ww * 0.06, wh * 0.3);
    ctx.fillRect(ww * 0.28, wh * 0.28, ww * 0.06, wh * 0.3);
    // wheel peeking front-center
    ctx.fillStyle = this.COL.wheel;
    ctx.beginPath(); ctx.arc(0, wh * 0.42, wh * 0.26, 0, 7); ctx.fill();
    ctx.fillStyle = "#54504A";
    ctx.beginPath(); ctx.arc(0, wh * 0.42, wh * 0.1, 0, 7); ctx.fill();
    // tray (trapezoid, wider at top - we see inside)
    const topW = ww, botW = ww * 0.66, tH = wh * 0.7;
    const g = ctx.createLinearGradient(0, -tH / 2, 0, tH / 2);
    g.addColorStop(0, "#F49E55"); g.addColorStop(1, this.COL.wbDk);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-topW / 2, -tH / 2); ctx.lineTo(topW / 2, -tH / 2);
    ctx.lineTo(botW / 2, tH / 2); ctx.lineTo(-botW / 2, tH / 2); ctx.closePath(); ctx.fill();
    // inner opening
    ctx.fillStyle = this.COL.wbIn;
    ctx.beginPath();
    ctx.ellipse(0, -tH / 2 + tH * 0.08, topW * 0.46, tH * 0.16, 0, 0, 7); ctx.fill();
    // the load: caught bricks visibly pile up into a jumbled mound over the run
    const loadN = this.bricksCaught > 0 ? Math.min(9, 1 + Math.floor(this.bricksCaught / 3)) : 0;
    if (loadN > 0) {
      const bw = topW * 0.16, bh = tH * 0.17;
      for (let i = 0; i < loadN; i++) {
        const fr = (((i + 1) * 2654435761) % 97) / 97 - 0.5;  // stable pseudo-random spread
        const fr2 = (((i + 3) * 1597334677) % 89) / 89;
        const lx = fr * topW * 0.56;
        const ly = -tH / 2 + tH * 0.08 - (i % 3) * bh * 0.45 - fr2 * bh * 0.35;
        ctx.save();
        ctx.translate(lx, ly);
        ctx.rotate((fr2 - 0.5) * 0.35);
        ctx.fillStyle = i % 2 ? "#C0512B" : "#D6663C";
        ctx.fillRect(-bw / 2, -bh, bw, bh);
        ctx.fillStyle = "rgba(255,255,255,.16)";
        ctx.fillRect(-bw / 2, -bh, bw, bh * 0.3);
        ctx.restore();
      }
    }
    // rim highlight
    ctx.strokeStyle = "#FFC089"; ctx.lineWidth = Math.max(2, ww * 0.022);
    ctx.beginPath(); ctx.moveTo(-topW / 2, -tH / 2); ctx.lineTo(topW / 2, -tH / 2); ctx.stroke();
    ctx.restore();
  }
}

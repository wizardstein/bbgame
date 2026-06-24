// Beard Brothers — "Brick Catcher" game engine.
// Ported verbatim from the Claude Design handoff (Brick Catcher.dc.html, `class Component`)
// into a framework-agnostic vanilla Canvas2D engine. The React shell (BBWheelbarrow.jsx)
// mounts it onto a <canvas>, feeds it HUD DOM nodes for imperative per-frame updates,
// and subscribes to onScreen / onLang callbacks for screen + language transitions.
//
// Gameplay, projection, tuning, drawing and content are unchanged from the design.

export class GameEngine {
  constructor(opts = {}) {
    this.props = {
      difficulty: opts.difficulty || "normal",
      defaultLang: opts.defaultLang || "ro",
    };
    this.onScreen = opts.onScreen || (() => {});
    this.onLang = opts.onLang || (() => {});
    // HUD DOM nodes are assigned by React via callback refs (same object reference).
    this.hud = { score: null, lives: [null, null, null], combo: null, toast: null };

    this._lang = this.props.defaultLang === "en" ? "en" : "ro";
    let best = 0;
    try {
      best = parseInt(localStorage.getItem("bbwb_best") || "0", 10) || 0;
    } catch (e) {}
    this.best = best;

    // final-run snapshot (for share text)
    this.finalScore = 0;
    this.finalBricks = 0;
    this.finalCombo = 0;
  }

  // ---- static content ----
  STR = {
    // cedilla ş/Ş in the title — see BBWheelbarrow.jsx note (Fredoka comma-below wrap bug)
    ro: { langBtn: "EN", title: "Construieşte Şcoala", sub: "un joc Beard Brothers",
      how1: "Trage stânga–dreapta ca să prinzi cărămizile", how2: "Ferește roaba de prejudecată, indiferență, birocrație și stereotip", how3: "3 greșeli și zidul se prăbușește",
      play: "Joacă", hint: "trage cu degetul ca să muți roaba", scoreLabel: "puncte", yourRank: "Rangul tău",
      bricks: "cărămizi", bestCombo: "combo", again: "Încă o tură", buy: "Cumpără o cărămidă", share: "Distribuie",
      overNote: "Fiecare cărămidă reală ridică școala Beard Brothers, în Florești.", best: "Record", toastCopied: "Link copiat — distribuie!" },
    en: { langBtn: "RO", title: "Build the School", sub: "a Beard Brothers game",
      how1: "Drag left–right to catch the bricks", how2: "Keep prejudice, indifference, red tape & stereotypes out", how3: "3 misses and the wall collapses",
      play: "Play", hint: "drag to move the wheelbarrow", scoreLabel: "points", yourRank: "Your rank",
      bricks: "bricks", bestCombo: "combo", again: "Play again", buy: "Buy a brick", share: "Share",
      overNote: "Every real brick raises the Beard Brothers school in Florești.", best: "Best", toastCopied: "Link copied — share it!" },
  };
  CAMPS = [
    { c: "#C0512B", icon: "bag", ro: "Beard on! Pentru cei în nevoie", en: "Beard on! For those in need", sro: "40+ saci de haine", sen: "40+ bags of clothes" },
    { c: "#3E7C8C", icon: "house", ro: "Beard on! For Bărboși", en: "Beard on! For Bărboși", sro: "€3.000 · un sat ajutat", sen: "€3,000 · a village helped" },
    { c: "#7A9A3B", icon: "heart", ro: "Beard On! For Eduard", en: "Beard On! For Eduard", sro: "€3.354 · o viață salvată", sen: "€3,354 · a life saved" },
    { c: "#C99A2E", icon: "leaf", ro: "Beard On! For România", en: "Beard On! For Romania", sro: "festivaluri ecologizate", sen: "festivals cleaned up" },
    { c: "#D8643C", icon: "balloons", ro: "Catch A Smile Day", en: "Catch A Smile Day", sro: "110 orașe · 10.000 baloane", sen: "110 cities · 10,000 balloons" },
    { c: "#4E8C6A", icon: "bus", ro: "Beards in Schools", en: "Beards in Schools", sro: "€8.035 · un microbuz", sen: "€8,035 · a minibus" },
    { c: "#9C5BA0", icon: "medal", ro: "Rolling Beards", en: "Rolling Beards", sro: "€7.029 · 5 medalii", sen: "€7,029 · 5 medals" },
    { c: "#2F6E8F", icon: "car", ro: "The Beard Mobile", en: "The Beard Mobile", sro: "€15.157 · taxi gratuit", sen: "€15,157 · free taxi" },
    { c: "#B5572E", icon: "people", ro: "Campania 9", en: "Campaign 9", sro: "5 cauze · 360 voluntari", sen: "5 causes · 360 volunteers" },
    { c: "#B23B3B", icon: "flame", ro: "Enough is Enough!", en: "Enough is Enough!", sro: "€30.973 · secția de arși", sen: "€30,973 · burn unit" },
    { c: "#3F7FB0", icon: "paint", ro: "Paint the Future", en: "Paint the Future", sro: "€55.000 · spital de copii", sen: "€55,000 · kids hospital" },
    { c: "#C0392B", icon: "ambulance", ro: "Wheels for Life", en: "Wheels for Life", sro: "€167.500 · 2 ambulanțe", sen: "€167,500 · 2 ambulances" },
    { c: "#C96A23", icon: "wall", ro: "Beard Brothers School", en: "Beard Brothers School", sro: "€302.540 · o școală", sen: "€302,540 · a school" },
  ];
  OBST = { ro: ["prejudecată", "indiferență", "birocrație", "stereotip"], en: ["prejudice", "indifference", "red tape", "stereotype"] };
  RANKS = [
    { min: 0, ro: ["Trecător curios", "Te-ai oprit din drum — bun început!"], en: ["Curious passer-by", "You stopped to look — nice start!"] },
    { min: 18, ro: ["Voluntar nou", "Mâinile încep să prindă ritm."], en: ["Rookie volunteer", "Your hands are finding the rhythm."] },
    { min: 42, ro: ["Frate bărbos", "Zidul crește văzând cu ochii."], en: ["Bearded brother", "The wall is rising fast."] },
    { min: 85, ro: ["Maistru de nădejde", "Școala se ridică datorită ție."], en: ["Trusted foreman", "The school is rising thanks to you."] },
    { min: 150, ro: ["Legendă Beard Brothers", "Bărboșii îți ridică pălăria."], en: ["Beard Brothers legend", "The bearded ones salute you."] },
  ];

  // ---- colors ----
  COL = { skyTop: "#9AD4F0", skyBot: "#CFF0FB", grass: "#7FBF52", grassDk: "#6BAA45", hill: "#8FC962",
    road: "#C7BAA0", roadEdge: "#E7DBC2", dash: "#F4ECD8", brick: "#C0512B", brickTop: "#D9693E", brickSide: "#9A3F20",
    wb: "#EE8B3D", wbDk: "#C96A23", wbIn: "#B85F1F", wheel: "#34302C", obst: "#8E8B85", obstDk: "#6E6B66" };

  mount(canvas, wrap) {
    this.canvas = canvas;
    this.wrap = wrap;
    this._setup();
    this._resize();
    try { this._draw(); } catch (e) {}
    this._onResize = () => { this._resize(); try { this._draw(); } catch (e) {} };
    window.addEventListener("resize", this._onResize);
    this._onKey = (e) => {
      if (e.key === "ArrowLeft") this.keyDir = -1;
      else if (e.key === "ArrowRight") this.keyDir = 1;
    };
    this._onKeyUp = (e) => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") this.keyDir = 0; };
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
  }

  _setup() {
    this.zNear = 1; this.zFar = 16; this.roadHalf = 3; this.maxX = 2.15;
    this.player = { x: 0 }; this.targetX = 0; this.vx = 0; this.keyDir = 0;
    this.items = []; this.boards = []; this.particles = [];
    this.dashPhase = 0; this.shake = 0; this.bob = 0;
    this.playing = false; this.campIdx = 0; this.boardSide = 1;
    this.holdZ = 2.5; this.boardCooldown = 0.3;
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
    this.items.length = 0; this.particles.length = 0;
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
    this.horizon = this.H * 0.32;
    // Aspect-aware zoom: on a tall phone, K = W*0.15 makes the whole world tiny & far.
    // Zoom portrait screens in and shorten the road so it reads close, like the wide
    // desktop view. To keep things on-screen at the bigger scale we tighten the player
    // travel (maxX) and the brick spawn band so nothing flies past the screen edges.
    const aspect = this.W / this.H;
    this.zoom = aspect < 0.72 ? Math.min(1.6, 1 + (0.72 - aspect) * 2.4) : 1;
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
  onDown = (e) => { if (!this.playing) return; this.dragging = true; this.targetX = this._scrToWorldX(e.clientX); };
  onMove = (e) => { if (this.dragging && this.playing) this.targetX = this._scrToWorldX(e.clientX); };
  onUp = () => { this.dragging = false; };

  toggleLang = () => { this._lang = this._lang === "ro" ? "en" : "ro"; this.onLang(this._lang); };
  buyBrick = () => { window.open("https://scoala.beard-brothers.ro/ro", "_blank"); };
  shareScore = () => {
    const L = this._lang;
    const txt = L === "ro"
      ? `Am prins ${this.finalBricks} cărămizi pentru școala Beard Brothers! Joacă și tu:`
      : `I caught ${this.finalBricks} bricks for the Beard Brothers school! Play it:`;
    const url = location.href;
    if (navigator.share) { navigator.share({ title: "Beard Brothers", text: txt, url }).catch(() => {}); }
    else {
      const t = txt + " " + url;
      if (navigator.clipboard) navigator.clipboard.writeText(t).catch(() => {});
      this._toast(this.STR[L].toastCopied);
    }
  };
  _toast(msg) {
    const el = this.hud.toast; if (!el) return;
    el.textContent = msg; el.style.opacity = "1";
    clearTimeout(this._tt); this._tt = setTimeout(() => { el.style.opacity = "0"; }, 2200);
  }

  startGame = () => {
    this._resetRun();
    this.playing = true;
    this.spawnTimer = 0.5; this.boardTimer = 1.2;
    this.onScreen("playing");
  };
  _gameOver() {
    this.playing = false;
    const L = this._lang;
    let rk = this.RANKS[0];
    for (const r of this.RANKS) if (this.bricksCaught >= r.min) rk = r;
    const best = Math.max(this.best, this.score);
    this.best = best;
    try { localStorage.setItem("bbwb_best", String(best)); } catch (e) {}
    this.finalScore = this.score; this.finalBricks = this.bricksCaught; this.finalCombo = this.bestCombo;
    this.onScreen("over", {
      finalScore: this.score, finalBricks: this.bricksCaught, finalCombo: this.bestCombo,
      rankTitle: rk[L][0], rankBlurb: rk[L][1], best,
    });
  }

  // ---- spawning ----
  _spawnItem() {
    const obFreq = Math.min(0.16 + this.score / 4000, 0.32);
    const isOb = Math.random() < obFreq;
    const half = this._spawnHalf || this.roadHalf - 0.55;
    const x = (Math.random() * 2 - 1) * half;
    if (isOb) {
      const arr = this.OBST[this._lang];
      this.items.push({ x, z: this.zFar, ob: true, label: arr[(Math.random() * arr.length) | 0], done: false, hop: 0 });
    } else {
      this.items.push({ x, z: this.zFar, ob: false, done: false, hop: Math.random() * 0.4 });
    }
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
    this._update(dt);
    this._draw();
    this.raf = requestAnimationFrame(this.loop);
  };

  _update(dt) {
    // movement
    if (this.playing) {
      if (this.keyDir) this.targetX = Math.max(-this.maxX, Math.min(this.maxX, this.targetX + this.keyDir * dt * 4.2));
      const nx = this.player.x + (this.targetX - this.player.x) * Math.min(1, dt * 11);
      this.vx = (nx - this.player.x) / Math.max(dt, 0.001);
      this.player.x = nx;
      this.speed = this.baseSpeed + Math.min(this.score / 120, 7);
    }
    const spd = this.playing ? this.speed : this.baseSpeed * 0.7;
    this.dashPhase = (this.dashPhase + spd * dt) % 2.4;
    this.bob += dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 30);
    if (this.comboTimer > 0) this.comboTimer -= dt;

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
      if (this.spawnTimer <= 0) { this._spawnItem(); this.spawnTimer = Math.max(0.5, 1.15 - this.score / 2600); }
      for (const it of this.items) {
        it.z -= this.speed * dt;
        if (!it.done && it.z <= this.zNear + 0.05) {
          it.done = true;
          const reach = Math.abs(it.x - this.player.x) < 1.0;
          if (it.ob) {
            if (reach) { this._hit(); this._burst(it.x, "#8E8B85"); }
            else { this.score += 3; }
          } else {
            if (reach) {
              this.bricksCaught++; this.combo++; this.bestCombo = Math.max(this.bestCombo, this.combo);
              const prevMult = this.comboMult;
              this.comboMult = Math.min(1 + Math.floor(this.combo / 4), 6);
              this.score += 12 * this.comboMult;
              this._burst(this.player.x, "#E0701F");
              // pop the combo popup once per new multiplier tier, then let it fade
              // (don't keep re-triggering every catch, which made "x2" linger).
              if (this.comboMult > 1 && this.comboMult !== prevMult) { this.comboTimer = 1.1; this._showCombo(); }
            } else { this._hit(); }
          }
        }
      }
      this.items = this.items.filter((it) => it.z > 0.5);
    }

    // particles
    for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 900 * dt; p.life -= dt; }
    this.particles = this.particles.filter((p) => p.life > 0);

    this._updateHud();
  }

  _hit() {
    this.lives--; this.combo = 0; this.comboMult = 1; this.shake = 9;
    if (this.lives <= 0) this._gameOver();
  }
  _burst(worldX, color) {
    const p = this.project(worldX, this.zNear + 0.1, 0.3);
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 160;
      this.particles.push({ x: p.sx, y: p.sy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, life: 0.5 + Math.random() * 0.3, c: color, s: 4 + Math.random() * 5 });
    }
  }
  _showCombo() {
    const el = this.hud.combo; if (!el) return;
    el.textContent = "x" + this.comboMult + (this._lang === "ro" ? "  combo!" : "  combo!");
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
  }

  // ---- drawing ----
  _draw() {
    const ctx = this.ctx; if (!ctx) return;
    const W = this.W, H = this.H;
    ctx.save();
    if (this.shake > 0) ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    // sky
    let g = ctx.createLinearGradient(0, 0, 0, this.horizon + 40);
    g.addColorStop(0, this.COL.skyTop); g.addColorStop(1, this.COL.skyBot);
    ctx.fillStyle = g; ctx.fillRect(-20, -20, W + 40, this.horizon + 60);
    // grass
    ctx.fillStyle = this.COL.grass; ctx.fillRect(-20, this.horizon - 1, W + 40, H - this.horizon + 40);
    // distant hill band
    ctx.fillStyle = this.COL.hill;
    ctx.beginPath(); ctx.moveTo(-20, this.horizon);
    ctx.quadraticCurveTo(W * 0.3, this.horizon - 26, W * 0.55, this.horizon - 6);
    ctx.quadraticCurveTo(W * 0.8, this.horizon - 30, W + 20, this.horizon);
    ctx.lineTo(W + 20, this.horizon + 10); ctx.lineTo(-20, this.horizon + 10); ctx.closePath(); ctx.fill();

    this._drawRoad();
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
    ctx.font = "600 " + Math.max(7, head * 0.54) + "px 'Fredoka', sans-serif";
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
    // title
    ctx.fillStyle = "#2B2A28";
    const tsz = Math.max(8, bh * 0.135);
    ctx.font = "700 " + tsz + "px 'Fredoka', sans-serif";
    const lines = this._wrap(ctx, b.cm[L], tw);
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
    if (it.ob) {
      // grey boulder of prejudice
      const r = 0.42 * sc;
      ctx.fillStyle = "rgba(0,0,0,.14)";
      ctx.beginPath(); ctx.ellipse(pr.sx, pr.sy + r * 0.1, r * 1.1, r * 0.4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = this.COL.obstDk;
      ctx.beginPath(); ctx.arc(pr.sx, pr.sy - r * 0.7, r, 0, 7); ctx.fill();
      ctx.fillStyle = this.COL.obst;
      ctx.beginPath(); ctx.arc(pr.sx - r * 0.18, pr.sy - r * 0.85, r * 0.82, 0, 7); ctx.fill();
      if (pr.p > 0.22 && it.label) {
        ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.font = "800 " + Math.max(8, r * 0.42) + "px 'Nunito', sans-serif";
        ctx.fillText(it.label, pr.sx, pr.sy - r * 0.7);
      }
    } else {
      // isometric brick
      const w = 0.62 * sc, h = 0.4 * sc, d = 0.28 * sc;
      const x = pr.sx, y = pr.sy;
      // shadow
      ctx.fillStyle = "rgba(0,0,0,.13)";
      ctx.beginPath(); ctx.ellipse(x, y + 2, w * 0.7, h * 0.28, 0, 0, 7); ctx.fill();
      // front
      ctx.fillStyle = this.COL.brick;
      ctx.fillRect(x - w / 2, y - h, w, h);
      // right side
      ctx.fillStyle = this.COL.brickSide;
      ctx.beginPath(); ctx.moveTo(x + w / 2, y - h); ctx.lineTo(x + w / 2 + d, y - h - d); ctx.lineTo(x + w / 2 + d, y - d); ctx.lineTo(x + w / 2, y); ctx.closePath(); ctx.fill();
      // top
      ctx.fillStyle = this.COL.brickTop;
      ctx.beginPath(); ctx.moveTo(x - w / 2, y - h); ctx.lineTo(x - w / 2 + d, y - h - d); ctx.lineTo(x + w / 2 + d, y - h - d); ctx.lineTo(x + w / 2, y - h); ctx.closePath(); ctx.fill();
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
    // rim highlight
    ctx.strokeStyle = "#FFC089"; ctx.lineWidth = Math.max(2, ww * 0.022);
    ctx.beginPath(); ctx.moveTo(-topW / 2, -tH / 2); ctx.lineTo(topW / 2, -tH / 2); ctx.stroke();
    ctx.restore();
  }
}

import React, { useRef, useEffect, useState } from "react";
import { GameEngine } from "./game/GameEngine.js";
import { Analytics } from "@vercel/analytics/react";
import { track } from "@vercel/analytics";

// UI string table (DOM overlays). Kept in sync with GameEngine.STR — single source
// later via CMS/i18n. The engine owns the canvas-rendered strings + obstacle labels.
const STR = {
  // Correct Romanian comma diacritics ș/ț throughout. The browser detaches comma-below
  // marks when text wraps across line-boxes, so the title is kept on a single line
  // (white-space:nowrap + responsive size in the h1) where it renders cleanly.
  ro: { langBtn: "EN", title: "Construiește Școala", sub: "un joc Beard Brothers",
    how1: "Trage stânga–dreapta ca să prinzi cărămizile", how2: "Ferește roaba de prejudecată, indiferență, birocrație și stereotip", how3: "3 greșeli și zidul se prăbușește",
    play: "Joacă", hint: "trage cu degetul ca să muți roaba", scoreLabel: "puncte", yourRank: "Rangul tău",
    bricks: "cărămizi", bestCombo: "combo", again: "Încă o tură", buy: "Donează o cărămidă", share: "Distribuie", resume: "Continuă jocul",
    overNote: "Fiecare cărămidă reală ridică școala Beard Brothers, în Florești.", best: "Record",
    newRecord: "Record nou!", soundOn: "Pornește sunetul", soundOff: "Oprește sunetul",
    nextRank: (n, r) => `Încă ${n} cărămizi până la „${r}”`, wallAlt: "cărămizile tale" },
  en: { langBtn: "RO", title: "Build the School", sub: "a Beard Brothers game",
    how1: "Drag left–right to catch the bricks", how2: "Keep prejudice, indifference, red tape & stereotypes out", how3: "3 misses and the wall collapses",
    play: "Play", hint: "drag to move the wheelbarrow", scoreLabel: "points", yourRank: "Your rank",
    bricks: "bricks", bestCombo: "combo", again: "Play again", buy: "Donate a brick", share: "Share", resume: "Resume game",
    overNote: "Every real brick raises the Beard Brothers school in Florești.", best: "Best",
    newRecord: "New record!", soundOn: "Turn sound on", soundOff: "Turn sound off",
    nextRank: (n, r) => `${n} more bricks to “${r}”`, wallAlt: "your bricks" },
};

// game-over star rating — filled stars pop in left to right (7 ranks → 24px
// stars so the full row still fits a 320px-wide card)
function Star({ filled, delay }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"
      style={{ display: "block", ...(filled ? { animation: `bbStarPop .45s ease ${delay}s both` } : {}) }}>
      <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8-6.1-3.4-6.1 3.4 1.4-6.8-5.1-4.7 6.9-.8z"
        fill={filled ? "#F2B33A" : "#E7DCC5"} stroke={filled ? "#D9910F" : "#D5C8AD"} strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
}

// the wall you built this run — one span per brick, laid like real brickwork
function BrickWall({ n }) {
  if (n <= 0) return null;
  const shown = Math.min(n, 42), perRow = 14, rows = [];
  for (let r = 0; r * perRow < shown; r++) rows.push(Math.min(perRow, shown - r * perRow));
  return (
    <div style={{ display: "flex", flexDirection: "column-reverse", alignItems: "center", gap: 2, background: "#B9AB9A", borderRadius: 12, padding: "9px 10px", margin: "0 0 16px" }}>
      {rows.map((cnt, r) => (
        <div key={r} style={{ display: "flex", gap: 2, marginLeft: r % 2 ? 9 : 0 }}>
          {Array.from({ length: cnt }).map((_, i) => {
            const idx = r * perRow + i;
            return <span key={i} style={{ width: 15, height: 8, borderRadius: 1.5, background: idx % 2 ? "#C0512B" : "#D6663C", boxShadow: "inset 0 -1px 0 rgba(0,0,0,.18)", animation: `bbRise .3s ease ${(0.35 + idx * 0.022).toFixed(2)}s both` }} />;
          })}
        </div>
      ))}
      {n > shown && <span style={{ fontFamily: NUN, fontWeight: 800, fontSize: 10.5, color: "#fff", background: "rgba(0,0,0,.25)", borderRadius: 999, padding: "1px 8px", marginBottom: 2 }}>+{n - shown}</span>}
    </div>
  );
}

// "a RainbowApps project" signature — light-background variant from the official
// badge kit (Rainbow Engineering brand assets); only font-family adapted to the
// app's Nunito, as the kit allows. Logo colors are fixed brand colors.
const RAINBOW = ["#E2574C", "#F0933D", "#EFC23F", "#55A45E", "#3FA39B", "#4E7FD0", "#8B66C6"];
const RAINBOW_POS = [[30, 106], [39.1, 72], [64, 47.1], [98, 38], [132, 47.1], [156.9, 72], [166, 106]];
function RainbowBadge({ lang }) {
  return (
    <a
      href="https://www.rainbowapps.org" target="_blank" rel="noopener noreferrer"
      onClick={() => track("rainbowapps_badge_click")}
      style={{ display: "inline-flex", alignItems: "center", gap: 9, fontFamily: NUN, fontWeight: 600, fontSize: 13, color: "#6E675C", textDecoration: "none" }}
    >
      <svg viewBox="24 32 172 104" width="27" aria-hidden="true" style={{ display: "block" }}>
        <polyline points="42,118 51.1,84 76,59.1 110,50 144,59.1 168.9,84 178,118" fill="none" stroke="#DAD3C6" strokeWidth="2.5" />
        {RAINBOW_POS.map(([x, y], i) => <rect key={i} x={x} y={y} width="24" height="24" rx="7.5" fill={RAINBOW[i]} />)}
      </svg>
      {lang === "ro"
        ? <span>un proiect <strong style={{ fontWeight: 800, color: "#2B2723" }}>RainbowApps</strong></span>
        : <span>a <strong style={{ fontWeight: 800, color: "#2B2723" }}>RainbowApps</strong> project</span>}
    </a>
  );
}

// Baloo 2 — chunky rounded display face with full, correctly-weighted Romanian
// comma-below diacritics (ș/ț), unlike Fredoka whose extended glyphs look thin.
const FRED = "'Baloo 2', sans-serif";
const NUN = "'Nunito', sans-serif";

export default function BBWheelbarrow({ difficulty = "normal", defaultLang = "ro" }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const hud = useRef({ score: null, lives: [null, null, null], combo: null, mult: null, toast: null, rankBar: null, rankLabel: null, hint: null });
  const primaryBtnRef = useRef(null);
  const boardBtnRef = useRef(null);

  const [screen, setScreen] = useState("start");
  const [lang, setLang] = useState(defaultLang === "en" ? "en" : "ro");
  const [best, setBest] = useState(0);
  const [res, setRes] = useState({ finalScore: 0, finalBricks: 0, finalCombo: 0, rankIdx: 0, isRecord: false });
  const [board, setBoard] = useState(null);
  const [muted, setMuted] = useState(false);
  // count-up values for the game-over stat cards
  const [count, setCount] = useState({ s: 0, b: 0, c: 0 });

  useEffect(() => {
    const engine = new GameEngine({
      difficulty,
      defaultLang,
      onScreen: (scr, r) => {
        setScreen(scr);
        if (r) { setRes(r); setBest(r.best); }
        // Vercel Web Analytics — cookieless, no PII, no consent banner needed.
        if (scr === "playing") track("game_start");
        else if (scr === "over" && r) track("game_over", { score: r.finalScore, bricks: r.finalBricks, combo: r.finalCombo, record: !!r.isRecord });
      },
      onLang: (l) => setLang(l),
      onBoard: (cm) => { setBoard(cm); if (cm) track("billboard_open", { campaign: cm.en }); },
      onEvent: (name, data) => track(name, data),
    });
    engine.hud = hud.current;
    engineRef.current = engine;
    setBest(engine.best);
    setLang(engine._lang);
    setMuted(engine.sfx.muted);
    engine.mount(canvasRef.current, wrapRef.current);
    if (import.meta.env.DEV) window.__bbEngine = engine; // Playwright hook, dev only
    return () => {
      engine.destroy();
      engineRef.current = null;
      if (import.meta.env.DEV) delete window.__bbEngine;
    };
  }, [difficulty, defaultLang]);

  // game-over: count the stat cards up from 0 (skipped under reduced motion)
  useEffect(() => {
    if (screen !== "over") return;
    let rm = false;
    try { rm = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
    if (rm) { setCount({ s: res.finalScore, b: res.finalBricks, c: res.finalCombo }); return; }
    setCount({ s: 0, b: 0, c: 0 });
    const t0 = performance.now(), D = 900;
    let raf;
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / D);
      const ease = 1 - Math.pow(1 - k, 3);
      setCount({ s: Math.round(res.finalScore * ease), b: Math.round(res.finalBricks * ease), c: Math.round(res.finalCombo * ease) });
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [screen, res]);

  // game-over: a rising tick as each earned star pops in
  useEffect(() => {
    if (screen !== "over") return;
    const timers = [];
    for (let i = 0; i <= res.rankIdx; i++) {
      timers.push(setTimeout(() => engineRef.current && engineRef.current.sfx.star(i), 400 + i * 150));
    }
    return () => timers.forEach(clearTimeout);
  }, [screen, res]);

  // keep <html lang> in sync with the in-game language toggle (screen readers)
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  // move keyboard focus to the primary action when a menu screen appears
  useEffect(() => {
    if (screen === "start" || screen === "over") primaryBtnRef.current?.focus();
  }, [screen]);

  // focus the resume button when a billboard opens for reading
  useEffect(() => { if (board) boardBtnRef.current?.focus(); }, [board]);

  const e = () => engineRef.current;
  const t = STR[lang] || STR.ro;
  const bestLine = best > 0 ? `${t.best}: ${best}` : "";
  // rank title/blurb resolved live from the engine's RANKS so they re-translate on toggle
  const rank = engineRef.current ? engineRef.current.RANKS[res.rankIdx]?.[lang] : null;

  return (
    <div
      ref={wrapRef}
      style={{
        position: "fixed", inset: 0, overflow: "hidden", touchAction: "none",
        background: "#A8DCF2", fontFamily: NUN, userSelect: "none", WebkitUserSelect: "none",
      }}
      onPointerDown={(ev) => e() && e().onDown(ev)}
      onPointerMove={(ev) => e() && e().onMove(ev)}
      onPointerUp={() => e() && e().onUp()}
      onPointerLeave={() => e() && e().onUp()}
      onPointerCancel={() => e() && e().onUp()}
    >
      <canvas ref={canvasRef} aria-label={lang === "ro" ? "Joc Beard Brothers — prinde cărămizile mișcând roaba cu degetul sau cu săgețile" : "Beard Brothers game — catch the bricks by moving the wheelbarrow with touch or arrow keys"} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />

      {/* LANG PILL (always) */}
      <button
        onClick={() => e() && e().toggleLang()}
        aria-label={lang === "ro" ? "Switch to English" : "Comută în română"}
        style={{
          position: "absolute", top: 14, right: 14, zIndex: 40, pointerEvents: "auto", border: "none",
          cursor: "pointer", fontFamily: FRED, fontWeight: 600, fontSize: 14, color: "#2B2A28",
          background: "rgba(255,255,255,.82)", backdropFilter: "blur(6px)", borderRadius: 999,
          padding: "7px 14px", boxShadow: "0 2px 8px rgba(0,0,0,.14)",
        }}
      >
        {t.langBtn}
      </button>

      {/* MUTE PILL (always) */}
      <button
        onClick={() => {
          const en = engineRef.current; if (!en) return;
          const m = !muted;
          en.sfx.setMuted(m); setMuted(m);
          if (!m) { en.sfx.unlock(); en.sfx.ui(); } // audible confirmation on unmute
        }}
        aria-label={muted ? t.soundOn : t.soundOff}
        aria-pressed={!muted}
        style={{
          position: "absolute", top: 14, right: 72, zIndex: 40, pointerEvents: "auto", border: "none",
          cursor: "pointer", fontSize: 15, lineHeight: 1, color: "#2B2A28",
          background: "rgba(255,255,255,.82)", backdropFilter: "blur(6px)", borderRadius: 999,
          padding: "7px 11px", boxShadow: "0 2px 8px rgba(0,0,0,.14)",
        }}
      >
        {muted ? "🔇" : "🔊"}
      </button>

      {/* PLAY HUD */}
      {screen === "playing" && (
        <div style={{ position: "absolute", inset: 0, zIndex: 20, pointerEvents: "none" }}>
          <div style={{
            position: "absolute", top: 13, left: 14, display: "flex", alignItems: "center", gap: 9,
            background: "rgba(255,255,255,.82)", backdropFilter: "blur(6px)", borderRadius: 999,
            padding: "7px 15px 7px 9px", boxShadow: "0 2px 8px rgba(0,0,0,.14)",
          }}>
            <span style={{ display: "inline-block", width: 22, height: 15, borderRadius: 3, background: "linear-gradient(#D6663C,#B6481F)", boxShadow: "inset 0 -2px 0 rgba(0,0,0,.18)" }} />
            <span ref={(el) => (hud.current.score = el)} style={{ fontFamily: FRED, fontWeight: 700, fontSize: 22, color: "#2B2A28", lineHeight: 1 }}>0</span>
          </div>
          {/* combo multiplier — top-right, separate from the score so it doesn't read
              as if the final score is multiplied by it */}
          <div
            ref={(el) => (hud.current.mult = el)}
            style={{ position: "absolute", top: 56, right: 14, fontFamily: FRED, fontWeight: 700, fontSize: 20, color: "#fff", background: "linear-gradient(#F0973E,#E0701F)", borderRadius: 10, padding: "3px 13px", boxShadow: "0 2px 8px rgba(0,0,0,.2)", opacity: 0, transition: "opacity .15s" }}
          />
          <div style={{ position: "absolute", top: 54, left: 14, display: "flex", gap: 6 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} ref={(el) => (hud.current.lives[i] = el)} style={{ width: 18, height: 13, borderRadius: 3, background: "#EE8B3D", boxShadow: "inset 0 -2px 0 rgba(0,0,0,.18)" }} />
            ))}
          </div>
          {/* progress toward the next rank — an always-visible goal during play */}
          <div style={{ position: "absolute", top: 13, left: "50%", transform: "translateX(-50%)", width: "min(150px, 31vw)", background: "rgba(255,255,255,.82)", backdropFilter: "blur(6px)", borderRadius: 999, padding: "5px 12px 7px", boxShadow: "0 2px 8px rgba(0,0,0,.14)" }}>
            <div ref={(el) => (hud.current.rankLabel = el)} style={{ fontFamily: FRED, fontWeight: 600, fontSize: 10, lineHeight: 1.25, color: "#6F6452", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: "center" }} />
            <div style={{ height: 5, borderRadius: 999, background: "#E4D9C2", marginTop: 3, overflow: "hidden" }}>
              <div ref={(el) => (hud.current.rankBar = el)} style={{ height: "100%", width: "0%", borderRadius: 999, background: "linear-gradient(90deg,#F0973E,#E0701F)", transition: "width .25s" }} />
            </div>
          </div>
          <div ref={(el) => (hud.current.combo = el)} style={{ position: "absolute", top: "24%", left: 0, right: 0, textAlign: "center", fontFamily: FRED, fontWeight: 700, fontSize: 30, color: "#fff", textShadow: "0 2px 0 #C96A23,0 4px 10px rgba(0,0,0,.25)", opacity: 0, transition: "opacity .15s" }} />
          <div style={{ position: "absolute", bottom: 18, left: 0, right: 0, textAlign: "center" }}>
            <span ref={(el) => (hud.current.hint = el)} style={{ display: "inline-block", fontFamily: FRED, fontWeight: 600, fontSize: 15, color: "#fff", background: "rgba(20,30,38,.6)", padding: "5px 14px", borderRadius: 999, transition: "opacity .6s" }}>↤ {t.hint} ↦</span>
          </div>
        </div>
      )}

      {/* START */}
      {screen === "start" && (
        <div style={{ position: "absolute", inset: 0, zIndex: 30, display: "flex", alignItems: "center", justifyContent: "center", padding: 22, background: "linear-gradient(180deg,rgba(20,40,55,.18),rgba(20,40,55,.5))" }}>
          <div style={{ width: "100%", maxWidth: 380, background: "#FBF4E6", borderRadius: 26, padding: "30px 26px 26px", boxShadow: "0 24px 60px rgba(0,0,0,.32)", animation: "bbPop .35s ease both", textAlign: "center" }}>
            <div style={{ fontFamily: FRED, fontWeight: 600, fontSize: 12, letterSpacing: ".18em", textTransform: "uppercase", color: "#C96A23" }}>Beard Brothers</div>
            <h1 style={{ fontFamily: FRED, fontWeight: 700, fontSize: "clamp(20px, 7.4vw, 38px)", whiteSpace: "nowrap", lineHeight: 1.04, margin: "6px 0 20px", color: "#2B2A28" }}>{t.title}</h1>
            <div style={{ display: "flex", flexDirection: "column", gap: 9, textAlign: "left", marginBottom: 22 }}>
              {[["#EE8B3D", "1", t.how1], ["#8A8782", "2", t.how2], ["#C0512B", "3", t.how3]].map(([bg, n, txt]) => (
                <div key={n} style={{ display: "flex", alignItems: "center", gap: 11, fontSize: 14, fontWeight: 600, color: "#3C382F" }}>
                  <span style={{ flex: "none", width: 30, height: 30, borderRadius: 9, background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FRED, fontWeight: 700, color: "#fff" }}>{n}</span>
                  {txt}
                </div>
              ))}
            </div>
            <button ref={primaryBtnRef} onClick={() => e() && e().startGame()} style={{ width: "100%", border: "none", cursor: "pointer", fontFamily: FRED, fontWeight: 700, fontSize: 21, color: "#fff", background: "linear-gradient(#F08C3E,#E0701F)", borderRadius: 16, padding: 16, boxShadow: "0 6px 0 #B6541A,0 10px 20px rgba(224,112,31,.4)" }}>{t.play}</button>
            <div style={{ marginTop: 14, fontSize: 13, fontWeight: 700, color: "#6F6452" }}>{bestLine}</div>
            <div style={{ marginTop: bestLine ? 10 : 2 }}><RainbowBadge lang={lang} /></div>
          </div>
        </div>
      )}

      {/* GAME OVER */}
      {screen === "over" && (
        <div style={{ position: "absolute", inset: 0, zIndex: 30, display: "flex", alignItems: "center", justifyContent: "center", padding: 22, background: "linear-gradient(180deg,rgba(20,40,55,.28),rgba(20,40,55,.62))" }}>
          <div style={{ position: "relative", width: "100%", maxWidth: 390 }}>
            {res.isRecord && (
              <div style={{ position: "absolute", top: -13, right: -6, zIndex: 2, transform: "rotate(5deg)" }}>
                <div style={{ fontFamily: FRED, fontWeight: 700, fontSize: 13.5, color: "#5C4708", background: "linear-gradient(#F6CE58,#E8A825)", borderRadius: 999, padding: "7px 14px", boxShadow: "0 4px 12px rgba(0,0,0,.28)", animation: "bbStarPop .5s ease .6s both" }}>
                  🏆 {t.newRecord}
                </div>
              </div>
            )}
            <div style={{ maxHeight: "86vh", overflowY: "auto", WebkitOverflowScrolling: "touch", background: "#FBF4E6", borderRadius: 26, padding: 24, boxShadow: "0 24px 60px rgba(0,0,0,.36)", animation: "bbPop .32s ease both", textAlign: "center" }}>
              <div style={{ fontFamily: FRED, fontWeight: 600, fontSize: 12, letterSpacing: ".16em", textTransform: "uppercase", color: "#C96A23" }}>{t.yourRank}</div>
              <div style={{ display: "flex", justifyContent: "center", gap: 4, margin: "9px 0 4px" }}>
                {Array.from({ length: engineRef.current ? engineRef.current.RANKS.length : 5 }).map((_, i) => (
                  <Star key={i} filled={i <= res.rankIdx} delay={0.4 + i * 0.15} />
                ))}
              </div>
              <h2 style={{ fontFamily: FRED, fontWeight: 700, fontSize: 29, lineHeight: 1.05, margin: "2px 0 5px", color: "#2B2A28" }}>{rank ? rank[0] : ""}</h2>
              <p style={{ margin: "0 0 14px", fontSize: 14, fontWeight: 600, color: "#6F6452", lineHeight: 1.4 }}>{rank ? rank[1] : ""}</p>
              <BrickWall n={res.finalBricks} />
              <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                {[[count.s, t.scoreLabel, "#E0701F", 0.15], [count.b, t.bricks, "#C0512B", 0.25], [count.c, t.bestCombo, "#2B2A28", 0.35]].map(([val, label, col, dly], i) => (
                  <div key={i} style={{ flex: 1, background: "#fff", borderRadius: 16, padding: "13px 6px", animation: `bbRise .35s ease ${dly}s both` }}>
                    <div style={{ fontFamily: FRED, fontWeight: 700, fontSize: 29, color: col, lineHeight: 1 }}>{val}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#6F6452", marginTop: 3 }}>{label}</div>
                  </div>
                ))}
              </div>
              {engineRef.current && res.rankIdx < engineRef.current.RANKS.length - 1 && (() => {
                const next = engineRef.current.RANKS[res.rankIdx + 1];
                const pct = Math.max(0.04, Math.min(1, res.finalBricks / next.min));
                return (
                  <div style={{ margin: "0 0 14px", animation: "bbRise .35s ease .45s both" }}>
                    <p style={{ margin: "0 0 6px", fontSize: 12.5, fontWeight: 700, color: "#8A7B5F" }}>{t.nextRank(next.min - res.finalBricks, next[lang][0])}</p>
                    <div style={{ height: 7, borderRadius: 999, background: "#EBDFC8", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${(pct * 100).toFixed(1)}%`, borderRadius: 999, background: "linear-gradient(90deg,#F0973E,#E0701F)" }} />
                    </div>
                  </div>
                );
              })()}
              <p style={{ margin: "0 0 15px", fontSize: 13.5, fontWeight: 600, color: "#5C5648", lineHeight: 1.45 }}>{t.overNote}</p>
              <button ref={primaryBtnRef} onClick={() => { track("buy_brick_click"); e() && e().buyBrick(); }} style={{ width: "100%", border: "none", cursor: "pointer", fontFamily: FRED, fontWeight: 700, fontSize: 19, color: "#fff", background: "linear-gradient(#F08C3E,#E0701F)", borderRadius: 16, padding: 15, boxShadow: "0 5px 0 #B6541A,0 10px 18px rgba(224,112,31,.36)", marginBottom: 10 }}>🧱 {t.buy}</button>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => { track("share_click"); e() && e().shareScore(); }} style={{ flex: 1, border: "2px solid #E0701F", cursor: "pointer", fontFamily: FRED, fontWeight: 700, fontSize: 16, color: "#E0701F", background: "#fff", borderRadius: 14, padding: 12 }}>{t.share}</button>
                <button onClick={() => e() && e().startGame()} style={{ flex: 1, border: "none", cursor: "pointer", fontFamily: FRED, fontWeight: 700, fontSize: 16, color: "#2B2A28", background: "#EFE6D2", borderRadius: 14, padding: 12 }}>{t.again}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BILLBOARD DETAIL — tap a billboard to read it; the game is paused.
          Capped height with an internally scrollable body so long descriptions
          never spill over or get truncated; header + buttons stay pinned. */}
      {board && (
        <div style={{ position: "absolute", inset: 0, zIndex: 45, display: "flex", alignItems: "center", justifyContent: "center", padding: 22, background: "linear-gradient(180deg,rgba(20,40,55,.42),rgba(20,40,55,.72))" }}>
          <div style={{ width: "100%", maxWidth: 380, maxHeight: "86vh", display: "flex", flexDirection: "column", background: "#FBF4E6", borderRadius: 26, overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,.42)", animation: "bbPop .3s ease both" }}>
            <div style={{ flex: "none", background: board.c, color: "#fff", fontFamily: FRED, fontWeight: 600, fontSize: 13, letterSpacing: ".16em", textTransform: "uppercase", padding: "12px 22px", textAlign: "center" }}>Beard Brothers</div>
            <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", touchAction: "pan-y", padding: "22px 24px 6px", textAlign: "center" }}>
              <h2 style={{ fontFamily: FRED, fontWeight: 700, fontSize: 25, lineHeight: 1.12, margin: "0 0 12px", color: "#2B2A28", overflowWrap: "anywhere" }}>{board[lang]}</h2>
              <div><span style={{ display: "inline-block", maxWidth: "100%", marginBottom: 14, background: board.c, color: "#fff", fontFamily: NUN, fontWeight: 800, fontSize: 15, padding: "6px 16px", borderRadius: 999, overflowWrap: "anywhere" }}>{board["s" + lang]}</span></div>
              <p style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 600, color: "#5C5648", lineHeight: 1.55, overflowWrap: "anywhere", whiteSpace: "pre-line", textAlign: "left" }}>{board["d" + lang]}</p>
            </div>
            <div style={{ flex: "none", padding: "12px 24px 20px", borderTop: "1px solid rgba(0,0,0,.07)" }}>
              <button ref={boardBtnRef} onClick={() => e() && e().resumeBoard()} style={{ width: "100%", border: "none", cursor: "pointer", fontFamily: FRED, fontWeight: 700, fontSize: 18, color: "#fff", background: "linear-gradient(#F08C3E,#E0701F)", borderRadius: 16, padding: 14, boxShadow: "0 5px 0 #B6541A", marginBottom: 10 }}>{t.resume}</button>
              <button onClick={() => { track("buy_brick_click"); e() && e().buyBrick(); }} style={{ width: "100%", border: "2px solid #E0701F", cursor: "pointer", fontFamily: FRED, fontWeight: 700, fontSize: 15, color: "#E0701F", background: "#fff", borderRadius: 14, padding: 11 }}>🧱 {t.buy}</button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      <div ref={(el) => (hud.current.toast = el)} style={{ position: "absolute", bottom: 74, left: "50%", transform: "translateX(-50%)", zIndex: 50, background: "#2B2A28", color: "#fff", fontWeight: 700, fontSize: 14, padding: "10px 18px", borderRadius: 999, opacity: 0, transition: "opacity .25s", pointerEvents: "none" }} />
      <Analytics />
    </div>
  );
}

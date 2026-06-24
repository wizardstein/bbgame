import React, { useRef, useEffect, useState } from "react";
import { GameEngine } from "./game/GameEngine.js";

// UI string table (DOM overlays). Kept in sync with GameEngine.STR — single source
// later via CMS/i18n. The engine owns the canvas-rendered strings + obstacle labels.
const STR = {
  // Correct Romanian comma diacritics ș/ț throughout. The browser detaches comma-below
  // marks when text wraps across line-boxes, so the title is kept on a single line
  // (white-space:nowrap + responsive size in the h1) where it renders cleanly.
  ro: { langBtn: "EN", title: "Construiește Școala", sub: "un joc Beard Brothers",
    how1: "Trage stânga–dreapta ca să prinzi cărămizile", how2: "Ferește roaba de prejudecată, indiferență, birocrație și stereotip", how3: "3 greșeli și zidul se prăbușește",
    play: "Joacă", hint: "trage cu degetul ca să muți roaba", scoreLabel: "puncte", yourRank: "Rangul tău",
    bricks: "cărămizi", bestCombo: "combo", again: "Încă o tură", buy: "Cumpără o cărămidă", share: "Distribuie",
    overNote: "Fiecare cărămidă reală ridică școala Beard Brothers, în Florești.", best: "Record" },
  en: { langBtn: "RO", title: "Build the School", sub: "a Beard Brothers game",
    how1: "Drag left–right to catch the bricks", how2: "Keep prejudice, indifference, red tape & stereotypes out", how3: "3 misses and the wall collapses",
    play: "Play", hint: "drag to move the wheelbarrow", scoreLabel: "points", yourRank: "Your rank",
    bricks: "bricks", bestCombo: "combo", again: "Play again", buy: "Buy a brick", share: "Share",
    overNote: "Every real brick raises the Beard Brothers school in Florești.", best: "Best" },
};

// Baloo 2 — chunky rounded display face with full, correctly-weighted Romanian
// comma-below diacritics (ș/ț), unlike Fredoka whose extended glyphs look thin.
const FRED = "'Baloo 2', sans-serif";
const NUN = "'Nunito', sans-serif";

export default function BBWheelbarrow({ difficulty = "normal", defaultLang = "ro" }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const hud = useRef({ score: null, lives: [null, null, null], combo: null, mult: null, toast: null });

  const [screen, setScreen] = useState("start");
  const [lang, setLang] = useState(defaultLang === "en" ? "en" : "ro");
  const [best, setBest] = useState(0);
  const [res, setRes] = useState({ finalScore: 0, finalBricks: 0, finalCombo: 0, rankIdx: 0 });

  useEffect(() => {
    const engine = new GameEngine({
      difficulty,
      defaultLang,
      onScreen: (scr, r) => {
        setScreen(scr);
        if (r) { setRes(r); setBest(r.best); }
      },
      onLang: (l) => setLang(l),
    });
    engine.hud = hud.current;
    engineRef.current = engine;
    setBest(engine.best);
    setLang(engine._lang);
    engine.mount(canvasRef.current, wrapRef.current);
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [difficulty, defaultLang]);

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
    >
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />

      {/* LANG PILL (always) */}
      <button
        onClick={() => e() && e().toggleLang()}
        style={{
          position: "absolute", top: 14, right: 14, zIndex: 40, pointerEvents: "auto", border: "none",
          cursor: "pointer", fontFamily: FRED, fontWeight: 600, fontSize: 14, color: "#2B2A28",
          background: "rgba(255,255,255,.82)", backdropFilter: "blur(6px)", borderRadius: 999,
          padding: "7px 14px", boxShadow: "0 2px 8px rgba(0,0,0,.14)",
        }}
      >
        {t.langBtn}
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
            <span
              ref={(el) => (hud.current.mult = el)}
              style={{ fontFamily: FRED, fontWeight: 700, fontSize: 16, color: "#fff", background: "linear-gradient(#F0973E,#E0701F)", borderRadius: 8, padding: "1px 7px", lineHeight: 1.3, opacity: 0, transition: "opacity .15s" }}
            />
          </div>
          <div style={{ position: "absolute", top: 54, left: 14, display: "flex", gap: 6 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} ref={(el) => (hud.current.lives[i] = el)} style={{ width: 18, height: 13, borderRadius: 3, background: "#EE8B3D", boxShadow: "inset 0 -2px 0 rgba(0,0,0,.18)" }} />
            ))}
          </div>
          <div ref={(el) => (hud.current.combo = el)} style={{ position: "absolute", top: "24%", left: 0, right: 0, textAlign: "center", fontFamily: FRED, fontWeight: 700, fontSize: 30, color: "#fff", textShadow: "0 2px 0 #C96A23,0 4px 10px rgba(0,0,0,.25)", opacity: 0, transition: "opacity .15s" }} />
          <div style={{ position: "absolute", bottom: 18, left: 0, right: 0, textAlign: "center", fontFamily: FRED, fontWeight: 500, fontSize: 15, color: "rgba(255,255,255,.92)", textShadow: "0 1px 4px rgba(0,0,0,.35)" }}>↤ {t.hint} ↦</div>
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
            <button onClick={() => e() && e().startGame()} style={{ width: "100%", border: "none", cursor: "pointer", fontFamily: FRED, fontWeight: 700, fontSize: 21, color: "#fff", background: "linear-gradient(#F08C3E,#E0701F)", borderRadius: 16, padding: 16, boxShadow: "0 6px 0 #B6541A,0 10px 20px rgba(224,112,31,.4)" }}>{t.play}</button>
            <div style={{ marginTop: 14, fontSize: 13, fontWeight: 700, color: "#A79B86" }}>{bestLine}</div>
          </div>
        </div>
      )}

      {/* GAME OVER */}
      {screen === "over" && (
        <div style={{ position: "absolute", inset: 0, zIndex: 30, display: "flex", alignItems: "center", justifyContent: "center", padding: 22, background: "linear-gradient(180deg,rgba(20,40,55,.28),rgba(20,40,55,.62))" }}>
          <div style={{ width: "100%", maxWidth: 390, background: "#FBF4E6", borderRadius: 26, padding: 26, boxShadow: "0 24px 60px rgba(0,0,0,.36)", animation: "bbPop .32s ease both", textAlign: "center" }}>
            <div style={{ fontFamily: FRED, fontWeight: 600, fontSize: 12, letterSpacing: ".16em", textTransform: "uppercase", color: "#C96A23" }}>{t.yourRank}</div>
            <h2 style={{ fontFamily: FRED, fontWeight: 700, fontSize: 30, lineHeight: 1.05, margin: "4px 0 18px", color: "#2B2A28" }}>{rank ? rank[0] : ""}</h2>
            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
              {[[res.finalScore, t.scoreLabel, "#E0701F"], [res.finalBricks, t.bricks, "#C0512B"], [res.finalCombo, t.bestCombo, "#2B2A28"]].map(([val, label, col], i) => (
                <div key={i} style={{ flex: 1, background: "#fff", borderRadius: 16, padding: "14px 8px" }}>
                  <div style={{ fontFamily: FRED, fontWeight: 700, fontSize: 30, color: col, lineHeight: 1 }}>{val}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#A79B86", marginTop: 3 }}>{label}</div>
                </div>
              ))}
            </div>
            <p style={{ margin: "0 0 16px", fontSize: 13.5, fontWeight: 600, color: "#5C5648", lineHeight: 1.45 }}>{t.overNote}</p>
            <button onClick={() => e() && e().buyBrick()} style={{ width: "100%", border: "none", cursor: "pointer", fontFamily: FRED, fontWeight: 700, fontSize: 19, color: "#fff", background: "linear-gradient(#F08C3E,#E0701F)", borderRadius: 16, padding: 15, boxShadow: "0 5px 0 #B6541A,0 10px 18px rgba(224,112,31,.36)", marginBottom: 10 }}>🧱 {t.buy}</button>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => e() && e().shareScore()} style={{ flex: 1, border: "2px solid #E0701F", cursor: "pointer", fontFamily: FRED, fontWeight: 700, fontSize: 16, color: "#E0701F", background: "#fff", borderRadius: 14, padding: 12 }}>{t.share}</button>
              <button onClick={() => e() && e().startGame()} style={{ flex: 1, border: "none", cursor: "pointer", fontFamily: FRED, fontWeight: 700, fontSize: 16, color: "#2B2A28", background: "#EFE6D2", borderRadius: 14, padding: 12 }}>{t.again}</button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      <div ref={(el) => (hud.current.toast = el)} style={{ position: "absolute", bottom: 74, left: "50%", transform: "translateX(-50%)", zIndex: 50, background: "#2B2A28", color: "#fff", fontWeight: 700, fontSize: 14, padding: "10px 18px", borderRadius: 999, opacity: 0, transition: "opacity .25s", pointerEvents: "none" }} />
    </div>
  );
}

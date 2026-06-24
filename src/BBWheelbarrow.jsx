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
    overNote: "Fiecare cărămidă reală ridică școala Beard Brothers, în Florești.", best: "Record" },
  en: { langBtn: "RO", title: "Build the School", sub: "a Beard Brothers game",
    how1: "Drag left–right to catch the bricks", how2: "Keep prejudice, indifference, red tape & stereotypes out", how3: "3 misses and the wall collapses",
    play: "Play", hint: "drag to move the wheelbarrow", scoreLabel: "points", yourRank: "Your rank",
    bricks: "bricks", bestCombo: "combo", again: "Play again", buy: "Donate a brick", share: "Share", resume: "Resume game",
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
  const primaryBtnRef = useRef(null);
  const boardBtnRef = useRef(null);

  const [screen, setScreen] = useState("start");
  const [lang, setLang] = useState(defaultLang === "en" ? "en" : "ro");
  const [best, setBest] = useState(0);
  const [res, setRes] = useState({ finalScore: 0, finalBricks: 0, finalCombo: 0, rankIdx: 0 });
  const [board, setBoard] = useState(null);

  useEffect(() => {
    const engine = new GameEngine({
      difficulty,
      defaultLang,
      onScreen: (scr, r) => {
        setScreen(scr);
        if (r) { setRes(r); setBest(r.best); }
        // Vercel Web Analytics — cookieless, no PII, no consent banner needed.
        if (scr === "playing") track("game_start");
        else if (scr === "over" && r) track("game_over", { score: r.finalScore, bricks: r.finalBricks, combo: r.finalCombo });
      },
      onLang: (l) => setLang(l),
      onBoard: (cm) => { setBoard(cm); if (cm) track("billboard_open", { campaign: cm.en }); },
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
          <div ref={(el) => (hud.current.combo = el)} style={{ position: "absolute", top: "24%", left: 0, right: 0, textAlign: "center", fontFamily: FRED, fontWeight: 700, fontSize: 30, color: "#fff", textShadow: "0 2px 0 #C96A23,0 4px 10px rgba(0,0,0,.25)", opacity: 0, transition: "opacity .15s" }} />
          <div style={{ position: "absolute", bottom: 18, left: 0, right: 0, textAlign: "center" }}>
            <span style={{ display: "inline-block", fontFamily: FRED, fontWeight: 600, fontSize: 15, color: "#fff", background: "rgba(20,30,38,.6)", padding: "5px 14px", borderRadius: 999 }}>↤ {t.hint} ↦</span>
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
          </div>
        </div>
      )}

      {/* GAME OVER */}
      {screen === "over" && (
        <div style={{ position: "absolute", inset: 0, zIndex: 30, display: "flex", alignItems: "center", justifyContent: "center", padding: 22, background: "linear-gradient(180deg,rgba(20,40,55,.28),rgba(20,40,55,.62))" }}>
          <div style={{ width: "100%", maxWidth: 390, background: "#FBF4E6", borderRadius: 26, padding: 26, boxShadow: "0 24px 60px rgba(0,0,0,.36)", animation: "bbPop .32s ease both", textAlign: "center" }}>
            <div style={{ fontFamily: FRED, fontWeight: 600, fontSize: 12, letterSpacing: ".16em", textTransform: "uppercase", color: "#C96A23" }}>{t.yourRank}</div>
            <h2 style={{ fontFamily: FRED, fontWeight: 700, fontSize: 30, lineHeight: 1.05, margin: "4px 0 6px", color: "#2B2A28" }}>{rank ? rank[0] : ""}</h2>
            <p style={{ margin: "0 0 18px", fontSize: 14, fontWeight: 600, color: "#6F6452", lineHeight: 1.4 }}>{rank ? rank[1] : ""}</p>
            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
              {[[res.finalScore, t.scoreLabel, "#E0701F"], [res.finalBricks, t.bricks, "#C0512B"], [res.finalCombo, t.bestCombo, "#2B2A28"]].map(([val, label, col], i) => (
                <div key={i} style={{ flex: 1, background: "#fff", borderRadius: 16, padding: "14px 8px" }}>
                  <div style={{ fontFamily: FRED, fontWeight: 700, fontSize: 30, color: col, lineHeight: 1 }}>{val}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#6F6452", marginTop: 3 }}>{label}</div>
                </div>
              ))}
            </div>
            <p style={{ margin: "0 0 16px", fontSize: 13.5, fontWeight: 600, color: "#5C5648", lineHeight: 1.45 }}>{t.overNote}</p>
            <button ref={primaryBtnRef} onClick={() => { track("buy_brick_click"); e() && e().buyBrick(); }} style={{ width: "100%", border: "none", cursor: "pointer", fontFamily: FRED, fontWeight: 700, fontSize: 19, color: "#fff", background: "linear-gradient(#F08C3E,#E0701F)", borderRadius: 16, padding: 15, boxShadow: "0 5px 0 #B6541A,0 10px 18px rgba(224,112,31,.36)", marginBottom: 10 }}>🧱 {t.buy}</button>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { track("share_click"); e() && e().shareScore(); }} style={{ flex: 1, border: "2px solid #E0701F", cursor: "pointer", fontFamily: FRED, fontWeight: 700, fontSize: 16, color: "#E0701F", background: "#fff", borderRadius: 14, padding: 12 }}>{t.share}</button>
              <button onClick={() => e() && e().startGame()} style={{ flex: 1, border: "none", cursor: "pointer", fontFamily: FRED, fontWeight: 700, fontSize: 16, color: "#2B2A28", background: "#EFE6D2", borderRadius: 14, padding: 12 }}>{t.again}</button>
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

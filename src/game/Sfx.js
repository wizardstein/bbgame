// Beard Brothers — tiny dependency-free WebAudio synth for game feedback.
// Everything is generated with oscillators / noise buffers at call time: no audio
// assets, no CDN requests (keeps the "nothing leaves the visitor's browser"
// GDPR posture of the self-hosted fonts). The AudioContext is created lazily on
// the first user gesture (autoplay policy), and every call is a no-op when the
// context is unavailable or the player muted the game.

const PENTA = [0, 2, 4, 7, 9]; // major pentatonic — any combo ladder step sounds musical

// iPadOS 13+ masquerades as macOS, hence the maxTouchPoints check.
const IOS = typeof navigator !== "undefined" &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

// 0.1s of 8-bit mono PCM silence as a WAV blob URL, built byte-by-byte (no
// audio asset shipped). Used only as the iOS session-upgrade keepalive below.
function silentWavURL() {
  const rate = 8000, n = 800;
  const b = new Uint8Array(44 + n);
  const str = (off, s) => { for (let i = 0; i < s.length; i++) b[off + i] = s.charCodeAt(i); };
  const u32 = (off, v) => { b[off] = v & 255; b[off + 1] = (v >> 8) & 255; b[off + 2] = (v >> 16) & 255; b[off + 3] = (v >> 24) & 255; };
  const u16 = (off, v) => { b[off] = v & 255; b[off + 1] = (v >> 8) & 255; };
  str(0, "RIFF"); u32(4, 36 + n); str(8, "WAVE");
  str(12, "fmt "); u32(16, 16); u16(20, 1); u16(22, 1);
  u32(24, rate); u32(28, rate); u16(32, 1); u16(34, 8);
  str(36, "data"); u32(40, n);
  b.fill(0x80, 44); // 8-bit PCM midpoint = silence
  return URL.createObjectURL(new Blob([b], { type: "audio/wav" }));
}

export class Sfx {
  constructor() {
    this.ac = null;
    this.keep = null; // iOS media-session keepalive <audio>
    this.muted = false;
    try { this.muted = localStorage.getItem("bbwb_muted") === "1"; } catch (e) {}
  }

  // Must be called from inside a user gesture (Play button / first pointerdown).
  unlock() {
    if (!this.ac) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) this.ac = new AC();
      } catch (e) {}
    }
    if (this.ac && this.ac.state === "suspended") this.ac.resume().catch(() => {});
    this._keepalive();
  }
  // iOS routes WebAudio through the RINGER channel by default, so the hardware
  // silent switch mutes the game even with the volume buttons up — unlike
  // native games. Promoting the audio session to "playback" moves the game to
  // the MEDIA channel: the silent switch is ignored and the volume buttons
  // directly set how loud the game is (there is no web API for volume-button
  // events — this session category is the mechanism native apps use too).
  // Two levers, both iOS-gated (elsewhere they'd only steal audio focus and
  // pause the user's music for no benefit):
  //  - navigator.audioSession.type = "playback" (WebKit AudioSession API);
  //  - a looping silent <audio> element started in the first gesture — the
  //    classic keepalive that upgrades the session on iOS versions without
  //    the API. Paused while the in-game mute is on, so muting the game also
  //    releases the media session.
  _keepalive() {
    if (!IOS || this.muted) return;
    try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {}
    try {
      if (!this.keep) {
        this._keepURL = silentWavURL();
        this.keep = new Audio(this._keepURL);
        this.keep.loop = true;
        this.keep.setAttribute("playsinline", "");
        this.keep.preload = "auto";
      }
      if (this.keep.paused) this.keep.play().catch(() => {});
    } catch (e) {}
  }
  dispose() {
    if (this.ac) { try { this.ac.close(); } catch (e) {} this.ac = null; }
    if (this.keep) {
      try { this.keep.pause(); this.keep.src = ""; } catch (e) {}
      try { URL.revokeObjectURL(this._keepURL); } catch (e) {}
      this.keep = null;
    }
  }
  setMuted(m) {
    this.muted = !!m;
    try { localStorage.setItem("bbwb_muted", m ? "1" : "0"); } catch (e) {}
    if (m) { if (this.keep) { try { this.keep.pause(); } catch (e) {} } }
    else this._keepalive(); // the unmute tap is a valid gesture for play()
  }

  _ready() {
    if (this.muted || !this.ac || this.ac.state !== "running") return null;
    return this.ac;
  }
  _tone(f0, { f1 = 0, at = 0, d = 0.12, type = "sine", g = 0.16 } = {}) {
    const ac = this._ready(); if (!ac) return;
    const t0 = ac.currentTime + at;
    const o = ac.createOscillator(), gn = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(30, f0), t0);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + d);
    gn.gain.setValueAtTime(0.0001, t0);
    gn.gain.exponentialRampToValueAtTime(g, t0 + 0.008);
    gn.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(gn).connect(ac.destination);
    o.start(t0); o.stop(t0 + d + 0.03);
  }
  _noise({ at = 0, d = 0.12, g = 0.1, fc = 1400 } = {}) {
    const ac = this._ready(); if (!ac) return;
    const t0 = ac.currentTime + at;
    const n = Math.max(1, Math.floor(ac.sampleRate * d));
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource(); src.buffer = buf;
    const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = fc;
    const gn = ac.createGain();
    gn.gain.setValueAtTime(g, t0);
    gn.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    src.connect(f).connect(gn).connect(ac.destination);
    src.start(t0);
  }

  // ---- game events ----
  // brick catch — pitch climbs the pentatonic ladder with the combo, so a long
  // streak literally plays a rising melody (slot-machine escalation).
  pop(combo) {
    const step = PENTA[combo % 5] + 12 * (Math.floor(combo / 5) % 3);
    const f = 392 * Math.pow(2, step / 12);
    this._tone(f, { type: "triangle", d: 0.09, g: 0.15 });
    this._tone(f * 2, { type: "sine", d: 0.05, g: 0.04 });
  }
  golden() {
    [880, 1174.7, 1568].forEach((f, i) => this._tone(f, { at: i * 0.055, d: 0.14, type: "triangle", g: 0.13 }));
  }
  dodge() { this._noise({ d: 0.16, g: 0.06, fc: 900 }); }
  thud() {
    this._tone(130, { f1: 55, d: 0.22, type: "sine", g: 0.3 });
    this._noise({ d: 0.13, g: 0.14, fc: 650 });
  }
  death() {
    [261.6, 196, 146.8].forEach((f, i) => this._tone(f, { at: i * 0.15, d: 0.22, type: "sawtooth", g: 0.07 }));
    this._tone(98, { at: 0.42, f1: 46, d: 0.5, type: "sine", g: 0.2 });
    this._noise({ at: 0.42, d: 0.4, g: 0.12, fc: 420 });
  }
  rankUp() {
    [523.3, 659.3, 784, 1046.5].forEach((f, i) => this._tone(f, { at: i * 0.07, d: i === 3 ? 0.24 : 0.14, type: "triangle", g: 0.14 }));
  }
  heart() {
    this._tone(587.3, { d: 0.12, type: "sine", g: 0.14 });
    this._tone(880, { at: 0.09, d: 0.18, type: "sine", g: 0.12 });
  }
  record() {
    [392, 523.3, 659.3, 784].forEach((f, i) => this._tone(f, { at: 0.55 + i * 0.09, d: i === 3 ? 0.35 : 0.12, type: "square", g: 0.045 }));
  }
  star(i) {
    // keeps climbing past the 5th star (ranks 6-7 jump an octave)
    const step = PENTA[i % 5] + 12 * Math.floor(i / 5);
    this._tone(523.3 * Math.pow(2, step / 12), { d: 0.11, type: "triangle", g: 0.13 });
  }
  board() { this._tone(520, { f1: 720, d: 0.1, type: "sine", g: 0.09 }); }
  ui() { this._tone(440, { f1: 520, d: 0.06, type: "sine", g: 0.07 }); }
}

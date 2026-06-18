import React, { useRef, useEffect, useState, useCallback } from "react";

// BB Wheelbarrow — v4
// First-person brick-catcher for Beard Brothers. Catch 100 bricks, build the BB school.
// - Absolute finger steering, clamped inside the road (no more flying off-screen).
// - Gradual spawn ramp (gentle start, intense finale).
// - Roadside billboards advertising real Beard Brothers initiatives.
// - Catch juice (particles, squash, combo, haptics) + personal best + share/challenge loop.
// Mobile-first; the playfield stays a fixed 480px column on desktop.

const TOTAL_BRICKS = 100;
const ROAD_HALF_WIDTH = 2.6;
const WB_HALF_WIDTH = 0.6;
const WB_Z = 2.2;
const ROAD_SPEED = 6.0;
const APPROACH_Z_START = -20;
const APPROACH_TIME = 2.4;

// Difficulty ramp — interval between spawns as a function of progress p (0..1)
const SPAWN_START = 0.95; // brick 1 — gentle
const SPAWN_MAIN = 0.5; // settles to the old baseline around 70%
const SPAWN_END = 0.34; // final sprint floor
function spawnInterval(p) {
  if (p < 0.7) {
    const k = p / 0.7;
    return SPAWN_START + (SPAWN_MAIN - SPAWN_START) * (k * k); // ease-in
  }
  const k = (p - 0.7) / 0.3;
  return SPAWN_MAIN + (SPAWN_END - SPAWN_MAIN) * k; // linear finale
}

// Fairness & steering bounds
const STEER_LIMIT = ROAD_HALF_WIDTH - WB_HALF_WIDTH; // 2.0 — barrow stays fully on road
const SPAWN_REACH = STEER_LIMIT - 0.06; // 1.94 — every brick is reachable
const CATCH_TOL = WB_HALF_WIDTH + 0.12; // 0.72 — rim-edge catches count
const STEER_LERP = 18; // higher = snappier follow

// Beard Brothers — roadside billboards.
// status: "now" (în desfășurare) · "done" (realizat) · "plan" (în plan) · null (fără badge)
// prop: 3D object shown next to the sign — see makeProp().
// >>> EDITEAZĂ liber: marchează corect ce e activ / realizat / în plan. <<<
const BILLBOARDS = [
  { t: "Școala BB", s: "Cărămidă cu cărămidă", prop: "brick", status: "now" },
  { t: "Wheels for Life", s: "2 ambulanțe SMURD donate", prop: "ambulance", status: "done" },
  { t: "The Bearded Forests", s: "Zeci de mii de copaci", prop: "trees", status: "now" },
  { t: "Catch A Smile Day", s: "Zâmbete în 110+ orașe", prop: "balloons", status: "now" },
  { t: "Ambulanța Socială", s: "Medic gratuit la sat", prop: "cross", status: "now" },
  { t: "Paint the Future", s: "Spital de pediatrie renovat", prop: "paint", status: "done" },
  { t: "Donează sânge", s: "Fii erou!", prop: "blood", status: "now" },
  { t: "The Beard Mobile", s: "Transport gratuit", prop: "van", status: "done" },
  { t: "The Tutors", s: "Meditații gratuite", prop: "book", status: "now" },
  { t: "Următoarea campanie?", s: "În curând · rămâi aproape", prop: "smiley", status: "plan" },
];
const BB_DONATE_URL = "https://scoala.beard-brothers.ro";
const BB_ABOUT_URL = "https://www.beard-brothers.ro/";

const STATUS_BADGE = {
  now: { label: "ÎN DESFĂȘURARE", bg: "#2f9e57" },
  done: { label: "REALIZAT", bg: "#3d7bd6" },
  plan: { label: "ÎN PLAN", bg: "#e0892b" },
};

// --- tiny mesh helpers for the 3D ad props ---
function mkMat(THREE, c) {
  return new THREE.MeshLambertMaterial({ color: c });
}
function mkBox(THREE, w, h, d, c, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mkMat(THREE, c));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
function mkSphere(THREE, r, c, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 14), mkMat(THREE, c));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// Returns { group, spin, bob } — a physical 3D object representing the campaign.
function makeProp(THREE, type) {
  const g = new THREE.Group();
  let spin = 0,
    bob = 0;
  switch (type) {
    case "balloons": {
      [
        [-0.34, 1.6, 0xffd23f],
        [0.34, 1.62, 0xff5da2],
        [0, 1.92, 0x4fb0ff],
      ].forEach(([x, y, c]) => {
        const bg = new THREE.Group();
        const b = mkSphere(THREE, 0.3, c);
        b.scale.y = 1.25;
        bg.add(b);
        const str = new THREE.Mesh(
          new THREE.CylinderGeometry(0.012, 0.012, y, 6),
          mkMat(THREE, 0x5a4632)
        );
        str.position.y = -y / 2;
        bg.add(str);
        bg.position.set(x, y, 0);
        g.add(bg);
      });
      bob = 0.12;
      break;
    }
    case "trees": {
      [
        [-0.4, 0.5],
        [0.42, 0.62],
        [0.02, 0.56],
      ].forEach(([x, h]) => {
        g.add(mkBox(THREE, 0.12, h, 0.12, 0x6b4a2b, x, h / 2, 0));
        const c1 = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.7, 8), mkMat(THREE, 0x3f9b46));
        c1.position.set(x, h + 0.3, 0);
        c1.castShadow = true;
        g.add(c1);
        const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.55, 8), mkMat(THREE, 0x4fb255));
        c2.position.set(x, h + 0.62, 0);
        g.add(c2);
      });
      break;
    }
    case "ambulance":
    case "van": {
      const body = type === "ambulance" ? 0xffffff : 0xf2994a;
      g.add(mkBox(THREE, 1.05, 0.5, 0.55, body, 0, 0.5, 0));
      g.add(mkBox(THREE, 0.42, 0.36, 0.56, 0xdfeaf2, 0.36, 0.46, 0));
      if (type === "ambulance") {
        g.add(mkBox(THREE, 0.24, 0.08, 0.57, 0xe23b3b, -0.18, 0.55, 0));
        g.add(mkBox(THREE, 0.08, 0.24, 0.57, 0xe23b3b, -0.18, 0.55, 0));
        g.add(mkBox(THREE, 0.18, 0.09, 0.2, 0x2f7bd6, 0, 0.8, 0));
      }
      [-0.32, 0.32].forEach((x) => g.add(mkSphere(THREE, 0.14, 0x1c1c1c, x, 0.14, 0.29)));
      break;
    }
    case "cross": {
      g.add(mkBox(THREE, 0.3, 1.0, 0.3, 0xffffff, 0, 0.7, 0));
      g.add(mkBox(THREE, 0.9, 0.3, 0.32, 0xe23b3b, 0, 0.85, 0));
      g.add(mkBox(THREE, 0.3, 0.9, 0.34, 0xe23b3b, 0, 0.85, 0));
      break;
    }
    case "brick": {
      let yy = 0.11;
      for (let r = 0; r < 4; r++) {
        const n = r % 2 ? 2 : 3;
        for (let i = 0; i < n; i++) {
          g.add(
            mkBox(THREE, 0.36, 0.18, 0.26, 0xb5532f, (i - (n - 1) / 2) * 0.4, yy, 0)
          );
        }
        yy += 0.2;
      }
      break;
    }
    case "blood": {
      const d = mkSphere(THREE, 0.34, 0xe23b3b, 0, 0.55, 0);
      d.scale.y = 1.3;
      g.add(d);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.42, 14), mkMat(THREE, 0xe23b3b));
      tip.position.y = 1.0;
      g.add(tip);
      spin = 0.6;
      bob = 0.06;
      break;
    }
    case "book": {
      g.add(mkBox(THREE, 0.74, 0.12, 0.52, 0x2f6bd6, 0, 0.5, 0));
      g.add(mkBox(THREE, 0.68, 0.06, 0.46, 0xfdf6e3, 0, 0.58, 0));
      g.add(mkBox(THREE, 0.52, 0.05, 0.52, 0x1c1c1c, 0, 0.84, 0));
      g.add(mkBox(THREE, 0.2, 0.16, 0.2, 0x1c1c1c, 0, 0.74, 0));
      bob = 0.05;
      break;
    }
    case "paint": {
      [0xe23b3b, 0xffd23f, 0x3f9b46, 0x2f7bd6].forEach((c, i) =>
        g.add(mkBox(THREE, 0.26, 0.5, 0.26, c, (i - 1.5) * 0.3, 0.25, 0))
      );
      bob = 0.04;
      break;
    }
    case "hearts": {
      [
        [-0.35, 1.5, 0xff5da2],
        [0.32, 1.72, 0xe23b3b],
        [0, 1.96, 0xff8fb0],
      ].forEach(([x, y, c]) => {
        const h = new THREE.Group();
        h.add(mkSphere(THREE, 0.16, c, -0.12, 0.06, 0));
        h.add(mkSphere(THREE, 0.16, c, 0.12, 0.06, 0));
        const b = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.36, 4), mkMat(THREE, c));
        b.rotation.z = Math.PI;
        b.position.y = -0.18;
        h.add(b);
        h.position.set(x, y, 0);
        g.add(h);
      });
      bob = 0.1;
      break;
    }
    default: {
      // smiley — the lively fallback
      g.add(mkSphere(THREE, 0.52, 0xffd23f, 0, 1.5, 0));
      g.add(mkSphere(THREE, 0.08, 0x1c1c1c, -0.19, 1.64, 0.44));
      g.add(mkSphere(THREE, 0.08, 0x1c1c1c, 0.19, 1.64, 0.44));
      const mouth = new THREE.Mesh(
        new THREE.TorusGeometry(0.22, 0.045, 8, 18, Math.PI),
        mkMat(THREE, 0x1c1c1c)
      );
      mouth.position.set(0, 1.46, 0.45);
      mouth.rotation.z = Math.PI;
      g.add(mouth);
      bob = 0.08;
      break;
    }
  }
  return { group: g, spin, bob };
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let yy = y;
  for (let n = 0; n < words.length; n++) {
    const test = line + words[n] + " ";
    if (ctx.measureText(test).width > maxWidth && n > 0) {
      ctx.fillText(line.trim(), x, yy);
      line = words[n] + " ";
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  ctx.fillText(line.trim(), x, yy);
  return yy;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function makeSignTexture(THREE, title, sub, status) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 320;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 320);
  g.addColorStop(0, "#23414f");
  g.addColorStop(1, "#16252d");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 320);
  ctx.strokeStyle = "#f2c94c";
  ctx.lineWidth = 18;
  ctx.strokeRect(9, 9, 494, 302);
  ctx.textAlign = "center";
  ctx.fillStyle = "#f2c94c";
  ctx.font = "bold 30px system-ui, Arial, sans-serif";
  ctx.fillText("BEARD BROTHERS", 256, 60);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 46px system-ui, Arial, sans-serif";
  const endY = wrapText(ctx, title, 256, 132, 452, 50);
  ctx.fillStyle = "#cfe0e8";
  ctx.font = "500 28px system-ui, Arial, sans-serif";
  wrapText(ctx, sub, 256, endY + 52, 452, 34);

  const badge = STATUS_BADGE[status];
  if (badge) {
    ctx.font = "bold 22px system-ui, Arial, sans-serif";
    const w = ctx.measureText(badge.label).width + 36;
    ctx.fillStyle = badge.bg;
    roundRect(ctx, (512 - w) / 2, 268, w, 36, 18);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillText(badge.label, 256, 293);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

function readInt(key) {
  try {
    return parseInt(localStorage.getItem(key) || "0", 10) || 0;
  } catch {
    return 0;
  }
}
function writeInt(key, v) {
  try {
    localStorage.setItem(key, String(v));
  } catch {}
}

export default function BBWheelbarrow() {
  const mountRef = useRef(null);
  const stateRef = useRef(null);
  const [phase, setPhase] = useState("intro");
  const [caught, setCaught] = useState(0);
  const [spawned, setSpawned] = useState(0);
  const [stars, setStars] = useState(0);
  const [combo, setCombo] = useState(0);
  const [ready, setReady] = useState(false);
  const [best, setBest] = useState(0);
  const [totalBricks, setTotalBricks] = useState(0);
  const [edgeFlash, setEdgeFlash] = useState(0); // -1 left, 1 right, 0 none
  const [showAbout, setShowAbout] = useState(false);
  const [copied, setCopied] = useState(false);
  const [challenge] = useState(() => {
    try {
      const v = new URLSearchParams(window.location.search).get("challenge");
      const n = v == null ? null : parseInt(v, 10);
      return Number.isFinite(n) ? Math.max(0, Math.min(TOTAL_BRICKS, n)) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    setBest(readInt("bb_best"));
    setTotalBricks(readInt("bb_total"));
  }, []);

  useEffect(() => {
    if (window.THREE) {
      setReady(true);
      return;
    }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
    s.onload = () => setReady(true);
    document.body.appendChild(s);
  }, []);

  const flashEdge = useCallback((side) => {
    const st = stateRef.current;
    if (!st) return;
    if (st.edgeCooldown > 0) return;
    st.edgeCooldown = 0.25;
    setEdgeFlash(side);
    if (navigator.vibrate) navigator.vibrate(10);
    setTimeout(() => setEdgeFlash(0), 180);
  }, []);

  const startGame = useCallback(() => {
    if (!ready || !window.THREE) return;
    const THREE = window.THREE;
    const mount = mountRef.current;
    while (mount.firstChild) mount.removeChild(mount.firstChild);

    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9fc6e0);
    scene.fog = new THREE.Fog(0x9fc6e0, 18, 44);

    // Camera framed so the wheelbarrow is always fully visible at the bottom.
    // Vertical FOV is aspect-independent, so this framing holds on any phone/desktop.
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 120);
    camera.position.set(0, 2.3, 5.2);
    camera.lookAt(0, 0.1, -8);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);

    const amb = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(amb);
    const sun = new THREE.DirectionalLight(0xffffff, 0.85);
    sun.position.set(4, 12, 6);
    sun.castShadow = true;
    scene.add(sun);

    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 160),
      new THREE.MeshLambertMaterial({ color: 0x6ea668 })
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.z = -50;
    grass.receiveShadow = true;
    scene.add(grass);

    const roadSegs = [];
    const SEG_LEN = 8,
      N_SEG = 16;
    const matA = new THREE.MeshLambertMaterial({ color: 0x8a8378 });
    const matB = new THREE.MeshLambertMaterial({ color: 0x817a6f });
    for (let i = 0; i < N_SEG; i++) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(ROAD_HALF_WIDTH * 2 + 0.6, SEG_LEN),
        i % 2 ? matA : matB
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(0, 0.01, -i * SEG_LEN + 4);
      m.receiveShadow = true;
      scene.add(m);
      roadSegs.push(m);
    }

    // Raised 3D curbs — boundaries that read as physical walls, not paint.
    const curbMat = new THREE.MeshLambertMaterial({ color: 0xf2e9d8 });
    [-1, 1].forEach((side) => {
      const curb = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.24, SEG_LEN * N_SEG),
        curbMat
      );
      curb.position.set(side * (ROAD_HALF_WIDTH + 0.12), 0.12, -(SEG_LEN * N_SEG) / 2 + 4);
      curb.castShadow = true;
      curb.receiveShadow = true;
      scene.add(curb);
    });

    // BB school silhouette at the horizon — the destination you're building toward.
    const school = new THREE.Group();
    const sb = new THREE.Mesh(
      new THREE.BoxGeometry(5, 2.2, 3),
      new THREE.MeshLambertMaterial({ color: 0xe8d8c0 })
    );
    sb.position.y = 1.1;
    school.add(sb);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(3.7, 1.5, 4),
      new THREE.MeshLambertMaterial({ color: 0xc44a2e })
    );
    roof.position.y = 2.95;
    roof.rotation.y = Math.PI / 4;
    school.add(roof);
    school.position.set(0, 0, -34);
    scene.add(school);

    // Roadside billboards — recycled like road segments, each with a 3D ad prop.
    const signs = [];
    const props = [];
    const N_SIGNS = 10;
    const SIGN_SPACING = 13;
    const SIGN_X = ROAD_HALF_WIDTH + 2.0;
    const totalSignLen = SIGN_SPACING * N_SIGNS;
    for (let i = 0; i < N_SIGNS; i++) {
      const side = i % 2 ? 1 : -1;
      const data = BILLBOARDS[i % BILLBOARDS.length];
      const group = new THREE.Group();
      const postMat = new THREE.MeshLambertMaterial({ color: 0x6b5333 });
      [-0.85, 0.85].forEach((px) => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.6, 0.1), postMat);
        post.position.set(px, 0.8, 0);
        post.castShadow = true;
        group.add(post);
      });
      const tex = makeSignTexture(THREE, data.t, data.s, data.status);
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(2.5, 1.56, 0.12),
        [
          new THREE.MeshBasicMaterial({ color: 0x12202a }),
          new THREE.MeshBasicMaterial({ color: 0x12202a }),
          new THREE.MeshBasicMaterial({ color: 0x12202a }),
          new THREE.MeshBasicMaterial({ color: 0x12202a }),
          new THREE.MeshBasicMaterial({ map: tex }),
          new THREE.MeshBasicMaterial({ map: tex }),
        ]
      );
      board.position.y = 2.0;
      group.add(board);

      // 3D ad prop, planted between the sign and the road.
      const prop = makeProp(THREE, data.prop);
      prop.group.position.set(side * -0.4, 0, 1.4);
      group.add(prop.group);
      props.push({ ...prop, phase: i * 1.3 });

      group.position.set(side * SIGN_X, 0, -i * SIGN_SPACING - 6);
      group.rotation.y = side > 0 ? -0.42 : 0.42; // angle the face toward the player
      scene.add(group);
      signs.push(group);
    }

    const zoneMat = new THREE.MeshBasicMaterial({
      color: 0xf2c94c,
      transparent: true,
      opacity: 0.18,
    });
    const zone = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_HALF_WIDTH * 2, 1.2),
      zoneMat
    );
    zone.rotation.x = -Math.PI / 2;
    zone.position.set(0, 0.03, WB_Z);
    scene.add(zone);

    // Realistic wheelbarrow, seen from above as if the player is holding it:
    // open tub catches the bricks, wheel at the front, handles reaching toward the camera.
    const wb = new THREE.Group();
    const TRAY = 0xcf5430,
      TRAYIN = 0x9c3d22,
      RIM = 0xe2734f,
      METAL = 0x9aa0a4,
      WOOD = 0x9a6b3b;
    wb.add(mkBox(THREE, 0.98, 0.08, 0.66, TRAY, 0, 0.42, -0.02)); // bottom
    wb.add(mkBox(THREE, 0.86, 0.02, 0.54, TRAYIN, 0, 0.47, -0.02)); // interior floor (depth)
    const back = mkBox(THREE, 1.0, 0.34, 0.06, TRAY, 0, 0.6, 0.3); // back wall (toward player)
    back.rotation.x = 0.22;
    wb.add(back);
    wb.add(mkBox(THREE, 1.02, 0.05, 0.08, RIM, 0, 0.76, 0.33)); // rim highlight
    const front = mkBox(THREE, 1.0, 0.2, 0.06, TRAY, 0, 0.52, -0.34); // front lip
    front.rotation.x = -0.22;
    wb.add(front);
    [-1, 1].forEach((s) => {
      const sw = mkBox(THREE, 0.06, 0.32, 0.66, TRAY, s * 0.49, 0.58, -0.02);
      sw.rotation.z = s * 0.2;
      wb.add(sw);
      wb.add(mkBox(THREE, 0.06, 0.36, 0.06, METAL, s * 0.4, 0.18, 0.16)); // leg
      const h = mkBox(THREE, 0.07, 0.07, 0.95, WOOD, s * 0.42, 0.52, 0.55); // handle
      h.rotation.x = 0.12;
      wb.add(h);
      wb.add(mkBox(THREE, 0.09, 0.09, 0.18, 0x2b2b2b, s * 0.42, 0.56, 1.0)); // grip
      const fork = mkBox(THREE, 0.05, 0.05, 0.5, METAL, s * 0.13, 0.32, -0.45);
      fork.rotation.x = 0.5;
      wb.add(fork);
    });
    const wheel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.24, 0.13, 18),
      mkMat(THREE, 0x222222)
    );
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(0, 0.24, -0.7);
    wheel.castShadow = true;
    wb.add(wheel);
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.15, 12),
      mkMat(THREE, 0xb6bcc0)
    );
    hub.rotation.z = Math.PI / 2;
    hub.position.set(0, 0.24, -0.7);
    wb.add(hub);
    wb.position.set(0, 0, WB_Z);
    scene.add(wb);

    const brickGeo = new THREE.BoxGeometry(0.34, 0.2, 0.24);
    const brickMat = new THREE.MeshLambertMaterial({ color: 0xb5532f });
    const bricks = [];

    const st = {
      THREE, scene, camera, renderer, wb, wheel, roadSegs, SEG_LEN, N_SEG,
      bricks, brickGeo, brickMat, zone, zoneMat, signs, totalSignLen, props,
      wbX: 0, wbTargetX: 0, spawnTimer: 0, spawnedCount: 0, caughtCount: 0,
      streak: 0, edgeCooldown: 0,
      lastT: performance.now(), raf: 0, running: true,
    };
    stateRef.current = st;
    setCaught(0);
    setSpawned(0);
    setStars(0);
    setCombo(0);

    const spawnBrick = () => {
      let b = bricks.find((x) => !x.active);
      if (!b) {
        const mesh = new THREE.Mesh(brickGeo, brickMat);
        mesh.castShadow = true;
        scene.add(mesh);
        b = { mesh, active: false };
        bricks.push(b);
      }
      b.active = true;
      b.scored = false;
      b.collecting = false;
      b.t = 0;
      b.x = (Math.random() * 2 - 1) * SPAWN_REACH; // always reachable
      b.mesh.visible = true;
      b.mesh.scale.setScalar(1);
      b.spin = { x: Math.random() * 2, y: Math.random() * 2 };
      st.spawnedCount++;
      setSpawned(st.spawnedCount);
    };

    const finish = () => {
      st.running = false;
      cancelAnimationFrame(st.raf);
      const c = st.caughtCount;
      let s = 0;
      if (c >= TOTAL_BRICKS) s = 3;
      else if (c >= TOTAL_BRICKS * 0.9) s = 2;
      else if (c >= TOTAL_BRICKS * 0.75) s = 1;
      const newBest = Math.max(readInt("bb_best"), c);
      writeInt("bb_best", newBest);
      const newTotal = readInt("bb_total") + c;
      writeInt("bb_total", newTotal);
      setBest(newBest);
      setTotalBricks(newTotal);
      setStars(s);
      setCaught(c);
      setPhase("done");
    };

    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);
    st.cleanupResize = () => window.removeEventListener("resize", onResize);

    const tick = () => {
      if (!st.running) return;
      const now = performance.now();
      let dt = (now - st.lastT) / 1000;
      st.lastT = now;
      if (dt > 0.05) dt = 0.05;
      if (st.edgeCooldown > 0) st.edgeCooldown -= dt;

      // Steering: smooth follow toward target, then hard-clamp inside the road.
      st.wbX += (st.wbTargetX - st.wbX) * Math.min(1, dt * STEER_LERP);
      st.wbX = Math.max(-STEER_LIMIT, Math.min(STEER_LIMIT, st.wbX));
      wb.position.x = st.wbX;
      // ease the lean back to neutral
      wb.rotation.z += (0 - wb.rotation.z) * Math.min(1, dt * 8);

      st.roadSegs.forEach((m) => {
        m.position.z += ROAD_SPEED * dt;
        if (m.position.z > 6) m.position.z -= st.SEG_LEN * st.N_SEG;
      });
      st.signs.forEach((g) => {
        g.position.z += ROAD_SPEED * dt;
        if (g.position.z > 9) g.position.z -= st.totalSignLen;
      });
      st.props.forEach((pr) => {
        if (pr.bob) pr.group.position.y = pr.bob * Math.sin(now / 600 + pr.phase);
        if (pr.spin) pr.group.rotation.y += dt * pr.spin;
      });
      wheel.rotation.x += ROAD_SPEED * dt * 2;

      const p = st.spawnedCount / TOTAL_BRICKS;
      const finale = p > 0.85;
      st.zoneMat.opacity =
        0.14 +
        Math.sin(now / (finale ? 160 : 300)) * (0.06 + Math.min(st.streak, 20) * 0.003);
      st.zoneMat.color.setHex(finale ? 0xf2994a : 0xf2c94c);

      st.spawnTimer += dt;
      const interval = spawnInterval(p);
      if (st.spawnTimer >= interval && st.spawnedCount < TOTAL_BRICKS) {
        st.spawnTimer = 0;
        spawnBrick();
      }

      bricks.forEach((b) => {
        if (!b.active) return;

        // Caught bricks are scooped into the tub (collected, not shattered).
        if (b.collecting) {
          b.ct += dt;
          const f = Math.min(1, dt * 16);
          b.mesh.position.x += (st.wbX - b.mesh.position.x) * f;
          b.mesh.position.y += (0.5 - b.mesh.position.y) * f;
          b.mesh.position.z += (WB_Z - 0.05 - b.mesh.position.z) * f;
          b.mesh.scale.setScalar(Math.max(0.05, 1 - b.ct / 0.16));
          if (b.ct >= 0.16) {
            b.active = false;
            b.collecting = false;
            b.mesh.visible = false;
            b.mesh.scale.setScalar(1);
          }
          return;
        }

        b.t += dt / APPROACH_TIME;
        const t = b.t;
        const z = APPROACH_Z_START + (WB_Z - APPROACH_Z_START) * t;
        const y = 0.45 + (6 - 0.45) * (1 - t) * (1 - t);
        b.mesh.position.set(b.x, y, z);
        b.mesh.rotation.x += b.spin.x * dt;
        b.mesh.rotation.y += b.spin.y * dt;

        if (!b.scored && t >= 0.93 && t <= 1.04) {
          if (Math.abs(b.x - st.wbX) < CATCH_TOL) {
            b.scored = true;
            b.collecting = true;
            b.ct = 0;
            st.caughtCount++;
            st.streak++;
            setCaught(st.caughtCount);
            setCombo(st.streak);
            wb.scale.set(1.1, 1.14, 1.1);
            if (navigator.vibrate) {
              if (st.streak % 10 === 0) navigator.vibrate([10, 30, 10]);
              else navigator.vibrate(14);
            }
          }
        }
        if (!b.collecting && t > 1.06) {
          if (!b.scored && st.streak > 0) {
            st.streak = 0;
            setCombo(0);
            if (navigator.vibrate) navigator.vibrate(28);
          }
          b.active = false;
          b.mesh.visible = false;
        }
      });

      ["x", "y", "z"].forEach((a) => {
        wb.scale[a] += (1 - wb.scale[a]) * Math.min(1, dt * 10);
      });

      if (st.spawnedCount >= TOTAL_BRICKS && !bricks.some((b) => b.active)) {
        finish();
        return;
      }

      renderer.render(scene, camera);
      st.raf = requestAnimationFrame(tick);
    };

    setPhase("playing");
    st.raf = requestAnimationFrame(tick);
  }, [ready]);

  // ABSOLUTE finger steering — finger x maps to barrow x within the fixed playfield.
  useEffect(() => {
    let dragging = false;

    const setTarget = (clientX) => {
      const st = stateRef.current;
      const mount = mountRef.current;
      if (!st || !mount) return;
      const rect = mount.getBoundingClientRect();
      let fx = (clientX - rect.left) / rect.width; // 0..1 across the playfield
      if (fx <= 0.025) flashEdge(-1);
      else if (fx >= 0.975) flashEdge(1);
      fx = Math.max(0, Math.min(1, fx));
      st.wbTargetX = (fx * 2 - 1) * STEER_LIMIT;
    };

    const onTouchStart = (e) => {
      dragging = true;
      setTarget(e.touches[0].clientX);
    };
    const onTouchMove = (e) => {
      if (!dragging) return;
      setTarget(e.touches[0].clientX);
      e.preventDefault();
    };
    const onTouchEnd = () => {
      dragging = false;
    };
    const onMouseDown = (e) => {
      dragging = true;
      setTarget(e.clientX);
    };
    const onMouseMove = (e) => {
      if (!dragging) return;
      setTarget(e.clientX);
    };
    const onMouseUp = () => {
      dragging = false;
    };

    window.addEventListener("touchstart", onTouchStart, { passive: false });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [flashEdge]);

  useEffect(
    () => () => {
      const st = stateRef.current;
      if (st) {
        st.running = false;
        cancelAnimationFrame(st.raf);
        if (st.cleanupResize) st.cleanupResize();
      }
    },
    []
  );

  const pct = Math.round((caught / TOTAL_BRICKS) * 100);
  const beatChallenge = challenge != null && caught > challenge;

  const shareText =
    stars === 3
      ? "Am prins toate cele 100 de cărămizi și am donat una pentru Școala Beard Brothers! 🧱 Împreună suntem o forță! Poți să mă întreci?"
      : `Am prins ${caught}/100 de cărămizi pentru Școala Beard Brothers 🧱 Te provoc să prinzi mai multe!`;
  const shareUrl = (() => {
    try {
      return `${window.location.origin}${window.location.pathname}?challenge=${caught}`;
    } catch {
      return "https://www.beard-brothers.ro/";
    }
  })();

  const doShare = async () => {
    const data = { title: "Beard Brothers — Construiește școala", text: shareText, url: shareUrl };
    if (navigator.share) {
      try {
        await navigator.share(data);
        return;
      } catch {}
    }
    window.open(
      `https://wa.me/?text=${encodeURIComponent(shareText + " " + shareUrl)}`,
      "_blank"
    );
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareText + " " + shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  return (
    <div
      style={{
        width: "100%", maxWidth: 480, margin: "0 auto", height: "100dvh",
        maxHeight: 860, display: "flex", flexDirection: "column",
        background: "#1c2b33", fontFamily: "system-ui, sans-serif",
        position: "relative", overflow: "hidden", userSelect: "none",
        WebkitUserSelect: "none", touchAction: "none",
      }}
    >
      <div ref={mountRef} style={{ flex: 1, position: "relative", background: "#9fc6e0" }} />

      {/* edge-hit feedback */}
      {edgeFlash !== 0 && (
        <div
          style={{
            position: "absolute", top: 0, bottom: 0,
            [edgeFlash < 0 ? "left" : "right"]: 0, width: 46,
            background: `linear-gradient(${edgeFlash < 0 ? "90deg" : "270deg"}, rgba(242,153,74,.6), transparent)`,
            pointerEvents: "none", zIndex: 5,
          }}
        />
      )}

      {phase === "playing" && (
        <>
          <div
            style={{
              position: "absolute", top: 0, left: 0, right: 0, padding: "14px 18px",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,.5)", pointerEvents: "none",
            }}
          >
            <div style={{ fontSize: 26, fontWeight: 800 }}>
              🧱 {caught}
              <span style={{ fontSize: 16, opacity: 0.8 }}> / {TOTAL_BRICKS}</span>
            </div>
            <div style={{ fontSize: 13, opacity: 0.85, fontWeight: 600 }}>
              căzute {spawned}/{TOTAL_BRICKS}
            </div>
          </div>

          {combo >= 3 && (
            <div
              style={{
                position: "absolute", top: 54, left: 0, right: 0, textAlign: "center",
                color: "#f2c94c", fontSize: 22, fontWeight: 900, pointerEvents: "none",
                textShadow: "0 2px 6px rgba(0,0,0,.6)",
              }}
            >
              Combo x{combo}!
            </div>
          )}

          <div
            style={{
              position: "absolute", bottom: 18, left: 0, right: 0, textAlign: "center",
              color: "#fff", fontSize: 13, fontWeight: 600, opacity: 0.55,
              textShadow: "0 1px 3px rgba(0,0,0,.6)", pointerEvents: "none",
            }}
          >
            ← trage cu degetul ca să muți roaba →
          </div>
        </>
      )}

      {phase === "intro" && (
        <div style={overlay}>
          <div style={{ fontSize: 13, letterSpacing: 3, opacity: 0.7, color: "#f2c94c", fontWeight: 700 }}>
            BEARD BROTHERS
          </div>
          <h1 style={{ fontSize: 34, fontWeight: 900, color: "#fff", margin: "8px 0 4px", letterSpacing: -1 }}>
            Cărămidă cu cărămidă
          </h1>
          <p style={{ color: "#bcd0da", fontSize: 15, lineHeight: 1.5, maxWidth: 320, textAlign: "center", margin: "0 0 8px" }}>
            Prinde cele 100 de cărămizi în zona galbenă și ajută la construirea{" "}
            <b style={{ color: "#fff" }}>Școlii BB</b>. Trage cu degetul ca să muți roaba.
          </p>
          {challenge != null && (
            <div
              style={{
                background: "#234", color: "#f2c94c", padding: "10px 16px", borderRadius: 12,
                fontWeight: 700, fontSize: 14, margin: "6px 0 12px", textAlign: "center",
              }}
            >
              🎯 Un prieten a prins {challenge}/100. Poți mai mult?
            </div>
          )}
          {best > 0 && (
            <div style={{ color: "#9db4bf", fontSize: 13, marginBottom: 14 }}>
              Recordul tău: <b style={{ color: "#fff" }}>{best}/100</b>
              {totalBricks > 0 && <> · {totalBricks} cărămizi în total</>}
            </div>
          )}
          <button onClick={startGame} disabled={!ready} style={btnPrimary(ready)}>
            {ready ? "Începe cursa" : "Se încarcă…"}
          </button>
          <p style={{ color: "#6f8b97", fontSize: 12, marginTop: 22 }}>
            3★=100 · 2★=90% · 1★=75%
          </p>
        </div>
      )}

      {phase === "done" && (
        <div style={overlay}>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {[1, 2, 3].map((i) => (
              <span
                key={i}
                style={{
                  fontSize: 50,
                  filter: i <= stars ? "none" : "grayscale(1) opacity(.3)",
                  transform: i === 2 ? "translateY(-8px)" : "none",
                }}
              >
                ⭐
              </span>
            ))}
          </div>
          <div style={{ fontSize: 40, fontWeight: 900, color: "#fff" }}>
            {caught}
            <span style={{ fontSize: 22, opacity: 0.7 }}>/{TOTAL_BRICKS}</span>
          </div>
          <div style={{ color: "#bcd0da", fontSize: 15, margin: "2px 0 6px" }}>{pct}% transportate</div>
          <div style={{ color: "#9db4bf", fontSize: 13, marginBottom: 12 }}>
            Record: <b style={{ color: "#fff" }}>{best}/100</b>
            {totalBricks > 0 && <> · {totalBricks} cărămizi în total</>}
          </div>

          {caught > 0 && (
            <div style={{ marginBottom: 14, textAlign: "center" }}>
              <BrickWall count={caught} />
              <div style={{ color: "#9db4bf", fontSize: 12, marginTop: 6 }}>
                {caught} {caught === 1 ? "cărămidă strânsă" : "cărămizi strânse"} pentru Școala BB
              </div>
            </div>
          )}

          {challenge != null && (
            <div
              style={{
                background: beatChallenge ? "#1e6f3f" : "#5a3a2a",
                color: "#fff", padding: "8px 16px", borderRadius: 10, fontWeight: 700,
                fontSize: 14, marginBottom: 10,
              }}
            >
              {beatChallenge
                ? `🏆 L-ai învins! ${caught} vs ${challenge}`
                : `Aproape! ${caught} vs ${challenge}`}
            </div>
          )}

          {stars === 3 ? (
            <div
              style={{
                background: "#1e6f3f", color: "#d9f5e3", padding: "12px 18px", borderRadius: 12,
                fontSize: 15, fontWeight: 700, margin: "2px 0 16px", textAlign: "center", maxWidth: 320,
              }}
            >
              🎉 Perfect! O cărămidă a fost donată în numele tău Școlii BB.
            </div>
          ) : (
            <div style={{ color: "#9db4bf", fontSize: 14, margin: "2px 0 16px", textAlign: "center", maxWidth: 300 }}>
              {stars > 0
                ? "Bine! Dar doar la 3 stele se donează o cărămidă. Mai încearcă!"
                : caught >= TOTAL_BRICKS * 0.97
                ? "Atât de aproape! Încă puține cărămizi."
                : "Sub 75%. Hai din nou — le poți prinde pe toate."}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
            <button onClick={startGame} style={btnPrimary(true)}>
              {stars === 3 ? "Joacă din nou" : "Reîncearcă"}
            </button>
            <button onClick={doShare} style={btnSecondary}>
              Provoacă un prieten
            </button>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap", justifyContent: "center" }}>
            <button onClick={copyLink} style={btnGhost}>
              {copied ? "Link copiat!" : "Copiază link"}
            </button>
            <a href={BB_DONATE_URL} target="_blank" rel="noreferrer" style={{ ...btnGhost, textDecoration: "none", color: "#f2c94c", borderColor: "#f2c94c" }}>
              Donează o cărămidă reală · 50 lei
            </a>
          </div>

          <button onClick={() => setShowAbout(true)} style={{ ...linkBtn, marginTop: 18 }}>
            Despre Beard Brothers
          </button>
        </div>
      )}

      {showAbout && (
        <div style={{ ...overlay, background: "rgba(20,33,40,.97)" }}>
          <div style={{ fontSize: 13, letterSpacing: 3, color: "#f2c94c", fontWeight: 700, marginBottom: 10 }}>
            BEARD BROTHERS
          </div>
          <p style={{ color: "#dce8ee", fontSize: 15, lineHeight: 1.6, maxWidth: 330, textAlign: "center" }}>
            ONG civic din Cluj-Napoca, fondat în 2013 — „probabil cel mai neconvențional ONG din România”.
            Peste 360 de voluntari, 13 campanii majore: ambulanțe SMURD, transport gratuit pentru
            persoane cu dizabilități, reîmpădurire, ambulanță socială la sat și{" "}
            <b style={{ color: "#fff" }}>Școala BB</b> — construită cărămidă cu cărămidă.
          </p>
          <p style={{ color: "#f2c94c", fontWeight: 800, fontSize: 16, margin: "14px 0 18px" }}>
            Împreună suntem o forță!
          </p>
          <a href={BB_ABOUT_URL} target="_blank" rel="noreferrer" style={{ ...btnPrimary(true), textDecoration: "none" }}>
            Vezi site-ul
          </a>
          <button onClick={() => setShowAbout(false)} style={{ ...linkBtn, marginTop: 16 }}>
            Înapoi
          </button>
        </div>
      )}
    </div>
  );
}

// Exact `count` bricks, stacked in a tidy running-bond wall — the player's haul.
function BrickWall({ count }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    const W = cv.width,
      H = cv.height;
    const perRow = 10,
      gap = 3,
      bh = 14;
    const bw = (W - gap * (perRow + 1)) / perRow;
    const shades = ["#b5532f", "#a8472a", "#c25b34", "#9c3d22", "#bd5733", "#aa4b2c"];
    ctx.clearRect(0, 0, W, H);
    const rows = Math.ceil(count / perRow);
    for (let r = 0; r < rows; r++) {
      const inRow = Math.min(perRow, count - r * perRow);
      const y = H - (r + 1) * (bh + gap);
      const offset = r % 2 ? (bw + gap) / 2 : 0;
      for (let i = 0; i < inRow; i++) {
        const x = gap + i * (bw + gap) + offset;
        ctx.fillStyle = shades[(r * 7 + i) % shades.length];
        roundRect(ctx, x, y, bw, bh, 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,.12)";
        ctx.fillRect(x + 2, y + 2, bw - 4, 2);
      }
    }
  }, [count]);
  return (
    <canvas
      ref={ref}
      width={300}
      height={188}
      style={{
        width: 280, height: 175, background: "#6f655d",
        borderRadius: 8, padding: 4, boxShadow: "0 6px 18px rgba(0,0,0,.35)",
      }}
    />
  );
}

const overlay = {
  position: "absolute", inset: 0, background: "rgba(20,33,40,.92)",
  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
  padding: 24, zIndex: 10,
};
const btnPrimary = (enabled) => ({
  background: enabled ? "#f2c94c" : "#5a6b73",
  color: enabled ? "#1c2b33" : "#9db4bf",
  border: "none", borderRadius: 12, padding: "15px 32px",
  fontSize: 17, fontWeight: 800, cursor: enabled ? "pointer" : "default",
  boxShadow: enabled ? "0 4px 14px rgba(242,201,76,.35)" : "none",
});
const btnSecondary = {
  background: "#2f4651", color: "#fff", border: "none", borderRadius: 12,
  padding: "15px 24px", fontSize: 16, fontWeight: 800, cursor: "pointer",
};
const btnGhost = {
  background: "transparent", color: "#bcd0da", border: "1.5px solid #3d5762",
  borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer",
};
const linkBtn = {
  background: "none", border: "none", color: "#6f8b97", fontSize: 13,
  fontWeight: 600, textDecoration: "underline", cursor: "pointer",
};

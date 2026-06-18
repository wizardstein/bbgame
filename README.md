# Beard Brothers — Cărămidă cu cărămidă 🧱

Joc hyper-casual de tip *brick-catcher* la persoana întâi pentru **Beard Brothers**.
Playerul ține o roabă și prinde cele 100 de cărămizi care cad din cer, ca să ajute la
construirea **Școlii BB** — cărămidă cu cărămidă. Scop: awareness, engagement, virality.

## Stack

- React 18 + Vite
- Three.js (încărcat de la CDN la runtime, r128)
- Single-component game: `src/BBWheelbarrow.jsx`

## Dezvoltare locală

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # output în dist/
npm run preview
```

## Deploy pe Vercel

Vercel detectează automat Vite (Build: `npm run build`, Output: `dist`).
Importă repo-ul în Vercel și gata — fără configurare suplimentară.

## Ce e implementat

- **Mobile-first**, playfield fix (max 480px) — identic pe desktop și pe telefon.
- Roabă realistă văzută de sus (ca și cum o ții tu), încadrată corect pe orice ecran.
- Limite clare: roaba stă în carosabil, borduri 3D, feedback pe marginea ecranului.
- Dificultate graduală: spawn de la `0.95s` → `0.50s` → `0.34s` (sprint final).
- Cărămizile sunt **colectate** (alunecă în cuvă), nu sparte.
- Ecran final: zidul tău cu **exact** câte cărămizi ai strâns (running-bond).
- Reclame Beard Brothers pe marginea drumului cu **props 3D** (baloane, copaci,
  ambulanță, picătură de sânge etc.) și badge de status (`ÎN DESFĂȘURARE` /
  `REALIZAT` / `ÎN PLAN`).
- Viralitate: record local, share + WhatsApp, link de provocare `?challenge=<scor>`,
  CTA donație către școala BB.

### De curățat / de confirmat

Lista de campanii și statusul lor se editează în `src/BBWheelbarrow.jsx` →
constanta `BILLBOARDS`. Marcați corect ce e activ, realizat sau în plan.

## Roadmap (later)

- Leaderboard global (Supabase / Cloudflare KV)
- OG image dinamic per scor (preview cu scorul în WhatsApp/Facebook)
- Certificat „o cărămidă donată în numele tău”

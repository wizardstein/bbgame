import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

// Self-hosted fonts (bundled by Vite) — replaces the Google Fonts CDN <link>
// so visitor IPs are never sent to Google. GDPR-safe for an EU NGO.
// Only the latin + latin-ext subsets are pulled in; that's full Romanian
// coverage (ă/â/î in latin, ș/ț in latin-ext) without shipping unused scripts.
import "@fontsource/baloo-2/latin-600.css";
import "@fontsource/baloo-2/latin-700.css";
import "@fontsource/baloo-2/latin-ext-600.css";
import "@fontsource/baloo-2/latin-ext-700.css";
import "@fontsource/nunito/latin-400.css";
import "@fontsource/nunito/latin-600.css";
import "@fontsource/nunito/latin-700.css";
import "@fontsource/nunito/latin-800.css";
import "@fontsource/nunito/latin-ext-400.css";
import "@fontsource/nunito/latin-ext-600.css";
import "@fontsource/nunito/latin-ext-700.css";
import "@fontsource/nunito/latin-ext-800.css";

createRoot(document.getElementById("root")).render(<App />);

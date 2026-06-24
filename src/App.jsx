import BBWheelbarrow from "./BBWheelbarrow.jsx";

// Full-viewport stage (the engine's wrap is position:fixed inset:0).
// difficulty: "easy" | "normal" | "hard" · defaultLang: "ro" | "en"
export default function App() {
  return <BBWheelbarrow difficulty="normal" defaultLang="ro" />;
}

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["'Space Grotesk'", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      colors: {
        ink: { 950: "#0f1419", 900: "#0f1419", 800: "#1a1f26", 700: "#262d36" },
        neon: {
          violet: "#06b6d4",
          cyan: "#06b6d4",
          amber: "#eab308",
          pink: "#ef4444",
          lime: "#22c55e",
        },
      },
      backgroundImage: {
        "hero-gradient":
          "radial-gradient(circle at 20% 10%, rgba(6,182,212,0.12), transparent 45%), radial-gradient(circle at 90% 20%, rgba(234,179,8,0.09), transparent 45%), radial-gradient(circle at 40% 90%, rgba(34,197,94,0.08), transparent 50%)",
      },
      boxShadow: {
        glow: "0 0 28px -10px rgba(6, 182, 212, 0.30)",
        glowCyan: "0 0 28px -10px rgba(6, 182, 212, 0.30)",
        soft: "0 8px 30px -12px rgba(0, 0, 0, 0.5)",
      },
    },
  },
  plugins: [],
};

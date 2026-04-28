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
        ink: { 950: "#0f1320", 900: "#131722", 800: "#181d2c", 700: "#1f2536" },
        neon: {
          violet: "#a78bfa",
          cyan: "#22d3ee",
          amber: "#fbbf24",
          pink: "#f472b6",
          lime: "#a3e635",
        },
      },
      backgroundImage: {
        "hero-gradient":
          "radial-gradient(circle at 20% 10%, rgba(99,102,241,0.10), transparent 45%), radial-gradient(circle at 90% 20%, rgba(34,211,238,0.08), transparent 45%), radial-gradient(circle at 40% 90%, rgba(244,114,182,0.06), transparent 50%)",
      },
      boxShadow: {
        glow: "0 0 28px -10px rgba(99, 102, 241, 0.30)",
        glowCyan: "0 0 28px -10px rgba(34, 211, 238, 0.30)",
        soft: "0 8px 30px -12px rgba(0, 0, 0, 0.5)",
      },
    },
  },
  plugins: [],
};

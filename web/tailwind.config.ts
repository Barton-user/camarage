import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Mismo palette que la app mobile
        cyan: { 400: "#22d3ee" },
        yellow: { 400: "#facc15" },
        green: { 500: "#22c55e" },
        red: { 500: "#ef4444" },
        purple: { 400: "#a78bfa" },
        orange: { 400: "#fb923c" },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./sidepanel.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#f6f7fb",
        ink: "#111322",
        muted: "#697086",
        panel: "#ffffff",
        line: "#e6e8f0",
        "line-strong": "#d5d8e4",
        accent: {
          DEFAULT: "#6366f1",
          hover: "#4f46e5",
          soft: "#eef2ff",
          softer: "#f5f6ff",
          ring: "#c7d2fe",
        },
        measure: "#14b8a6",
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      borderRadius: {
        card: "0.75rem",
      },
      boxShadow: {
        panel: "0 1px 2px rgb(17 19 34 / 0.05), 0 1px 3px rgb(17 19 34 / 0.06)",
        card: "0 1px 2px rgb(17 19 34 / 0.04), 0 2px 8px rgb(17 19 34 / 0.04)",
        pop: "0 4px 12px rgb(17 19 34 / 0.08), 0 12px 32px rgb(17 19 34 / 0.12)",
        "accent-glow": "0 1px 2px rgb(79 70 229 / 0.25), 0 4px 12px rgb(99 102 241 / 0.35)",
      },
    },
  },
  plugins: [],
};

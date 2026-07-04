/** @type {import('tailwindcss').Config} */
export default {
  content: ["./sidepanel.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#f4f3f9",
        ink: "#211f30",
        muted: "#726f8c",
        panel: "#ffffff",
        "panel-soft": "#faf9fe",
        line: "#eceaf5",
        "line-strong": "#ded9ef",
        accent: {
          DEFAULT: "#6f5ae6",
          hover: "#5c46d6",
          soft: "#efeafe",
          softer: "#f7f5ff",
          ring: "#d8cffb",
        },
        measure: "#14b8a6",
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      borderRadius: {
        card: "1.125rem",
        pill: "9999px",
      },
      boxShadow: {
        panel: "0 1px 2px rgb(33 31 48 / 0.04), 0 2px 6px rgb(33 31 48 / 0.05)",
        card: "0 1px 2px rgb(33 31 48 / 0.03), 0 6px 20px rgb(33 31 48 / 0.06)",
        soft: "0 1px 3px rgb(33 31 48 / 0.05)",
        pop: "0 8px 24px rgb(33 31 48 / 0.10), 0 20px 48px rgb(33 31 48 / 0.14)",
        "accent-glow": "0 2px 8px rgb(111 90 230 / 0.28), 0 6px 18px rgb(111 90 230 / 0.30)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.18s ease-out",
      },
    },
  },
  plugins: [],
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./sidepanel.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#f7f8fb",
        ink: "#111827",
        muted: "#6b7280",
        panel: "#ffffff",
        accent: "#2563eb",
        measure: "#14b8a6",
      },
      boxShadow: {
        panel: "0 1px 3px rgb(15 23 42 / 0.12)",
      },
    },
  },
  plugins: [],
};

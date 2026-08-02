/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#efece3",
        "paper-dim": "#e4e0d3",
        paperwhite: "#fbfaf6",
        ink: "#1c1b19",
        "ink-soft": "#59564d",
        line: "#cac5b6",
        "pen-blue": "#2c4a73",
        "pen-red": "#b23a2e",
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-monospace", "monospace"],
        body: ["var(--font-body)", "-apple-system", "sans-serif"],
        annotation: ["var(--font-annotation)", "cursive"],
      },
      borderRadius: {
        doc: "3px",
      },
      maxWidth: {
        wrap: "1180px",
      },
    },
  },
  plugins: [],
};

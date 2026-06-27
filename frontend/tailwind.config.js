/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Warm paper palette — the visual identity of the product
        "hr-sidebar": "#F0EDE8",   // sidebar background — warm paper
        "hr-bg":      "#F7F6F4",   // page background — off-white warm
        "hr-navy":    "#1E2A3A",   // logo, primary headings
        "hr-ink":     "#2C2C2C",   // body text
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        // Subtle card lift for active nav items
        "nav-active": "0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.06)",
      },
    },
  },
  plugins: [],
}

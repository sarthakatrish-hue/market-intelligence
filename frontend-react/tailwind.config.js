/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: '#1a1a2e',
        sidebar: '#16213e',
        accent: '#0f3460',
        'text-primary': '#ffffff',
        'text-secondary': '#e0e0e0',
        'text-muted': '#8892a4',
        border: 'rgba(15,52,96,0.4)',
      },
    },
  },
  plugins: [],
}

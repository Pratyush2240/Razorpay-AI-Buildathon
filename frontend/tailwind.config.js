/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        primary: {
          DEFAULT: '#166534',
          dark: '#004c22',
          light: '#f0fdf4',
          container: '#166534',
          'on-container': '#93e0a2',
        },
        surface: {
          DEFAULT: '#f8f9ff',
          bright: '#f8f9ff',
          dim: '#cbdbf5',
          container: '#e5eeff',
          'container-low': '#eff4ff',
          'container-high': '#dce9ff',
          'container-highest': '#d3e4fe',
        },
        'on-surface': '#0b1c30',
        'on-surface-variant': '#404940',
        standard: '#e2e8f0',
      },
    },
  },
  plugins: [],
}

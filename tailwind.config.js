/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0b0f14',
        card: '#121822',
        border: '#22303f',
        foreground: '#e6edf3',
        muted: '#8b98a9',
        primary: '#e8344e',
        accent: '#1b2632',
      },
    },
  },
  plugins: [],
};

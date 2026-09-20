/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#07090d',
        card: '#0e1219',
        'card-2': '#131a24',
        border: '#1c2633',
        'border-strong': '#2a3646',
        foreground: '#eef2f7',
        muted: '#8593a6',
        accent: '#182130',
        primary: '#e8344e',
        'primary-hover': '#ff4d66',
        success: '#22c55e',
        warning: '#f5b840',
        danger: '#ef4444',
        info: '#3b82f6',
      },
    },
  },
  plugins: [],
};

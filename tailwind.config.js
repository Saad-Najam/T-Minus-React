/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        void: '#04070f', panel: '#0a1020', panel2: '#0f1830', line: '#1d2a4a',
        ink: '#e8eefc', mute: '#8a98b8', accent: '#ff7a1a', accent2: '#ffb36b',
        cyanx: '#38d6ff', ok: '#4ade80', warn: '#fbbf24', bad: '#f87171',
      },
      fontFamily: {
        display: ['Rajdhani', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: { glow: '0 0 40px -8px rgba(255,122,26,.55)', cyan: '0 0 32px -8px rgba(56,214,255,.5)' },
    },
  },
  plugins: [],
};

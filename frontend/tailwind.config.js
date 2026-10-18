/** @type {import('tailwindcss').Config} */

// Colours come from CSS variables (see src/index.css) so the signed-in app can switch to dark mode.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // "white" is the surface colour and "black" the strongest foreground; both flip in dark mode.
        white: v('white'),
        black: v('black'),
        // Monochrome brand: black actions on white, grey supporting text.
        brand: {
          50: v('water-50'),
          100: v('water-100'),
          500: v('black'),
          600: v('black'),
          700: v('black'),
        },
        // Water accents, used for waves, levels and pipes.
        water: {
          50: v('water-50'),
          100: v('water-100'),
          200: v('water-200'),
          300: v('water-300'),
          400: v('water-400'),
          600: v('water-600'),
          900: v('water-900'),
        },
        background: v('background'),
        // Background of the signed-in app: off-blue in light mode, deep navy in dark mode.
        app: v('app'),
        ink: v('ink'),
        muted: v('muted'),
        canvas: v('background'),
      },
      fontFamily: {
        sans: ['Inter', '"Noto Sans Telugu"', '"Noto Sans Devanagari"', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', '"Noto Sans Telugu"', '"Noto Sans Devanagari"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgb(var(--shadow) / 0.05), 0 12px 32px -16px rgb(var(--shadow) / 0.22)',
      },
    },
  },
  plugins: [],
};

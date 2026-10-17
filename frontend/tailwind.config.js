/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#E6F4F1',
          100: '#CCEAE4',
          500: '#14B8A6',
          600: '#0F766E',
          700: '#115E59',
        },
        ink: '#0F172A',
        muted: '#475569',
        canvas: '#F8FAFC',
      },
      fontFamily: {
        sans: ['"Noto Sans"', '"Noto Sans Telugu"', '"Noto Sans Devanagari"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,23,42,0.06), 0 8px 24px -12px rgba(15,23,42,0.18)',
      },
    },
  },
  plugins: [],
};

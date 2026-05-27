/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        nixie: {
          50:  '#fff8eb',
          100: '#ffefc3',
          200: '#ffdb82',
          300: '#ffc13f',
          400: '#ffa500',
          500: '#f08000',
          600: '#cc5e00',
          700: '#a03f02',
          800: '#833209',
          900: '#6e290b',
        },
      },
    },
  },
  plugins: [],
};

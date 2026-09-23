import colors from 'tailwindcss/colors';

// Theme-able palettes: every shade the pages use resolves to a CSS variable
// (see :root / html.light in src/index.css), so the existing slate/amber
// classes switch between the dark and light theme without per-page edits.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const scale = (name, shades) => Object.fromEntries(shades.map(s => [s, v(`${name}-${s}`)]));
const ALL = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        digits: ['"Barlow Condensed"', '"IBM Plex Sans"', 'sans-serif'],
      },
      colors: {
        slate:   scale('slate', ALL),
        amber:   { ...colors.amber,   ...scale('amber', [200, 300, 400, 500, 600]) },
        green:   { ...colors.green,   ...scale('green', [400, 700, 900]) },
        emerald: { ...colors.emerald, ...scale('emerald', [400, 700, 900]) },
        red:     { ...colors.red,     ...scale('red', [400, 700, 900]) },
        yellow:  { ...colors.yellow,  ...scale('yellow', [400, 700, 900]) },
        blue:    { ...colors.blue,    ...scale('blue', [400, 700, 900]) },
        // Text on the orange accent — stays dark in both themes.
        onaccent: '#1A1206',
      },
    },
  },
  plugins: [],
};

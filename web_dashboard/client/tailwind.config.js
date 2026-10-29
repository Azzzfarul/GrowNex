import defaultTheme from 'tailwindcss/defaultTheme'

// Material Design 3 color roles; values are CSS variables set in src/index.css (light + .dark)
const ROLES = [
  'primary', 'on-primary', 'primary-container', 'on-primary-container',
  'secondary', 'on-secondary', 'secondary-container', 'on-secondary-container',
  'tertiary', 'on-tertiary', 'tertiary-container', 'on-tertiary-container',
  'error', 'on-error', 'error-container', 'on-error-container',
  'warning', 'on-warning', 'warning-container', 'on-warning-container',
  'surface', 'on-surface', 'on-surface-variant',
  'surface-container-lowest', 'surface-container-low', 'surface-container',
  'surface-container-high', 'surface-container-highest',
  'outline', 'outline-variant', 'inverse-surface', 'inverse-on-surface', 'inverse-primary', 'scrim',
]

// M3 type scale: [size, { lineHeight, letterSpacing, fontWeight }]
const type = (size, lh, ls, weight = '400') => [size, { lineHeight: lh, letterSpacing: ls, fontWeight: weight }]

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: Object.fromEntries(ROLES.map((r) => [r, `rgb(var(--md-${r}) / <alpha-value>)`])),
      fontFamily: { sans: ['Roboto', ...defaultTheme.fontFamily.sans] },
      fontSize: {
        'display-sm':  type('36px', '44px', '0'),
        'headline-md': type('28px', '36px', '0'),
        'headline-sm': type('24px', '32px', '0'),
        'title-lg':    type('22px', '28px', '0'),
        'title-md':    type('16px', '24px', '0.15px', '500'),
        'title-sm':    type('14px', '20px', '0.1px', '500'),
        'body-lg':     type('16px', '24px', '0.5px'),
        'body-md':     type('14px', '20px', '0.25px'),
        'body-sm':     type('12px', '16px', '0.4px'),
        'label-lg':    type('14px', '20px', '0.1px', '500'),
        'label-md':    type('12px', '16px', '0.5px', '500'),
        'label-sm':    type('11px', '16px', '0.5px', '500'),
      },
      // M3 elevation levels 1–3
      boxShadow: {
        'elevation-1': '0 1px 2px 0 rgb(0 0 0 / 0.3), 0 1px 3px 1px rgb(0 0 0 / 0.15)',
        'elevation-2': '0 1px 2px 0 rgb(0 0 0 / 0.3), 0 2px 6px 2px rgb(0 0 0 / 0.15)',
        'elevation-3': '0 1px 3px 0 rgb(0 0 0 / 0.3), 0 4px 8px 3px rgb(0 0 0 / 0.15)',
      },
      borderRadius: { '4xl': '28px' }, // M3 extra-large (dialogs)
    },
  },
  plugins: [],
}

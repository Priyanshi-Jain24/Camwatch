/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // All theme-aware via CSS variables (see src/index.css)
        bg:      'rgb(var(--color-bg) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        surface2:'rgb(var(--color-surface2) / <alpha-value>)',
        border:  'rgb(var(--color-border) / <alpha-value>)',
        border2: 'rgb(var(--color-border2) / <alpha-value>)',
        text:    'rgb(var(--color-text) / <alpha-value>)',
        muted:   'rgb(var(--color-muted) / <alpha-value>)',
        dim:     'rgb(var(--color-dim) / <alpha-value>)',
        accent:  'rgb(var(--color-accent) / <alpha-value>)',
        success: 'rgb(var(--color-success) / <alpha-value>)',
        warning: 'rgb(var(--color-warning) / <alpha-value>)',
        danger:  'rgb(var(--color-danger) / <alpha-value>)',
        purple:  'rgb(var(--color-purple) / <alpha-value>)',
        teal:    'rgb(var(--color-teal) / <alpha-value>)',
        primary: 'rgb(var(--color-primary) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '6px',
        lg: '10px',
        xl: '14px',
      },
    },
  },
  plugins: [],
}

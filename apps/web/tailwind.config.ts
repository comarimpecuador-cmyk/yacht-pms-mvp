import type { Config } from 'tailwindcss';

const colorVar = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Backgrounds
        background: {
          DEFAULT: colorVar('--color-background'),
          light: '#FFFFFF',
        },
        surface: {
          DEFAULT: colorVar('--color-surface'),
          light: '#F1F5F9',
        },
        'surface-hover': {
          DEFAULT: colorVar('--color-surface-hover'),
          light: '#E2E8F0',
        },
        border: {
          DEFAULT: colorVar('--color-border'),
          light: '#E2E8F0',
        },
        // Accents
        accent: {
          DEFAULT: '#0F4C81',
          hover: '#0C3D67',
          subtle: '#E9F1F8',
          foreground: '#FFFFFF',
        },
        gold: {
          DEFAULT: '#D4AF37',
          hover: '#C5A028',
          subtle: '#6B5C1E',
        },
        // Semantics
        success: '#10B981',
        warning: '#F59E0B',
        error: '#EF4444',
        info: '#3B82F6',
        // Text
        'text-primary': {
          DEFAULT: colorVar('--color-text-primary'),
          light: '#0F172A',
        },
        'text-secondary': {
          DEFAULT: colorVar('--color-text-secondary'),
          light: '#475569',
        },
        'text-muted': {
          DEFAULT: colorVar('--color-text-muted'),
          light: '#94A3B8',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;

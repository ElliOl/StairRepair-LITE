/**
 * Design tokens for StepFixer — dark theme, Radix Tomato accent, Plasticity-style viewport
 */

export const colors = {
  background: '#0a0a0a',
  surface: '#111111',
  surfaceElevated: '#1a1a1a',
  surfaceHover: '#1f1f1f',
  viewport: '#050505',
  border: '#2a2a2a',
  borderHover: '#3a3a3a',
  accent: '#e54d2e',
  accentHover: '#ec6142',
  accentMuted: '#291415',
  accentSubtle: '#3b1813',
  success: '#46a758',
  error: '#e5484d',
  warning: '#f76b15',
  info: '#0090ff',
  text: '#e5e5e5',
  textMuted: '#a3a3a3',
  textSubtle: '#666666',
  white: '#ffffff',
  black: '#000000',
} as const

export const spacing = {
  xs: '0.25rem',
  sm: '0.5rem',
  md: '0.75rem',
  lg: '1rem',
  xl: '1.5rem',
  '2xl': '2rem',
  '3xl': '3rem',
  sectionGap: '1.25rem',
  controlGap: '0.5rem',
} as const

export const typography = {
  fontFamily: {
    sans: 'Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
    mono: 'JetBrains Mono, Consolas, monospace',
  },
  fontSize: { xs: '0.75rem', sm: '0.875rem', base: '1rem', lg: '1.125rem', xl: '1.25rem' },
  fontWeight: { normal: 400, medium: 500, semibold: 600, bold: 700 },
  lineHeight: { tight: 1.25, normal: 1.5, relaxed: 1.75 },
} as const

export const borderRadius = {
  none: '0',
  sm: '0.25rem',
  md: '0.375rem',
  lg: '0.5rem',
  xl: '0.75rem',
  full: '9999px',
} as const

export const transitions = {
  fast: '150ms ease',
  base: '200ms ease',
  slow: '300ms ease',
} as const

export const panel = {
  width: '320px',
  headerHeight: '32px',
} as const

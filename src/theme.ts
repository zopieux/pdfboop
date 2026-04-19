import { createTheme, globalStyle } from '@macaron-css/core';

export const [themeClass, vars] = createTheme({
  colors: {
    primary: '#3b82f6',
    bg: '#f8f9fa',
    surface: '#ffffff',
    text: '#1f2937',
    border: '#e5e7eb',
    danger: '#ef4444',
    success: '#22c55e',
  },
  gaps: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '20px',
  },
  sizes: {
    sidebarWidth: '320px',
    headerHeight: '48px',
  },
});

globalStyle(':root', {
  '@media': {
    '(prefers-color-scheme: dark)': {
      vars: {
        [vars.colors.bg]: '#0f172a',
        [vars.colors.surface]: '#1e293b',
        [vars.colors.text]: '#f1f5f9',
        [vars.colors.border]: '#334155',
        [vars.colors.danger]: '#f87171',
      },
    },
  },
});

globalStyle('body, html', {
  margin: 0,
  padding: 0,
  height: '100%',
  width: '100%',
  fontFamily:
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  backgroundColor: vars.colors.bg,
  color: vars.colors.text,
  overflow: 'hidden',
});

globalStyle('*', {
  boxSizing: 'border-box',
});

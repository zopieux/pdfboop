import { styled } from '@macaron-css/solid';
import { vars } from '../../theme';

export const TabList = styled('div', {
  base: {
    display: 'flex',
    height: vars.sizes.headerHeight,
    borderBottom: `1px solid ${vars.colors.border}`,
    flexShrink: 0,
  },
});

const tabBase = {
  flex: 1,
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: vars.gaps.sm,
  fontSize: '13px',
  fontWeight: 500,
  color: vars.colors.text,
} as const;

export const TabButton = styled('button', {
  base: {
    ...tabBase,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    transition: 'background 0.1s, color 0.1s',
    selectors: {
      '&:hover': {
        background: vars.colors.border,
      },
    },
  },
  variants: {
    active: {
      true: {
        background: vars.colors.primary,
        color: vars.colors.surface,
        selectors: {
          '&:hover': {
            background: vars.colors.primary,
          },
        },
      },
    },
  },
});

export const TabTitle = styled('div', {
  base: {
    ...tabBase,
    fontWeight: 600, // Keep titles slightly bolder
    padding: `0 ${vars.gaps.md}`,
  },
});

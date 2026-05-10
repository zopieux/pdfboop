import { styled } from '@macaron-css/solid';
import { vars } from '../../theme';

export const Button = styled('button', {
  base: {
    background: vars.colors.surface,
    border: `1px solid ${vars.colors.border}`,
    color: vars.colors.text,
    padding: `${vars.gaps.xs} ${vars.gaps.sm}`,
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: vars.gaps.xs,
    transition: 'background 0.1s',
    selectors: {
      '&:hover': {
        background: vars.colors.border,
      },
      '&:disabled': {
        opacity: 0.5,
        cursor: 'not-allowed',
      },
    },
  },
  variants: {
    size: {
      sm: {
        fontSize: '11px',
        padding: '4px 8px',
      },
    },
    variant: {
      primary: {
        background: vars.colors.primary,
        color: 'white',
        borderColor: vars.colors.primary,
        selectors: {
          '&:hover': {
            filter: 'brightness(1.1)',
            background: vars.colors.primary,
          },
        },
      },
      danger: {
        selectors: {
          '&:hover': {
            background: '#fee2e2',
            color: '#ef4444',
          },
        },
      },
    },
  },
});

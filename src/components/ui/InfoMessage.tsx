import { styled } from '@macaron-css/solid';
import { vars } from '../../theme';

export const InfoMessage = styled('div', {
  base: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    fontSize: '13px',
    lineHeight: 1.5,
    color: vars.colors.textMuted,
    gap: vars.gaps.md,
    padding: vars.gaps.lg,
  },
  variants: {
    italic: {
      true: {
        fontStyle: 'italic',
      },
    },
    strong: {
      true: {
        color: vars.colors.text,
        fontWeight: 500,
      },
    },
  },
});

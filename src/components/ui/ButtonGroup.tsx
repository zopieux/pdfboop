import { styled } from '@macaron-css/solid';
import { vars } from '../../theme';

export const ButtonGroup = styled('div', {
  base: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: vars.gaps.sm,
    marginTop: vars.gaps.sm,
  },
  variants: {
    size: {
      small: {
        '& > button': {
          fontSize: '11px',
          padding: '4px 8px',
        },
      },
    },
    fill: {
      true: {
        '& > button': {
          flex: 1,
        },
      },
    },
  },
  defaultVariants: {
    fill: true,
  },
});

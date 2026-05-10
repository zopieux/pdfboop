import { vars } from '../../theme';
import type { Anchor } from '../../types';

export const AnchorIcon = (props: { anchor: Anchor }) => {
  const getFill = (a: Anchor) => (props.anchor === a ? vars.colors.primary : 'transparent');
  return (
    <svg width="20" height="20" viewBox="0 0 14 14" style={{ 'flex-shrink': 0, display: 'block' }}>
      <circle
        cx="2.5"
        cy="2.5"
        r="1.5"
        fill={getFill('top-left')}
        stroke="currentColor"
        stroke-width="1"
        vector-effect="non-scaling-stroke"
      />
      <circle
        cx="7"
        cy="2.5"
        r="1.5"
        fill={getFill('top')}
        stroke="currentColor"
        stroke-width="1"
        vector-effect="non-scaling-stroke"
      />
      <circle
        cx="11.5"
        cy="2.5"
        r="1.5"
        fill={getFill('top-right')}
        stroke="currentColor"
        stroke-width="1"
        vector-effect="non-scaling-stroke"
      />

      <circle
        cx="2.5"
        cy="7"
        r="1.5"
        fill={getFill('left')}
        stroke="currentColor"
        stroke-width="1"
        vector-effect="non-scaling-stroke"
      />
      <circle
        cx="7"
        cy="7"
        r="1.5"
        fill={getFill('center')}
        stroke="currentColor"
        stroke-width="1"
        vector-effect="non-scaling-stroke"
      />
      <circle
        cx="11.5"
        cy="7"
        r="1.5"
        fill={getFill('right')}
        stroke="currentColor"
        stroke-width="1"
        vector-effect="non-scaling-stroke"
      />

      <circle
        cx="2.5"
        cy="11.5"
        r="1.5"
        fill={getFill('bottom-left')}
        stroke="currentColor"
        stroke-width="1"
        vector-effect="non-scaling-stroke"
      />
      <circle
        cx="7"
        cy="11.5"
        r="1.5"
        fill={getFill('bottom')}
        stroke="currentColor"
        stroke-width="1"
        vector-effect="non-scaling-stroke"
      />
      <circle
        cx="11.5"
        cy="11.5"
        r="1.5"
        fill={getFill('bottom-right')}
        stroke="currentColor"
        stroke-width="1"
        vector-effect="non-scaling-stroke"
      />
    </svg>
  );
};

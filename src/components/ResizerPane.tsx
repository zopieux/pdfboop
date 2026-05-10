import { styled } from '@macaron-css/solid';
import {
  ChevronDown,
  ChevronUp,
  Crop,
  Files,
  Link,
  Maximize,
  RefreshCw,
  Scissors,
  Unlink,
} from 'lucide-solid';
import { type Component, createMemo, createSignal, Show } from 'solid-js';

const Grow = ChevronUp;
const Shrink = ChevronDown;
const Layers = Files;
const AspectRatio = Scissors;

import { resolveGeometry } from '../lib/geo';
import {
  cancelPickMode,
  resizeSelected,
  resizeSelectedToRatio,
  selectSameAspect,
  selectSameSize,
  setResizerAnchor,
  setResizerLinked,
  setResizerMode,
  startPickMode,
  state,
} from '../state';
import { vars } from '../theme';
import type { Anchor, Page } from '../types';
import { AnchorIcon } from './ui/AnchorIcon';
import { Button } from './ui/Button';

const Container = styled('div', {
  base: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    borderTop: `1px solid ${vars.colors.border}`,
    background: vars.colors.surface,
    color: vars.colors.text,
    padding: vars.gaps.md,
    gap: vars.gaps.sm,
    fontSize: '13px',
  },
});

const Title = styled('div', {
  base: {
    fontWeight: 600,
    marginBottom: vars.gaps.xs,
    color: vars.colors.text,
    opacity: 0.8,
    display: 'flex',
    alignItems: 'center',
    gap: vars.gaps.xs,
  },
});

const EmptyState = styled('div', {
  base: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    opacity: 0.5,
    fontStyle: 'italic',
    color: vars.colors.text,
  },
});

const InputGroup = styled('div', {
  base: {
    display: 'flex',
    alignItems: 'stretch',
    gap: vars.gaps.sm,
  },
});

const InputWrapper = styled('div', {
  base: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    flex: 1,
  },
});

const Label = styled('label', {
  base: {
    fontSize: '10px',
    fontWeight: 600,
    textTransform: 'uppercase',
    opacity: 0.6,
  },
});

const StyledInput = styled('input', {
  base: {
    width: '100%',
    background: vars.colors.bg,
    border: `1px solid ${vars.colors.border}`,
    color: vars.colors.text,
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '13px',
    '&:focus': {
      outline: `2px solid ${vars.colors.primary}`,
      outlineOffset: '-1px',
    },
  },
});

const ActionGroup = styled('div', {
  base: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: vars.gaps.sm,
    marginTop: vars.gaps.xs,
  },
});

const StyledSelect = styled('select', {
  base: {
    flex: 1,
    background: vars.colors.bg,
    border: `1px solid ${vars.colors.border}`,
    color: vars.colors.text,
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '13px',
    '&:focus': {
      outline: `2px solid ${vars.colors.primary}`,
      outlineOffset: '-1px',
    },
  },
});

const WELL_KNOWN_SIZES = [
  { name: 'ISO (A4, etc.)', ratio: Math.SQRT2 },
  { name: 'US Letter', ratio: 11 / 8.5 },
  { name: 'US Legal', ratio: 14 / 8.5 },
  { name: 'Tabloid', ratio: 17 / 11 },
  { name: 'Square', ratio: 1 },
  { name: '16:9', ratio: 16 / 9 },
  { name: '4:3', ratio: 4 / 3 },
  { name: '21:9', ratio: 21 / 9 },
];

const ANCHORS: Anchor[] = [
  'top-left',
  'top',
  'top-right',
  'left',
  'center',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
];

export const ResizerPane: Component = () => {
  const selectedPages = createMemo(() => state.pages.filter((p) => state.selection.includes(p.id)));

  const analysis = createMemo(() => {
    const pages = selectedPages();
    if (pages.length === 0) return null;

    let allSameSize = true;
    let allSameAspect = true;

    const getPageSize = (p: Page) => {
      const geo = resolveGeometry(
        p.originalSize,
        state.operations.slice(0, state.historyIndex),
        p.id,
      );
      return { width: geo.canvasWidth, height: geo.canvasHeight };
    };

    const firstSize = getPageSize(pages[0]);
    const firstAspect = firstSize.height / firstSize.width;

    for (let i = 1; i < pages.length; i++) {
      const size = getPageSize(pages[i]);
      const aspect = size.height / size.width;

      if (
        Math.abs(size.width - firstSize.width) > 0.1 ||
        Math.abs(size.height - firstSize.height) > 0.1
      ) {
        allSameSize = false;
      }
      if (Math.abs(aspect - firstAspect) > 0.001) {
        allSameAspect = false;
      }
    }

    return {
      allSameSize,
      allSameAspect,
      width: firstSize.width,
      height: firstSize.height,
      aspect: firstAspect,
      pages,
    };
  });

  const [localW, setLocalW] = createSignal<string>('');
  const [localH, setLocalH] = createSignal<string>('');

  createMemo(() => {
    const a = analysis();
    if (a?.allSameSize) {
      setLocalW(a.width.toFixed(2));
      setLocalH(a.height.toFixed(2));
    }
  });

  const handleWidthChange = (val: string) => {
    const w = parseFloat(val);
    const a = analysis();
    if (!Number.isNaN(w) && w > 0 && a) {
      if (state.resizerLinked) {
        const h = w * a.aspect;
        resizeSelected({ width: w, height: h });
      } else {
        resizeSelected({ width: w, height: a.height });
      }
    } else {
      // Reset if invalid
      setLocalW(a?.width.toFixed(2) || '');
    }
  };

  const handleHeightChange = (val: string) => {
    const h = parseFloat(val);
    const a = analysis();
    if (!Number.isNaN(h) && h > 0 && a) {
      if (state.resizerLinked) {
        const w = h / a.aspect;
        resizeSelected({ width: w, height: h });
      } else {
        resizeSelected({ width: a.width, height: h });
      }
    } else {
      // Reset if invalid
      setLocalH(a?.height.toFixed(2) || '');
    }
  };

  const handleReset = () => {
    resizeSelected(undefined);
  };

  const resizeToSmallest = () => {
    const a = analysis();
    if (!a) return;
    let smallestW = Infinity;
    let smallestH = Infinity;

    a.pages.forEach((p) => {
      const geo = resolveGeometry(
        p.originalSize,
        state.operations.slice(0, state.historyIndex),
        p.id,
      );
      if (geo.canvasWidth < smallestW) {
        smallestW = geo.canvasWidth;
        smallestH = geo.canvasHeight;
      }
    });

    if (smallestW !== Infinity) {
      resizeSelected({ width: smallestW, height: smallestH });
    }
  };

  const resizeToLargest = () => {
    const a = analysis();
    if (!a) return;
    let largestW = 0;
    let largestH = 0;

    a.pages.forEach((p) => {
      const geo = resolveGeometry(
        p.originalSize,
        state.operations.slice(0, state.historyIndex),
        p.id,
      );
      if (geo.canvasWidth > largestW) {
        largestW = geo.canvasWidth;
        largestH = geo.canvasHeight;
      }
    });

    if (largestW > 0) {
      resizeSelected({ width: largestW, height: largestH });
    }
  };

  const cycleAnchor = (dir: 1 | -1) => {
    const idx = ANCHORS.indexOf(state.resizerAnchor);
    const nextIdx = (idx + dir + ANCHORS.length) % ANCHORS.length;
    setResizerAnchor(ANCHORS[nextIdx]);
  };

  return (
    <Container>
      <Title>
        <Show when={state.pickingAspectFor} fallback="Resizing Options">
          Pick target page...
        </Show>
      </Title>

      <Show when={state.pickingAspectFor}>
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: vars.gaps.md }}>
          <div style={{ opacity: 0.8, 'line-height': 1.4 }}>
            Select a page in the workspace that has the target aspect ratio and dimensions you want
            to match.
          </div>
          <Button onClick={cancelPickMode} style={{ 'justify-content': 'center' }}>
            Cancel pick
          </Button>
        </div>
      </Show>

      <Show when={!state.pickingAspectFor}>
        <Show
          when={analysis()}
          fallback={<EmptyState>Select some pages for resizing options</EmptyState>}
        >
          {(a) => (
            <Show
              when={a().allSameSize}
              fallback={
                <Show
                  when={a().allSameAspect}
                  fallback={
                    <div style={{ opacity: 0.7, 'line-height': 1.4 }}>
                      Selection contains multiple sizes and aspect ratios. Select only pages with
                      the same size or aspect ratio to enable resizing tools.
                    </div>
                  }
                >
                  <div style={{ display: 'flex', 'flex-direction': 'column', gap: vars.gaps.sm }}>
                    <div style={{ opacity: 0.8 }}>
                      Selection has same aspect ratio, but different sizes.
                    </div>
                    <ActionGroup>
                      <Button onClick={resizeToSmallest} style={{ flex: 1 }}>
                        <Shrink size={14} /> Resize to smallest
                      </Button>
                      <Button onClick={resizeToLargest} style={{ flex: 1 }}>
                        <Grow size={14} /> Resize to largest
                      </Button>
                    </ActionGroup>
                    <Button
                      onClick={() => selectSameAspect(a().aspect)}
                      style={{ 'justify-content': 'center' }}
                    >
                      <AspectRatio size={14} /> Select all with same aspect
                    </Button>
                    <Button
                      variant="primary"
                      onClick={startPickMode}
                      style={{ 'justify-content': 'center', 'margin-top': vars.gaps.xs }}
                    >
                      <AspectRatio size={14} /> Match aspect...
                    </Button>
                  </div>
                </Show>
              }
            >
              <div style={{ display: 'flex', 'flex-direction': 'column', gap: vars.gaps.sm }}>
                <InputGroup>
                  <InputWrapper>
                    <Label>Width (pt)</Label>
                    <StyledInput
                      type="text"
                      value={localW()}
                      onInput={(e: any) => setLocalW(e.currentTarget.value)}
                      onBlur={(e: any) => handleWidthChange(e.currentTarget.value)}
                      onKeyDown={(e: any) =>
                        e.key === 'Enter' && handleWidthChange(e.currentTarget.value)
                      }
                    />
                  </InputWrapper>
                  <Button
                    onClick={() => setResizerLinked(!state.resizerLinked)}
                    style={{
                      width: '32px',
                      padding: '4px',
                      'justify-content': 'center',
                      'margin-top': '14px',
                      border: 'none',
                      background: 'none',
                      opacity: state.resizerLinked ? 1 : 0.5,
                    }}
                    title={state.resizerLinked ? 'Unlink dimensions' : 'Link dimensions'}
                  >
                    <Show when={state.resizerLinked} fallback={<Unlink size={16} />}>
                      <Link size={16} />
                    </Show>
                  </Button>
                  <InputWrapper>
                    <Label>Height (pt)</Label>
                    <StyledInput
                      type="text"
                      value={localH()}
                      onInput={(e: any) => setLocalH(e.currentTarget.value)}
                      onBlur={(e: any) => handleHeightChange(e.currentTarget.value)}
                      onKeyDown={(e: any) =>
                        e.key === 'Enter' && handleHeightChange(e.currentTarget.value)
                      }
                    />
                  </InputWrapper>
                </InputGroup>

                <InputGroup>
                  <StyledSelect
                    value={(() => {
                      const a = analysis();
                      if (!a) return 'custom';
                      const match = WELL_KNOWN_SIZES.find(
                        (s) =>
                          Math.abs(s.ratio - a.aspect) < 0.005 ||
                          Math.abs(s.ratio - 1 / a.aspect) < 0.005,
                      );
                      return match ? match.name : 'custom';
                    })()}
                    onChange={(e: any) => {
                      const val = e.currentTarget.value;
                      if (val === 'custom') {
                        setResizerLinked(false);
                        return;
                      }
                      const size = WELL_KNOWN_SIZES.find((s) => s.name === val);
                      if (size) {
                        resizeSelectedToRatio(size.ratio);
                      }
                    }}
                  >
                    <option value="custom">Custom</option>
                    {WELL_KNOWN_SIZES.map((s) => (
                      <option value={s.name}>{s.name}</option>
                    ))}
                  </StyledSelect>
                  <Button
                    onClick={() => cycleAnchor(1)}
                    onContextMenu={(e: any) => {
                      e.preventDefault();
                      cycleAnchor(-1);
                    }}
                    onWheel={(e: any) => {
                      e.preventDefault();
                      cycleAnchor(e.deltaY > 0 ? 1 : -1);
                    }}
                    style={{
                      width: '36px',
                      padding: '2px',
                      'justify-content': 'center',
                    }}
                    title={`Anchor: ${state.resizerAnchor} (Click/Wheel to cycle)`}
                  >
                    <AnchorIcon anchor={state.resizerAnchor} />
                  </Button>
                  <Button
                    onClick={() => setResizerMode(state.resizerMode === 'crop' ? 'pad' : 'crop')}
                    style={{
                      width: '80px',
                      'justify-content': 'center',
                    }}
                    title={state.resizerMode === 'crop' ? 'Switch to Pad' : 'Switch to Crop'}
                  >
                    <Show when={state.resizerMode === 'crop'} fallback={<Maximize size={14} />}>
                      <Crop size={14} />
                    </Show>
                    {state.resizerMode === 'crop' ? 'Crop' : 'Pad'}
                  </Button>
                </InputGroup>

                <ActionGroup>
                  <Button onClick={handleReset} style={{ flex: 1, 'justify-content': 'center' }}>
                    <RefreshCw size={14} /> Reset size
                  </Button>
                </ActionGroup>

                <ActionGroup>
                  <Button
                    onClick={() => selectSameSize(a().width, a().height)}
                    style={{ flex: 1, 'justify-content': 'center' }}
                  >
                    <Layers size={14} /> Select same size
                  </Button>
                  <Button
                    onClick={() => selectSameAspect(a().aspect)}
                    style={{ flex: 1, 'justify-content': 'center' }}
                  >
                    <AspectRatio size={14} /> Select same aspect
                  </Button>
                </ActionGroup>
                <Button
                  variant="primary"
                  onClick={startPickMode}
                  style={{ 'justify-content': 'center', 'margin-top': vars.gaps.xs }}
                >
                  <AspectRatio size={14} /> Match aspect...
                </Button>
              </div>
            </Show>
          )}
        </Show>
      </Show>
    </Container>
  );
};

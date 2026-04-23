import { styled } from '@macaron-css/solid';
import { ChevronDown, ChevronUp, Files, RefreshCw, Scissors } from 'lucide-solid';
import { type Component, createMemo, createSignal, Show } from 'solid-js';

const Maximize = ChevronUp;
const Minimize = ChevronDown;
const Layers = Files;
const AspectRatio = Scissors;

import { resolveGeometry } from '../lib/geo';
import {
  cancelPickMode,
  resizeSelected,
  selectSameAspect,
  selectSameSize,
  startPickMode,
  state,
} from '../state';
import { vars } from '../theme';
import type { Page } from '../types';
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
    alignItems: 'center',
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
      const h = w * a.aspect;
      resizeSelected({ width: w, height: h });
    } else {
      // Reset if invalid
      setLocalW(a?.width.toFixed(2) || '');
    }
  };

  const handleHeightChange = (val: string) => {
    const h = parseFloat(val);
    const a = analysis();
    if (!Number.isNaN(h) && h > 0 && a) {
      const w = h / a.aspect;
      resizeSelected({ width: w, height: h });
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
                        <Minimize size={14} /> Resize to smallest
                      </Button>
                      <Button onClick={resizeToLargest} style={{ flex: 1 }}>
                        <Maximize size={14} /> Resize to largest
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

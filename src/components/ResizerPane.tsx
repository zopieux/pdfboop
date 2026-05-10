import { styled } from '@macaron-css/solid';
import { Crop, Files, Link, Maximize2, Minimize2, RefreshCw, Scissors, Unlink } from 'lucide-solid';
import { type Component, createEffect, createMemo, createSignal, Show } from 'solid-js';

const Grow = Maximize2;
const Shrink = Minimize2;
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
import { ButtonGroup } from './ui/ButtonGroup';
import { InfoMessage } from './ui/InfoMessage';

const Container = styled('div', {
  base: {
    display: 'flex',
    flexDirection: 'column',
    borderTop: `1px solid ${vars.colors.border}`,
    background: vars.colors.surface,
    color: vars.colors.text,
    padding: 0,
    gap: 0,
    fontSize: '13px',
    minHeight: '180px',
    maxHeight: '50%',
    overflow: 'hidden',
    flexShrink: 0,
  },
});

import { TabList, TabTitle } from './ui/Tabs';

const Content = styled('div', {
  base: {
    display: 'flex',
    flexDirection: 'column',
    padding: vars.gaps.md,
    gap: vars.gaps.sm,
    flex: 1,
    overflowY: 'auto',
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
    fontSize: '11px',
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
  { name: 'ISO A (A4)', ratio: Math.SQRT2 },
  { name: 'US Letter', ratio: 11 / 8.5 },
  { name: 'US Legal', ratio: 14 / 8.5 },
  { name: 'Tabloid', ratio: 17 / 11 },
  { name: 'Square (1:1)', ratio: 1 },
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

const AspectList = styled('div', {
  base: {
    display: 'flex',
    flexDirection: 'column',
    gap: vars.gaps.xs,
    overflowY: 'auto',
    flex: 1,
    marginTop: vars.gaps.xs,
  },
});

const AspectRow = styled('div', {
  base: {
    display: 'flex',
    alignItems: 'center',
    gap: vars.gaps.sm,
    padding: vars.gaps.xs,
    background: vars.colors.bg,
    borderRadius: '4px',
    border: `1px solid ${vars.colors.border}`,
  },
});

const Section = styled('div', {
  base: {
    display: 'flex',
    flexDirection: 'column',
    gap: vars.gaps.sm,
  },
  variants: {
    fill: {
      true: {
        flex: 1,
        overflow: 'hidden',
      },
    },
  },
});

const Hint = styled('div', {
  base: {
    opacity: 0.8,
    fontSize: '12px',
    lineHeight: '1.4',
  },
});

import { renderPreview } from '../lib/previews';

const TinyPagePreview: Component<{ page: Page }> = (props) => {
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement>();

  createEffect(() => {
    const c = canvas();
    if (c) {
      renderPreview(props.page, c, 32);
    }
  });

  return (
    <canvas
      ref={setCanvas}
      style={{
        width: '32px',
        height: '40px',
        'object-fit': 'contain',
        background: '#fff',
        border: `1px solid ${vars.colors.border}`,
        'border-radius': '2px',
        'flex-shrink': 0,
      }}
    />
  );
};

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

    const uniqueAspectsMap = new Map<string, { firstPage: Page; aspect: number }>();

    pages.forEach((p) => {
      const size = getPageSize(p);
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

      const aspectKey = aspect.toFixed(3);
      if (!uniqueAspectsMap.has(aspectKey)) {
        uniqueAspectsMap.set(aspectKey, { firstPage: p, aspect });
      }
    });

    return {
      allSameSize,
      allSameAspect,
      width: firstSize.width,
      height: firstSize.height,
      aspect: firstAspect,
      pages,
      uniqueAspects: Array.from(uniqueAspectsMap.values()),
    };
  });

  const getAspectName = (aspect: number) => {
    const match = WELL_KNOWN_SIZES.find(
      (s) => Math.abs(s.ratio - aspect) < 0.005 || Math.abs(s.ratio - 1 / aspect) < 0.005,
    );
    return match ? match.name : aspect.toFixed(2);
  };

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

  const AnchorButton: Component = () => (
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
      style={{ width: '36px', padding: '2px' }}
      title={`Anchor: ${state.resizerAnchor} (Click/Wheel to cycle)`}
    >
      <AnchorIcon anchor={state.resizerAnchor} />
    </Button>
  );

  const ModeButton: Component = () => (
    <Button
      onClick={() => setResizerMode(state.resizerMode === 'crop' ? 'pad' : 'crop')}
      style={{ width: '80px' }}
      title={state.resizerMode === 'crop' ? 'Switch to Pad' : 'Switch to Crop'}
    >
      <Show when={state.resizerMode === 'crop'} fallback={<Maximize2 size={14} />}>
        <Crop size={14} />
      </Show>
      {state.resizerMode === 'crop' ? 'Crop' : 'Pad'}
    </Button>
  );

  return (
    <Container>
      <TabList>
        <TabTitle>
          <Show
            when={state.pickingAspectFor}
            fallback={
              <>
                <AspectRatio size={16} /> Resizing & cropping
              </>
            }
          >
            Pick target page...
          </Show>
        </TabTitle>
      </TabList>

      <Content>
        <Show when={state.pickingAspectFor}>
          <InfoMessage>
            <div>
              Select a page in the workspace that has the target aspect ratio and dimensions you
              want to match.
            </div>
            <ButtonGroup>
              <Button onClick={cancelPickMode}>Cancel pick</Button>
            </ButtonGroup>
          </InfoMessage>
        </Show>

        <Show when={!state.pickingAspectFor}>
          <Show
            when={analysis()}
            fallback={<InfoMessage>Select some pages for resizing options</InfoMessage>}
          >
            {(a) => (
              <Section fill>
                <Show
                  when={a().allSameSize}
                  fallback={
                    <Show
                      when={a().allSameAspect}
                      fallback={
                        <Section fill>
                          <div
                            style={{
                              display: 'flex',
                              'flex-direction': 'column',
                              gap: vars.gaps.xs,
                            }}
                          >
                            <Hint>
                              Your selection contains <strong>{a().uniqueAspects.length}</strong>{' '}
                              distinct aspect ratios. Pick one to{' '}
                              <strong>{state.resizerAnchor.replace('-', ' ')}</strong>{' '}
                              <strong>{state.resizerMode}</strong> the others to match.
                            </Hint>
                            <div
                              style={{
                                display: 'flex',
                                'justify-content': 'flex-end',
                                gap: vars.gaps.sm,
                              }}
                            >
                              <AnchorButton />
                              <ModeButton />
                            </div>
                          </div>
                          <AspectList>
                            {a().uniqueAspects.map((ua) => (
                              <AspectRow>
                                <TinyPagePreview page={ua.firstPage} />
                                <div style={{ flex: 1, 'font-weight': 500 }}>
                                  {getAspectName(ua.aspect)}
                                </div>
                                <Button
                                  size="sm"
                                  variant="primary"
                                  onClick={() => resizeSelectedToRatio(ua.aspect)}
                                >
                                  Pick
                                </Button>
                              </AspectRow>
                            ))}
                          </AspectList>
                        </Section>
                      }
                    >
                      <Section>
                        <Hint>Selection has same aspect ratio, but different sizes.</Hint>
                        <ButtonGroup>
                          <Button onClick={resizeToSmallest}>
                            <Shrink size={14} /> Shrink to smallest
                          </Button>
                          <Button onClick={resizeToLargest}>
                            <Grow size={14} /> Enlarge to largest
                          </Button>
                        </ButtonGroup>
                        <ButtonGroup>
                          <Button onClick={() => selectSameAspect(a().aspect)}>
                            <AspectRatio size={14} /> Select all with same aspect
                          </Button>
                        </ButtonGroup>
                      </Section>
                    </Show>
                  }
                >
                  <Section>
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
                      <AnchorButton />
                      <ModeButton />
                    </InputGroup>

                    <ButtonGroup>
                      <Button onClick={handleReset}>
                        <RefreshCw size={14} /> Reset size
                      </Button>
                    </ButtonGroup>

                    <ButtonGroup>
                      <Button onClick={() => selectSameSize(a().width, a().height)}>
                        <Layers size={14} /> Select same size
                      </Button>
                      <Button onClick={() => selectSameAspect(a().aspect)}>
                        <AspectRatio size={14} /> Select same aspect
                      </Button>
                    </ButtonGroup>
                    <ButtonGroup>
                      <Button variant="primary" onClick={startPickMode}>
                        <AspectRatio size={14} /> Match aspect...
                      </Button>
                    </ButtonGroup>
                  </Section>
                </Show>
              </Section>
            )}
          </Show>
        </Show>
      </Content>
    </Container>
  );
};

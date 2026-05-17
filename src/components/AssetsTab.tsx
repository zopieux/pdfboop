import { styled } from '@macaron-css/solid';
import { ImageOff, Trash2 } from 'lucide-solid';
import { type Component, createMemo, For, Show } from 'solid-js';
import { type WorkspaceAsset, workspaceAssets } from '../resources';
import { deleteSelectedAssets, selectAsset, setAssetQuality, setAssetScale, state } from '../state';
import { vars } from '../theme';
import type { Asset } from '../types';
import { Button } from './ui/Button';
import { ButtonGroup } from './ui/ButtonGroup';
import { InfoMessage } from './ui/InfoMessage';

const Root = styled('div', {
  base: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },
});

const TabContent = styled('div', {
  base: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
  },
});

const AssetGrid = styled('div', {
  base: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
    gap: vars.gaps.sm,
    padding: vars.gaps.md,
  },
});

const AssetItemWrapper = styled('div', {
  base: {
    aspectRatio: '1',
    border: `1px solid ${vars.colors.border}`,
    borderRadius: '4px',
    overflow: 'hidden',
    position: 'relative',
    cursor: 'pointer',
    background: vars.colors.bg,
    transition: 'transform 0.1s, border-color 0.1s',
    selectors: {
      '&:hover': {
        borderColor: vars.colors.primary,
      },
      '&.selected': {
        borderColor: vars.colors.primary,
        boxShadow: `0 0 0 2px ${vars.colors.primary}`,
        zIndex: 1,
      },
    },
  },
});

/** Non-interactive placeholder for assets that exceeded the memory cap. */
const OverLimitWrapper = styled('div', {
  base: {
    aspectRatio: '1',
    border: `1px dashed ${vars.colors.border}`,
    borderRadius: '4px',
    overflow: 'hidden',
    position: 'relative',
    cursor: 'default',
    background: vars.colors.bg,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.5,
  },
});

const AssetThumbnail = styled('img', {
  base: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  },
});

const AssetMeta = styled('div', {
  base: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    background: 'rgba(0,0,0,0.6)',
    color: 'white',
    fontSize: '9px',
    padding: '2px 4px',
    display: 'none',
    selectors: {
      [`${AssetItemWrapper}:hover &`]: {
        display: 'block',
      },
      '.selected &': {
        display: 'block',
        background: vars.colors.primary,
      },
    },
  },
});

const FloatingControls = styled('div', {
  base: {
    padding: vars.gaps.md,
    borderTop: `1px solid ${vars.colors.border}`,
    background: vars.colors.surface,
    color: vars.colors.text,
    display: 'flex',
    flexDirection: 'column',
    gap: vars.gaps.md,
  },
});

const SelectionCount = styled('div', {
  base: {
    fontSize: '13px',
    fontWeight: 600,
    color: vars.colors.text,
  },
});

const ControlGroup = styled('div', {
  base: {
    display: 'flex',
    flexDirection: 'column',
    gap: vars.gaps.xs,
  },
});

const LabelRow = styled('div', {
  base: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '11px',
    color: vars.colors.text,
    opacity: 0.8,
    marginBottom: '2px',
  },
});

const DimensionRow = styled('div', {
  base: {
    display: 'flex',
    alignItems: 'center',
    gap: vars.gaps.xs,
    marginTop: '4px',
  },
});

const NumberInput = styled('input', {
  base: {
    width: '60px',
    background: vars.colors.bg,
    border: `1px solid ${vars.colors.border}`,
    color: vars.colors.text,
    fontSize: '11px',
    padding: '2px 4px',
    borderRadius: '2px',
    '&:focus': {
      borderColor: vars.colors.primary,
      outline: 'none',
    },
  },
});

function isOverLimit(a: WorkspaceAsset): a is { id: string; overLimit: true } {
  return 'overLimit' in a && a.overLimit === true;
}

export const AssetsTab: Component = () => {
  const assets = workspaceAssets;

  // Only fully-loaded assets (not over-limit) with meaningful dimensions
  const filteredAssets = createMemo(
    () =>
      assets()?.filter(
        (a) => !isOverLimit(a) && ((a as Asset).width > 1 || (a as Asset).height > 1),
      ) || [],
  );

  // Over-limit placeholders
  const overLimitAssets = createMemo(() => assets()?.filter(isOverLimit) || []);

  const selectedAssets = createMemo(() => {
    const list = filteredAssets() as Asset[];
    const sel = state.assetSelection;
    return list.filter((a) => sel.includes(a.id));
  });

  const handleAssetClick = (e: MouseEvent, id: string) => {
    const allIds = (filteredAssets() as Asset[]).map((a) => a.id);
    selectAsset(id, allIds, e.ctrlKey || e.metaKey, e.shiftKey);
  };

  const currentQuality = () => {
    const sel = selectedAssets();
    if (sel.length === 0) return 100;
    const first = sel[0];
    const orig = state.originals.find((o) => o.id === first.originalId);
    return orig?.assetQualities?.[first.ref] ?? 100;
  };

  const currentScale = () => {
    const sel = selectedAssets();
    if (sel.length === 0) return 1.0;
    const first = sel[0];
    const orig = state.originals.find((o) => o.id === first.originalId);
    return orig?.assetScales?.[first.ref] ?? 1.0;
  };

  const currentW = () => {
    const sel = selectedAssets();
    if (sel.length === 0) return 0;
    return Math.round(sel[0].width * currentScale());
  };

  const currentH = () => {
    const sel = selectedAssets();
    if (sel.length === 0) return 0;
    return Math.round(sel[0].height * currentScale());
  };

  const handleQualityInput = (e: InputEvent & { currentTarget: HTMLInputElement }) => {
    const q = parseInt(e.currentTarget.value, 10);
    for (const a of selectedAssets()) {
      setAssetQuality(a.originalId, a.ref, q);
    }
  };

  const handleScaleInput = (e: InputEvent & { currentTarget: HTMLInputElement }) => {
    const s = parseInt(e.currentTarget.value, 10) / 100;
    for (const a of selectedAssets()) {
      setAssetScale(a.originalId, a.ref, s);
    }
  };

  const updateDimension = (value: number, dimension: 'width' | 'height') => {
    const sel = selectedAssets();
    if (sel.length === 0) return;
    const first = sel[0];
    const s = Math.min(1.0, value / first[dimension]);
    for (const a of sel) {
      setAssetScale(a.originalId, a.ref, s);
    }
  };

  const handleWidthChange = (e: Event & { currentTarget: HTMLInputElement }) => {
    updateDimension(parseInt(e.currentTarget.value, 10) || 0, 'width');
  };

  const handleHeightChange = (e: Event & { currentTarget: HTMLInputElement }) => {
    updateDimension(parseInt(e.currentTarget.value, 10) || 0, 'height');
  };

  const onReset = () => {
    for (const a of selectedAssets()) {
      setAssetQuality(a.originalId, a.ref, 100);
      setAssetScale(a.originalId, a.ref, 1.0);
    }
  };

  const onDelete = async () => {
    const list = assets();
    if (!list) return;
    await deleteSelectedAssets(list.filter((a): a is Asset => !isOverLimit(a)));
  };

  const hasAnyAsset = createMemo(() => filteredAssets().length > 0 || overLimitAssets().length > 0);

  return (
    <Root>
      <TabContent>
        <Show
          when={hasAnyAsset()}
          fallback={<InfoMessage>No images found in workspace</InfoMessage>}
        >
          <AssetGrid>
            <For each={filteredAssets() as Asset[]}>
              {(asset) => (
                <AssetItemWrapper
                  classList={{ selected: state.assetSelection.includes(asset.id) }}
                  onClick={(e: MouseEvent) => handleAssetClick(e, asset.id)}
                >
                  <AssetThumbnail src={asset.previewUrl} />
                  <AssetMeta>
                    {asset.width}x{asset.height}
                  </AssetMeta>
                </AssetItemWrapper>
              )}
            </For>
            <For each={overLimitAssets()}>
              {() => (
                <OverLimitWrapper title="Too many assets — this image was not loaded to stay within the memory limit">
                  <ImageOff size={24} />
                </OverLimitWrapper>
              )}
            </For>
          </AssetGrid>
        </Show>
      </TabContent>

      <Show when={selectedAssets().length > 0}>
        <FloatingControls>
          <SelectionCount>{selectedAssets().length} asset(s) selected</SelectionCount>

          <ControlGroup>
            <LabelRow>
              <span>Export Quality</span>
              <span>{currentQuality()}%</span>
            </LabelRow>
            <input
              type="range"
              min="10"
              max="100"
              step="5"
              value={currentQuality()}
              onInput={handleQualityInput}
            />
          </ControlGroup>

          <ControlGroup>
            <LabelRow>
              <span>Export Size</span>
              <span>{Math.round(currentScale() * 100)}%</span>
            </LabelRow>
            <input
              type="range"
              min="1"
              max="100"
              step="1"
              value={Math.round(currentScale() * 100)}
              onInput={handleScaleInput}
            />
            <DimensionRow>
              <NumberInput type="number" value={currentW()} onChange={handleWidthChange} />
              <span style={{ opacity: 0.5 }}>×</span>
              <NumberInput type="number" value={currentH()} onChange={handleHeightChange} />
              <span style={{ 'font-size': '11px', opacity: 0.5, 'margin-left': 'auto' }}>px</span>
            </DimensionRow>
          </ControlGroup>

          <ButtonGroup size="small">
            <Button variant="secondary" onClick={onReset}>
              Reset
            </Button>
            <Button variant="danger" onClick={onDelete}>
              <Trash2 size={14} /> Delete
            </Button>
          </ButtonGroup>
        </FloatingControls>
      </Show>
    </Root>
  );
};

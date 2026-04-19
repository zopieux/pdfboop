import { Component, For, Show, createMemo } from 'solid-js';
import { styled } from '@macaron-css/solid';
import { Trash2 } from 'lucide-solid';
import { state, selectAsset, deleteSelectedAssets, setAssetQuality } from '../state';
import { vars } from '../theme';
import { Button } from './ui/Button';
import { workspaceAssets } from '../resources';

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

const LoadingOverlay = styled('div', {
  base: {
    padding: vars.gaps.md,
    textAlign: 'center',
    fontSize: '11px',
    color: vars.colors.primary,
    background: `${vars.colors.primary}11`,
    borderBottom: `1px solid ${vars.colors.border}`,
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
    gap: vars.gaps.sm,
  },
});

const SelectionCount = styled('div', {
  base: {
    fontSize: '12px',
    fontWeight: 600,
    color: vars.colors.text,
  },
});

const ControlGroup = styled('div', {
  base: {
    display: 'flex',
    flexDirection: 'column',
    gap: vars.gaps.sm,
  },
});

const QualityInfo = styled('div', {
  base: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '11px',
    color: vars.colors.text,
    opacity: 0.8,
  },
});

const ButtonRow = styled('div', {
  base: {
    display: 'flex',
    gap: vars.gaps.sm,
  },
});

const EmptyState = styled('p', {
  base: {
    textAlign: 'center',
    opacity: 0.5,
    fontSize: '12px',
    marginTop: '40px',
    color: vars.colors.text,
  },
});

export const AssetsTab: Component = () => {
  const assets = workspaceAssets;

  const filteredAssets = createMemo(() => assets()?.filter((a) => a.width > 1 || a.height > 1) || []);

  const selectedAssets = createMemo(() => {
    const list = assets() || [];
    const sel = state.assetSelection;
    return list.filter((a) => sel.includes(a.id));
  });

  const handleAssetClick = (e: MouseEvent, id: string) => {
    selectAsset(id, e.ctrlKey || e.metaKey, e.shiftKey);
  };

  const currentQuality = () => {
    const sel = selectedAssets();
    if (sel.length === 0) return 100;
    const first = sel[0];
    const orig = state.originals.find((o) => o.id === first.originalId);
    return orig?.assetQualities?.[first.imageRef || ''] ?? 100;
  };

  const handleQualityInput = (e: InputEvent & { currentTarget: HTMLInputElement }) => {
    const q = parseInt(e.currentTarget.value);
    for (const a of selectedAssets()) {
      if (a.imageRef) {
        setAssetQuality(a.originalId, a.imageRef, q);
      }
    }
  };

  const onDelete = async () => {
    const list = assets();
    if (!list) return;
    await deleteSelectedAssets(list);
  };

  return (
    <Root>
      <TabContent>
        <Show when={assets.loading}>
          <LoadingOverlay>Updating assets list...</LoadingOverlay>
        </Show>

        <Show
          when={filteredAssets().length > 0}
          fallback={<EmptyState>No images found in workspace.</EmptyState>}
        >
          <AssetGrid>
            <For each={filteredAssets()}>
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
          </AssetGrid>
        </Show>
      </TabContent>

      <Show when={selectedAssets().length > 0}>
        <FloatingControls>
          <SelectionCount>
            {selectedAssets().length} asset(s) selected
          </SelectionCount>
          <ControlGroup>
            <QualityInfo>
              <span>Export Quality</span>
              <span>{currentQuality()}%</span>
            </QualityInfo>
            <input
              type="range"
              min="10"
              max="100"
              step="5"
              value={currentQuality()}
              onInput={handleQualityInput}
            />
            <ButtonRow>
              <Button
                variant="danger"
                onClick={onDelete}
                style={{ width: '100%', padding: '4px', 'font-size': '11px' }}
              >
                <Trash2 size={14} style={{ display: 'inline', 'margin-right': '4px' }} />
                Delete from Document
              </Button>
            </ButtonRow>
          </ControlGroup>
        </FloatingControls>
      </Show>
    </Root>
  );
};

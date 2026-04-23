import { styled } from '@macaron-css/solid';
import { createVirtualizer } from '@tanstack/solid-virtual';
import { Plus, Upload } from 'lucide-solid';
import { type Component, createMemo, createSignal, For, onCleanup, onMount } from 'solid-js';
import { processUpload } from '../lib/inputs';
import { addPageAt, cancelPickMode, setState, state } from '../state';
import { vars } from '../theme';
import { PageItem } from './PageItem';
import { Button } from './ui/Button';

const StyledWorkspace = styled('div', {
  base: {
    flex: 1,
    overflowY: 'auto',
    padding: `${vars.gaps.lg} ${vars.gaps.lg} 0`,
    backgroundColor: vars.colors.bg,
  },
});

const EmptyState = styled('div', {
  base: {
    textAlign: 'center',
    padding: '100px',
    color: vars.colors.text,
  },
});

const PlaceholderPage = styled('div', {
  base: {
    border: `2px dashed ${vars.colors.border}`,
    borderRadius: '4px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: vars.colors.surface,
    color: vars.colors.text,
    opacity: 0.6,
    gap: vars.gaps.sm,
    fontSize: '12px',
    textAlign: 'center',
    padding: vars.gaps.md,
    minHeight: '200px',
  },
});

const StyledVirtualContainer = styled('div', {
  base: {
    position: 'relative',
    width: '100%',
  },
});

export const Workspace: Component = () => {
  const [dragInfo, setDragInfo] = createSignal<{ fileCount: number } | null>(null);
  let containerRef: HTMLDivElement | undefined;
  const [containerWidth, setContainerWidth] = createSignal(0);

  const handleWheel = (e: WheelEvent) => {
    if (e.ctrlKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 1 : -1;
      const newZoom = Math.min(10, Math.max(1, state.zoom + delta));
      setState('zoom', newZoom);
    }
  };

  const handleDragOver = (e: DragEvent) => {
    if (e.dataTransfer?.types.includes('Files')) {
      e.preventDefault();
      setDragInfo({ fileCount: e.dataTransfer.items.length });
    }
  };

  const handleDragLeave = (e: DragEvent) => {
    const rect =
      e.currentTarget instanceof HTMLElement ? e.currentTarget.getBoundingClientRect() : null;
    if (rect) {
      if (
        e.clientX <= rect.left ||
        e.clientX >= rect.right ||
        e.clientY <= rect.top ||
        e.clientY >= rect.bottom
      ) {
        setDragInfo(null);
      }
    }
  };

  const handleDrop = (e: DragEvent) => {
    setDragInfo(null);
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      e.preventDefault();
      processUpload(e.dataTransfer.files);
    }
  };

  onMount(() => {
    window.addEventListener('wheel', handleWheel, { passive: false });
    const ro = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(containerRef!);
    onCleanup(() => {
      window.removeEventListener('wheel', handleWheel);
      ro.disconnect();
    });
  });
  const columns = createMemo(() => {
    const w = containerWidth() - 40;
    if (w <= 0) return 1;
    return Math.max(1, state.zoom);
  });

  const contentWidth = createMemo(() => {
    const lg = 20; // vars.gaps.lg
    const padding = lg * 2;
    const availableWidth = Math.max(0, containerWidth() - padding);
    const cols = columns();
    const totalGaps = (cols - 1) * lg;
    return Math.max(0, (availableWidth - totalGaps) / cols);
  });

  const itemHeight = createMemo(() => {
    const lg = 20; // vars.gaps.lg
    const contentW = contentWidth();
    const contentH = contentW * (state.workspaceRatio || Math.SQRT2);
    return contentH + 56 + lg;
  });

  const rows = createMemo(() => {
    const p = state.pages;
    const c = columns();
    const res = [];
    for (let i = 0; i < p.length; i += c) {
      res.push(p.slice(i, i + c));
    }
    return res;
  });

  const virtualizer = createVirtualizer({
    get count() {
      return rows().length;
    },
    getScrollElement: () => containerRef || null,
    estimateSize: () => itemHeight(),
    overscan: 2,
  });

  return (
    <StyledWorkspace
      ref={containerRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={(e: MouseEvent & { target: HTMLElement }) => {
        if (e.target === containerRef && state.pickingAspectFor) {
          cancelPickMode();
        }
      }}
    >
      <StyledVirtualContainer
        style={{
          height: `${virtualizer.getTotalSize()}px`,
        }}
      >
        <For each={virtualizer.getVirtualItems()}>
          {(virtualRow) => (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
                display: 'flex',
                gap: vars.gaps.lg,
                'padding-bottom': vars.gaps.lg,
              }}
            >
              <For each={rows()[virtualRow.index] ?? []}>
                {(page, i) => (
                  <div
                    style={{ flex: 1, 'min-width': 0, display: 'flex', 'flex-direction': 'column' }}
                  >
                    <PageItem
                      page={page}
                      index={virtualRow.index * columns() + i()}
                      width={contentWidth()}
                    />
                  </div>
                )}
              </For>
              {/* Fill remaining space in the last row to maintain grid alignment */}
              <For
                each={Array.from({ length: columns() - (rows()[virtualRow.index]?.length ?? 0) })}
              >
                {() => <div style={{ flex: 1 }} />}
              </For>
            </div>
          )}
        </For>

        {dragInfo() && (
          <PlaceholderPage
            style={{
              'aspect-ratio': `1 / ${state.workspaceRatio}`,
              width: '100%',
              'margin-top': vars.gaps.lg,
              position: 'absolute',
              top: `${virtualizer.getTotalSize()}px`,
            }}
          >
            <Upload size={24} />
            <span>
              Drop to append {dragInfo()?.fileCount}{' '}
              {dragInfo()?.fileCount === 1 ? 'file' : 'files'}
            </span>
          </PlaceholderPage>
        )}
      </StyledVirtualContainer>

      {state.pages.length === 0 && !dragInfo() && (
        <EmptyState>
          <div
            style={{
              display: 'flex',
              'align-items': 'center',
              'justify-content': 'center',
              'flex-wrap': 'wrap',
              gap: vars.gaps.sm,
            }}
          >
            <span style={{ opacity: 0.6 }}>To start, upload a PDF, upload an image, or</span>
            <Button onClick={() => addPageAt(0)} style={{ 'font-size': '13px' }}>
              <Plus size={14} /> add a blank page
            </Button>
          </div>
        </EmptyState>
      )}
    </StyledWorkspace>
  );
};

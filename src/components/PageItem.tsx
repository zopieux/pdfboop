import { styled } from '@macaron-css/solid';
import { AlertTriangle, ArrowLeft, ArrowRight, Plus, RefreshCw, Trash2 } from 'lucide-solid';
import {
  type Component,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  Show,
} from 'solid-js';
import { resolveGeometry } from '../lib/geo';
import { handleReupload } from '../lib/inputs';
import { renderPreview } from '../lib/previews';
import { addPageAt, pushOperation, selectPage, state } from '../state';
import { vars } from '../theme';
import type { Page, PageSize } from '../types';
import { MatchAspectModal } from './MatchAspectModal';
import { Button } from './ui/Button';

const PageContainer = styled('div', {
  base: {
    border: `1px solid ${vars.colors.border}`,
    background: 'white',
    position: 'relative',
    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    cursor: 'pointer',
    height: '100%',
    selectors: {
      '&.selected': {
        outline: `2px solid ${vars.colors.primary}`,
        outlineOffset: '1px',
      },
      '&.picking-dimmed': {
        opacity: 0.3,
        cursor: 'default',
        pointerEvents: 'none',
      },
    },
  },
});

// Shared map to track page positions for FLIP animations across re-renders and virtual row swaps.
// This allows us to animate pages smoothly as they move from one row to another.
const lastRects = new Map<string, { rect: DOMRect; index: number }>();

const Section = styled('div', {
  base: {
    height: '28px',
    minHeight: '28px',
    flexShrink: 0,
    background: vars.colors.surface,
    display: 'flex',
    alignItems: 'center',
    borderBottom: `1px solid ${vars.colors.border}`,
  },
});

const PageFooter = styled(Section, {
  base: {
    borderBottom: 'none',
    borderTop: `1px solid ${vars.colors.border}`,
  },
});

const OpGroup = styled('div', {
  base: {
    display: 'flex',
    flex: 1,
    height: '100%',
    selectors: {
      '&:not(:last-child)': {
        borderRight: `1px solid ${vars.colors.border}`,
      },
    },
  },
});

const PageOpButton = styled('button', {
  base: {
    flex: 1,
    height: '100%',
    border: 'none',
    background: 'transparent',
    color: vars.colors.text,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    borderRight: `1px solid ${vars.colors.border}`,
    transition: 'background 0.1s',
    selectors: {
      '&:last-child': {
        borderRight: 'none',
      },
      '&:hover': {
        background: vars.colors.border,
      },
      '&.danger:hover': {
        background: '#fee2e2',
        color: '#ef4444',
      },
    },
  },
});

const CanvasContainer = styled('div', {
  base: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: vars.gaps.sm,
    background: '#f1f5f9',
    position: 'relative',
    overflow: 'hidden',
  },
});

const MissingWarning = styled('div', {
  base: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: vars.gaps.md,
    textAlign: 'center',
    padding: vars.gaps.md,
    width: '100%',
    height: '100%',
    color: vars.colors.danger,
    fontSize: '12px',
    fontWeight: 500,
  },
});

const WarningText = styled('span', {
  base: {
    opacity: 0.9,
    lineHeight: 1.4,
  },
});

const DropZone = styled('div', {
  base: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(59, 130, 246, 0.1)',
    border: `2px dashed ${vars.colors.primary}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    pointerEvents: 'none',
    opacity: 0,
    transition: 'opacity 0.2s, background 0.2s, border-color 0.2s',
    selectors: {
      '&.active': {
        opacity: 1,
      },
      '&.match': {
        background: 'rgba(34, 197, 94, 0.1)',
        borderColor: vars.colors.success,
      },
      '&.mismatch': {
        background: 'rgba(239, 68, 68, 0.1)',
        borderColor: vars.colors.danger,
      },
    },
  },
});

const FooterInfo = styled('div', {
  base: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '11px',
    fontWeight: 600,
    padding: '0 8px',
    width: '100%',
    height: '100%',
    color: vars.colors.text,
  },
});

const MetadataText = styled('span', {
  base: {
    opacity: 0.6,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flexShrink: 1,
    minWidth: 0,
    fontWeight: 400,
  },
});

const StatusDot = styled('div', {
  base: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
  },
});

const StyledCanvas = styled('canvas', {
  base: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    display: 'block',
    margin: 'auto',
  },
});

export const PageItem: Component<{ page: Page; index: number; width: number }> = (props) => {
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement>();
  const [measuredWidth, setMeasuredWidth] = createSignal(props.width);
  const [pickedTarget, setPickedTarget] = createSignal<Page | null>(null);
  let containerRef: HTMLDivElement | undefined;

  createEffect(() => {
    const id = props.page.id;
    const currentIndex = props.index;

    if (!containerRef) return;

    const newRect = containerRef.getBoundingClientRect();
    const prev = lastRects.get(id);

    // Only animate if the index changed (reorder operation),
    // we have a previous position, and the user hasn't requested reduced motion.
    if (
      prev &&
      prev.index !== currentIndex &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      const dx = prev.rect.left - newRect.left;
      const dy = prev.rect.top - newRect.top;

      // Filter out huge jumps (e.g. from virtualization resets)
      if (Math.abs(dx) < 2000 && Math.abs(dy) < 2000 && (dx !== 0 || dy !== 0)) {
        containerRef.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
          {
            duration: 300,
            easing: 'cubic-bezier(0.2, 0, 0, 1)',
          },
        );
      }
    }

    // Record the current state for the next reorder
    lastRects.set(id, { rect: newRect, index: currentIndex });
  });

  const original = createMemo(() => state.originals.find((o) => o.id === props.page.originalId));

  onMount(() => {
    const ro = new ResizeObserver((entries) => {
      setMeasuredWidth(entries[0].contentRect.width);
    });
    if (containerRef) ro.observe(containerRef);
    onCleanup(() => ro.disconnect());
  });

  createEffect(() => {
    const c = canvas();
    const w = measuredWidth();
    if (c && !original()?.evicted) {
      // Track reactivity: re-render when history changes
      void state.historyIndex;
      void state.operations.length;
      original(); // Track re-uploads

      // Pin the first and last 3 pages so they survive LRU eviction longest
      const pinned = props.index < 3 || props.index >= state.pages.length - 3;
      const cancel = renderPreview(props.page, c, w, 'visible', pinned);

      onCleanup(cancel);
    }
  });

  const [isDragOver, setIsDragOver] = createSignal(false);
  let fileInput: HTMLInputElement | undefined;

  const handleDelete = () => {
    pushOperation({ type: 'DELETE', pageIds: [props.page.id] } as any);
  };

  const isSelected = () => state.selection.includes(props.page.id);

  const getPageAspect = (p: Page) => {
    const ops = state.operations.slice(0, state.historyIndex);
    const geo = resolveGeometry(p.originalSize, ops, p.id);
    return geo.canvasHeight / geo.canvasWidth;
  };

  const isDimmed = () => {
    if (!state.pickingAspectFor) return false;
    const sourcePageId = state.pickingAspectFor[0];
    const sourcePage = state.pages.find((p) => p.id === sourcePageId);
    if (!sourcePage) return false;

    // Dim if it has the SAME aspect ratio as the source
    const sourceAspect = getPageAspect(sourcePage);
    const myAspect = getPageAspect(props.page);
    return Math.abs(sourceAspect - myAspect) < 0.001;
  };

  const toggleSelect = (e: MouseEvent) => {
    if (state.pickingAspectFor) {
      if (!isDimmed()) {
        setPickedTarget(props.page);
      }
      return;
    }
    const allIds = state.pages.map((p) => p.id);
    selectPage(props.page.id, allIds, e.ctrlKey || e.metaKey, e.shiftKey);
  };

  const handleAddAt = (index: number) => {
    const ops = state.operations.slice(0, state.historyIndex);
    const geo = resolveGeometry(props.page.originalSize, ops, props.page.id);
    addPageAt(index, { width: geo.canvasWidth, height: geo.canvasHeight });
  };

  const handleMove = (direction: -1 | 1) => {
    pushOperation({
      type: 'MOVE',
      pageIds: [props.page.id],
      targetIndex: direction === -1 ? props.index - 1 : props.index + 1,
    } as any);
  };

  const onDragOver = (e: DragEvent) => {
    if (!original()?.evicted) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const onDragLeave = () => {
    setIsDragOver(false);
  };

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    // Hard filtering
    const file = e.dataTransfer?.files[0];
    if (file && original()?.evicted) {
      const droppedKind = file.type === 'application/pdf' ? 'pdf' : 'image';
      if (droppedKind !== original()?.type) {
        alert(`Mismatch: This page requires a ${original()?.type.toUpperCase()} file.`);
        return;
      }
      await handleReupload(original()!.id, file);
    }
  };

  const handlePick = () => {
    fileInput?.click();
  };

  const onFileChange = async (e: Event) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file && original()) {
      await handleReupload(original()!.id, file);
    }
  };

  const footerTitle = createMemo(() => {
    const o = original();
    if (!o) return '(blank)';
    const base = o.name;
    if (o.pageCount > 1) {
      return `${base} (original page ${props.page.originalPageIndex + 1} of ${o.pageCount})`;
    }
    return base;
  });

  return (
    <PageContainer
      ref={containerRef}
      classList={{
        selected: isSelected(),
        'picking-dimmed': isDimmed(),
      }}
      onClick={toggleSelect}
    >
      <Show when={pickedTarget()}>
        <MatchAspectModal targetPage={pickedTarget()!} onClose={() => setPickedTarget(null)} />
      </Show>
      <Section>
        <OpGroup>
          <PageOpButton
            onClick={(e: MouseEvent) => {
              e.stopPropagation();
              handleAddAt(props.index);
            }}
            title="Add page before"
          >
            <Plus size={14} />
          </PageOpButton>
          <Show when={props.index > 0}>
            <PageOpButton
              onClick={(e: MouseEvent) => {
                e.stopPropagation();
                handleMove(-1);
              }}
              title="Move left"
            >
              <ArrowLeft size={14} />
            </PageOpButton>
          </Show>
        </OpGroup>

        <PageOpButton
          class="danger"
          onClick={(e: MouseEvent) => {
            e.stopPropagation();
            handleDelete();
          }}
          title="Delete page"
        >
          <Trash2 size={14} />
        </PageOpButton>

        <OpGroup>
          <Show when={props.index < state.pages.length - 1}>
            <PageOpButton
              onClick={(e: MouseEvent) => {
                e.stopPropagation();
                handleMove(1);
              }}
              title="Move right"
            >
              <ArrowRight size={14} />
            </PageOpButton>
          </Show>
          <PageOpButton
            onClick={(e: MouseEvent) => {
              e.stopPropagation();
              handleAddAt(props.index + 1);
            }}
            title="Add page after"
          >
            <Plus size={14} />
          </PageOpButton>
        </OpGroup>
      </Section>

      <CanvasContainer onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
        <DropZone
          classList={{
            active: !!original()?.evicted && (!!state.draggingKind || isDragOver()),
            match: state.draggingKind === original()?.type,
            mismatch:
              state.draggingKind !== null &&
              state.draggingKind !== 'file' &&
              state.draggingKind !== original()?.type,
          }}
        >
          <RefreshCw
            size={24}
            color={
              state.draggingKind === original()?.type
                ? vars.colors.success
                : state.draggingKind !== null && state.draggingKind !== 'file'
                  ? vars.colors.danger
                  : vars.colors.primary
            }
          />
        </DropZone>
        {original()?.evicted ? (
          <MissingWarning>
            <AlertTriangle size={32} />
            <WarningText>
              Original is missing,
              <br />
              re-upload {original()?.name}
            </WarningText>
            <Button
              onClick={(e: MouseEvent) => {
                e.stopPropagation();
                handlePick();
              }}
              size="sm"
            >
              <RefreshCw size={12} style={{ 'margin-right': '4px' }} /> Pick original
            </Button>
            <input
              type="file"
              ref={fileInput}
              style={{ display: 'none' }}
              onChange={onFileChange}
              accept={original()?.type === 'pdf' ? '.pdf' : 'image/*'}
            />
          </MissingWarning>
        ) : (
          <StyledCanvas ref={setCanvas} width={200} height={280} />
        )}
      </CanvasContainer>

      <PageFooter>
        <FooterInfo title={footerTitle()}>
          <span style={{ 'white-space': 'nowrap', 'flex-shrink': 0 }}>#{props.index + 1}</span>
          {original() ? (
            <>
              <MetadataText style={{ 'flex-grow': 1 }}>{original()?.name}</MetadataText>
              {(original()?.pageCount ?? 0) > 1 && (
                <span
                  style={{
                    'white-space': 'nowrap',
                    'flex-shrink': 0,
                    opacity: 0.6,
                    'font-weight': 400,
                  }}
                >
                  (#{props.page.originalPageIndex + 1})
                </span>
              )}
            </>
          ) : (
            <MetadataText style={{ 'flex-grow': 1 }}>(blank)</MetadataText>
          )}
          <StatusDot style={{ background: original()?.color || '#ccc', 'flex-shrink': 0 }} />
        </FooterInfo>
      </PageFooter>
    </PageContainer>
  );
};

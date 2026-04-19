import { Component, createMemo, createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import { reconcile } from 'solid-js/store';
import { styled } from '@macaron-css/solid';
import { AlertTriangle, RefreshCw, Trash2, Plus } from 'lucide-solid';
import { state, setState, pushOperation, addPageAt, selectPage } from '../state';
import { Page } from '../types';
import { renderPreview } from '../lib/previews';
import { handleReupload } from '../lib/inputs';
import { vars } from '../theme';
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
    },
  },
});

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
    fontSize: '10px',
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
  let containerRef: HTMLDivElement | undefined;

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
      // Track primitives for reactivity
      const ops = props.page.ops;
      original(); // Track re-uploads
      
      const abortController = new AbortController();
      renderPreview(props.page, c, w, abortController.signal);
      
      onCleanup(() => {
        abortController.abort();
      });
    }
  });

  const [isDragOver, setIsDragOver] = createSignal(false);
  let fileInput: HTMLInputElement | undefined;

  const handleDelete = () => {
    pushOperation({ type: 'DELETE', pageIds: [props.page.id] } as any);
  };

  const isSelected = () => state.selection.includes(props.page.id);

  const toggleSelect = (e: MouseEvent) => {
    const allIds = state.pages.map((p) => p.id);
    selectPage(props.page.id, allIds, e.ctrlKey || e.metaKey, e.shiftKey);
  };

  const handleAddAt = (index: number) => {
    addPageAt(index);
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
    if (file && original() && original()?.evicted) {
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
    <PageContainer ref={containerRef} classList={{ selected: isSelected() }} onClick={toggleSelect}>
      <Section>
        <PageOpButton
          onClick={(e: MouseEvent) => {
            e.stopPropagation();
            handleAddAt(props.index);
          }}
          title="Add page before"
        >
          <Plus size={14} />
        </PageOpButton>
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
        <PageOpButton
          onClick={(e: MouseEvent) => {
            e.stopPropagation();
            handleAddAt(props.index + 1);
          }}
          title="Add page after"
        >
          <Plus size={14} />
        </PageOpButton>
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
              style={{ 'font-size': '11px', padding: '4px 8px' }}
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
                <span style={{ 'white-space': 'nowrap', 'flex-shrink': 0, opacity: 0.6, 'font-weight': 400 }}>
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

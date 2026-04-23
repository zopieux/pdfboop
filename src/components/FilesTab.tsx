import { styled } from '@macaron-css/solid';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-solid';
import { type Component, createMemo, createSignal, For, Show } from 'solid-js';
import { handleReupload } from '../lib/inputs';
import { deleteOriginal, deleteUnusedOriginals, state } from '../state';
import { vars } from '../theme';
import type { OriginalFile } from '../types';
import { Button } from './ui/Button';

const FileCard = styled('div', {
  base: {
    padding: vars.gaps.md,
    borderBottom: `1px solid ${vars.colors.border}`,
    position: 'relative',
    transition: 'background 0.2s',
    selectors: {
      '&.drop-active': {
        background: 'rgba(59, 130, 246, 0.1)',
        outline: `2px dashed ${vars.colors.primary}`,
        outlineOffset: '-2px',
      },
      '&.match': {
        background: 'rgba(34, 197, 94, 0.1)',
        outlineColor: vars.colors.success,
      },
      '&.mismatch': {
        background: 'rgba(239, 68, 68, 0.1)',
        outlineColor: vars.colors.danger,
      },
      '&.confirming': {
        background: 'rgba(239, 68, 68, 0.08)',
      },
    },
  },
});

const FileHeader = styled('div', {
  base: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
});

const FileName = styled('span', {
  base: {
    fontSize: '13px',
    fontWeight: 500,
    wordBreak: 'break-all',
    color: vars.colors.text,
  },
});

const FileMeta = styled('div', {
  base: {
    display: 'flex',
    gap: vars.gaps.sm,
    fontSize: '11px',
    opacity: 0.6,
    marginTop: vars.gaps.xs,
    color: vars.colors.text,
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

const FileNameWrapper = styled('div', {
  base: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flex: 1,
    minWidth: 0,
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

const IconButton = styled('button', {
  base: {
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    color: vars.colors.text,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px',
    borderRadius: '4px',
    transition: 'background 0.1s, color 0.1s',
    selectors: {
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

const ConfirmContainer = styled('div', {
  base: {
    display: 'flex',
    flexDirection: 'column',
    gap: vars.gaps.xs,
  },
});

const ConfirmMessage = styled('div', {
  base: {
    fontSize: '11px',
    color: vars.colors.danger,
    fontWeight: 600,
    lineHeight: 1.3,
    textAlign: 'center',
    marginBottom: vars.gaps.xs,
  },
});

const ConfirmButton = styled(Button, {
  base: {
    flex: 1,
    fontSize: '10px',
    padding: '4px',
    justifyContent: 'center',
  },
  variants: {
    intent: {
      confirm: {
        background: vars.colors.danger,
        color: 'white',
        borderColor: vars.colors.danger,
        selectors: {
          '&:hover': {
            background: vars.colors.danger,
            filter: 'brightness(1.1)',
          },
        },
      },
      cancel: {},
    },
  },
});

const ActionHeader = styled('div', {
  base: {
    padding: vars.gaps.md,
    borderBottom: `1px solid ${vars.colors.border}`,
  },
});

const UnusedButton = styled(Button, {
  base: {
    width: '100%',
    padding: vars.gaps.sm,
    fontSize: '12px',
    justifyContent: 'center',
  },
});

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
};

const OriginalItem: Component<{ file: OriginalFile }> = (props) => {
  const [isDragOver, setIsDragOver] = createSignal(false);
  const [isConfirming, setIsConfirming] = createSignal(false);
  const pagesToDelete = createMemo(
    () => state.pages.filter((p) => p.originalId === props.file.id).length,
  );

  let fileInput: HTMLInputElement | undefined;

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const onDragLeave = () => {
    setIsDragOver(false);
  };

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const f = e.dataTransfer?.files[0];
    if (f) {
      const droppedKind = f.type === 'application/pdf' ? 'pdf' : 'image';
      if (droppedKind !== props.file.type) {
        alert(`Mismatch: This file requires a ${props.file.type.toUpperCase()} replacement.`);
        return;
      }
      await handleReupload(props.file.id, f);
    }
  };

  const onFileChange = async (e: Event) => {
    const target = e.target as HTMLInputElement;
    const f = target.files?.[0];
    if (f) {
      await handleReupload(props.file.id, f);
    }
  };

  return (
    <FileCard
      classList={{
        'drop-active': !!state.draggingKind || isDragOver(),
        match: state.draggingKind === props.file.type,
        mismatch:
          state.draggingKind !== null &&
          state.draggingKind !== 'file' &&
          state.draggingKind !== props.file.type,
        confirming: isConfirming(),
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <Show
        when={!isConfirming()}
        fallback={
          <ConfirmContainer>
            <ConfirmMessage>
              Delete "{props.file.name}"?
              <br />
              This cannot be undone. Removes {pagesToDelete()} pages.
            </ConfirmMessage>
            <div style={{ display: 'flex', gap: '4px' }}>
              <ConfirmButton intent="confirm" onClick={() => deleteOriginal(props.file.id)}>
                Confirm
              </ConfirmButton>
              <ConfirmButton intent="cancel" onClick={() => setIsConfirming(false)}>
                Cancel
              </ConfirmButton>
            </div>
          </ConfirmContainer>
        }
      >
        <FileHeader>
          <FileNameWrapper>
            <StatusDot style={{ background: props.file.color }} />
            <FileName title={props.file.name}>{props.file.name}</FileName>
          </FileNameWrapper>
          <div style={{ display: 'flex', gap: '4px', 'align-items': 'center' }}>
            {props.file.evicted && <AlertTriangle size={14} color={vars.colors.danger} />}
            <IconButton
              class="danger"
              title="Remove file and associated pages"
              onClick={(e: MouseEvent) => {
                e.stopPropagation();
                if (pagesToDelete() === 0) {
                  deleteOriginal(props.file.id);
                } else {
                  setIsConfirming(true);
                }
              }}
            >
              <Trash2 size={14} />
            </IconButton>
          </div>
        </FileHeader>
        <FileMeta>
          <span>{props.file.type.toUpperCase()}</span>
          <span>•</span>
          <Show when={props.file.type === 'pdf'}>
            <span>
              {props.file.pageCount} {props.file.pageCount === 1 ? 'page' : 'pages'}
            </span>
            <span>•</span>
          </Show>
          <span>{formatSize(props.file.size)}</span>
        </FileMeta>
        <Button
          style={{ width: '100%', 'margin-top': vars.gaps.sm, 'font-size': '11px' }}
          onClick={() => fileInput?.click()}
        >
          <RefreshCw size={12} /> Replace / Re-upload
        </Button>
        <input
          type="file"
          ref={fileInput}
          style={{ display: 'none' }}
          onChange={onFileChange}
          accept={props.file.type === 'pdf' ? '.pdf' : 'image/*'}
        />
      </Show>
    </FileCard>
  );
};

export const FilesTab: Component = () => {
  const unusedOriginalsCount = createMemo(() => {
    const usedIds = new Set(state.pages.map((p) => p.originalId));
    return state.originals.filter((o) => !usedIds.has(o.id)).length;
  });

  return (
    <div>
      <Show when={state.originals.length > 0 && unusedOriginalsCount() > 0}>
        <ActionHeader>
          <UnusedButton onClick={() => deleteUnusedOriginals()}>
            <Trash2 size={12} style={{ 'margin-right': '6px' }} />
            Delete unused ({unusedOriginalsCount()})
          </UnusedButton>
        </ActionHeader>
      </Show>
      <For each={state.originals}>{(file) => <OriginalItem file={file} />}</For>
      {state.originals.length === 0 && <EmptyState>No files uploaded.</EmptyState>}
    </div>
  );
};

import { styled } from '@macaron-css/solid';
import {
  type Component,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from 'solid-js';
import { Portal } from 'solid-js/web';
import { resolveGeometry } from '../lib/geo';
import { renderPreview } from '../lib/previews';
import { pushOperation, setState, state } from '../state';
import { themeClass, vars } from '../theme';
import type { Page } from '../types';
import { Button } from './ui/Button';
import { ButtonGroup } from './ui/ButtonGroup';

const ModalBackdrop = styled('div', {
  base: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.4)',
    backdropFilter: 'blur(8px)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px',
  },
});

const ModalContent = styled('div', {
  base: {
    background: vars.colors.surface,
    borderRadius: '12px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '100%',
    width: '100%',
    maxWidth: '800px',
    overflow: 'hidden',
    position: 'relative',
    color: vars.colors.text,
  },
});

const ModalHeader = styled('div', {
  base: {
    padding: '12px 20px',
    background: vars.colors.bg,
    borderBottom: `1px solid ${vars.colors.border}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 20,
  },
});

const ModalTitle = styled('div', {
  base: {
    fontWeight: 600,
    fontSize: '16px',
    color: vars.colors.text,
  },
});

const ModalBody = styled('div', {
  base: {
    flex: 1,
    padding: '40px',
    background: '#f1f5f9',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
    position: 'relative',
    overflow: 'hidden',
  },
});

const PreviewWrapper = styled('div', {
  base: {
    position: 'relative',
    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
    background: 'white',
    overflow: 'hidden',
  },
});

const CropOverlay = styled('div', {
  base: {
    position: 'absolute',
    border: `2px solid ${vars.colors.primary}`,
    background: 'rgba(59, 130, 246, 0.2)',
    cursor: 'move',
    boxSizing: 'border-box',
    '&::after': {
      content: '""',
      position: 'absolute',
      inset: 0,
      outline: '4000px solid rgba(0, 0, 0, 0.4)',
      pointerEvents: 'none',
    },
  },
});

const Handle = styled('div', {
  base: {
    position: 'absolute',
    width: '12px',
    height: '12px',
    background: vars.colors.primary,
    border: '2px solid white',
    borderRadius: '50%',
    zIndex: 10,
  },
});

export const MatchAspectModal: Component<{ targetPage: Page; onClose: () => void }> = (props) => {
  const [container, setContainer] = createSignal<HTMLDivElement>();
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement>();

  const sourceAspect = createMemo(() => {
    const sourcePageId = state.pickingAspectFor?.[0];
    const sourcePage = state.pages.find((p) => p.id === sourcePageId);
    if (!sourcePage) return Math.SQRT2;
    const geo = resolveGeometry(
      sourcePage.originalSize,
      state.operations.slice(0, state.historyIndex),
      sourcePage.id,
    );
    return geo.canvasHeight / geo.canvasWidth;
  });

  const targetSizeData = createMemo(() => {
    const p = props.targetPage;
    const geo = resolveGeometry(
      p.originalSize,
      state.operations.slice(0, state.historyIndex),
      p.id,
    );
    return { width: geo.canvasWidth, height: geo.canvasHeight };
  });

  const [displaySize, setDisplaySize] = createSignal({ width: 0, height: 0 });
  const [cropRect, setCropRect] = createSignal({ x: 0, y: 0, w: 0, h: 0 });

  const updateDisplaySize = () => {
    const c = container();
    if (!c) return;
    const maxW = c.clientWidth - 80;
    const maxH = c.clientHeight - 80;
    const ts = targetSizeData();
    const ratio = ts.height / ts.width;

    let w = maxW;
    let h = w * ratio;
    if (h > maxH) {
      h = maxH;
      w = h / ratio;
    }

    setDisplaySize({ width: w, height: h });

    // Initialize crop rect
    const sa = sourceAspect();
    let rw = w;
    let rh = rw * sa;
    if (rh > h) {
      rh = h;
      rw = rh / sa;
    }

    setCropRect({
      x: (w - rw) / 2,
      y: (h - rh) / 2,
      w: rw,
      h: rh,
    });
  };

  onMount(() => {
    updateDisplaySize();
    window.addEventListener('resize', updateDisplaySize);
  });

  onCleanup(() => {
    window.removeEventListener('resize', updateDisplaySize);
  });

  createEffect(() => {
    const c = canvas();
    const ds = displaySize();
    if (c && ds.width > 0) {
      renderPreview(props.targetPage, c, ds.width);
    }
  });

  let isDragging = false;
  let isResizing = false;
  let startX = 0;
  let startY = 0;
  let startRect = { x: 0, y: 0, w: 0, h: 0 };

  const onMouseDown = (e: MouseEvent, type: 'move' | 'resize') => {
    e.preventDefault();
    e.stopPropagation();
    if (type === 'move') isDragging = true;
    else isResizing = true;

    startX = e.clientX;
    startY = e.clientY;
    startRect = { ...cropRect() };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const onMouseMove = (e: MouseEvent) => {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const ds = displaySize();
    const sa = sourceAspect();

    if (isDragging) {
      let nx = startRect.x + dx;
      let ny = startRect.y + dy;
      nx = Math.max(0, Math.min(ds.width - startRect.w, nx));
      ny = Math.max(0, Math.min(ds.height - startRect.h, ny));
      setCropRect({ ...cropRect(), x: nx, y: ny });
    } else if (isResizing) {
      let nw = startRect.w + dx;
      let nh = nw * sa;

      if (startRect.x + nw > ds.width) {
        nw = ds.width - startRect.x;
        nh = nw * sa;
      }
      if (startRect.y + nh > ds.height) {
        nh = ds.height - startRect.y;
        nw = nh / sa;
      }
      if (nw < 20) {
        nw = 20;
        nh = nw * sa;
      }
      setCropRect({ ...cropRect(), w: nw, h: nh });
    }
  };

  const onMouseUp = () => {
    isDragging = false;
    isResizing = false;
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  };

  const onApply = () => {
    const ds = displaySize();
    const cr = cropRect();
    const targetAspect = targetSizeData().height / targetSizeData().width;

    const sourcePageIds = state.pickingAspectFor;
    if (!sourcePageIds?.length) return;
    const sourcePage = state.pages.find((p) => p.id === sourcePageIds[0]);
    if (!sourcePage) return;
    const ops = state.operations.slice(0, state.historyIndex);
    const sourceGeo = resolveGeometry(sourcePage.originalSize, ops, sourcePage.id);

    // The new paper has the target's aspect ratio, scaled so the source
    // content (at 1:1 scale) occupies exactly the blue rectangle's
    // fraction of the paper:
    //   content width / paper width = cr.w / ds.width
    //   => paper width = content width * (ds.width / cr.w)
    const paperW = sourceGeo.canvasWidth * (ds.width / cr.w);
    const paperH = paperW * targetAspect;

    // A single CROP: expand the paper to (paperW, paperH) and position
    // the content at the rect's location within it.
    // In resolveGeometry: cx -= crop.x, cy -= crop.y
    // Negative crop.x/y shifts content right/down (adds left/top padding).
    pushOperation({
      type: 'CROP',
      pageIds: [...sourcePageIds],
      crop: {
        x: -(cr.x / ds.width) * paperW,
        y: -(cr.y / ds.height) * paperH,
        width: paperW,
        height: paperH,
      },
    });

    setState('pickingAspectFor', undefined);
    props.onClose();
  };

  return (
    <Portal>
      <ModalBackdrop
        class={themeClass}
        onClick={(e: MouseEvent & { target: HTMLElement; currentTarget: HTMLElement }) =>
          e.target === e.currentTarget && props.onClose()
        }
      >
        <ModalContent onClick={(e: MouseEvent) => e.stopPropagation()}>
          <ModalHeader>
            <ModalTitle>Fit into Page</ModalTitle>
            <ButtonGroup fill={false} style={{ 'margin-top': 0 }}>
              <Button onClick={props.onClose}>Cancel</Button>
              <Button variant="primary" onClick={onApply}>
                Apply Aspect Match
              </Button>
            </ButtonGroup>
          </ModalHeader>
          <ModalBody ref={setContainer}>
            <PreviewWrapper
              style={{ width: `${displaySize().width}px`, height: `${displaySize().height}px` }}
            >
              <canvas ref={setCanvas} style={{ width: '100%', height: '100%', display: 'block' }} />
              <CropOverlay
                style={{
                  left: `${cropRect().x}px`,
                  top: `${cropRect().y}px`,
                  width: `${cropRect().w}px`,
                  height: `${cropRect().h}px`,
                }}
                onMouseDown={(e: MouseEvent) => onMouseDown(e, 'move')}
              >
                <Handle
                  style={{ right: '-6px', bottom: '-6px', cursor: 'nwse-resize' }}
                  onMouseDown={(e: MouseEvent) => onMouseDown(e, 'resize')}
                />
              </CropOverlay>
            </PreviewWrapper>
          </ModalBody>
        </ModalContent>
      </ModalBackdrop>
    </Portal>
  );
};

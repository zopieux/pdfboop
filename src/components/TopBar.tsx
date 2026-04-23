import { styled } from '@macaron-css/solid';
import {
  Download,
  FlipHorizontal,
  FlipVertical,
  Redo2,
  RotateCcw,
  RotateCw,
  Trash2,
  Undo2,
  Upload,
} from 'lucide-solid';
import type { Component } from 'solid-js';
import { exportProject } from '../lib/export';
import { processUpload } from '../lib/inputs';
import {
  clearWorkspace,
  deleteSelected,
  flipHSelected,
  flipVSelected,
  redo,
  rotateCCWSelected,
  rotateCWSelected,
  state,
  undo,
} from '../state';
import { vars } from '../theme';
import { Button } from './ui/Button';

const StyledHeader = styled('header', {
  base: {
    height: vars.sizes.headerHeight,
    display: 'flex',
    alignItems: 'center',
    padding: `0 ${vars.gaps.md}`,
    borderBottom: `1px solid ${vars.colors.border}`,
    background: vars.colors.surface,
    justifyContent: 'space-between',
  },
});

const ToolbarGroup = styled('div', {
  base: {
    display: 'flex',
    gap: vars.gaps.md,
    alignItems: 'center',
  },
});

const Title = styled('h1', {
  base: {
    fontSize: '18px',
    margin: 0,
    fontWeight: 600,
    color: vars.colors.text,
  },
});

const Divider = styled('div', {
  base: {
    width: '1px',
    height: '24px',
    background: vars.colors.border,
    margin: `0 ${vars.gaps.sm}`,
  },
});

export const TopBar: Component = () => {
  let fileInput: HTMLInputElement | undefined;

  const handleClear = () => {
    if (confirm('Start from scratch? This will clear all pages and history.')) {
      clearWorkspace();
    }
  };

  return (
    <StyledHeader>
      <ToolbarGroup>
        <Title>pdfboop</Title>
        <Divider />
        <Button variant="danger" onClick={handleClear}>
          <Trash2 size={16} /> Reset
        </Button>
        <Button variant="primary" onClick={() => fileInput?.click()}>
          <Upload size={16} /> Upload
        </Button>
        <input
          type="file"
          multiple
          accept=".pdf,image/*"
          style="display: none"
          ref={fileInput}
          onChange={(e) => processUpload(e.currentTarget.files!)}
        />
        <Button onClick={undo} disabled={state.historyIndex === 0} title="Undo">
          <Undo2 size={16} />
        </Button>
        <Button
          onClick={redo}
          disabled={state.historyIndex >= state.operations.length}
          title="Redo"
        >
          <Redo2 size={16} />
        </Button>
      </ToolbarGroup>

      <ToolbarGroup style={{ gap: vars.gaps.sm }}>
        <Button
          disabled={state.selection.length === 0}
          onClick={rotateCCWSelected}
          title="Rotate Counter-Clockwise"
        >
          <RotateCcw size={16} />
        </Button>
        <Button
          disabled={state.selection.length === 0}
          onClick={rotateCWSelected}
          title="Rotate Clockwise"
        >
          <RotateCw size={16} />
        </Button>
        <Button
          disabled={state.selection.length === 0}
          onClick={flipHSelected}
          title="Flip Horizontal"
        >
          <FlipHorizontal size={16} />
        </Button>
        <Button
          disabled={state.selection.length === 0}
          onClick={flipVSelected}
          title="Flip Vertical"
        >
          <FlipVertical size={16} />
        </Button>
        <Button
          disabled={state.selection.length === 0}
          onClick={deleteSelected}
          title="Delete Selected"
          variant="danger"
        >
          <Trash2 size={16} />
        </Button>
      </ToolbarGroup>

      <ToolbarGroup style={{ gap: vars.gaps.sm }}>
        <Button variant="primary" onClick={exportProject}>
          <Download size={16} /> Save
        </Button>
      </ToolbarGroup>
    </StyledHeader>
  );
};

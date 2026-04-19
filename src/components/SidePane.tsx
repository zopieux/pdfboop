import { Component } from 'solid-js';
import { styled } from '@macaron-css/solid';
import { Files, Image as ImageIcon } from 'lucide-solid';
import { vars } from '../theme';
import { FilesTab } from './FilesTab';
import { AssetsTab } from './AssetsTab';
import { state, setActiveTab } from '../state';

const StyledAside = styled('aside', {
  base: {
    width: vars.sizes.sidebarWidth,
    borderLeft: `1px solid ${vars.colors.border}`,
    background: vars.colors.surface,
    display: 'flex',
    flexDirection: 'column',
  },
});

const TabList = styled('div', {
  base: {
    display: 'flex',
    height: vars.sizes.headerHeight,
    borderBottom: `1px solid ${vars.colors.border}`,
  },
});

const TabButton = styled('button', {
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
    gap: vars.gaps.sm,
    fontSize: '13px',
    fontWeight: 500,
    transition: 'background 0.1s, color 0.1s',
    selectors: {
      '&:hover': {
        background: vars.colors.border,
      },
    },
  },
  variants: {
    active: {
      true: {
        background: vars.colors.primary,
        color: vars.colors.surface,
        selectors: {
          '&:hover': {
            background: vars.colors.primary,
          },
        },
      },
    },
  },
});

const TabContent = styled('div', {
  base: {
    flex: 1,
    overflowY: 'auto',
  },
});

export const SidePane: Component = () => {
  return (
    <StyledAside>
      <TabList>
        <TabButton
          active={state.activeTab === 'files'}
          onClick={() => setActiveTab('files')}
        >
          <Files size={16} /> Files
        </TabButton>
        <TabButton
          active={state.activeTab === 'assets'}
          onClick={() => setActiveTab('assets')}
        >
          <ImageIcon size={16} /> Assets
        </TabButton>
      </TabList>

      <TabContent>
        {state.activeTab === 'files' ? <FilesTab /> : <AssetsTab />}
      </TabContent>
    </StyledAside>
  );
};

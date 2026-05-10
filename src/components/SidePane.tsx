import { styled } from '@macaron-css/solid';
import { Files, Image as ImageIcon } from 'lucide-solid';
import type { Component } from 'solid-js';
import { setActiveTab, state } from '../state';
import { vars } from '../theme';
import { AssetsTab } from './AssetsTab';
import { FilesTab } from './FilesTab';
import { ResizerPane } from './ResizerPane';

const StyledAside = styled('aside', {
  base: {
    width: vars.sizes.sidebarWidth,
    borderLeft: `1px solid ${vars.colors.border}`,
    background: vars.colors.surface,
    display: 'flex',
    flexDirection: 'column',
  },
});

import { TabButton, TabList } from './ui/Tabs';

const TabContent = styled('div', {
  base: {
    flex: 1,
    overflowY: 'auto',
    minHeight: 0,
  },
});

export const SidePane: Component = () => {
  return (
    <StyledAside>
      <TabList>
        <TabButton active={state.activeTab === 'files'} onClick={() => setActiveTab('files')}>
          <Files size={16} /> Files
        </TabButton>
        <TabButton active={state.activeTab === 'assets'} onClick={() => setActiveTab('assets')}>
          <ImageIcon size={16} /> Assets
        </TabButton>
      </TabList>

      <TabContent>{state.activeTab === 'files' ? <FilesTab /> : <AssetsTab />}</TabContent>

      <ResizerPane />
    </StyledAside>
  );
};

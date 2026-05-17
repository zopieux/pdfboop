import { styled } from '@macaron-css/solid';
import { type Component, onMount, Show } from 'solid-js';
import { ChangelogModal } from './components/ChangelogModal';
import { SidePane } from './components/SidePane';
import { TopBar } from './components/TopBar';
import { Workspace } from './components/Workspace';
import {
  deleteSelected,
  loadState,
  moveSelection,
  redo,
  saveState,
  selectAllPages,
  setShowChangelogModal,
  showChangelogModal,
  undo,
} from './state';
import { themeClass } from './theme';

const AppContainer = styled('div', {
  base: {
    display: 'flex',
    height: '100vh',
    width: '100vw',
  },
});

const MainContent = styled('main', {
  base: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
});

const App: Component = () => {
  onMount(() => {
    loadState();
    // Auto-save on change
    window.addEventListener('beforeunload', saveState);

    const handleKey = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        moveSelection(e.key === 'ArrowLeft' ? -1 : 1);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) redo();
        else undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        redo();
      }
      if (e.key === 'Delete') {
        e.preventDefault();
        deleteSelected();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        selectAllPages();
      }
    };
    window.addEventListener('keydown', handleKey);
  });

  return (
    <AppContainer class={themeClass}>
      <MainContent>
        <TopBar />
        <Workspace />
      </MainContent>
      <SidePane />
      <Show when={showChangelogModal()}>
        <ChangelogModal onClose={() => setShowChangelogModal(false)} />
      </Show>
    </AppContainer>
  );
};

export default App;

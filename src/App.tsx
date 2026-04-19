import { Component, onMount } from 'solid-js';
import { styled } from '@macaron-css/solid';
import { TopBar } from './components/TopBar';
import { Workspace } from './components/Workspace';
import { SidePane } from './components/SidePane';
import { loadState, saveState, moveSelection, undo, redo, deleteSelected } from './state';
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
    </AppContainer>
  );
};

export default App;

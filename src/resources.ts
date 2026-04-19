import { createResource, createRoot, createSignal } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import { state, getOriginalBlob } from './state';
import { getProcessedPdfBlob } from './lib/processed';
import { getAssetsForWorkspace } from './lib/extraction';
import { Asset } from './types';

export const workspaceAssets = createRoot(() => {
  const [store, setStore] = createStore<{ list: Asset[], loading: boolean }>({ list: [], loading: false });

  const [assets] = createResource(
    () => ({
      pages: [...state.pages],
      originals: state.originals.map(o => ({ ...o })), 
      historyIndex: state.historyIndex,
    }),
    async (source) => {
      const newList = await getAssetsForWorkspace(
        source.pages,
        source.originals,
        (id) => getProcessedPdfBlob(id, source.historyIndex)
      );
      setStore('list', reconcile(newList, { key: 'id' }));
      return newList;
    }
  );

  // Return a derived signal that reads from store
  const assetsSignal = () => store.list;
  Object.defineProperty(assetsSignal, 'loading', { get: () => assets.loading });
  return assetsSignal as (() => Asset[]) & { loading: boolean };
});

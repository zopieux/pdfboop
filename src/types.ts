export type PageOperation = {
  rotation: number; // 0, 90, 180, 270
  flipH: boolean;
  flipV: boolean;
};

export type Page = {
  id: string;
  originalId: string;
  originalPageIndex: number; // 0-based index in the original file
  ops: PageOperation;
};

export interface Asset {
  id: string; // Format: "originalId:ref" or "originalId:standalone"
  originalId: string;
  imageRef?: string; // For PDFs
  previewUrl: string;
  width: number;
  height: number;
}

export type OriginalFile = {
  id: string;
  name: string;
  size: number;
  type: 'pdf' | 'image';
  pageCount: number;
  color: string;
  evicted: boolean;
  pageRatios: number[];
  version: number;
  assetQualities: Record<string, number>;
};

export type AbstractOperation =
  | { type: 'APPEND_ORIGINAL'; originalId: string; instanceId: string }
  | { type: 'ADD_BLANK'; pageId: string; index: number }
  | { type: 'DELETE'; pageIds: string[] }
  | { type: 'MOVE'; pageIds: string[]; targetIndex: number }
  | {
      type: 'TRANSFORM';
      pageIds: string[];
      operation: 'rotateCW' | 'rotateCCW' | 'flipH' | 'flipV';
    }
  | {
      type: 'REPLACE_IMAGE';
      originalId: string;
      imageRefs: string[];
      newBlobIds: string[]; // 1:1 with imageRefs or 1:Many
    }
  | { type: 'DELETE_IMAGE'; originalId: string; imageRefs: string[] };

export type EditorState = {
  originals: OriginalFile[];
  operations: AbstractOperation[];
  historyIndex: number;
  pages: Page[];
  selection: string[]; // Page IDs
  assetSelection: string[]; // Asset IDs
  zoom: number; // 1 to 10
  workspaceRatio: number; // height / width
  draggingKind: 'pdf' | 'image' | 'file' | null;
  activeTab: 'files' | 'assets';
};

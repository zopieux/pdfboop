export type PageSize = { width: number; height: number };

export type PageCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Anchor =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'center'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right';

export type Page = {
  id: string;
  originalId: string;
  originalPageIndex: number; // 0-based index in the original file
  originalSize: PageSize; // set at creation, immutable
};

export interface DiscoveredAsset {
  ref: string;
  width: number;
  height: number;
}

export interface Asset extends DiscoveredAsset {
  id: string; // originalId:ref
  originalId: string;
  previewUrl: string;
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
  pageSizes: { width: number; height: number }[];
  version: number;
  assets: DiscoveredAsset[];
  assetUsage: Record<number, string[]>; // pageIndex -> array of refs
  assetQualities: Record<string, number>;
  assetScales: Record<string, number>; // 0.01 to 1.0
};

export type ResizeMode = 'crop' | 'pad';

export type UserPreferences = {
  resizerMode: ResizeMode;
  resizerAnchor: Anchor;
};

export type AbstractOperation =
  | { type: 'APPEND_ORIGINAL'; originalId: string; instanceId: string }
  | { type: 'ADD_BLANK'; pageId: string; index: number; originalSize: PageSize }
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
  | { type: 'DELETE_IMAGE'; originalId: string; imageRefs: string[] }
  | {
      type: 'RESIZE';
      pageIds: string[];
      targetSize?: PageSize;
      targetRatio?: number;
      resizeMode?: ResizeMode;
      anchor?: Anchor;
    }
  | { type: 'CROP'; pageIds: string[]; crop?: PageCrop }
  | { type: 'RESET_GEOMETRY'; pageIds: string[] };

export type EditorState = {
  originals: OriginalFile[];
  operations: AbstractOperation[];
  historyIndex: number;
  pages: Page[];
  selection: string[]; // Page IDs
  assetSelection: string[]; // Asset IDs
  zoom: number; // 1 to 10
  draggingKind: 'pdf' | 'image' | 'file' | null;
  activeTab: 'files' | 'assets';
  resizerMode: ResizeMode;
  resizerAnchor: Anchor;
  resizerLinked: boolean;
  pickingAspectFor?: string[]; // IDs of pages we are matching for
};

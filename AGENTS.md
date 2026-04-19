# pdfboop: Browser-Based PDF Editor

A fully in-browser, offline-first PDF manipulation tool built for speed, privacy, and visual excellence.

## Tech Stack
- **Framework**: Vite + SolidJS
- **Language**: Modern, concise TypeScript (minimal boilerplate)
- **Icons**: Lucide
- **PDF Manipulation**: Browser-side JS libraries (e.g., `pdf-lib`, `jspdf`, `pdf.js`)
- **Styling**: macaron (zero-runtime CSS-in-JS for SolidJS) with layout efficiency in mind (no glassmorphism, no vibrant colors). Systematic use of design tokens in `src/theme.ts`. Modern CSS media queries for light/dark themes.
- **Visuals**: Prosumer aesthetic. Efficient, clean, and animation-free (except for reordering).
- **Environment**: Nix flake support (devshell + static standalone package). Use `nix develop -c ...` for all development commands.
- **Package Manager**: pnpm (do not use npm or yarn).
- **Linter/Formatter**: Biome (via Nix devshell).

## Core Features
- **Direct Entry**: No landing page; opens immediately to the main editor.
- **Main Editor**: 
    - Empty state initially.
    - Page preview list (grid view with wrapping).
    - Zoom levels (Ctrl+Wheel): 1~10 pages per screen-width, responsive to viewport size.
    - Multi-select support (Ctrl/Shift).
    - Dragon-and-drop reordering.
    - Keyboard reordering (Alt+Left/Right).
- **Upload Flow**: 
    - Merge PDF/Images into the workspace at the end.
    - Images become blank pages covering the full area, respecting aspect ratio.
    - Pixel density consistency for added images.
    - Dynamic workspace aspect ratio based on the first uploaded page (defaulting to A4 Portrait).
- **Page Controls**:
    - Header per page: Add Left / Delete / Add Right.
    - Footer per page: Metadata (global page #, original page #), color-coded dot (based on origin file from a 24-color hue/saturation palette).
- **Operations (Undoable)**:
    - Rotate 90° Clockwise/Anticlockwise.
    - Flip Horizontal/Vertical.
- **Side Pane Tabs**:
    1. **Files List**: Original filename, byte size, page count, type, warning sign for evicted cache, Re-upload button.
    2. **Assets Inspector**: List of images across all pages (thumbnail, `background-size: contain`). Lower pixel density (re-compress) and Delete image references.

## State Management
- **Persistence**: `localStorage` for the entire editor state to persist between sessions.
- **Large Assets**: `Caches API` for original PDF/Image blobs to avoid `localStorage` limits.
- **Immutability**: Original files are immutable; operations are performed on in-memory copies.
- **Undo/Redo**: Global history stack (depth: 100) synced to `localStorage`.

## UI/UX Requirements
- **Visuals**: Prosumer efficiency. Modern typography, clean light/dark themes. No animations, except for reordering (fast: 200ms).
- **Responsive**: Adapts to various viewport sizes.

## Development & Testing
- **Vitest Suite**: Unit and interaction tests for:
    - Workspace state transitions.
    - Page reordering logic & multi-selection.
    - PDF/Image processing calculations.
    - Operations (rotation, flip), including chained operations.
    - Global Undo/Redo of all operations.

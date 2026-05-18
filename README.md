# Asset Console

`Asset Console` is a desktop-first asset management app built with React, TypeScript, Vite, and Tauri. It also ships with a mobile-oriented companion UI.

## What it does

- Organizes projects and folder trees around local file sources
- Shows recent files, duplicate groups, and operation history
- Supports image, PDF, video, and 3D preview handling
- Covers import, selection, move, delete, rename, and restore flows
- Includes a mobile UI under `src/mobile`

## Tech Stack

- React 19
- TypeScript
- Vite
- Tauri 2
- Zustand
- React Router
- Three.js and Rhino3dm for 3D preview support

## Project Layout

- `src/` - desktop and mobile UI
- `src-tauri/` - Rust sidecar and Tauri shell
- `public/vendor/rhino3dm/` - runtime assets required by 3D preview
- `remotion-intro/` - optional intro/outro composition source

## Run Locally

```bash
npm install
npm run dev
```

To run the native shell:

```bash
npm run tauri:dev
```

## Build

```bash
npm run build
```

## Notes

- Generated build outputs are intentionally not tracked in Git.
- This repository keeps source code and runtime assets only.
- The `remotion-intro` folder keeps source files; rendered output is excluded from Git.

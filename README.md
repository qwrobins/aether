# Aether

A modern desktop file transfer application for **AWS S3** and **SFTP**, built with Electron, React, and a custom dark UI theme.

Aether provides a dual-pane file manager with drag-and-drop transfers, multiple simultaneous connections, recursive directory operations, and encrypted credential storage — all wrapped in a warm indigo-tinted interface designed to feel atmospheric rather than flat.

![Electron](https://img.shields.io/badge/Electron-40-47848f?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-4.5-3178c6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06b6d4?logo=tailwindcss&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

---

## Features

### File Transfer
- **AWS S3** — browse buckets, upload/download objects, create folders, batch delete with retry
- **SFTP** — password or SSH key authentication, full remote filesystem browsing
- **Drag and drop** between panels or from the OS file manager
- **Recursive directory transfers** — directories are automatically expanded into individual file transfers
- **Concurrent transfers** — up to 3 simultaneous transfers via a managed queue (p-queue)
- **Progress tracking** — real-time speed, bytes transferred, animated progress bars
- **Automatic retry** — failed transfers retry up to 3 times with exponential backoff

### Connection Management
- Save and manage multiple S3 and SFTP connection profiles
- S3 auth methods: access keys, IAM role assumption, named AWS profile, default credential chain
- SFTP auth methods: password, SSH private key (with optional passphrase)
- Credentials encrypted at rest via Electron safeStorage
- Test connection before saving

### Dual-Pane File Browser
- **Local panel** (left) — browse the local filesystem
- **Remote panel** (right) — browse S3 buckets/objects or SFTP servers
- Sortable columns (name, size, modified date)
- Keyboard shortcuts: Delete, Ctrl+A (select all), Ctrl+R (refresh), Ctrl+N (new folder), F2 (rename), Escape (clear selection)
- Shift-click range selection and Ctrl-click multi-selection
- Right-click context menu with all file operations
- Color-coded file type icons

### UI
- Custom frameless title bar with window controls
- Collapsible sidebar with quick-access directories and connection list
- Resizable panels (horizontal split) and drag-to-resize transfer queue
- Animated drop zones with glowing borders
- Toast notifications for errors and actions
- Dark theme with OKLCH color system (Geist Sans + Geist Mono typography)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Electron 40 + Electron Forge + Vite 7 |
| UI | React 19, Tailwind CSS v4, shadcn/ui (new-york), Radix UI |
| Animation | framer-motion, CSS keyframes |
| State | Zustand (5 stores) |
| S3 | @aws-sdk/client-s3, @aws-sdk/lib-storage, @aws-sdk/credential-providers |
| SFTP | ssh2-sftp-client |
| Transfers | p-queue (concurrency control) |
| Storage | electron-store (JSON) + Electron safeStorage (encryption) |
| Fonts | Geist Sans, Geist Mono |
| Icons | lucide-react |

---

## Getting Started

### Prerequisites

- **Node.js** >= 18
- **npm** >= 9

### Install

```bash
git clone https://github.com/qwrobins/aether.git
cd aether
npm install
```

### Development

```bash
npm start
```

Launches the app in development mode with Vite HMR for the renderer process.

### Package

```bash
npm run package
```

Builds the app into a platform-specific executable (not an installer).

### Build Distributable

```bash
npm run make
```

Creates distributable installers. Configured makers:

| Platform | Format |
|---|---|
| Windows | Squirrel |
| macOS | ZIP |
| Linux | DEB, RPM |

---

## Project Structure

```
src/
├── main/                          # Main process (Node.js)
│   ├── index.ts                   # App lifecycle, BrowserWindow
│   ├── ipc/                       # IPC handler registration
│   │   ├── connection.handlers.ts # Connection CRUD
│   │   ├── filesystem.handlers.ts # Local filesystem ops
│   │   ├── s3.handlers.ts         # S3 connect/disconnect + object ops
│   │   ├── sftp.handlers.ts       # SFTP connect/disconnect + file ops
│   │   └── transfer.handlers.ts   # Transfer queue management
│   ├── services/                  # Business logic
│   │   ├── connection.service.ts  # Profile storage + encryption
│   │   ├── credential.service.ts  # Electron safeStorage wrapper
│   │   ├── filesystem.service.ts  # Local fs operations
│   │   ├── s3.service.ts          # AWS S3 client + operations
│   │   ├── sftp.service.ts        # SSH2 SFTP client + operations
│   │   └── transfer.service.ts    # Transfer engine (p-queue)
│   └── utils/
│       └── store.ts               # JSON file persistence
├── preload/
│   └── preload.ts                 # contextBridge (invoke, on, removeAllListeners)
├── renderer/                      # Renderer process (React)
│   ├── App.tsx                    # Root component
│   ├── index.css                  # Tailwind v4 theme + animations
│   ├── components/
│   │   ├── connection/            # Connection manager sheet + forms
│   │   ├── layout/                # AppLayout, AppSidebar, TitleBar
│   │   ├── panels/                # LocalPanel, RemotePanel, FileList, FileItem
│   │   ├── shared/                # EmptyState, FileIcon, FileSize
│   │   ├── transfer/              # TransferQueue, TransferItem
│   │   └── ui/                    # 21 shadcn/ui primitives
│   ├── hooks/                     # useKeyboardShortcuts, useTransferEvents, useFileSystem
│   └── stores/                    # Zustand stores (connection, local, remote, transfer, ui)
└── shared/                        # Cross-process (types only)
    ├── constants/
    │   └── channels.ts            # IPC channel name constants
    └── types/
        ├── connection.ts          # S3/SFTP profile types
        ├── filesystem.ts          # FileEntry, DirectoryListing
        ├── ipc.ts                 # Fully typed IPC map
        └── transfer.ts            # Transfer item/request/progress types
```

---

## Architecture

Aether follows strict Electron process separation:

- **Main process** handles all Node.js, filesystem, network, and AWS SDK operations. Services are never imported by the renderer.
- **Preload script** exposes a minimal `window.api` bridge via `contextBridge` with `invoke` (request/response) and `on` (event subscription).
- **Renderer process** is a pure React app. All backend operations go through `window.api.invoke()`, fully typed via `IpcInvokeMap`.
- **Shared directory** contains only TypeScript types and constants — no runtime code with side effects.

Security: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Credentials are encrypted via `safeStorage` before being written to disk.

---

## IPC Channels

All channels are defined in `src/shared/constants/channels.ts` and typed in `src/shared/types/ipc.ts`.

| Category | Channels |
|---|---|
| Filesystem | `fs:read-dir`, `fs:stat`, `fs:mkdir`, `fs:delete`, `fs:rename`, `fs:get-home` |
| Connections | `conn:list`, `conn:save`, `conn:delete`, `conn:test`, `conn:connect`, `conn:disconnect` |
| S3 | `s3:list-buckets`, `s3:list-objects`, `s3:delete-object`, `s3:create-folder`, `s3:list-profiles`, `s3:list-roles` |
| SFTP | `sftp:list`, `sftp:mkdir`, `sftp:delete`, `sftp:rename` |
| Transfers | `transfer:start`, `transfer:cancel`, `transfer:clear`, `transfer:list` |
| Events | `transfer:progress`, `transfer:complete`, `transfer:error` |
| Window | `window:close`, `window:minimize`, `window:maximize` |

---

## License

[MIT](LICENSE)

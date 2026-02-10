# Aether - Electron File Transfer App

## Context

Build "Aether", a modern Electron file transfer app supporting AWS S3 and SFTP with a dual-pane interface (local left, remote right), drag-and-drop transfers, and multiple simultaneous connections.

## Tech Stack

- **Electron Forge + Vite** (vite-typescript template)
- **React 19 + TypeScript** for renderer
- **Tailwind CSS v4** via `@tailwindcss/vite` (no JS config file)
- **shadcn/ui v4** (new-york style, lucide icons)
- **framer-motion** for animations and micro-interactions
- **@aws-sdk/client-s3 + @aws-sdk/lib-storage** for S3
- **ssh2-sftp-client** for SFTP
- **zustand** for state management
- **p-queue** for concurrent transfer management
- **electron-store** for persistent settings
- **Electron safeStorage** for credential encryption

## Architecture

```
src/
├── main/                    # Main process (Node.js)
│   ├── index.ts             # BrowserWindow, app lifecycle
│   ├── ipc/                 # IPC handlers (one per domain)
│   │   ├── index.ts         # Register all handlers
│   │   ├── filesystem.handlers.ts
│   │   ├── s3.handlers.ts
│   │   ├── sftp.handlers.ts
│   │   ├── connection.handlers.ts
│   │   ├── transfer.handlers.ts
│   │   └── credential.handlers.ts
│   ├── services/            # Business logic
│   │   ├── filesystem.service.ts
│   │   ├── s3.service.ts
│   │   ├── sftp.service.ts
│   │   ├── connection.service.ts
│   │   ├── credential.service.ts
│   │   └── transfer.service.ts   # p-queue transfer engine
│   └── utils/
│       └── store.ts              # electron-store instance
├── preload/
│   └── index.ts             # contextBridge with typed invoke/on
├── renderer/                # React app
│   ├── index.tsx
│   ├── index.css            # Tailwind v4 entry + @theme
│   ├── App.tsx
│   ├── env.d.ts             # window.api types
│   ├── lib/utils.ts         # shadcn cn()
│   ├── components/
│   │   ├── ui/              # shadcn components (auto-generated)
│   │   ├── layout/          # AppLayout, TitleBar, Sidebar
│   │   ├── panels/          # LocalPanel, RemotePanel, FileList, FileItem, PathBreadcrumb, DropZone
│   │   ├── transfer/        # TransferQueue, TransferItem, TransferSummary
│   │   ├── connection/      # ConnectionManager, ConnectionForm, S3/SFTP forms
│   │   └── shared/          # FileIcon, FileSize, EmptyState, ConfirmDialog
│   ├── hooks/               # useFileSystem, useS3, useSftp, useTransfer, useDragDrop
│   └── stores/              # connectionStore, localPanelStore, remotePanelStore, transferStore, uiStore
└── shared/                  # Shared between main + renderer
    ├── types/               # ipc.ts, connection.ts, filesystem.ts, transfer.ts
    └── constants/           # channels.ts, defaults.ts
```

## Key Design Decisions

- **Type-safe IPC**: `IpcInvokeMap` types ensure `window.api.invoke('channel', ...args)` has full type inference for args and return values
- **Transfer engine in main process**: File I/O must happen in main; renderer only sees progress events via IPC
- **Separate zustand stores**: One per domain (connections, local panel, remote panel, transfers, UI) to minimize re-renders
- **Custom drag data type** (`application/aether-transfer`): Distinguishes internal panel drags from OS file drops
- **Credentials encrypted via safeStorage**: Sensitive fields encrypted before writing to electron-store

## UI Design System

### Design Philosophy: "Luminous Ether"
The name Aether references the classical fifth element — the luminous medium through which light travels. The UI evokes this with **subtle luminous glow effects** on active elements, **warm-tinted depth** rather than cold flat surfaces, and a sense of **data flowing between worlds**. The signature look: a deep, warm dark base with an indigo-violet accent that shifts to amber-gold during active transfers. Every surface has atmosphere — never flat, never generic.

### Typography (Critical — No System Fonts)
- **Display/UI**: **Geist Sans** (Vercel's font — geometric, modern, distinctive but highly readable at small sizes). Load via `@fontsource/geist-sans` or self-host.
- **Monospace** (paths, file sizes, speeds): **Geist Mono** — pairs perfectly.
- **Title bar logo text**: Geist Sans 600 weight, 13px, letter-spacing 0.08em.
- **File list**: Geist Sans 400, 13px body / 11px secondary info (muted).
- **Section headers**: Geist Sans 500, 11px, uppercase, letter-spacing 0.05em, `text-muted-foreground`.
- NEVER use Inter, Roboto, Arial, or system-ui.

### Color System (OKLCH)
The palette is **warm indigo** — not cold blue. Indigo-violet feels ethereal and distinctive.

```css
@theme {
  --color-background: oklch(0.07 0.01 280);       /* Deep warm black */
  --color-surface: oklch(0.10 0.01 280);           /* Elevated surface */
  --color-card: oklch(0.13 0.012 280);             /* Cards, panels */
  --color-card-foreground: oklch(0.90 0.01 260);
  --color-primary: oklch(0.62 0.25 280);           /* Rich indigo */
  --color-primary-foreground: oklch(0.98 0 0);
  --color-accent: oklch(0.78 0.16 75);             /* Warm amber */
  --color-accent-foreground: oklch(0.15 0.02 75);
  --color-success: oklch(0.68 0.19 155);           /* Muted emerald */
  --color-warning: oklch(0.78 0.16 75);            /* Amber */
  --color-destructive: oklch(0.58 0.22 25);        /* Deep coral-red */
  --color-foreground: oklch(0.92 0.008 260);       /* Warm off-white */
  --color-muted-foreground: oklch(0.55 0.015 270); /* Soft lavender-gray */
  --color-border: oklch(0.20 0.015 280);           /* Warm subtle border */
  --color-input: oklch(0.16 0.012 280);            /* Input backgrounds */
  --color-ring: oklch(0.62 0.25 280);              /* Focus ring = primary */
  --radius-sm: 0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;
}
```

### Atmosphere & Depth
- **Background texture**: Subtle CSS noise overlay at 2-3% opacity
- **Ambient glow**: Active sidebar items have soft radial gradient glow
- **Panel depth**: 1px inner border `border-border/50`, ResizableHandle has faint indigo glow on hover
- **Title bar gradient**: Subtle horizontal gradient, "brushed metal" feel
- **Glass morphism** (modals/sheets only): `bg-background/80 backdrop-blur-2xl border border-white/[0.06] shadow-2xl shadow-black/40`

### Layout
```
┌──────────────────────────────────────────────────────┐
│  ◆ Aether                        ─  □  ×            │  Title bar (38px)
├────────┬─────────────────────────────────────────────┤
│        │  ┌─ Local ─────────┐ ┌─ Remote ────────┐  │
│ SIDE   │  │ Breadcrumb      │ │ Breadcrumb       │  │  Self-contained panels
│ BAR    │  │ Name     Size   │ │ Name      Size   │  │
│        │  │ docs/      --   │ │ data.csv  4.5MB  │  │
│ 52px   │  │ file.txt 1.2MB  │ │ img.png   2.1MB  │  │
│ glow   │  │ drag ─────────> │ │ <────── drag     │  │
│        │  └─────────────────┘ └──────────────────┘  │
├────────┼─────────────────────────────────────────────┤
│        │  ▾ Transfers  3 active · 1.2 GB remaining   │
│        │  workspace.zip ═══════▓░░ 67% 2.3 MB/s      │
└────────┴─────────────────────────────────────────────┘
```

### Key UI Patterns
- **File rows**: 34px, hover `bg-white/[0.03]`, selected `bg-primary/8` + 2px left border
- **File icons**: Color-coded at 80% opacity (folders=indigo, docs=rose, images=emerald, code=amber, archives=violet, media=cyan)
- **Drag ghost**: Card with blur + rotation(2deg) + count badge. Cursor-following radial glow on drop zone.
- **Drop zones**: Solid glowing border (breathing animation), NOT dashed. `bg-primary/[0.04]` wash.
- **Transfer progress**: 3px bars with shimmer sweep animation. Upload=indigo, download=amber.
- **Connection cards**: Left accent strip (S3=indigo, SFTP=emerald) + status dot with pulse.
- **Scrollbars**: 5px, `bg-white/[0.08]` thumb, hidden when not scrolling.
- **Accessibility**: WCAG 2.1 AA, visible focus rings, full keyboard nav, `prefers-reduced-motion`, ARIA labels.

## Implementation Phases

### Phase 1: Project Scaffold
1. `npx create-electron-app@latest` with vite-typescript template
2. Install React 19, Tailwind v4, shadcn/ui, zustand, framer-motion, Geist fonts
3. Restructure to `src/main/`, `src/preload/`, `src/renderer/`
4. Configure vite configs, tsconfig, forge.config
5. Create index.html, entry files, CSS with @theme
6. Verify: `npm start` launches styled Electron window

### Phase 2: Core Layout + Local File Browser
1. Add shadcn components (breadcrumb, table, scroll-area, skeleton, context-menu, etc.)
2. Create shared types + constants
3. Create filesystem service + IPC handlers
4. Wire preload contextBridge
5. Build layout: TitleBar, Sidebar, AppLayout (ResizablePanelGroup)
6. Build panels: LocalPanel, RemotePanel (empty state), FileList, FileItem
7. Verify: left panel navigates local filesystem

### Phase 3: Connection Management
1. Create connection/credential types + services
2. Build ConnectionManager Sheet, connection forms, connectionStore
3. Verify: CRUD connection profiles, encrypted credential storage

### Phase 4: S3 Integration
1. Create S3 service + IPC handlers
2. Build remotePanelStore, update RemotePanel
3. Verify: connect to S3, browse buckets/objects

### Phase 5: SFTP Integration
1. Create SFTP service + IPC handlers
2. Update remotePanelStore for SFTP dispatch
3. Verify: connect to SFTP, browse remote directories

### Phase 6: Drag-and-Drop + Transfer Queue
1. Create transfer service (p-queue engine) + IPC handlers
2. Build TransferQueue UI, DropZone, drag hooks
3. Verify: drag transfers work, progress shows, cancel works

### Phase 7: Polish
1. Keyboard shortcuts, context menus, settings
2. Animations, loading states, error handling
3. Full end-to-end verification

## Agent Team Strategy

### Git Worktrees
Use `/using-git-worktrees` skill to create isolated worktrees per phase. Each agent team works in its own worktree.

### Team Structure Per Phase
- **Phase 1**: Sequential (no team)
- **Phase 2**: 3 agents (types, main-process, renderer)
- **Phase 3**: 3 agents (types, main-process, renderer)
- **Phase 4-5**: 2 agents each (main-process, renderer)
- **Phase 6**: 3 agents (types, main-process, renderer)
- **Phase 7**: 2 agents (interaction, visual)

# Aether - Project Guidelines

## Project Overview
Aether is an Electron file transfer application supporting AWS S3 and SFTP with a modern dual-pane UI, drag-and-drop transfers, and multiple simultaneous connections.

## Tech Stack
- Electron Forge + Vite (plugin-vite)
- React 19 + TypeScript (renderer)
- Tailwind CSS v4 (via @tailwindcss/vite, NO tailwind.config.js)
- shadcn/ui v4 (new-york style, lucide icons, radix-ui unified package)
- framer-motion for animations and micro-interactions
- Geist Sans + Geist Mono fonts (NEVER use Inter, Roboto, Arial, system-ui)
- zustand for state management
- @aws-sdk/client-s3 + @aws-sdk/lib-storage for S3
- ssh2-sftp-client for SFTP
- p-queue for transfer concurrency
- electron-store for persistent settings
- Electron safeStorage for credential encryption

## Architecture Rules

### Process Separation
- **Main process** (`src/main/`): All Node.js/filesystem/network operations. Never import renderer code.
- **Preload** (`src/preload/`): Only contextBridge exposure. Minimal logic.
- **Renderer** (`src/renderer/`): React UI only. Never use Node.js APIs directly. All backend operations go through `window.api.invoke()`.
- **Shared** (`src/shared/`): TypeScript types and constants only. No runtime code with side effects.

### IPC Communication
- All IPC channels defined in `src/shared/constants/channels.ts`
- All IPC payload types defined in `src/shared/types/ipc.ts` via `IpcInvokeMap`
- Renderer calls `window.api.invoke(channel, ...args)` — fully typed
- Main-to-renderer events use `window.api.on(channel, callback)` — fully typed
- NEVER expose raw `ipcRenderer` to the renderer

### Security
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
- Credentials encrypted via `safeStorage` before storing with electron-store
- Validate all IPC inputs in main process handlers

### State Management
- Separate zustand stores per domain: `connectionStore`, `localPanelStore`, `remotePanelStore`, `transferStore`, `uiStore`
- Stores live in `src/renderer/stores/`
- Never put main-process logic in stores — stores only call `window.api.invoke()`

### File Naming
- React components: PascalCase (`FileItem.tsx`)
- Hooks: camelCase with `use` prefix (`useFileSystem.ts`)
- Services: kebab-case with `.service.ts` suffix (`s3.service.ts`)
- IPC handlers: kebab-case with `.handlers.ts` suffix (`s3.handlers.ts`)
- Types: kebab-case (`filesystem.ts`)
- Stores: camelCase with `Store` suffix (`connectionStore.ts`)

### Tailwind CSS v4
- NO `tailwind.config.js` — all theming via `@theme` blocks in `src/renderer/index.css`
- Use `@import "tailwindcss"` not the old `@tailwind` directives
- shadcn/ui theme variables use oklch color space

### shadcn/ui
- Components auto-generated in `src/renderer/components/ui/`
- Add components with `npx shadcn@latest add <name>`
- Uses `radix-ui` unified package (not individual `@radix-ui/react-*` packages)
- Import utility: `import { cn } from "@/lib/utils"`

### Path Aliases
- `@/` → `src/renderer/` (for renderer imports and shadcn/ui)
- `@shared/` → `src/shared/` (for cross-process types)

## Commands
- `npm start` — Launch dev mode with Vite HMR
- `npm run lint` — Run ESLint across TypeScript and TSX files
- `npm run package` — Package the app
- `npm run make` — Build distributable installers

## Workflow Expectations

### Before Changing Code
- Read the relevant renderer/main/shared files before editing so IPC, types, and state stay aligned
- Prefer small, targeted changes that preserve the current architecture and visual language
- If a change spans main/preload/renderer, update shared IPC types and channels first

### Validation and Testing
- At minimum, run `npm run lint` after non-trivial code changes
- For changes affecting startup, packaging, preload, or Electron wiring, also run `npm start` if the environment allows it
- For packaging/distribution changes, run `npm run package`; run `npm run make` only when installer output matters
- If you cannot run a relevant verification step, state that clearly in the handoff

### Error Handling and Logging
- Fail IPC handlers with clear, actionable error messages; do not swallow errors unless the failure is explicitly non-fatal
- Validate inputs at IPC boundaries before touching filesystem, network, or credential code
- Log concise, prefixed diagnostics in main-process code (for example `[Aether] ...`) when they help debug startup, IPC, transfers, or connection issues
- Surface user-relevant failures to the renderer in a form that can be shown in UI state or toast notifications

### Input Validation
- Treat all renderer-provided IPC arguments as untrusted input
- Validate required strings, IDs, paths, bucket names, and operation-specific options in the main process
- Reject invalid payloads early with descriptive errors rather than coercing questionable input
- Keep validation logic close to each IPC handler unless multiple handlers share the same rules

### Release and Packaging Notes
- Keep dev and packaged behavior aligned: asset paths, preload paths, and window creation should work in both modes
- When changing Electron packaging behavior, verify Linux-oriented flows first unless the task is explicitly platform-specific
- Never commit secrets, live credentials, or environment-specific machine paths

## UI Design Rules

### Design Philosophy: "Luminous Ether"
Deep warm dark base with indigo-violet accent that shifts to amber-gold during active transfers. Every surface has atmosphere — subtle noise texture, ambient glows, warm-tinted depth. Never flat, never generic.

### Typography
- **UI font**: Geist Sans (400 body, 500 headers, 600 logo). 13px body, 11px secondary.
- **Mono font**: Geist Mono (file sizes, paths, speeds, timestamps). 11px.
- **Section headers**: 11px, 500 weight, uppercase, letter-spacing 0.05em, `text-muted-foreground`.
- NEVER use Inter, Roboto, Arial, or system-ui — these are generic and forgettable.

### Color System (OKLCH — Warm Indigo Palette)
- **Background depth**: `0.07` (base) → `0.10` (surface) → `0.13` (card), all hue 280
- **Primary**: `oklch(0.62 0.25 280)` — rich indigo (the "aether" glow)
- **Accent**: `oklch(0.78 0.16 75)` — warm amber (active transfers)
- **Success**: `oklch(0.68 0.19 155)` — muted emerald
- **Destructive**: `oklch(0.58 0.22 25)` — deep coral-red
- **Text**: `oklch(0.92 0.008 260)` primary, `oklch(0.55 0.015 270)` muted
- **Borders**: `oklch(0.20 0.015 280)` — very subtle, warm-tinted

### Component Styling Standards
- **File list rows**: 34px height, hover `bg-white/[0.03]`, selected `bg-primary/8` + 2px left border
- **Buttons**: Use shadcn variants. Primary actions use indigo accent.
- **Progress bars**: 3px height with shimmer sweep animation. Upload=indigo, download=amber.
- **Cards**: `bg-card border-border` with subtle hover lift via framer-motion
- **Scrollbars**: 5px width, `bg-white/[0.08]` thumb on hover, hidden when not scrolling
- **Transitions**: 150ms hovers, 200ms panel nav, 250ms sidebar, 300ms sheets
- **Easing**: `cubic-bezier(0.4, 0, 0.2, 1)` for CSS, spring(300, 30) for framer-motion

### Atmosphere & Depth
- Subtle CSS noise texture overlay at 2-3% opacity on background
- Ambient radial glow behind active sidebar items
- Glass morphism for modals/sheets ONLY: `bg-background/80 backdrop-blur-2xl border border-white/[0.06]`
- Title bar has subtle horizontal gradient ("brushed metal")
- ResizableHandle has faint indigo glow on hover

### File Type Icon Colors (lucide-react, all at 80% opacity)
- Folders: `text-primary/80` (indigo — matches theme)
- Documents (pdf/doc): `text-rose-400/80`
- Images: `text-emerald-400/80`
- Code/config: `text-amber-400/80`
- Archives (zip/tar): `text-violet-400/80`
- Media (video/audio): `text-cyan-400/80`
- Unknown: `text-muted-foreground/50`

### Drag & Drop
- Drag ghost: Card with `backdrop-blur-md border-primary/30 shadow-xl`, slight rotation(2deg), count badge
- Drop zones: Solid glowing border (breathing animation), `bg-primary/[0.04]` wash, cursor-following radial glow
- Landing: Staggered `y: 8→0, opacity: 0→1` per item (framer-motion)
- NOT dashed borders — solid but luminous

### Accessibility
- WCAG 2.1 AA contrast (4.5:1 text, 3:1 interactive)
- Visible focus rings: `outline-2 outline-ring outline-offset-2`
- Full keyboard nav (Tab, Arrows, Enter, Delete, F2, Escape, Ctrl+A)
- ARIA: `role="grid"` on file lists, `aria-selected`, `aria-live="polite"` on transfers
- Respect `prefers-reduced-motion` — disable all animations

### Animation Library
- **framer-motion** for: sidebar layout, file list stagger, sheet slides, drag overlays, landing animations
- **Tailwind transition-\*** for: hover states, focus rings, opacity changes
- **Pure CSS @keyframes** for: progress shimmer, drop zone breathing, status dot pulse
- Never animate width/height without framer-motion layout animation

## Implementation Reference
See `PLAN.md` for the full implementation plan, UI design spec, and phase breakdown.

## Agent Teams
When implementing larger features, use agent teams to parallelize work across independent files. Use `/using-git-worktrees` to create isolated worktrees per phase when the task is broad enough to benefit from isolation.

Typical team structure:
- **types-agent**: Shared types + constants (general-purpose agent)
- **main-agent**: Services + IPC handlers (general-purpose agent)
- **renderer-agent**: React components + stores + hooks (general-purpose agent)

For each phase, create a team with tasks assigned to appropriate agents. Use TaskCreate/TaskUpdate to track progress. Spawn agents in parallel whenever their work is independent.

For small, localized changes, a single agent is fine; avoid unnecessary coordination overhead when one focused edit is faster and safer.

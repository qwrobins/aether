# Aether - Agent Guide

## Purpose
Aether is an Electron file transfer app for local files, AWS S3, and SFTP. Preserve the dual-pane desktop UX, typed IPC boundaries, and the existing "Luminous Ether" visual language.

## Core Stack
- Electron Forge + Vite
- React 19 + TypeScript
- Tailwind CSS v4 via `@tailwindcss/vite` with theme tokens in `src/renderer/index.css`
- shadcn/ui v4 (new-york style) + `radix-ui`
- framer-motion for layout and interaction animation
- zustand for renderer state
- `@aws-sdk/client-s3` + `@aws-sdk/lib-storage` for S3
- `ssh2-sftp-client` for SFTP
- `p-queue` for transfer concurrency
- `electron-store` + Electron `safeStorage` for persisted encrypted credentials

## Architecture Rules

### Process Boundaries
- `src/main/`: Node.js, filesystem, network, transfer orchestration, credential handling
- `src/preload/`: minimal `contextBridge` exposure only
- `src/renderer/`: React UI only; never use Node.js APIs directly
- `src/shared/`: shared TypeScript types/constants only; no side effects

### IPC Contract
- Define channels in `src/shared/constants/channels.ts`
- Define invoke payloads in `src/shared/types/ipc.ts` via `IpcInvokeMap`
- Renderer must use `window.api.invoke(...)` and `window.api.on(...)`
- Never expose raw `ipcRenderer` to renderer code
- If a feature crosses process boundaries, update shared IPC types/channels first

### State Management
- Use domain-specific zustand stores in `src/renderer/stores/`
- Keep stores focused on UI state and IPC calls
- Do not move main-process business logic into renderer stores

## Naming Conventions
- React components: PascalCase (`FileItem.tsx`)
- Hooks: camelCase with `use` prefix (`useTransferEvents.ts`)
- Services: kebab-case with `.service.ts`
- IPC handlers: kebab-case with `.handlers.ts`
- Shared types: kebab-case filenames
- Stores: camelCase with `Store` suffix

## Security and Validation
- Keep `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`
- Encrypt sensitive credential fields before writing to `electron-store`
- Treat all renderer-provided IPC data as untrusted
- Validate IDs, paths, bucket names, and operation-specific inputs in main-process handlers
- Reject invalid input early with descriptive errors

## Error Handling
- IPC handlers should fail with clear, actionable messages
- Log concise main-process diagnostics with an `[Aether]` prefix when useful
- Surface user-relevant failures back to renderer state or toast-friendly errors
- Do not silently swallow errors unless the failure is intentionally non-fatal

## UI and Design Rules

### Visual Direction
- Follow the "Luminous Ether" style: warm dark base, indigo primary glow, amber transfer accents, atmospheric depth
- Never flatten the UI into generic dashboard styling
- Preserve the existing desktop-first dual-pane layout and mobile-safe behavior where applicable

### Typography
- Use Geist Sans for UI text
- Use Geist Mono for sizes, paths, speeds, and timestamps
- Never introduce Inter, Roboto, Arial, or system-ui

### Styling Standards
- No `tailwind.config.js`; use `@theme` in `src/renderer/index.css`
- Use OKLCH theme variables for color decisions
- Prefer shadcn/ui primitives already in `src/renderer/components/ui/`
- Use `import { cn } from "@/lib/utils"`
- Respect the existing motion system: framer-motion for layout/staggered transitions, CSS for small visual effects
- Respect `prefers-reduced-motion`

## Transfer and Remote Access Expectations
- Transfer execution belongs in `src/main/`, not in renderer code
- Renderer should observe transfer progress through typed IPC events
- Keep S3 and SFTP behaviors aligned where the UX is shared, while respecting protocol-specific differences
- Preserve drag-and-drop semantics and queue behavior when touching file movement code

## Workflow Expectations
- Read relevant main, preload, renderer, and shared files before editing
- Prefer small, targeted changes over broad rewrites
- Preserve existing patterns unless there is a clear project-wide reason to change them
- For larger multi-file features, parallelize with agent teams when it reduces risk or waiting time
- For small localized changes, a single focused agent is preferred

## Validation and Verification
- Run `npm run lint` after non-trivial code changes
- Run `npm start` for startup/preload/window-wiring changes when feasible
- Run `npm run package` for packaging-related changes; run `npm run make` only when installer output matters
- If you cannot run an expected verification step, say so explicitly in your handoff

## Release Hygiene
- Keep dev and packaged behavior aligned, especially asset and preload paths
- Verify Linux-oriented packaging flows first unless the task is platform-specific
- Never commit secrets, live credentials, or machine-specific paths

## References
- `CLAUDE.md`: full project guidance
- `PLAN.md`: implementation phases and product/UI plan

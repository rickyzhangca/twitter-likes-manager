# Project Guidelines

## Build And Validate

- Use `pnpm` for all package management and scripts.
- `pnpm dev` starts the Electron app with the Vite dev server.
- `pnpm dev:web` starts the renderer without Electron. Use this when working on UI that must tolerate a missing desktop bridge.
- `pnpm typecheck` and `pnpm lint` are the default narrow validation commands.
- `pnpm build` is the full desktop build. Run it when you change Electron entrypoints, preload code, or bundling behavior.

## Architecture

- `src/` is the React renderer.
- `electron/` is the Electron main-process and preload surface.
- `src/types/desktop.ts` is the shared contract for IPC channel names and desktop bridge types. Update it first when changing renderer-to-Electron communication.
- `electron/preload.ts` exposes the safe `window.twitterLikesDesktop` bridge.
- `electron/main.ts` owns app lifecycle, window creation, `userData` location, and `ipcMain.handle(...)` registration.
- Archive persistence and sync orchestration live in `electron/archive-store.ts` and `electron/sync-service.ts`.

## Conventions

- Keep Node-only dependencies and filesystem access inside `electron/`. The renderer must go through the preload bridge.
- When adding a desktop capability, update all three layers together: shared types in `src/types/desktop.ts`, bridge exposure in `electron/preload.ts`, and handler wiring in `electron/main.ts`.
- The renderer is expected to run in both Electron and web mode. Guard all desktop calls behind `window.twitterLikesDesktop` checks.
- Use the `@/` alias for renderer imports from `src/`.
- Keep changes consistent with the existing style split: `src/` uses tabs today, while some Electron files use two-space indentation.

## Pitfalls

- Keep `package.json` `main` pointing to `dist-electron/main.js` or Electron startup from the repo root will fail.
- The app sets a custom Electron `userData` path early in `electron/main.ts`. Desktop data lives under `~/Library/Application Support/Twitter Likes Manager` on macOS, not Electron's default app folder.
- Desktop sync artifacts and the Playwright profile are stored under the app data directory, including `sync-captures/` and `playwright-profile/`.
- `vite.config.ts` externalizes `node:sqlite`, `playwright`, `playwright-core`, and `chromium-bidi` from the Electron build. Do not move those imports into renderer code or expect them to be bundled.
- The Electron plugin is disabled in Vite `web` mode, so any change that assumes preload or IPC exists must preserve the browser fallback path.

## References

- [package.json](./package.json) for the current script surface.
- [vite.config.ts](./vite.config.ts) for mode-specific Electron wiring and aliases.
- [electron/main.ts](./electron/main.ts) for app bootstrap and IPC handlers.
- [src/types/desktop.ts](./src/types/desktop.ts) for the shared desktop contract.
- [README.md](./README.md) is still template-level and should not be treated as the source of truth for app architecture.

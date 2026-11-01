# Changelog

All notable changes to `electron-win11-snap-overlay` are documented here.

This project adheres to [Semantic Versioning](https://semver.org/).

---

## [1.0.0] — 2026-11-01

### Added
- `SnapController` — Electron main-process controller managing the Win32 overlay HWND lifecycle, IPC handlers, and window event wiring
- `useSnapOverlay` — React hook for the renderer; tracks button bounds via `ResizeObserver` + staggered RAF measurements and subscribes to native events
- Native NAPI C++ addon (`snap_overlay.node`) implementing the transparent Win32 child window with full `WM_NCHITTEST` / `WM_NCMOUSEMOVE` / `WM_NCMOUSELEAVE` message handling
- Prebuilt binaries for Windows x64 and arm64 (bundled in the npm package)
- Graceful degradation to CSS `:hover` on Windows 10, macOS, and Linux
- `SNAP_IPC` constants for stable preload wiring
- TypeScript types with full JSDoc for all public APIs
- Utility exports: `isWindows11OrNewer`, `validateSnapBounds`, `cssToPhysicalRect`
- Minimal working example app (vanilla JS — no bundler required)
- GitHub Actions CI workflow (build + type-check + addon verification on every push)
- GitHub Actions release workflow (prebuilds for x64 + arm64, npm publish, GitHub Release — all triggered by a version tag push)

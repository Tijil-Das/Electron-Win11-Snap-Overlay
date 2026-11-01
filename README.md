# electron-win11-snap-overlay

> Native Windows 11 Snap Layout flyout for frameless Electron applications.

<div align="center">

[![npm version](https://img.shields.io/npm/v/electron-win11-snap-overlay?color=cb3837&style=flat-square)](https://www.npmjs.com/package/electron-win11-snap-overlay)
[![npm downloads](https://img.shields.io/npm/dm/electron-win11-snap-overlay?color=blue&style=flat-square)](https://www.npmjs.com/package/electron-win11-snap-overlay)
[![GitHub release](https://img.shields.io/github/v/release/Tijil-Das/Electron-Win11-Snap-Overlay?color=success&style=flat-square)](https://github.com/Tijil-Das/Electron-Win11-Snap-Overlay/releases/latest)
[![CI](https://img.shields.io/github/actions/workflow/status/Tijil-Das/Electron-Win11-Snap-Overlay/ci.yml?branch=main&label=CI&style=flat-square)](https://github.com/Tijil-Das/Electron-Win11-Snap-Overlay/actions/workflows/ci.yml)
[![Platform](https://img.shields.io/badge/platform-Windows%2011%20%7C%2010%20%7C%20macOS%20%7C%20Linux-informational?style=flat-square)](https://www.microsoft.com/windows/windows-11)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](./LICENSE)

</div>

---

## ⚡ The Problem

When you build an Electron app with `titleBarStyle: 'hidden'` (custom HTML title bar), caption buttons (minimize, maximize, close) are rendered as HTML DOM elements inside Chromium's render surface.

On **Windows 11**, hovering over the maximize button is supposed to summon the native **Snap Layouts flyout** (the grid showing layouts to snap windows across screen regions).

However, the Snap Layouts flyout is a Desktop Window Manager (**DWM**) shell feature. DWM only triggers the flyout when the top-level Win32 window receives a `WM_NCMOUSEMOVE` message with `wParam == HTMAXBUTTON`. Because Chromium renders HTML buttons into a private DirectX surface, **DWM has no idea your HTML maximize button exists**, so the Snap Layouts flyout never appears.

---

## 💡 The Solution

`electron-win11-snap-overlay` creates a lightweight, borderless, transparent Win32 child window ("overlay HWND") positioned with sub-pixel precision directly over your HTML maximize button.

```
       ┌────────────────────────────────────────────────────────┐
       │   BrowserWindow (Top-Level Win32 HWND)                 │
       │                                                        │
       │   ┌──────────────────────────────┐ ┌───┐ ┌───┐ ┌───┐   │
       │   │ HTML Custom Title Bar        │ │ _ │ │ □ │ │ X │   │
       │   └──────────────────────────────┘ └───┘ └───┘ └───┘   │
       │                                            │           │
       │                                   ┌────────▼────────┐  │
       │                                   │ Native Overlay  │  │
       │                                   │   (Child HWND)  │  │
       │                                   └────────┬────────┘  │
       └────────────────────────────────────────────┼───────────┘
                                                    │
                Hover over overlay HWND             │
                WM_NCHITTEST returns HTMAXBUTTON    ▼
          DefWindowProcW(hParent, WM_NCMOUSEMOVE, HTMAXBUTTON, ...)
                                                    │
                                                    ▼
                               ┌────────────────────────────────┐
                               │ Native Windows 11 Snap Layouts │
                               │ Flyout Appears Instantly! ✨   │
                               └────────────────────────────────┘
```

### Key Technical Characteristics:
- **Transparent (`NULL_BRUSH`)**: No flicker, no rendering overhead — your HTML button styling remains 100% visible beneath it.
- **Bi-directional event bridge**: Emits `idle`, `hover`, `pressed`, and `click` state transitions via N-API so your HTML button reflects mouse interactions accurately.
- **DPI & Multi-Monitor Aware**: Automatically converts logical CSS pixels into native physical device pixels via `GetDpiForWindow`.
- **Z-Order Anchored**: Keeps the overlay HWND strictly above Chromium's internal render widget without stealing window focus.
- **100% Graceful Degradation**: On Windows 10, macOS, and Linux, the controller silently disables the overlay and lets your frontend use native CSS `:hover` / `:active` rules.

---

## 📦 Installation

```bash
npm install electron-win11-snap-overlay
```

The package ships with **prebuilt N-API binaries**. Because it targets Node-API (N-API), a single binary is ABI-compatible across **Electron 28 through 34+** — end users do not need python, Visual Studio, or `node-gyp`.

---

## 🚀 Quick Start

### 1. Main Process (`main.ts` / `main.js`)

Call `SnapController.getOrCreate(win)` right after creating your window:

```ts
import { app, BrowserWindow } from 'electron'
import { SnapController } from 'electron-win11-snap-overlay'

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    titleBarStyle: 'hidden', // Required: custom title bar
    titleBarOverlay: false,  // Disable Electron's built-in overlay
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  })

  // Safe across all operating systems:
  SnapController.getOrCreate(win)

  win.loadURL('http://localhost:3000')
})
```

---

### 2. Preload Script (`preload.ts` / `preload.js`)

Expose the IPC bridge through `contextBridge`:

```ts
import { contextBridge, ipcRenderer } from 'electron'
import { SNAP_IPC } from 'electron-win11-snap-overlay'

contextBridge.exposeInMainWorld('electronAPI', {
  snapLayout: {
    getSupportStatus: () => ipcRenderer.invoke(SNAP_IPC.getSupport),
    updateBounds: (bounds: { x: number; y: number; width: number; height: number }) =>
      ipcRenderer.send(SNAP_IPC.updateBounds, bounds),
    onStateChange: (callback: (state: 'idle' | 'hover' | 'pressed') => void) => {
      const handler = (_event: any, state: 'idle' | 'hover' | 'pressed') => callback(state)
      ipcRenderer.on(SNAP_IPC.stateChanged, handler)
      return () => ipcRenderer.removeListener(SNAP_IPC.stateChanged, handler)
    },
    onRequestBoundsUpdate: (callback: () => void) => {
      ipcRenderer.on(SNAP_IPC.requestBoundsUpdate, callback)
      return () => ipcRenderer.removeListener(SNAP_IPC.requestBoundsUpdate, callback)
    }
  },
  maximize: () => ipcRenderer.send('window:maximize'),
  unmaximize: () => ipcRenderer.send('window:unmaximize')
})
```

---

### 3. Renderer with React (`useSnapOverlay`)

Use the included `useSnapOverlay` React hook:

```tsx
import React, { useRef, useState, useEffect } from 'react'
import { useSnapOverlay } from 'electron-win11-snap-overlay/renderer'

export function WindowControls() {
  const [maximized, setMaximized] = useState(false)
  const maxBtnRef = useRef<HTMLButtonElement>(null)

  const snapBridge = window.electronAPI?.snapLayout
  const winApi = window.electronAPI

  const { isOverlayMode, dataHover, dataPressed } = useSnapOverlay(
    maxBtnRef,
    snapBridge,
    winApi,
    maximized
  )

  return (
    <div className="flex items-center">
      <button onClick={() => winApi?.minimize()} className="p-2 hover:bg-white/10">
        <MinimizeIcon />
      </button>

      {/* Maximize Button */}
      <button
        ref={maxBtnRef}
        data-hover={dataHover}
        data-pressed={dataPressed}
        onClick={() => (maximized ? winApi?.unmaximize() : winApi?.maximize())}
        className={
          isOverlayMode
            ? 'p-2 data-[hover=true]:bg-white/10 data-[pressed=true]:bg-white/20'
            : 'p-2 hover:bg-white/10 active:bg-white/20'
        }
      >
        {maximized ? <RestoreIcon /> : <MaximizeIcon />}
      </button>

      <button onClick={() => winApi?.close()} className="p-2 hover:bg-red-500">
        <CloseIcon />
      </button>
    </div>
  )
}
```

---

### 4. Renderer with Vanilla JavaScript

If you aren't using React, measure your DOM element with `getBoundingClientRect()` and send bounds to the main process:

```js
const maxBtn = document.getElementById('max-btn')

function sendBounds() {
  const r = maxBtn.getBoundingClientRect()
  window.electronAPI.snapLayout.updateBounds({
    x: Math.round(r.left),
    y: Math.round(r.top),
    width: Math.round(r.width),
    height: Math.round(r.height)
  })
}

// Measure on load and when the window resizes
window.addEventListener('resize', sendBounds)
window.electronAPI.snapLayout.onRequestBoundsUpdate(sendBounds)
sendBounds()

// Update button visuals when overlay intercepts mouse events
window.electronAPI.snapLayout.onStateChange((state) => {
  maxBtn.dataset.hover = state === 'hover'
  maxBtn.dataset.pressed = state === 'pressed'
})
```

---

## 🎛️ Advanced Usage

### Mini-Player / PiP Mode

If your application transitions into a compact mini-player or floating mode where caption controls are hidden, tell the controller to hide the native overlay HWND:

```ts
// Hide overlay HWND
SnapController.getByWindowId(win.id)?.setMiniPlayerMode(true)

// Restore overlay HWND when returning to normal view
SnapController.getByWindowId(win.id)?.setMiniPlayerMode(false)
```

---

## 🛡️ Cross-Platform Behavior

| Environment | Overlay Active? | Behavior |
|---|:---:|---|
| **Windows 11 (build ≥ 22000)** | ✅ Yes | Full native Snap Layouts flyout on hover |
| **Windows 10** | ❌ No | Seamless fallback: CSS `:hover` and `:active` rules fire normally |
| **macOS** | ❌ No | Seamless fallback: native macOS traffic lights or CSS hover |
| **Linux** | ❌ No | Seamless fallback: CSS `:hover` and `:active` rules fire normally |
| **Missing native binary** | ❌ No | Graceful degradation, zero runtime exceptions |

---

## 🧩 Compatibility

| Component | Supported Versions |
|---|---|
| **Electron** | 28, 29, 30, 31, 32, 33, 34+ |
| **Node.js** | ≥ 18.0.0 |
| **N-API ABI** | Node-API v8+ |
| **React** *(optional)* | ≥ 16.8 |
| **OS** | Windows 11 build 22000+ (for flyout), Windows 10, macOS, Linux (graceful degradation) |

---

## 🛠️ Contributing

Contributions are welcome! Please follow these steps:

1. Clone the repository:
   ```bash
   git clone https://github.com/Tijil-Das/Electron-Win11-Snap-Overlay.git
   cd Electron-Win11-Snap-Overlay
   ```
2. Install dependencies:
   ```bash
   npm install --ignore-scripts
   ```
3. Build the native addon:
   ```bash
   npx node-gyp rebuild
   ```
4. Compile TypeScript:
   ```bash
   npm run build
   ```

---

## 📄 License

[MIT](./LICENSE) © [Tijil Das](https://github.com/Tijil-Das)

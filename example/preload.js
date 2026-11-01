// example/preload.js — Electron preload script
'use strict'

const { contextBridge, ipcRenderer } = require('electron')

// Import the IPC channel name constants from the package
const { SNAP_IPC } = require('electron-win11-snap-overlay')

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Standard window controls ─────────────────────────────────────────────
  minimize:    () => ipcRenderer.send('window:minimize'),
  maximize:    () => ipcRenderer.send('window:maximize'),
  close:       () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),

  onMaximizedChange: (cb) => {
    const handler = (_event, value) => cb(value)
    ipcRenderer.on('window:maximized-changed', handler)
    return () => ipcRenderer.removeListener('window:maximized-changed', handler)
  },

  // ── Snap Layout bridge ───────────────────────────────────────────────────
  // These four methods are all useSnapOverlay / the vanilla JS example need.
  snapLayout: {
    getSupportStatus: () =>
      ipcRenderer.invoke(SNAP_IPC.getSupport),

    updateBounds: (bounds) =>
      ipcRenderer.send(SNAP_IPC.updateBounds, bounds),

    onStateChange: (cb) => {
      const handler = (_event, state) => cb(state)
      ipcRenderer.on(SNAP_IPC.stateChanged, handler)
      return () => ipcRenderer.removeListener(SNAP_IPC.stateChanged, handler)
    },

    onRequestBoundsUpdate: (cb) => {
      ipcRenderer.on(SNAP_IPC.requestBoundsUpdate, cb)
      return () => ipcRenderer.removeListener(SNAP_IPC.requestBoundsUpdate, cb)
    },
  },
})

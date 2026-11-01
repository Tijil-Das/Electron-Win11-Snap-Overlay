// example/main.js — Electron main process
'use strict'

const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')

// ── Import the package ───────────────────────────────────────────────────────
const { SnapController } = require('electron-win11-snap-overlay')

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    minWidth: 480,
    minHeight: 300,
    // Remove native title bar — we draw our own in HTML
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0a0a0a',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // ── One line. That's it. ─────────────────────────────────────────────────
  // Safe on all platforms — gracefully no-ops on Windows 10, macOS, Linux.
  SnapController.getOrCreate(mainWindow)
  // ────────────────────────────────────────────────────────────────────────

  // Standard window control IPC handlers
  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize()
    else mainWindow?.maximize()
    mainWindow?.webContents.send('window:maximized-changed', mainWindow?.isMaximized())
  })
  ipcMain.on('window:close', () => mainWindow?.close())
  ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized() ?? false)

  mainWindow.on('maximize',   () => mainWindow?.webContents.send('window:maximized-changed', true))
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window:maximized-changed', false))

  mainWindow.loadFile(path.join(__dirname, 'index.html'))
  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

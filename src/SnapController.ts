import { BrowserWindow, ipcMain, type IpcMainInvokeEvent, type IpcMainEvent } from 'electron'
import type { SnapBounds, SnapButtonState, SnapSupportStatus } from './types'
import { isWindows11OrNewer, validateSnapBounds } from './geometry'
import { loadSnapAddon, type SnapOverlayAddon } from './addonLoader'

/**
 * IPC channel names. Stable across package versions.
 */
export const SNAP_IPC = {
  getSupport:          'snap:get-support',
  updateBounds:        'snap:update-bounds',
  stateChanged:        'snap:state-changed',
  requestBoundsUpdate: 'snap:request-bounds-update',
} as const

/**
 * SnapController — per-window manager for the Win32 transparent overlay HWND.
 *
 * @example
 * ```ts
 * import { SnapController } from 'electron-win11-snap-overlay'
 * const win = new BrowserWindow({ titleBarStyle: 'hidden', ... })
 * SnapController.getOrCreate(win)
 * ```
 */
export class SnapController {
  private static readonly controllers = new Map<number, SnapController>()
  private static ipcRegistered = false

  private readonly win: BrowserWindow
  private readonly addon: SnapOverlayAddon | null = null
  private childHwnd: bigint | null = null
  private isDisposed = false
  private isMiniPlayer = false
  private currentState: SnapButtonState = 'idle'
  private readonly supported: boolean
  private readonly supportReason?: string

  private constructor(win: BrowserWindow) {
    this.win = win
    if (!isWindows11OrNewer()) {
      this.supported = false; this.supportReason = 'Windows 11 build 22000+ required'; return
    }
    if (!win.isResizable() || !win.isMaximizable()) {
      this.supported = false; this.supportReason = 'Window is not resizable or maximizable'; return
    }
    this.addon = loadSnapAddon()
    if (!this.addon) {
      this.supported = false; this.supportReason = 'Native addon unavailable'; return
    }
    this.supported = true
    this.initWindowListeners()
  }

  public static getOrCreate(win: BrowserWindow): SnapController {
    SnapController.ensureIpcHandlers()
    let ctrl = SnapController.controllers.get(win.id)
    if (!ctrl) { ctrl = new SnapController(win); SnapController.controllers.set(win.id, ctrl) }
    return ctrl
  }

  public static getByWindowId(id: number): SnapController | undefined {
    return SnapController.controllers.get(id)
  }

  public isSupported(): boolean { return this.supported && this.addon !== null }

  public getSupportStatus(): SnapSupportStatus {
    return { supported: this.isSupported(), reason: this.supportReason }
  }

  public setMiniPlayerMode(isMini: boolean): void {
    this.isMiniPlayer = isMini
    if (isMini) {
      this.setOverlayVisibility(false)
      if (this.childHwnd !== null && this.addon) {
        try { this.addon.updateRect(this.childHwnd, -1000, -1000, 0, 0) } catch { /* non-fatal */ }
      }
    } else {
      if (!this.win.isDestroyed()) this.requestRendererBounds()
    }
  }

  public updateButtonBounds(bounds: SnapBounds | null): void {
    if (this.isDisposed || !this.isSupported() || !this.addon || this.win.isDestroyed() || this.isMiniPlayer) {
      if (this.isMiniPlayer && this.childHwnd !== null && this.addon) {
        this.setOverlayVisibility(false)
        try { this.addon.updateRect(this.childHwnd, -1000, -1000, 0, 0) } catch { /* non-fatal */ }
      }
      return
    }
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
      this.setOverlayVisibility(false); return
    }
    if (this.childHwnd === null) {
      try {
        const hwndBuf = this.win.getNativeWindowHandle()
        this.childHwnd = this.addon.attach(
          hwndBuf, bounds.x, bounds.y, bounds.width, bounds.height,
          (event: string) => this.handleNativeEvent(event)
        )
      } catch (err) {
        console.warn('[SnapController] Failed to attach overlay window:', err)
        this.childHwnd = null
      }
    } else {
      this.addon.updateRect(this.childHwnd, bounds.x, bounds.y, bounds.width, bounds.height)
      this.setOverlayVisibility(!this.win.isFullScreen() && !this.win.isMinimized() && !this.isMiniPlayer)
    }
  }

  public dispose(): void {
    if (this.isDisposed) return
    this.isDisposed = true
    if (this.childHwnd !== null && this.addon) {
      try { this.addon.detach(this.childHwnd) } catch { /* non-fatal */ }
      this.childHwnd = null
    }
    SnapController.controllers.delete(this.win.id)
  }

  private static ensureIpcHandlers(): void {
    if (SnapController.ipcRegistered) return
    SnapController.ipcRegistered = true
    ipcMain.handle(SNAP_IPC.getSupport, (event: IpcMainInvokeEvent): SnapSupportStatus => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return { supported: false, reason: 'No window found' }
      return SnapController.controllers.get(win.id)?.getSupportStatus() ?? { supported: false, reason: 'Controller not initialised' }
    })
    ipcMain.on(SNAP_IPC.updateBounds, (event: IpcMainEvent, rawBounds: unknown): void => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win || event.sender.isDestroyed() || win.isDestroyed()) return
      const ctrl = SnapController.controllers.get(win.id)
      if (!ctrl?.isSupported()) return
      ctrl.updateButtonBounds(validateSnapBounds(rawBounds))
    })
  }

  private initWindowListeners(): void {
    if (this.win.isDestroyed()) return
    const onLayoutChange = (): void => {
      if (this.isDisposed || this.win.isDestroyed() || this.isMiniPlayer) return
      this.reassertTop(); this.requestRendererBounds()
    }
    this.win.on('resize', onLayoutChange)
    this.win.on('maximize', onLayoutChange)
    this.win.on('unmaximize', onLayoutChange)
    this.win.on('moved', onLayoutChange)
    this.win.on('focus', () => { if (!this.isDisposed && !this.win.isDestroyed() && !this.isMiniPlayer) this.reassertTop() })
    this.win.on('enter-full-screen', () => this.setOverlayVisibility(false))
    this.win.on('leave-full-screen', () => { if (!this.isMiniPlayer) { this.setOverlayVisibility(true); onLayoutChange() } })
    this.win.on('minimize', () => this.setOverlayVisibility(false))
    this.win.on('restore', () => { if (!this.isMiniPlayer) { this.setOverlayVisibility(true); onLayoutChange() } })
    this.win.webContents.on('did-finish-load', () => {
      if (!this.isDisposed && !this.win.isDestroyed() && !this.isMiniPlayer) { this.reassertTop(); this.requestRendererBounds() }
    })
    this.win.webContents.on('render-process-gone', () => this.setOverlayVisibility(false))
    this.win.once('closed', () => this.dispose())
  }

  private reassertTop(): void {
    if (this.isMiniPlayer || this.childHwnd === null || !this.addon || this.win.isDestroyed()) return
    if (this.win.isFullScreen() || this.win.isMinimized()) return
    try { this.addon.bringToTop(this.childHwnd) } catch { /* non-fatal */ }
  }

  private requestRendererBounds(): void {
    if (this.isMiniPlayer || this.win.isDestroyed() || this.isDisposed) return
    if (this.win.isFullScreen() || this.win.isMinimized()) return
    try { this.win.webContents.send(SNAP_IPC.requestBoundsUpdate) } catch { /* non-fatal */ }
  }

  private setOverlayVisibility(visible: boolean): void {
    if (this.childHwnd === null || !this.addon) return
    if (this.isMiniPlayer) visible = false
    try { this.addon.setVisible(this.childHwnd, visible) } catch { /* non-fatal */ }
  }

  private handleNativeEvent(event: string): void {
    if (this.isDisposed || this.win.isDestroyed()) return
    switch (event) {
      case 'enter':           this.sendState('hover');   break
      case 'leave':
      case 'cancel':          this.sendState('idle');    break
      case 'down':            this.sendState('pressed'); break
      case 'click':           this.sendState('idle');    this.toggleMaximize(); break
    }
  }

  private toggleMaximize(): void {
    if (this.win.isDestroyed()) return
    if (this.win.isFullScreen()) this.win.setFullScreen(false)
    if (this.win.isMaximized()) this.win.unmaximize()
    else this.win.maximize()
  }

  private sendState(state: SnapButtonState): void {
    if (this.currentState === state) return
    this.currentState = state
    if (!this.win.isDestroyed()) {
      try { this.win.webContents.send(SNAP_IPC.stateChanged, state) } catch { /* non-fatal */ }
    }
  }
}

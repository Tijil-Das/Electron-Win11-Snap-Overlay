import { useEffect, useRef, useState } from 'react'
import type { SnapBounds, SnapButtonState, SnapSupportStatus } from './types'

// ---------------------------------------------------------------------------
// Bridge interfaces — implement these in your Electron preload
// ---------------------------------------------------------------------------

/**
 * The snap-specific part of your preload bridge.
 * Wire these up using the SNAP_IPC channel names from SnapController.
 *
 * @example
 * ```ts
 * // preload.ts
 * import { SNAP_IPC } from 'electron-win11-snap-overlay'
 *
 * contextBridge.exposeInMainWorld('electronAPI', {
 *   snapLayout: {
 *     getSupportStatus: () => ipcRenderer.invoke(SNAP_IPC.getSupport),
 *     updateBounds: (b) => ipcRenderer.send(SNAP_IPC.updateBounds, b),
 *     onStateChange: (cb) => {
 *       const h = (_e, s) => cb(s)
 *       ipcRenderer.on(SNAP_IPC.stateChanged, h)
 *       return () => ipcRenderer.removeListener(SNAP_IPC.stateChanged, h)
 *     },
 *     onRequestBoundsUpdate: (cb) => {
 *       ipcRenderer.on(SNAP_IPC.requestBoundsUpdate, cb)
 *       return () => ipcRenderer.removeListener(SNAP_IPC.requestBoundsUpdate, cb)
 *     },
 *   },
 * })
 * ```
 */
export interface SnapBridgeAPI {
  getSupportStatus(): Promise<SnapSupportStatus>
  updateBounds(bounds: SnapBounds | null): void
  onStateChange(callback: (state: SnapButtonState) => void): () => void
  /** Optional — called by main process to request a bounds re-measurement */
  onRequestBoundsUpdate?(callback: () => void): () => void
}

/**
 * Optional window-level bridge for maximize / fullscreen change subscriptions.
 * These are used to trigger bounds re-measurement after Win11 animations settle.
 */
export interface WindowBridgeAPI {
  onMaximizedChange?(callback: (maximized: boolean) => void): () => void
  onFullscreenChange?(callback: (fullscreen: boolean) => void): () => void
}

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface UseSnapOverlayReturn {
  /**
   * True when the native addon is active on this system.
   * When false, use standard CSS `:hover` / `:active` on the button instead.
   */
  isOverlayMode: boolean
  /** Current button state from native Win32 mouse events. */
  buttonState: SnapButtonState
  /**
   * Pass as `data-hover` attribute on the maximize button.
   * `"true"` when hovered, `undefined` otherwise.
   * Only relevant when `isOverlayMode` is true.
   */
  dataHover: string | undefined
  /**
   * Pass as `data-pressed` attribute on the maximize button.
   * `"true"` when pressed, `undefined` otherwise.
   * Only relevant when `isOverlayMode` is true.
   */
  dataPressed: string | undefined
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * `useSnapOverlay` — wires the native Win32 overlay HWND to a React button ref.
 *
 * Handles:
 * - Platform support detection (Win11 build 22000+, addon availability)
 * - Subscribing to native `enter` / `leave` / `down` / `click` events
 * - Tracking the button's pixel bounds and reporting them to main via IPC
 * - Re-measuring on resize, DPI change, maximize, fullscreen, and window move
 *
 * @param buttonRef    - Ref attached to the HTML maximize / restore button element
 * @param snapBridge   - The snap bridge object from your preload (or null/undefined)
 * @param windowBridge - Optional: bridge for maximize/fullscreen change subscriptions
 * @param maximized    - Current maximized state; change triggers bounds re-measurement
 *
 * @example
 * ```tsx
 * import { useRef, useState, useEffect } from 'react'
 * import { useSnapOverlay } from 'electron-win11-snap-overlay/renderer'
 *
 * function WindowControls() {
 *   const [maximized, setMaximized] = useState(false)
 *   const maxBtnRef = useRef<HTMLButtonElement>(null)
 *
 *   const snap   = window.electronAPI?.snapLayout
 *   const winApi = window.electronAPI
 *   const { isOverlayMode, dataHover, dataPressed } = useSnapOverlay(
 *     maxBtnRef, snap, winApi, maximized
 *   )
 *
 *   return (
 *     <button
 *       ref={maxBtnRef}
 *       data-hover={dataHover}
 *       data-pressed={dataPressed}
 *       className={cn(
 *         isOverlayMode
 *           ? 'data-[hover=true]:bg-white/10 data-[pressed=true]:bg-white/20'
 *           : 'hover:bg-white/10 active:bg-white/20'
 *       )}
 *       onClick={() => winApi?.maximize()}
 *     />
 *   )
 * }
 * ```
 */
export function useSnapOverlay(
  buttonRef: React.RefObject<HTMLButtonElement | null>,
  snapBridge: SnapBridgeAPI | null | undefined,
  windowBridge?: WindowBridgeAPI | null,
  maximized?: boolean
): UseSnapOverlayReturn {
  const [isOverlayMode, setIsOverlayMode] = useState(false)
  const [buttonState, setButtonState] = useState<SnapButtonState>('idle')
  const lastBoundsRef = useRef<SnapBounds | null>(null)
  const scheduleUpdateRef = useRef<(() => void) | null>(null)

  // 1. Check platform support once on mount / bridge change
  useEffect(() => {
    if (!snapBridge) { setIsOverlayMode(false); return }
    let mounted = true
    snapBridge.getSupportStatus()
      .then(s => { if (mounted) setIsOverlayMode(Boolean(s?.supported)) })
      .catch(() => { if (mounted) setIsOverlayMode(false) })
    return () => { mounted = false }
  }, [snapBridge])

  // 2. Subscribe to native hover / press / click state
  useEffect(() => {
    if (!snapBridge || !isOverlayMode) { setButtonState('idle'); return }
    return snapBridge.onStateChange(setButtonState)
  }, [snapBridge, isOverlayMode])

  // 3. Track button pixel bounds and report to the main process
  useEffect(() => {
    if (!snapBridge || !isOverlayMode) return

    let rafId = 0
    let timers: ReturnType<typeof setTimeout>[] = []

    const sendBounds = (): void => {
      const el = buttonRef.current
      if (!el || !snapBridge) return

      const rect = el.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) {
        if (lastBoundsRef.current !== null) {
          lastBoundsRef.current = null
          snapBridge.updateBounds(null)
        }
        return
      }

      // getBoundingClientRect() -> CSS logical pixels
      // Win32 child window positioning -> physical pixels
      // Multiply by devicePixelRatio to convert correctly for all DPI settings.
      const scale  = window.devicePixelRatio || 1.0
      const left   = Math.round(rect.left   * scale)
      const top    = Math.round(rect.top    * scale)
      const right  = Math.round(rect.right  * scale)
      const bottom = Math.round(rect.bottom * scale)

      const next: SnapBounds = { x: left, y: top, width: right - left, height: bottom - top }

      // Skip IPC dispatch if integer pixel geometry has not changed
      const prev = lastBoundsRef.current
      if (
        prev &&
        prev.x === next.x && prev.y === next.y &&
        prev.width === next.width && prev.height === next.height
      ) return

      lastBoundsRef.current = next
      snapBridge.updateBounds(next)
    }

    const scheduleUpdate = (): void => {
      cancelAnimationFrame(rafId)
      timers.forEach(clearTimeout)
      timers = []

      // Immediate measurement on the next animation frame
      rafId = requestAnimationFrame(sendBounds)

      // Windows 11 snap / maximize animations last ~150 ms.
      // Staggered follow-ups guarantee the settled final geometry is captured.
      timers.push(setTimeout(sendBounds, 50))
      timers.push(setTimeout(sendBounds, 150))
      timers.push(setTimeout(sendBounds, 300))
    }

    scheduleUpdateRef.current = scheduleUpdate
    scheduleUpdate()

    // Viewport and button size changes
    const ro = new ResizeObserver(scheduleUpdate)
    if (document.documentElement) ro.observe(document.documentElement)
    if (buttonRef.current) ro.observe(buttonRef.current)
    window.addEventListener('resize', scheduleUpdate, { passive: true })

    // Main-process push (window moved, snapped into a zone, page reloaded)
    const offRequest = snapBridge.onRequestBoundsUpdate?.(scheduleUpdate)

    // Maximize / fullscreen state changes reposition the button
    const offMax = windowBridge?.onMaximizedChange?.(() => scheduleUpdate())
    const offFs  = windowBridge?.onFullscreenChange?.(() => scheduleUpdate())

    // DPI / display scaling changes (user moves window to another monitor)
    let mql: MediaQueryList | null = null
    const onDpiChange = (): void => { scheduleUpdate(); bindDpiListener() }
    const bindDpiListener = (): void => {
      mql?.removeEventListener('change', onDpiChange)
      mql = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
      mql.addEventListener('change', onDpiChange)
    }
    bindDpiListener()

    return () => {
      scheduleUpdateRef.current = null
      cancelAnimationFrame(rafId)
      timers.forEach(clearTimeout)
      ro.disconnect()
      window.removeEventListener('resize', scheduleUpdate)
      mql?.removeEventListener('change', onDpiChange)
      offRequest?.()
      offMax?.()
      offFs?.()
      if (snapBridge) {
        lastBoundsRef.current = null
        snapBridge.updateBounds(null)
      }
    }
  }, [snapBridge, isOverlayMode, buttonRef, windowBridge])

  // 4. Re-measure when maximized prop changes (without tearing down the overlay)
  useEffect(() => {
    scheduleUpdateRef.current?.()
  }, [maximized])

  return {
    isOverlayMode,
    buttonState,
    dataHover:    buttonState === 'hover'   ? 'true' : undefined,
    dataPressed:  buttonState === 'pressed' ? 'true' : undefined,
  }
}

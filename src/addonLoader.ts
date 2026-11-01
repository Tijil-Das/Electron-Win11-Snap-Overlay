import path from 'node:path'

export interface SnapOverlayAddon {
  attach(
    hwndBuffer: Buffer,
    x: number,
    y: number,
    width: number,
    height: number,
    callback: (event: string) => void
  ): bigint
  updateRect(childHwnd: bigint, x: number, y: number, width: number, height: number): boolean
  setVisible(childHwnd: bigint, visible: boolean): boolean
  bringToTop(childHwnd: bigint): boolean
  debugHitTest(childHwnd: bigint, screenX: number, screenY: number): number
  detach(childHwnd: bigint): boolean
}

let cachedAddon: SnapOverlayAddon | null = null
let hasAttemptedLoad = false

/**
 * Loads the native snap_overlay addon using node-gyp-build.
 * Searches prebuilds/ (bundled) then build/Release/ (local build).
 * Returns null on non-Windows or if the addon cannot be loaded.
 */
export function loadSnapAddon(): SnapOverlayAddon | null {
  if (hasAttemptedLoad) return cachedAddon
  hasAttemptedLoad = true

  if (process.platform !== 'win32') return null

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ngb = require('node-gyp-build') as (dir: string) => SnapOverlayAddon
    const addon = ngb(path.join(__dirname, '..'))
    if (typeof addon?.attach === 'function') {
      console.log('[electron-win11-snap-overlay] Native addon loaded successfully.')
      cachedAddon = addon
      return cachedAddon
    }
    console.warn('[electron-win11-snap-overlay] Addon loaded but attach() is missing.')
  } catch (err) {
    console.warn('[electron-win11-snap-overlay] Could not load native addon:', err)
    console.warn('[electron-win11-snap-overlay] Snap Layout flyout will be disabled.')
    console.warn('[electron-win11-snap-overlay] To build from source: node-gyp rebuild')
  }

  return null
}

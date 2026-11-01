/**
 * electron-win11-snap-overlay/renderer — Renderer process entry point
 *
 * Requires React >= 16.8 (peer dependency).
 *
 * @example
 * ```ts
 * import { useSnapOverlay } from 'electron-win11-snap-overlay/renderer'
 * ```
 */

export { useSnapOverlay } from './useSnapOverlay'
export type { UseSnapOverlayReturn, SnapBridgeAPI, WindowBridgeAPI } from './useSnapOverlay'
export type { SnapBounds, SnapButtonState, SnapSupportStatus } from './types'

/**
 * electron-win11-snap-overlay — Main process entry point
 *
 * @example
 * ```ts
 * import { SnapController, SNAP_IPC } from 'electron-win11-snap-overlay'
 * ```
 */

export { SnapController, SNAP_IPC } from './SnapController'
export { isWindows11OrNewer, validateSnapBounds, cssToPhysicalRect } from './geometry'
export { loadSnapAddon } from './addonLoader'
export type { SnapOverlayAddon } from './addonLoader'
export type { SnapBounds, SnapButtonState, SnapSupportStatus } from './types'

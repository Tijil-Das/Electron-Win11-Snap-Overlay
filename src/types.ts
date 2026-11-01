/** Physical pixel bounds of the maximize button in client-area coordinates. */
export interface SnapBounds {
  x: number
  y: number
  width: number
  height: number
}

/** Visual state of the maximize button as reported by the native overlay. */
export type SnapButtonState = 'idle' | 'hover' | 'pressed'

/** Result of querying whether snap layout overlay is supported on this system. */
export interface SnapSupportStatus {
  supported: boolean
  /** Human-readable reason when supported is false. */
  reason?: string
}

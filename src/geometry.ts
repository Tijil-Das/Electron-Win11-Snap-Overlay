import os from 'node:os'
import type { SnapBounds } from './types'

/**
 * Returns true on Windows 11 build 22000 or newer.
 * The Snap Layouts flyout was introduced in Windows 11 build 22000.
 */
export function isWindows11OrNewer(): boolean {
  if (process.platform !== 'win32') return false
  try {
    const parts = os.release().split('.')
    if (parts.length >= 3) return parseInt(parts[2], 10) >= 22000
    return false
  } catch {
    return false
  }
}

/**
 * Validates an untrusted IPC payload as SnapBounds.
 * Rejects non-finite values, out-of-range coordinates, and zero dimensions.
 */
export function validateSnapBounds(payload: unknown): SnapBounds | null {
  if (!payload || typeof payload !== 'object') return null
  const obj = payload as Record<string, unknown>
  const x = Number(obj.x)
  const y = Number(obj.y)
  const width = Number(obj.width)
  const height = Number(obj.height)
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) return null
  if (x < -500 || x > 30000) return null
  if (y < -500 || y > 30000) return null
  if (width <= 0 || width > 2000) return null
  if (height <= 0 || height > 1000) return null
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) }
}

/**
 * Converts a CSS logical pixel rect to physical Win32 pixels.
 */
export function cssToPhysicalRect(rect: SnapBounds, scaleFactor: number): SnapBounds {
  const sf = Math.max(0.25, Math.min(8.0, scaleFactor || 1.0))
  return {
    x:      Math.round(rect.x      * sf),
    y:      Math.round(rect.y      * sf),
    width:  Math.round(rect.width  * sf),
    height: Math.round(rect.height * sf)
  }
}

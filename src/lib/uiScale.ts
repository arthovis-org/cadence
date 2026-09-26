// UI scale is a per-device preference (a 2K monitor and a laptop want different sizes),
// so it lives in this browser's storage rather than in the database.
// Mantine sizes are in rem, so scaling the root font size scales the whole interface.

const KEY = 'cadence.uiScale'
export const UI_SCALE_MIN = 80
export const UI_SCALE_MAX = 150
export const UI_SCALE_DEFAULT = 100

export function getUiScale(): number {
  try {
    const v = Number(localStorage.getItem(KEY))
    if (v >= UI_SCALE_MIN && v <= UI_SCALE_MAX) return v
  } catch {
    // Storage unavailable: use the default.
  }
  return UI_SCALE_DEFAULT
}

export function applyUiScale(percent: number) {
  document.documentElement.style.fontSize = `${(16 * percent) / 100}px`
}

export function setUiScale(percent: number) {
  applyUiScale(percent)
  try {
    localStorage.setItem(KEY, String(percent))
  } catch {
    // Not critical: the scale still applies until the page reloads.
  }
}

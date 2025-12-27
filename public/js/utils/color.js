// Color manipulation utilities

export const adjustColor = (hex, percent) => {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, Math.max(0, (num >> 16) + percent))
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + percent))
  const b = Math.min(255, Math.max(0, (num & 0x0000FF) + percent))
  return '#' + (0x1000000 + (r << 16) + (g << 8) + b).toString(16).slice(1)
}

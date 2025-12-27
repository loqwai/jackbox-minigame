// Assign consistent colors to peers
import { CURSOR_COLORS } from '../constants/colors.js'

const peerColors = new Map()

export const getPeerColor = (peerId) => {
  if (!peerColors.has(peerId)) {
    peerColors.set(peerId, CURSOR_COLORS[peerColors.size % CURSOR_COLORS.length])
  }
  return peerColors.get(peerId)
}

export const clearPeerColor = (peerId) => {
  peerColors.delete(peerId)
}

export const resetPeerColors = () => {
  peerColors.clear()
}

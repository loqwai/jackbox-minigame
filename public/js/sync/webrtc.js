// WebRTC peer connection management
import { RTC_CONFIG } from '../constants/rtc.js'

// Global state
const peers = new Map()
const dataChannels = new Map()

let onPeerCountChange = () => {}
let onMessage = () => {}

export const setOnPeerCountChange = (fn) => { onPeerCountChange = fn }
export const setOnMessage = (fn) => { onMessage = fn }
export const getPeerCount = () => dataChannels.size
export const getDataChannels = () => dataChannels

const setupDataChannel = (peerId, dc) => {
  dc.onopen = () => {
    dataChannels.set(peerId, dc)
    onPeerCountChange()
  }
  dc.onclose = () => {
    dataChannels.delete(peerId)
    onPeerCountChange()
  }
  dc.onmessage = (e) => {
    try { onMessage(JSON.parse(e.data)) } catch {}
  }
}

export const cleanupPeer = (peerId) => {
  const pc = peers.get(peerId)
  if (pc) {
    pc.close()
    peers.delete(peerId)
  }
  dataChannels.delete(peerId)
  onPeerCountChange()
}

export const createPeerConnection = (peerId, isInitiator, ws) => {
  if (peers.has(peerId)) return peers.get(peerId)

  const pc = new RTCPeerConnection(RTC_CONFIG)
  peers.set(peerId, pc)

  pc.onicecandidate = (e) => {
    if (e.candidate && ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ice', to: peerId, candidate: e.candidate }))
    }
  }

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
      cleanupPeer(peerId)
    }
  }

  pc.ondatachannel = (e) => {
    setupDataChannel(peerId, e.channel)
  }

  if (isInitiator) {
    const dc = pc.createDataChannel('draw')
    setupDataChannel(peerId, dc)
    pc.createOffer()
      .then(offer => pc.setLocalDescription(offer))
      .then(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'offer', to: peerId, sdp: pc.localDescription }))
        }
      })
      .catch(() => {})
  }

  return pc
}

export const handleSignaling = (data, ws, onPeerLeft) => {
  if (data.type === 'peers') {
    data.peerIds.forEach(peerId => createPeerConnection(peerId, true, ws))
    return true
  }

  if (data.type === 'peer-joined') {
    return true
  }

  if (data.type === 'peer-left') {
    cleanupPeer(data.peerId)
    onPeerLeft?.(data.peerId)
    return true
  }

  if (data.type === 'offer') {
    const pc = createPeerConnection(data.from, false, ws)
    pc.setRemoteDescription(data.sdp)
      .then(() => pc.createAnswer())
      .then(answer => pc.setLocalDescription(answer))
      .then(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'answer', to: data.from, sdp: pc.localDescription }))
        }
      })
      .catch(() => {})
    return true
  }

  if (data.type === 'answer') {
    const pc = peers.get(data.from)
    if (pc) pc.setRemoteDescription(data.sdp).catch(() => {})
    return true
  }

  if (data.type === 'ice') {
    const pc = peers.get(data.from)
    if (pc) pc.addIceCandidate(data.candidate).catch(() => {})
    return true
  }

  return false
}

export const cleanupAllPeers = () => {
  peers.forEach((pc, id) => cleanupPeer(id))
}

export const broadcastToDataChannels = (message) => {
  const json = JSON.stringify(message)
  dataChannels.forEach(dc => {
    if (dc.readyState === 'open') dc.send(json)
  })
}

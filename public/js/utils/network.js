// Network utilities

export const getLocalIp = () => new Promise((resolve) => {
  const pc = new RTCPeerConnection({ iceServers: [] })
  pc.createDataChannel('')
  pc.createOffer().then(offer => pc.setLocalDescription(offer))
  pc.onicecandidate = (e) => {
    if (!e.candidate) return
    const match = e.candidate.candidate.match(/([0-9]{1,3}\.){3}[0-9]{1,3}/)
    if (match) {
      pc.close()
      resolve(match[0])
    }
  }
  setTimeout(() => {
    pc.close()
    resolve(null)
  }, 3000)
})

export const drawHtml = (roomId: string): string => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="theme-color" content="#1a1a2e">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <link rel="manifest" href="/manifest.json">
  <title>Draw - ${roomId}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; touch-action: none; user-select: none }
    html, body, #app {
      width: 100%; height: 100%; overflow: hidden;
      background: #1a1a2e;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif
    }
    .app { display: flex; flex-direction: column; height: 100% }
    .header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 8px 12px; background: #16213e; color: #fff; z-index: 10
    }
    .room-code { font-size: 18px; font-weight: bold; letter-spacing: 2px }
    .status { font-size: 12px; opacity: 0.7 }
    .user-count { font-size: 14px; opacity: 0.8 }
    .canvas-container {
      flex: 1; position: relative; overflow: hidden; background: #ffffff
    }
    #infinite-canvas {
      position: absolute; top: 0; left: 0;
      background: #ffffff;
      cursor: none
    }
    .toolbar {
      display: flex; flex-wrap: wrap; gap: 8px; padding: 10px;
      background: #16213e; justify-content: center; align-items: center; z-index: 10
    }
    .paint-bucket {
      position: relative; width: 44px; height: 52px;
      cursor: pointer; display: flex; flex-direction: column;
      align-items: center; transition: transform 0.1s
    }
    .paint-bucket:hover { transform: scale(1.1) }
    .paint-bucket.active { transform: scale(1.15) }
    .paint-bucket.empty { opacity: 0.5; cursor: not-allowed }
    .bucket-body {
      width: 28px; height: 24px; border-radius: 0 0 6px 6px;
      position: relative; overflow: hidden;
      border: 2px solid rgba(0,0,0,0.3); border-top: none
    }
    .bucket-rim {
      width: 34px; height: 6px; border-radius: 2px;
      border: 2px solid rgba(0,0,0,0.3); margin-bottom: -1px
    }
    .bucket-handle {
      position: absolute; top: -8px; left: 50%; transform: translateX(-50%);
      width: 18px; height: 10px; border: 3px solid rgba(0,0,0,0.4);
      border-bottom: none; border-radius: 8px 8px 0 0
    }
    .bucket-fill {
      position: absolute; bottom: 0; left: 0; right: 0;
      transition: height 0.3s ease
    }
    .paint-spill {
      position: absolute; top: 4px; right: -8px;
      width: 14px; height: 20px; border-radius: 0 0 50% 50%;
      transform: rotate(30deg); opacity: 0.9
    }
    .paint-drops {
      position: absolute; top: 22px; right: -6px;
      display: flex; flex-direction: column; gap: 3px
    }
    .paint-drop {
      width: 5px; height: 7px; border-radius: 50% 50% 50% 50%;
      animation: drip 1.5s ease-in-out infinite
    }
    .paint-drop:nth-child(2) { animation-delay: 0.5s; width: 4px; height: 5px }
    .paint-drop:nth-child(3) { animation-delay: 1s; width: 3px; height: 4px }
    @keyframes drip {
      0%, 100% { opacity: 0.8; transform: translateY(0) }
      50% { opacity: 0.4; transform: translateY(4px) }
    }
    .bucket-level {
      position: absolute; bottom: -4px; left: 50%; transform: translateX(-50%);
      font-size: 8px; color: #fff; font-weight: bold;
      text-shadow: 0 0 2px rgba(0,0,0,0.8)
    }
    .reload-bar {
      position: absolute; bottom: -8px; left: 0; right: 0;
      height: 3px; background: rgba(0,0,0,0.3); border-radius: 2px
    }
    .reload-progress {
      height: 100%; border-radius: 2px; transition: width 0.1s
    }
    .tool-btn {
      padding: 6px 12px; border: none; border-radius: 6px;
      background: #0f3460; color: #fff; font-size: 12px; cursor: pointer
    }
    .tool-btn.active { background: #e94560 }
    .size-slider {
      width: 60px; height: 6px; -webkit-appearance: none;
      background: #0f3460; border-radius: 3px
    }
    .size-slider::-webkit-slider-thumb {
      -webkit-appearance: none; width: 20px; height: 20px;
      border-radius: 50%; background: #e94560
    }
    .size-dot { background: #fff; border-radius: 50% }
    .zoom-display { color: #888; font-size: 11px; min-width: 40px; text-align: center }
    .offline-badge {
      background: #f39c12; color: #000; padding: 2px 6px;
      border-radius: 4px; font-size: 10px; font-weight: bold
    }
    .peer-count { font-size: 11px; color: #2ecc71 }
    .modal-overlay {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.85); z-index: 100;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      padding: 20px
    }
    .modal-content {
      background: #16213e; border-radius: 16px; padding: 24px;
      text-align: center; max-width: 320px; color: #fff
    }
    .modal-title { font-size: 20px; font-weight: bold; margin-bottom: 16px }
    .modal-subtitle { font-size: 14px; opacity: 0.8; margin-bottom: 20px }
    .qr-container {
      background: #fff; border-radius: 12px; padding: 16px;
      display: inline-block; margin-bottom: 16px
    }
    .qr-container svg { width: 180px; height: 180px }
    .url-display {
      font-size: 12px; color: #3498db; word-break: break-all;
      background: #0f3460; padding: 8px; border-radius: 6px; margin-bottom: 16px
    }
    .modal-close {
      background: #e94560; border: none; color: #fff;
      padding: 12px 32px; border-radius: 8px; font-size: 14px; cursor: pointer
    }
    .host-btn { background: #2ecc71 }
    .minimap {
      position: absolute; bottom: 12px; left: 12px;
      width: 140px; height: 140px;
      background: rgba(22, 33, 62, 0.85);
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-radius: 8px;
      overflow: hidden;
      pointer-events: none;
      z-index: 20
    }
    .minimap-inner {
      position: relative; width: 100%; height: 100%
    }
    .minimap-viewport {
      position: absolute;
      border: 1.5px solid rgba(255, 255, 255, 0.5);
      background: rgba(255, 255, 255, 0.1);
      pointer-events: none
    }
    .minimap-cursor {
      position: absolute; width: 8px; height: 8px;
      border-radius: 50%; transform: translate(-50%, -50%);
      border: 1.5px solid rgba(0, 0, 0, 0.5);
      box-shadow: 0 0 4px rgba(0, 0, 0, 0.3)
    }
    .minimap-cursor.self {
      width: 10px; height: 10px;
      border: 2px solid #fff;
      box-shadow: 0 0 6px rgba(255, 255, 255, 0.5)
    }
    .minimap-arrow {
      position: absolute; width: 0; height: 0;
      border-left: 6px solid transparent;
      border-right: 6px solid transparent;
      border-bottom: 10px solid;
      transform-origin: center bottom
    }
    .disabled-overlay {
      position: absolute; top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(233, 69, 96, 0.9);
      color: #fff; padding: 16px 32px;
      border-radius: 12px; font-size: 18px;
      font-weight: bold; z-index: 30;
      text-align: center; pointer-events: none;
      animation: pulse 0.5s ease-in-out infinite alternate
    }
    .disabled-timer {
      font-size: 32px; display: block; margin-top: 8px
    }
    @keyframes pulse {
      from { transform: translate(-50%, -50%) scale(1); }
      to { transform: translate(-50%, -50%) scale(1.05); }
    }
  </style>
</head>
<body>
  <div id="app"></div>

  <script type="module">
    import { render } from 'https://esm.sh/preact@10.25.4'
    import { useRef, useEffect, useState, useCallback } from 'https://esm.sh/preact@10.25.4/hooks'
    import { html } from 'https://esm.sh/htm@3.1.1/preact?deps=preact@10.25.4'
    import qrcode from 'https://esm.sh/qrcode-generator@1.4.4'

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }

    const ROOM_ID = "${roomId}"
    const COLORS = ["#000000", "#e94560", "#f39c12", "#2ecc71", "#3498db", "#9b59b6", "#1abc9c", "#ffffff"]

    // Global state
    let ws = null
    let peers = new Map()  // peerId -> RTCPeerConnection
    let dataChannels = new Map()  // peerId -> RTCDataChannel
    let myPeerId = Math.random().toString(36).substr(2, 9)
    let onPeerCountChange = () => {}
    let onMessage = (data) => {}
    let onCursorUpdate = (peerId, cursor) => {}

    // Assign colors to peers for visual distinction
    const CURSOR_COLORS = ['#e94560', '#f39c12', '#2ecc71', '#3498db', '#9b59b6', '#1abc9c', '#e74c3c', '#00cec9']
    const peerColors = new Map()  // peerId -> color
    const getPeerColor = (peerId) => {
      if (!peerColors.has(peerId)) {
        peerColors.set(peerId, CURSOR_COLORS[peerColors.size % CURSOR_COLORS.length])
      }
      return peerColors.get(peerId)
    }

    const RTC_CONFIG = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    }

    const createPeerConnection = (peerId, isInitiator) => {
      if (peers.has(peerId)) return peers.get(peerId)

      const pc = new RTCPeerConnection(RTC_CONFIG)
      peers.set(peerId, pc)

      pc.onicecandidate = (e) => {
        if (e.candidate && ws && ws.readyState === WebSocket.OPEN) {
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
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'offer', to: peerId, sdp: pc.localDescription }))
            }
          })
          .catch(() => {})
      }

      return pc
    }

    const setupDataChannel = (peerId, dc) => {
      dc.onopen = () => {
        dataChannels.set(peerId, dc)
        onPeerCountChange()
        // Request sync from peer when channel opens
        dc.send(JSON.stringify({ type: 'sync-request', from: myPeerId }))
      }
      dc.onclose = () => {
        dataChannels.delete(peerId)
        onPeerCountChange()
      }
      dc.onmessage = (e) => {
        try { onMessage(JSON.parse(e.data)) } catch {}
      }
    }

    const cleanupPeer = (peerId) => {
      const pc = peers.get(peerId)
      if (pc) {
        pc.close()
        peers.delete(peerId)
      }
      dataChannels.delete(peerId)
      onPeerCountChange()
    }

    const handleSignaling = (data) => {
      if (data.type === 'peers') {
        // Connect to all existing peers (we're the initiator)
        data.peerIds.forEach(peerId => createPeerConnection(peerId, true))
        return true
      }

      if (data.type === 'peer-joined') {
        // New peer joined, they'll initiate connection to us
        return true
      }

      if (data.type === 'peer-left') {
        cleanupPeer(data.peerId)
        onCursorUpdate(data.peerId, null)  // Remove cursor
        peerColors.delete(data.peerId)
        return true
      }

      if (data.type === 'offer') {
        const pc = createPeerConnection(data.from, false)
        pc.setRemoteDescription(data.sdp)
          .then(() => pc.createAnswer())
          .then(answer => pc.setLocalDescription(answer))
          .then(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
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

    // Get local IP address via WebRTC (for hotspot hosting)
    const getLocalIp = () => new Promise((resolve) => {
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

    // Generate QR code SVG using qrcode-generator
    const generateQrSvg = (text) => {
      const qr = qrcode(0, 'M')
      qr.addData(text)
      qr.make()
      return qr.createSvgTag({ cellSize: 6, margin: 2 })
    }

    const App = () => {
      const [userCount, setUserCount] = useState(0)
      const [connected, setConnected] = useState(false)
      const [online, setOnline] = useState(navigator.onLine)
      const [peerCount, setPeerCount] = useState(0)
      const [currentColor, setCurrentColor] = useState("#000000")
      const [brushSize, setBrushSize] = useState(5)
      const [isEraser, setIsEraser] = useState(false)
      const [tempEraser, setTempEraser] = useState(false)
      const [view, setView] = useState({ zoom: 1, panX: 0, panY: 0 })
      const [showHost, setShowHost] = useState(false)
      const [localIp, setLocalIp] = useState(null)
      const [qrSvg, setQrSvg] = useState(null)
      const [remoteCursors, setRemoteCursors] = useState(new Map())  // peerId -> {x, y}
      const myCursor = useRef({ x: 0, y: 0 })  // My cursor in world coordinates
      const [drawDisabled, setDrawDisabled] = useState(false)
      const [disabledTimer, setDisabledTimer] = useState(0)
      const enemies = useRef([])  // Array of {x, y, id} in world coordinates
      const ENEMY_SIZE = 25  // Enemy radius in world units
      const ENEMY_SPEED = 140  // Pixels per second in world units (faster!)
      const ENEMY_COUNT = 3  // Number of enemies
      const DISABLE_DURATION = 5  // Seconds player can't draw
      const LINE_BREAK_INTERVAL = 10000  // ms between line break attempts
      const LINE_BREAK_CHANCE = 0.5  // 50% chance to break a line

      // Paint system - each color has limited paint that reloads
      const MAX_PAINT = 100
      const PAINT_RELOAD_RATE = 8  // Units per second
      const PAINT_USE_RATE = 0.5  // Per pixel drawn (adjusted by brush size)
      const initPaintLevels = () => {
        const levels = {}
        COLORS.forEach(c => { levels[c] = MAX_PAINT })
        return levels
      }
      const [paintLevels, setPaintLevels] = useState(initPaintLevels)
      const paintLevelsRef = useRef(paintLevels)
      useEffect(() => { paintLevelsRef.current = paintLevels }, [paintLevels])

      // Paint pickups
      const pickups = useRef([])  // Array of {x, y, id, color}
      const PICKUP_SIZE = 20
      const PICKUP_SPAWN_INTERVAL = 10000  // ms between spawns
      const MAX_PICKUPS = 5

      const canvasRef = useRef(null)
      const containerRef = useRef(null)
      const ctxRef = useRef(null)
      const isDrawing = useRef(false)
      const activePointers = useRef(new Map())  // pointerId -> {x, y}
      const gestureState = useRef({ active: false, lastMid: null, lastDist: null })
      const currentPoints = useRef([])
      const allStrokes = useRef([])  // Store all strokes for redraw
      const currentColorRef = useRef(currentColor)  // For renderCanvas access
      const isEraserRef = useRef(isEraser)
      const brushSizeRef = useRef(brushSize)

      // Online/offline detection
      useEffect(() => {
        const handleOnline = () => setOnline(true)
        const handleOffline = () => setOnline(false)
        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)
        return () => {
          window.removeEventListener('online', handleOnline)
          window.removeEventListener('offline', handleOffline)
        }
      }, [])

      // Store view in ref for render function
      const viewRef = useRef(view)
      useEffect(() => { viewRef.current = view }, [view])

      // Keep color/brush refs in sync
      useEffect(() => { currentColorRef.current = currentColor }, [currentColor])
      useEffect(() => { isEraserRef.current = isEraser }, [isEraser])
      useEffect(() => { brushSizeRef.current = brushSize }, [brushSize])

      // Helper to lighten/darken colors for gradients
      const adjustColor = (hex, percent) => {
        const num = parseInt(hex.replace('#', ''), 16)
        const r = Math.min(255, Math.max(0, (num >> 16) + percent))
        const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + percent))
        const b = Math.min(255, Math.max(0, (num & 0x0000FF) + percent))
        return '#' + (0x1000000 + (r << 16) + (g << 8) + b).toString(16).slice(1)
      }

      // Render all strokes with current transform
      const renderCanvas = useCallback(() => {
        const ctx = ctxRef.current
        const canvas = canvasRef.current
        const v = viewRef.current
        if (!ctx || !canvas) return

        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.save()
        ctx.translate(v.panX, v.panY)
        ctx.scale(v.zoom, v.zoom)

        // Draw all strokes
        allStrokes.current.forEach(s => {
          if (s.points.length < 2) return
          ctx.strokeStyle = s.color
          ctx.lineWidth = s.size
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          ctx.beginPath()
          ctx.moveTo(s.points[0].x, s.points[0].y)
          for (let i = 1; i < s.points.length; i++) {
            ctx.lineTo(s.points[i].x, s.points[i].y)
          }
          ctx.stroke()
        })

        // Draw current stroke in progress (fixes visibility while drawing)
        if (currentPoints.current.length >= 2) {
          const color = isEraserRef.current ? '#ffffff' : currentColorRef.current
          ctx.strokeStyle = color
          ctx.lineWidth = brushSizeRef.current
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          ctx.beginPath()
          ctx.moveTo(currentPoints.current[0].x, currentPoints.current[0].y)
          for (let i = 1; i < currentPoints.current.length; i++) {
            ctx.lineTo(currentPoints.current[i].x, currentPoints.current[i].y)
          }
          ctx.stroke()
        }

        // Draw enemies - scale size with zoom so they stay consistent on screen
        const enemyColor = currentColorRef.current === '#ffffff' ? '#e94560' : currentColorRef.current
        const scaledEnemySize = ENEMY_SIZE / v.zoom  // Keeps screen size consistent

        enemies.current.forEach(enemy => {
          // Enemy body with gradient matching selected color
          const gradient = ctx.createRadialGradient(enemy.x, enemy.y, 0, enemy.x, enemy.y, scaledEnemySize)
          gradient.addColorStop(0, adjustColor(enemyColor, 60))
          gradient.addColorStop(0.7, enemyColor)
          gradient.addColorStop(1, adjustColor(enemyColor, -40))
          ctx.fillStyle = gradient
          ctx.beginPath()
          ctx.arc(enemy.x, enemy.y, scaledEnemySize, 0, Math.PI * 2)
          ctx.fill()

          // Enemy eyes (looking toward player) - scale with zoom
          const dx = myCursor.current.x - enemy.x
          const dy = myCursor.current.y - enemy.y
          const angle = Math.atan2(dy, dx)
          const eyeOffset = 8 / v.zoom
          const eyeRadius = 5 / v.zoom
          const pupilRadius = 2.5 / v.zoom
          const pupilOffset = 2 / v.zoom

          // Left eye
          const leftEyeX = enemy.x + Math.cos(angle - 0.4) * eyeOffset
          const leftEyeY = enemy.y + Math.sin(angle - 0.4) * eyeOffset
          ctx.fillStyle = '#fff'
          ctx.beginPath()
          ctx.arc(leftEyeX, leftEyeY, eyeRadius, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = '#000'
          ctx.beginPath()
          ctx.arc(leftEyeX + Math.cos(angle) * pupilOffset, leftEyeY + Math.sin(angle) * pupilOffset, pupilRadius, 0, Math.PI * 2)
          ctx.fill()

          // Right eye
          const rightEyeX = enemy.x + Math.cos(angle + 0.4) * eyeOffset
          const rightEyeY = enemy.y + Math.sin(angle + 0.4) * eyeOffset
          ctx.fillStyle = '#fff'
          ctx.beginPath()
          ctx.arc(rightEyeX, rightEyeY, eyeRadius, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = '#000'
          ctx.beginPath()
          ctx.arc(rightEyeX + Math.cos(angle) * pupilOffset, rightEyeY + Math.sin(angle) * pupilOffset, pupilRadius, 0, Math.PI * 2)
          ctx.fill()
        })

        // Draw paint pickups (paint cans)
        const scaledPickupSize = PICKUP_SIZE / v.zoom
        pickups.current.forEach(pickup => {
          // Paint can body
          const canGradient = ctx.createLinearGradient(
            pickup.x - scaledPickupSize, pickup.y,
            pickup.x + scaledPickupSize, pickup.y
          )
          canGradient.addColorStop(0, adjustColor(pickup.color, -30))
          canGradient.addColorStop(0.5, pickup.color)
          canGradient.addColorStop(1, adjustColor(pickup.color, -30))

          // Can body
          ctx.fillStyle = canGradient
          ctx.beginPath()
          ctx.roundRect(
            pickup.x - scaledPickupSize * 0.7,
            pickup.y - scaledPickupSize * 0.5,
            scaledPickupSize * 1.4,
            scaledPickupSize * 1.2,
            scaledPickupSize * 0.2
          )
          ctx.fill()

          // Can rim (top)
          ctx.fillStyle = adjustColor(pickup.color, 40)
          ctx.beginPath()
          ctx.ellipse(pickup.x, pickup.y - scaledPickupSize * 0.5,
            scaledPickupSize * 0.8, scaledPickupSize * 0.25, 0, 0, Math.PI * 2)
          ctx.fill()

          // Paint drip
          ctx.fillStyle = pickup.color
          ctx.beginPath()
          ctx.ellipse(pickup.x + scaledPickupSize * 0.5, pickup.y,
            scaledPickupSize * 0.2, scaledPickupSize * 0.4, 0.3, 0, Math.PI * 2)
          ctx.fill()

          // Sparkle effect
          ctx.fillStyle = 'rgba(255,255,255,0.8)'
          ctx.beginPath()
          ctx.arc(pickup.x - scaledPickupSize * 0.3, pickup.y - scaledPickupSize * 0.3,
            scaledPickupSize * 0.15, 0, Math.PI * 2)
          ctx.fill()
        })

        // Draw Splatoon-inspired player character (squid kid)
        const playerX = myCursor.current.x
        const playerY = myCursor.current.y
        const playerSize = 20 / v.zoom  // Consistent screen size
        const playerColor = currentColorRef.current === '#ffffff' ? '#e94560' : currentColorRef.current

        // Calculate facing direction based on recent movement
        const lastPoints = currentPoints.current
        let facingAngle = 0
        if (lastPoints.length >= 2) {
          const p1 = lastPoints[lastPoints.length - 2]
          const p2 = lastPoints[lastPoints.length - 1]
          facingAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x)
        }

        // Squid body (rounded blob shape)
        const bodyGradient = ctx.createRadialGradient(
          playerX, playerY - playerSize * 0.2, 0,
          playerX, playerY, playerSize * 1.2
        )
        bodyGradient.addColorStop(0, adjustColor(playerColor, 50))
        bodyGradient.addColorStop(0.6, playerColor)
        bodyGradient.addColorStop(1, adjustColor(playerColor, -40))

        ctx.fillStyle = bodyGradient
        ctx.beginPath()
        ctx.ellipse(playerX, playerY, playerSize * 0.9, playerSize * 1.1, 0, 0, Math.PI * 2)
        ctx.fill()

        // Tentacles (6 wavy legs at the bottom)
        const tentacleCount = 6
        for (let i = 0; i < tentacleCount; i++) {
          const angle = (Math.PI * 0.3) + (i / (tentacleCount - 1)) * (Math.PI * 0.4)
          const wobble = Math.sin(Date.now() / 150 + i) * playerSize * 0.15
          const tentacleLen = playerSize * 0.8

          const startX = playerX + Math.cos(angle + Math.PI * 0.5) * playerSize * 0.5
          const startY = playerY + playerSize * 0.7
          const endX = startX + Math.cos(angle + Math.PI * 0.5) * tentacleLen + wobble
          const endY = startY + Math.sin(Math.PI * 0.5) * tentacleLen

          ctx.strokeStyle = playerColor
          ctx.lineWidth = playerSize * 0.15
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(startX, startY)
          ctx.quadraticCurveTo(startX + wobble * 0.5, startY + tentacleLen * 0.5, endX, endY)
          ctx.stroke()
        }

        // Eyes (big cute eyes)
        const eyeOffsetX = playerSize * 0.3
        const eyeOffsetY = -playerSize * 0.1
        const eyeSize = playerSize * 0.35

        // Left eye white
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        ctx.ellipse(playerX - eyeOffsetX, playerY + eyeOffsetY, eyeSize, eyeSize * 1.2, 0, 0, Math.PI * 2)
        ctx.fill()

        // Right eye white
        ctx.beginPath()
        ctx.ellipse(playerX + eyeOffsetX, playerY + eyeOffsetY, eyeSize, eyeSize * 1.2, 0, 0, Math.PI * 2)
        ctx.fill()

        // Pupils (look in facing direction)
        const pupilOffset = eyeSize * 0.25
        const pupilX = Math.cos(facingAngle) * pupilOffset
        const pupilY = Math.sin(facingAngle) * pupilOffset
        const pupilSize = eyeSize * 0.5

        ctx.fillStyle = '#000'
        ctx.beginPath()
        ctx.arc(playerX - eyeOffsetX + pupilX, playerY + eyeOffsetY + pupilY, pupilSize, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.arc(playerX + eyeOffsetX + pupilX, playerY + eyeOffsetY + pupilY, pupilSize, 0, Math.PI * 2)
        ctx.fill()

        // Eye highlights
        ctx.fillStyle = 'rgba(255,255,255,0.8)'
        ctx.beginPath()
        ctx.arc(playerX - eyeOffsetX - pupilSize * 0.3, playerY + eyeOffsetY - pupilSize * 0.3, pupilSize * 0.4, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.arc(playerX + eyeOffsetX - pupilSize * 0.3, playerY + eyeOffsetY - pupilSize * 0.3, pupilSize * 0.4, 0, Math.PI * 2)
        ctx.fill()

        // Ink splatter effect when drawing
        if (isDrawing.current && !isEraserRef.current && currentPoints.current.length > 1) {
          const inkSpots = 5
          for (let i = 0; i < inkSpots; i++) {
            const spreadAngle = facingAngle + (Math.random() - 0.5) * 1.2
            const spreadDist = playerSize * (1.5 + Math.random() * 2)
            const spotX = playerX + Math.cos(spreadAngle) * spreadDist
            const spotY = playerY + Math.sin(spreadAngle) * spreadDist
            const spotSize = playerSize * (0.1 + Math.random() * 0.2)

            ctx.fillStyle = playerColor
            ctx.globalAlpha = 0.3 + Math.random() * 0.4
            ctx.beginPath()
            ctx.arc(spotX, spotY, spotSize, 0, Math.PI * 2)
            ctx.fill()
          }
          ctx.globalAlpha = 1
        }

        // Top of head (pointy squid top)
        ctx.fillStyle = playerColor
        ctx.beginPath()
        ctx.moveTo(playerX, playerY - playerSize * 1.4)
        ctx.lineTo(playerX - playerSize * 0.3, playerY - playerSize * 0.5)
        ctx.lineTo(playerX + playerSize * 0.3, playerY - playerSize * 0.5)
        ctx.closePath()
        ctx.fill()

        ctx.restore()
      }, [])

      // Initialize canvas to fill container
      useEffect(() => {
        const canvas = canvasRef.current
        const container = containerRef.current
        if (!canvas || !container) return

        const resize = () => {
          const rect = container.getBoundingClientRect()
          canvas.width = rect.width
          canvas.height = rect.height
          canvas.style.width = rect.width + 'px'
          canvas.style.height = rect.height + 'px'
          ctxRef.current = canvas.getContext('2d')
          ctxRef.current.lineCap = 'round'
          ctxRef.current.lineJoin = 'round'
          renderCanvas()
        }

        resize()
        window.addEventListener('resize', resize)
        return () => window.removeEventListener('resize', resize)
      }, [renderCanvas])

      // Re-render when view changes
      useEffect(() => {
        renderCanvas()
      }, [view, renderCanvas])

      // Check if a point collides with any stroke (for enemy pathfinding)
      const collidesWithStroke = useCallback((x, y, radius) => {
        for (const stroke of allStrokes.current) {
          if (stroke.color === '#ffffff') continue  // Skip eraser strokes
          for (let i = 0; i < stroke.points.length - 1; i++) {
            const p1 = stroke.points[i]
            const p2 = stroke.points[i + 1]
            // Point-to-line-segment distance
            const dx = p2.x - p1.x
            const dy = p2.y - p1.y
            const len2 = dx * dx + dy * dy
            let t = 0
            if (len2 > 0) {
              t = Math.max(0, Math.min(1, ((x - p1.x) * dx + (y - p1.y) * dy) / len2))
            }
            const nearX = p1.x + t * dx
            const nearY = p1.y + t * dy
            const dist = Math.hypot(x - nearX, y - nearY)
            if (dist < radius + stroke.size / 2) return true
          }
        }
        return false
      }, [])

      // Spawn enemies at random positions around the player
      const spawnEnemies = useCallback(() => {
        const newEnemies = []
        for (let i = 0; i < ENEMY_COUNT; i++) {
          const angle = Math.random() * Math.PI * 2
          const distance = 400 + Math.random() * 300  // Spawn 400-700 units away
          let x = myCursor.current.x + Math.cos(angle) * distance
          let y = myCursor.current.y + Math.sin(angle) * distance
          // Make sure spawn point isn't inside a stroke
          let attempts = 0
          while (collidesWithStroke(x, y, ENEMY_SIZE) && attempts < 10) {
            const newAngle = Math.random() * Math.PI * 2
            x = myCursor.current.x + Math.cos(newAngle) * distance
            y = myCursor.current.y + Math.sin(newAngle) * distance
            attempts++
          }
          newEnemies.push({ x, y, id: i })
        }
        enemies.current = newEnemies
      }, [collidesWithStroke])

      // Game loop - enemy movement and collision detection
      useEffect(() => {
        let lastTime = performance.now()
        let animationId = null
        let spawned = false

        const gameLoop = (currentTime) => {
          const deltaTime = (currentTime - lastTime) / 1000  // Convert to seconds
          lastTime = currentTime

          // Spawn enemies on first run
          if (!spawned) {
            spawnEnemies()
            spawned = true
          }

          // Update each enemy
          let playerHit = false
          enemies.current = enemies.current.map(enemy => {
            // Direction toward player
            const dx = myCursor.current.x - enemy.x
            const dy = myCursor.current.y - enemy.y
            const dist = Math.hypot(dx, dy)

            // Check if touching player (cursor)
            if (dist < ENEMY_SIZE + 10) {  // 10 = cursor "hitbox"
              playerHit = true
            }

            // Don't move if very close
            if (dist < ENEMY_SIZE) {
              return enemy
            }

            // Normalize direction
            const dirX = dx / dist
            const dirY = dy / dist

            // Calculate new position
            const moveSpeed = ENEMY_SPEED * deltaTime
            let newX = enemy.x + dirX * moveSpeed
            let newY = enemy.y + dirY * moveSpeed

            // Check collision with strokes - improved pathfinding
            if (collidesWithStroke(newX, newY, ENEMY_SIZE)) {
              // Try moving only in X
              if (!collidesWithStroke(newX, enemy.y, ENEMY_SIZE)) {
                return { ...enemy, x: newX, wallFollowDir: enemy.wallFollowDir || 1 }
              }
              // Try moving only in Y
              if (!collidesWithStroke(enemy.x, newY, ENEMY_SIZE)) {
                return { ...enemy, y: newY, wallFollowDir: enemy.wallFollowDir || 1 }
              }

              // Wall following - try perpendicular directions
              const perpDir = enemy.wallFollowDir || (Math.random() > 0.5 ? 1 : -1)
              const perpX = -dirY * perpDir
              const perpY = dirX * perpDir
              const slideX = enemy.x + perpX * moveSpeed * 1.5
              const slideY = enemy.y + perpY * moveSpeed * 1.5

              if (!collidesWithStroke(slideX, slideY, ENEMY_SIZE)) {
                return { ...enemy, x: slideX, y: slideY, wallFollowDir: perpDir }
              }

              // Try opposite perpendicular
              const oppSlideX = enemy.x - perpX * moveSpeed * 1.5
              const oppSlideY = enemy.y - perpY * moveSpeed * 1.5
              if (!collidesWithStroke(oppSlideX, oppSlideY, ENEMY_SIZE)) {
                return { ...enemy, x: oppSlideX, y: oppSlideY, wallFollowDir: -perpDir }
              }

              // Still stuck - try random direction
              const randAngle = Math.random() * Math.PI * 2
              const randX = enemy.x + Math.cos(randAngle) * moveSpeed
              const randY = enemy.y + Math.sin(randAngle) * moveSpeed
              if (!collidesWithStroke(randX, randY, ENEMY_SIZE)) {
                return { ...enemy, x: randX, y: randY }
              }

              return enemy
            }

            // Clear wall follow direction when not blocked
            return { ...enemy, x: newX, y: newY, wallFollowDir: null }
          })

          // Disable drawing if player was hit
          if (playerHit && !drawDisabled) {
            setDrawDisabled(true)
            setDisabledTimer(DISABLE_DURATION)

            // Respawn the enemy that hit the player far away
            enemies.current = enemies.current.map(enemy => {
              const dx = myCursor.current.x - enemy.x
              const dy = myCursor.current.y - enemy.y
              if (Math.hypot(dx, dy) < ENEMY_SIZE + 15) {
                const angle = Math.random() * Math.PI * 2
                const distance = 500 + Math.random() * 300
                return {
                  ...enemy,
                  x: myCursor.current.x + Math.cos(angle) * distance,
                  y: myCursor.current.y + Math.sin(angle) * distance
                }
              }
              return enemy
            })
          }

          // Reload paint over time (all colors reload slowly)
          setPaintLevels(prev => {
            const next = { ...prev }
            let changed = false
            COLORS.forEach(c => {
              if (c !== '#ffffff' && next[c] < MAX_PAINT) {
                next[c] = Math.min(MAX_PAINT, next[c] + PAINT_RELOAD_RATE * deltaTime)
                changed = true
              }
            })
            return changed ? next : prev
          })

          // Check pickup collision
          pickups.current = pickups.current.filter(pickup => {
            const dx = myCursor.current.x - pickup.x
            const dy = myCursor.current.y - pickup.y
            if (Math.hypot(dx, dy) < PICKUP_SIZE + 15) {
              // Collected! Instantly refill that color
              setPaintLevels(prev => ({
                ...prev,
                [pickup.color]: MAX_PAINT
              }))
              return false  // Remove pickup
            }
            return true
          })

          renderCanvas()
          animationId = requestAnimationFrame(gameLoop)
        }

        animationId = requestAnimationFrame(gameLoop)
        return () => {
          if (animationId) cancelAnimationFrame(animationId)
        }
      }, [renderCanvas, spawnEnemies, collidesWithStroke, drawDisabled])

      // Disabled timer countdown
      useEffect(() => {
        if (!drawDisabled) return

        const interval = setInterval(() => {
          setDisabledTimer(prev => {
            if (prev <= 1) {
              setDrawDisabled(false)
              return 0
            }
            return prev - 1
          })
        }, 1000)

        return () => clearInterval(interval)
      }, [drawDisabled])

      // Spawn paint pickups periodically
      useEffect(() => {
        const spawnPickup = () => {
          if (pickups.current.length >= MAX_PICKUPS) return

          // Spawn near player but not too close
          const angle = Math.random() * Math.PI * 2
          const distance = 200 + Math.random() * 400
          const x = myCursor.current.x + Math.cos(angle) * distance
          const y = myCursor.current.y + Math.sin(angle) * distance

          // Random color (not white)
          const colorOptions = COLORS.filter(c => c !== '#ffffff')
          const color = colorOptions[Math.floor(Math.random() * colorOptions.length)]

          pickups.current.push({
            x, y,
            id: Date.now() + Math.random(),
            color
          })
        }

        // Spawn initial pickups
        for (let i = 0; i < 3; i++) spawnPickup()

        const interval = setInterval(spawnPickup, PICKUP_SPAWN_INTERVAL)
        return () => clearInterval(interval)
      }, [])

      // Enemy line breaking - 50% chance every 10 seconds to break nearby drawings
      useEffect(() => {
        const tryBreakLines = () => {
          enemies.current.forEach(enemy => {
            if (Math.random() > LINE_BREAK_CHANCE) return  // 50% chance

            // Find strokes near this enemy
            let closestIdx = -1
            let closestDist = Infinity

            allStrokes.current.forEach((stroke, idx) => {
              if (stroke.color === '#ffffff') return  // Skip eraser strokes
              stroke.points.forEach(point => {
                const dist = Math.hypot(point.x - enemy.x, point.y - enemy.y)
                if (dist < closestDist && dist < 200) {  // Within 200 units
                  closestDist = dist
                  closestIdx = idx
                }
              })
            })

            // Break the closest stroke
            if (closestIdx >= 0) {
              allStrokes.current.splice(closestIdx, 1)
            }
          })
        }

        const interval = setInterval(tryBreakLines, LINE_BREAK_INTERVAL)
        return () => clearInterval(interval)
      }, [])

      // Draw stroke in world coordinates (applies current transform)
      const drawStrokeWorld = useCallback((points, color, size) => {
        const ctx = ctxRef.current
        const v = viewRef.current
        if (!ctx || points.length < 2) return
        ctx.save()
        ctx.translate(v.panX, v.panY)
        ctx.scale(v.zoom, v.zoom)
        ctx.strokeStyle = color
        ctx.lineWidth = size
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        ctx.moveTo(points[0].x, points[0].y)
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y)
        }
        ctx.stroke()
        ctx.restore()
      }, [])

      const clearCanvas = useCallback(() => {
        const ctx = ctxRef.current
        if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
        allStrokes.current = []
      }, [])

      const broadcastStroke = useCallback((stroke) => {
        const msg = JSON.stringify({ type: 'stroke', ...stroke, from: myPeerId })
        // Send via WebSocket
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'stroke', ...stroke }))
        }
        // Send via WebRTC data channels
        dataChannels.forEach((dc) => {
          if (dc.readyState === 'open') {
            try { dc.send(msg) } catch {}
          }
        })
      }, [])

      const broadcastClear = useCallback(() => {
        const msg = JSON.stringify({ type: 'clear', from: myPeerId })
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'clear' }))
        }
        dataChannels.forEach((dc) => {
          if (dc.readyState === 'open') {
            try { dc.send(msg) } catch {}
          }
        })
      }, [])

      // Throttled cursor broadcast (max 20 updates per second)
      const lastCursorBroadcast = useRef(0)
      const broadcastCursor = useCallback((worldX, worldY) => {
        const now = Date.now()
        if (now - lastCursorBroadcast.current < 50) return  // Throttle to 20fps
        lastCursorBroadcast.current = now

        myCursor.current = { x: worldX, y: worldY }
        const msg = JSON.stringify({ type: 'cursor', x: worldX, y: worldY, from: myPeerId })
        dataChannels.forEach((dc) => {
          if (dc.readyState === 'open') {
            try { dc.send(msg) } catch {}
          }
        })
      }, [])

      // Handle incoming messages (from WS or WebRTC)
      const handleMessage = useCallback((data) => {
        // Handle signaling messages
        if (handleSignaling(data)) return

        if (data.type === 'stroke' && data.from !== myPeerId) {
          allStrokes.current.push({ points: data.points, color: data.color, size: data.size })
          renderCanvas()
        }
        if (data.type === 'clear' && data.from !== myPeerId) {
          clearCanvas()
          renderCanvas()
        }
        if (data.type === 'userCount') {
          setUserCount(data.count)
        }
        if (data.type === 'sync-request') {
          // Send all strokes to requesting peer
          const syncData = JSON.stringify({ type: 'sync', strokes: allStrokes.current, from: myPeerId })
          dataChannels.forEach((dc) => {
            if (dc.readyState === 'open') {
              try { dc.send(syncData) } catch {}
            }
          })
        }
        if (data.type === 'sync') {
          // Receive full canvas state from server
          allStrokes.current = data.strokes || []
          renderCanvas()
        }
        if (data.type === 'cursor' && data.from !== myPeerId) {
          setRemoteCursors(prev => {
            const next = new Map(prev)
            next.set(data.from, { x: data.x, y: data.y })
            return next
          })
        }
      }, [renderCanvas, clearCanvas])

      // Store handleMessage in ref to avoid reconnection on change
      const handleMessageRef = useRef(handleMessage)
      useEffect(() => { handleMessageRef.current = handleMessage }, [handleMessage])

      // Wire up global callbacks for WebRTC
      useEffect(() => {
        onPeerCountChange = () => setPeerCount(dataChannels.size)
        onMessage = (data) => handleMessageRef.current(data)
        onCursorUpdate = (peerId, cursor) => {
          setRemoteCursors(prev => {
            const next = new Map(prev)
            if (cursor === null) {
              next.delete(peerId)
            } else {
              next.set(peerId, cursor)
            }
            return next
          })
        }
      }, [])

      // WebSocket connection (stable - only runs once)
      useEffect(() => {
        const connect = () => {
          if (!navigator.onLine) return
          const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
          ws = new WebSocket(protocol + '//' + location.host + '/room/' + ROOM_ID + '/ws?peerId=' + myPeerId)

          ws.onopen = () => setConnected(true)
          ws.onclose = () => {
            setConnected(false)
            // Cleanup all peer connections
            peers.forEach((pc, id) => cleanupPeer(id))
            if (navigator.onLine) setTimeout(connect, 2000)
          }
          ws.onerror = () => ws.close()
          ws.onmessage = (e) => {
            try {
              handleMessageRef.current(JSON.parse(e.data))
            } catch {}
          }
        }
        connect()
        return () => {
          if (ws) ws.close()
          peers.forEach((pc, id) => cleanupPeer(id))
        }
      }, [])

      // Convert screen coordinates to world coordinates
      const screenToWorld = useCallback((screenX, screenY) => {
        return {
          x: (screenX - view.panX) / view.zoom,
          y: (screenY - view.panY) / view.zoom
        }
      }, [view])

      // Get world coordinates from pointer event
      const getWorldCoords = useCallback((e) => {
        const canvas = canvasRef.current
        const rect = canvas.getBoundingClientRect()
        return screenToWorld(e.clientX - rect.left, e.clientY - rect.top)
      }, [screenToWorld])

      const getPointersArray = () => Array.from(activePointers.current.values())
      const getDistance = (p1, p2) => Math.hypot(p2.x - p1.x, p2.y - p1.y)
      const getMidpoint = (p1, p2) => ({ x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 })

      const handlePointerDown = useCallback((e) => {
        e.preventDefault()
        e.target.setPointerCapture(e.pointerId)

        // Update cursor position even when disabled
        const startPoint = getWorldCoords(e)
        myCursor.current = { x: startPoint.x, y: startPoint.y }
        broadcastCursor(startPoint.x, startPoint.y)

        activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        const pointers = getPointersArray()

        // Two+ pointers = pan + zoom gesture (always allowed)
        if (pointers.length >= 2) {
          isDrawing.current = false
          currentPoints.current = []
          gestureState.current = {
            active: true,
            lastMid: getMidpoint(pointers[0], pointers[1]),
            lastDist: getDistance(pointers[0], pointers[1])
          }
          return
        }

        // Don't allow drawing if disabled
        if (drawDisabled) return

        // Right-click = erase
        if (e.button === 2) setTempEraser(true)

        // Check if we have paint for this color (eraser always works)
        const erasing = e.button === 2 || isEraser
        if (!erasing && paintLevelsRef.current[currentColor] <= 0) return

        // Single pointer = draw
        isDrawing.current = true
        currentPoints.current = [startPoint]
      }, [getWorldCoords, broadcastCursor, drawDisabled, currentColor, isEraser])

      const handlePointerMove = useCallback((e) => {
        e.preventDefault()

        // Always broadcast cursor position for minimap (even if not in activePointers yet)
        const point = getWorldCoords(e)
        broadcastCursor(point.x, point.y)

        if (!activePointers.current.has(e.pointerId)) return
        activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        const pointers = getPointersArray()

        // Two+ pointer pan + pinch-to-zoom
        if (pointers.length >= 2 && gestureState.current.active) {
          const mid = getMidpoint(pointers[0], pointers[1])
          const dist = getDistance(pointers[0], pointers[1])

          if (gestureState.current.lastMid && gestureState.current.lastDist > 0) {
            const scale = dist / gestureState.current.lastDist
            const dx = mid.x - gestureState.current.lastMid.x
            const dy = mid.y - gestureState.current.lastMid.y

            setView(v => {
              const newZoom = Math.max(0.01, Math.min(100, v.zoom * scale))
              const zoomRatio = newZoom / v.zoom
              // Zoom around pinch midpoint, then apply pan
              const newPanX = mid.x - (mid.x - v.panX) * zoomRatio + dx
              const newPanY = mid.y - (mid.y - v.panY) * zoomRatio + dy
              return { zoom: newZoom, panX: newPanX, panY: newPanY }
            })
          }

          gestureState.current.lastMid = mid
          gestureState.current.lastDist = dist
          return
        }

        if (!isDrawing.current) return

        const erasing = isEraser || tempEraser

        // Check if we have paint (eraser doesn't use paint)
        if (!erasing && paintLevelsRef.current[currentColor] <= 0) {
          isDrawing.current = false
          return
        }

        // Deplete paint based on distance drawn
        if (!erasing && currentPoints.current.length > 0) {
          const lastPoint = currentPoints.current[currentPoints.current.length - 1]
          const dist = Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y)
          const paintUsed = dist * PAINT_USE_RATE * (brushSize / 10)
          setPaintLevels(prev => ({
            ...prev,
            [currentColor]: Math.max(0, prev[currentColor] - paintUsed)
          }))
        }

        currentPoints.current.push(point)
        const color = erasing ? '#ffffff' : currentColor
        if (currentPoints.current.length >= 2) {
          drawStrokeWorld(currentPoints.current.slice(-2), color, brushSize)
        }
      }, [getWorldCoords, broadcastCursor, currentColor, brushSize, isEraser, tempEraser, drawStrokeWorld])

      const handlePointerUp = useCallback((e) => {
        e.preventDefault()
        activePointers.current.delete(e.pointerId)

        // If still have 2+ pointers, continue gesture
        if (activePointers.current.size >= 2) return

        // Reset gesture state when back to 1 or 0 pointers
        gestureState.current = { active: false, lastMid: null, lastDist: null }

        if (!isDrawing.current) {
          setTempEraser(false)
          return
        }

        isDrawing.current = false
        const erasing = isEraser || tempEraser
        const color = erasing ? '#ffffff' : currentColor

        if (currentPoints.current.length > 0) {
          const stroke = { points: currentPoints.current, color, size: brushSize }
          allStrokes.current.push(stroke)
          broadcastStroke(stroke)
          renderCanvas()  // Re-render to include the new stroke properly
        }
        currentPoints.current = []
        setTempEraser(false)
      }, [currentColor, brushSize, isEraser, tempEraser, broadcastStroke, renderCanvas])

      const handleWheel = useCallback((e) => {
        e.preventDefault()
        const scale = e.deltaY > 0 ? 0.85 : 1.15
        const focalX = e.clientX
        const focalY = e.clientY

        setView(v => {
          const newZoom = Math.max(0.01, Math.min(100, v.zoom * scale))
          const zoomRatio = newZoom / v.zoom
          return {
            zoom: newZoom,
            panX: focalX - (focalX - v.panX) * zoomRatio,
            panY: focalY - (focalY - v.panY) * zoomRatio
          }
        })
      }, [])

      const handleContextMenu = (e) => e.preventDefault()

      const sendClear = useCallback(() => {
        clearCanvas()
        broadcastClear()
      }, [clearCanvas, broadcastClear])

      const zoomIn = () => {
        const container = containerRef.current
        if (!container) return
        const rect = container.getBoundingClientRect()
        const cx = rect.width / 2
        const cy = rect.height / 2
        setView(v => {
          const newZoom = Math.min(100, v.zoom * 1.25)
          const ratio = newZoom / v.zoom
          return { zoom: newZoom, panX: cx - (cx - v.panX) * ratio, panY: cy - (cy - v.panY) * ratio }
        })
      }

      const zoomOut = () => {
        const container = containerRef.current
        if (!container) return
        const rect = container.getBoundingClientRect()
        const cx = rect.width / 2
        const cy = rect.height / 2
        setView(v => {
          const newZoom = Math.max(0.01, v.zoom / 1.25)
          const ratio = newZoom / v.zoom
          return { zoom: newZoom, panX: cx - (cx - v.panX) * ratio, panY: cy - (cy - v.panY) * ratio }
        })
      }

      const resetView = () => {
        const container = containerRef.current
        if (!container) return
        const rect = container.getBoundingClientRect()
        // Center on origin at zoom 1
        setView({
          zoom: 1,
          panX: rect.width / 2,
          panY: rect.height / 2
        })
      }

      const showHostQr = async () => {
        setShowHost(true)
        const ip = await getLocalIp()
        if (ip) {
          setLocalIp(ip)
          const url = 'http://' + ip + ':8787/room/' + ROOM_ID
          const svg = generateQrSvg(url)
          setQrSvg(svg)
        }
      }

      const hideHost = () => {
        setShowHost(false)
        setLocalIp(null)
        setQrSvg(null)
      }

      const statusText = connected
        ? userCount + ' player' + (userCount !== 1 ? 's' : '')
        : 'Connecting...'

      // Minimap configuration
      const MINIMAP_SIZE = 140
      const MINIMAP_WORLD_RADIUS = 2000  // World units shown in minimap radius
      const MINIMAP_CENTER = MINIMAP_SIZE / 2

      // Convert world coordinates to minimap coordinates
      const worldToMinimap = (worldX, worldY) => {
        const myX = myCursor.current.x
        const myY = myCursor.current.y
        const dx = worldX - myX
        const dy = worldY - myY
        const scale = MINIMAP_CENTER / MINIMAP_WORLD_RADIUS
        return {
          x: MINIMAP_CENTER + dx * scale,
          y: MINIMAP_CENTER + dy * scale
        }
      }

      // Check if point is within minimap bounds (with some margin for arrows)
      const isInMinimapBounds = (mx, my, margin = 10) => {
        return mx >= margin && mx <= MINIMAP_SIZE - margin &&
               my >= margin && my <= MINIMAP_SIZE - margin
      }

      // Calculate arrow position and rotation for off-screen cursors
      const getArrowIndicator = (worldX, worldY, color) => {
        const myX = myCursor.current.x
        const myY = myCursor.current.y
        const dx = worldX - myX
        const dy = worldY - myY
        const angle = Math.atan2(dy, dx)

        // Position arrow at edge of minimap
        const edgeMargin = 14
        const radius = MINIMAP_CENTER - edgeMargin
        const arrowX = MINIMAP_CENTER + Math.cos(angle) * radius
        const arrowY = MINIMAP_CENTER + Math.sin(angle) * radius

        // Rotation: arrow points outward (add 90deg since CSS triangle points up)
        const rotation = (angle * 180 / Math.PI) + 90

        return { x: arrowX, y: arrowY, rotation, color }
      }

      // Build minimap cursor elements
      const minimapElements = []

      // Add self cursor (center) - use selected color
      const selfColor = currentColor === '#ffffff' ? '#e94560' : currentColor
      minimapElements.push({
        type: 'cursor',
        x: MINIMAP_CENTER,
        y: MINIMAP_CENTER,
        color: selfColor,
        isSelf: true
      })

      // Add remote cursors
      remoteCursors.forEach((cursor, peerId) => {
        const color = getPeerColor(peerId)
        const pos = worldToMinimap(cursor.x, cursor.y)

        if (isInMinimapBounds(pos.x, pos.y)) {
          minimapElements.push({
            type: 'cursor',
            x: pos.x,
            y: pos.y,
            color,
            isSelf: false
          })
        } else {
          // Show arrow for off-screen player
          const arrow = getArrowIndicator(cursor.x, cursor.y, color)
          minimapElements.push({
            type: 'arrow',
            ...arrow
          })
        }
      })

      // Add enemies to minimap
      enemies.current.forEach((enemy, i) => {
        const pos = worldToMinimap(enemy.x, enemy.y)
        if (isInMinimapBounds(pos.x, pos.y, 5)) {
          minimapElements.push({
            type: 'enemy',
            x: pos.x,
            y: pos.y
          })
        } else {
          // Show arrow for off-screen enemy
          const arrow = getArrowIndicator(enemy.x, enemy.y, '#e94560')
          minimapElements.push({
            type: 'enemy-arrow',
            ...arrow
          })
        }
      })

      return html\`
        <div class="app">
          <div class="header">
            <div>
              <span class="room-code">\${ROOM_ID}</span>
              \${!online && html\`<span class="offline-badge">OFFLINE</span>\`}
            </div>
            <div>
              <span class="user-count">\${statusText}</span>
              \${peerCount > 0 && html\`<span class="peer-count"> (\${peerCount} P2P)</span>\`}
            </div>
          </div>

          <div class="canvas-container" ref=\${containerRef} onWheel=\${handleWheel}>
            <canvas
              id="infinite-canvas"
              ref=\${canvasRef}
              onPointerDown=\${handlePointerDown}
              onPointerMove=\${handlePointerMove}
              onPointerUp=\${handlePointerUp}
              onPointerCancel=\${handlePointerUp}
              onPointerLeave=\${handlePointerUp}
              onContextMenu=\${handleContextMenu}
            />
            <div class="minimap">
              <div class="minimap-inner">
                \${minimapElements.map((el, i) => {
                  if (el.type === 'cursor') {
                    const cls = 'minimap-cursor' + (el.isSelf ? ' self' : '')
                    const style = 'left:' + el.x + 'px;top:' + el.y + 'px;background:' + el.color
                    return html\`<div key=\${i} class=\${cls} style=\${style} />\`
                  } else if (el.type === 'arrow') {
                    const style = 'left:' + el.x + 'px;top:' + el.y + 'px;border-bottom-color:' + el.color + ';transform:translate(-50%,-50%) rotate(' + el.rotation + 'deg)'
                    return html\`<div key=\${i} class="minimap-arrow" style=\${style} />\`
                  } else if (el.type === 'enemy') {
                    const style = 'left:' + el.x + 'px;top:' + el.y + 'px;background:#e94560;width:6px;height:6px'
                    return html\`<div key=\${i} class="minimap-cursor" style=\${style} />\`
                  } else if (el.type === 'enemy-arrow') {
                    const style = 'left:' + el.x + 'px;top:' + el.y + 'px;border-bottom-color:#e94560;transform:translate(-50%,-50%) rotate(' + el.rotation + 'deg);opacity:0.7'
                    return html\`<div key=\${i} class="minimap-arrow" style=\${style} />\`
                  }
                })}
              </div>
            </div>
            \${drawDisabled && html\`
              <div class="disabled-overlay">
                DRAWING DISABLED
                <span class="disabled-timer">\${disabledTimer}s</span>
              </div>
            \`}
          </div>

          <div class="toolbar">
            \${COLORS.filter(c => c !== '#ffffff').map(c => {
              const active = currentColor === c && !isEraser
              const paintLevel = paintLevels[c] || 0
              const fillPercent = (paintLevel / MAX_PAINT) * 100
              const isEmpty = paintLevel <= 0
              const cls = 'paint-bucket' + (active ? ' active' : '') + (isEmpty ? ' empty' : '')
              return html\`
                <div class=\${cls} onClick=\${() => { if (!isEmpty) { setCurrentColor(c); setIsEraser(false) } }}>
                  <div class="bucket-handle" style="border-color:\${c}" />
                  <div class="bucket-rim" style="background:\${c}" />
                  <div class="bucket-body" style="background:rgba(0,0,0,0.2)">
                    <div class="bucket-fill" style="background:\${c};height:\${fillPercent}%" />
                  </div>
                  \${paintLevel > 20 && html\`
                    <div class="paint-spill" style="background:\${c}" />
                    <div class="paint-drops">
                      <div class="paint-drop" style="background:\${c}" />
                      <div class="paint-drop" style="background:\${c}" />
                      <div class="paint-drop" style="background:\${c}" />
                    </div>
                  \`}
                  <div class="reload-bar">
                    <div class="reload-progress" style="width:\${fillPercent}%;background:\${c}" />
                  </div>
                </div>
              \`
            })}

            <input type="range" class="size-slider" min="2" max="40" value=\${brushSize}
              onInput=\${(e) => setBrushSize(parseInt(e.target.value))} />

            <button class=\${'tool-btn' + (isEraser ? ' active' : '')}
              onClick=\${() => setIsEraser(!isEraser)}>Erase</button>

            <button class="tool-btn" onClick=\${sendClear}>Clear</button>

            <button class="tool-btn" onClick=\${zoomOut}>-</button>
            <span class="zoom-display">\${Math.round(view.zoom * 100)}%</span>
            <button class="tool-btn" onClick=\${zoomIn}>+</button>
            <button class="tool-btn" onClick=\${resetView}>Reset</button>
            <button class="tool-btn host-btn" onClick=\${showHostQr}>Host</button>
          </div>

          \${showHost && html\`
            <div class="modal-overlay" onClick=\${hideHost}>
              <div class="modal-content" onClick=\${(e) => e.stopPropagation()}>
                <div class="modal-title">Host Offline Session</div>
                <div class="modal-subtitle">
                  1. Enable phone hotspot<br/>
                  2. Connect other devices to your hotspot<br/>
                  3. Scan QR code to join
                </div>
                \${qrSvg && html\`
                  <div class="qr-container" dangerouslySetInnerHTML=\${{ __html: qrSvg }} />
                \`}
                \${localIp && html\`
                  <div class="url-display">http://\${localIp}:8787/room/\${ROOM_ID}</div>
                \`}
                \${!localIp && html\`
                  <div class="modal-subtitle">Detecting local IP...</div>
                \`}
                <button class="modal-close" onClick=\${hideHost}>Close</button>
              </div>
            </div>
          \`}
        </div>
      \`
    }

    render(html\`<\${App} />\`, document.getElementById('app'))
  </script>
</body>
</html>`

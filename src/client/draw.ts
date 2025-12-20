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
      cursor: crosshair
    }
    .toolbar {
      display: flex; flex-wrap: wrap; gap: 8px; padding: 10px;
      background: #16213e; justify-content: center; align-items: center; z-index: 10
    }
    .color-btn {
      width: 32px; height: 32px; border-radius: 50%;
      border: 3px solid transparent; cursor: pointer
    }
    .color-btn.active { border-color: #fff }
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

      const canvasRef = useRef(null)
      const containerRef = useRef(null)
      const ctxRef = useRef(null)
      const isDrawing = useRef(false)
      const activePointers = useRef(new Map())  // pointerId -> {x, y}
      const gestureState = useRef({ active: false, lastMid: null, lastDist: null })
      const currentPoints = useRef([])
      const allStrokes = useRef([])  // Store all strokes for redraw

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
      }, [])

      // Render all strokes with current transform
      const renderCanvas = useCallback(() => {
        const ctx = ctxRef.current
        const canvas = canvasRef.current
        if (!ctx || !canvas) return

        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.save()
        ctx.translate(view.panX, view.panY)
        ctx.scale(view.zoom, view.zoom)

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

        ctx.restore()
      }, [view])

      // Re-render when view changes
      useEffect(() => {
        renderCanvas()
      }, [view, renderCanvas])

      // Draw stroke in world coordinates (applies current transform)
      const drawStrokeWorld = useCallback((points, color, size) => {
        const ctx = ctxRef.current
        if (!ctx || points.length < 2) return
        ctx.save()
        ctx.translate(view.panX, view.panY)
        ctx.scale(view.zoom, view.zoom)
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
      }, [view])

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
      }, [renderCanvas, clearCanvas])

      // Wire up global callbacks for WebRTC
      useEffect(() => {
        onPeerCountChange = () => setPeerCount(dataChannels.size)
        onMessage = handleMessage
      }, [handleMessage])

      // WebSocket connection
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
              handleMessage(JSON.parse(e.data))
            } catch {}
          }
        }
        connect()
        return () => {
          if (ws) ws.close()
          peers.forEach((pc, id) => cleanupPeer(id))
        }
      }, [handleMessage])

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

        activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
        const pointers = getPointersArray()

        // Two+ pointers = pan + zoom gesture
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

        // Right-click = erase
        if (e.button === 2) setTempEraser(true)

        // Single pointer = draw
        isDrawing.current = true
        currentPoints.current = [getWorldCoords(e)]
      }, [getWorldCoords])

      const handlePointerMove = useCallback((e) => {
        e.preventDefault()

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

        const point = getWorldCoords(e)
        currentPoints.current.push(point)
        const erasing = isEraser || tempEraser
        const color = erasing ? '#ffffff' : currentColor
        if (currentPoints.current.length >= 2) {
          drawStrokeWorld(currentPoints.current.slice(-2), color, brushSize)
        }
      }, [getWorldCoords, currentColor, brushSize, isEraser, tempEraser, drawStrokeWorld])

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
          </div>

          <div class="toolbar">
            \${COLORS.map(c => {
              const active = currentColor === c && !isEraser
              const cls = 'color-btn' + (active ? ' active' : '')
              const style = 'background:' + c + (c === '#ffffff' ? ';border:1px solid #ccc' : '')
              return html\`
                <button class=\${cls} style=\${style}
                  onClick=\${() => { setCurrentColor(c); setIsEraser(false) }} />
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

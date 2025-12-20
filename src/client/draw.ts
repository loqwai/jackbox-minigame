export const drawHtml = (roomId: string): string => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Draw - Room ${roomId}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; touch-action: none }
    html, body, #app {
      width: 100%; height: 100%; overflow: hidden;
      background: #1a1a2e;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif
    }
    .app { display: flex; flex-direction: column; height: 100% }
    .header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 8px 12px; background: #16213e; color: #fff
    }
    .room-code { font-size: 18px; font-weight: bold; letter-spacing: 2px }
    .user-count { font-size: 14px; opacity: 0.8 }
    .canvas-container {
      flex: 1; display: flex; justify-content: center; align-items: center;
      background: #0f0f23; overflow: hidden
    }
    canvas { background: #fff; touch-action: none }
    .toolbar {
      display: flex; flex-wrap: wrap; gap: 8px; padding: 12px;
      background: #16213e; justify-content: center; align-items: center
    }
    .color-btn {
      width: 36px; height: 36px; border-radius: 50%;
      border: 3px solid transparent; cursor: pointer
    }
    .color-btn.active { border-color: #fff }
    .tool-btn {
      padding: 8px 16px; border: none; border-radius: 8px;
      background: #0f3460; color: #fff; font-size: 14px; cursor: pointer
    }
    .tool-btn.active { background: #e94560 }
    .tool-btn:active { transform: scale(0.95) }
    .size-slider {
      width: 80px; height: 8px; -webkit-appearance: none;
      background: #0f3460; border-radius: 4px; outline: none
    }
    .size-slider::-webkit-slider-thumb {
      -webkit-appearance: none; width: 24px; height: 24px;
      border-radius: 50%; background: #e94560; cursor: pointer
    }
    .size-preview {
      width: 36px; height: 36px;
      display: flex; align-items: center; justify-content: center
    }
    .size-dot { background: #fff; border-radius: 50% }
    .status {
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.8); color: #fff; padding: 20px 40px;
      border-radius: 12px; font-size: 18px
    }
  </style>
</head>
<body>
  <div id="app"></div>

  <script type="module">
    import { render } from 'https://esm.sh/preact@10.25.4'
    import { useRef, useEffect, useState } from 'https://esm.sh/preact@10.25.4/hooks'
    import { html } from 'https://esm.sh/htm@3.1.1/preact?deps=preact@10.25.4'

    const ROOM_ID = "${roomId}"
    const COLORS = ["#000000", "#e94560", "#f39c12", "#2ecc71", "#3498db", "#9b59b6", "#1abc9c", "#ffffff"]

    let ws = null
    let canvasEl = null
    let containerEl = null
    let isDrawing = false
    let currentPoints = []

    const getCtx = () => canvasEl && canvasEl.getContext("2d")

    const drawStroke = (points, color, size) => {
      const ctx = getCtx()
      if (!ctx || points.length < 2) return
      const w = canvasEl.width
      const h = canvasEl.height
      ctx.strokeStyle = color
      ctx.lineWidth = size * (w / 400)
      ctx.lineCap = "round"
      ctx.lineJoin = "round"
      ctx.beginPath()
      ctx.moveTo(points[0].x * w, points[0].y * h)
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x * w, points[i].y * h)
      ctx.stroke()
    }

    const clearCanvas = () => {
      const ctx = getCtx()
      if (ctx) ctx.clearRect(0, 0, canvasEl.width, canvasEl.height)
    }

    const resizeCanvas = () => {
      if (!containerEl || !canvasEl) return
      const rect = containerEl.getBoundingClientRect()
      const size = Math.min(rect.width, rect.height) - 20
      canvasEl.width = size
      canvasEl.height = size
      canvasEl.style.width = size + "px"
      canvasEl.style.height = size + "px"
    }

    const getCanvasCoords = (e) => {
      const rect = canvasEl.getBoundingClientRect()
      const clientX = e.touches ? e.touches[0].clientX : e.clientX
      const clientY = e.touches ? e.touches[0].clientY : e.clientY
      return {
        x: (clientX - rect.left) / rect.width,
        y: (clientY - rect.top) / rect.height
      }
    }

    const isTwoFingerTouch = (e) => e.touches && e.touches.length >= 2

    const App = () => {
      const [userCount, setUserCount] = useState(0)
      const [connected, setConnected] = useState(false)
      const [currentColor, setCurrentColor] = useState("#000000")
      const [brushSize, setBrushSize] = useState(5)
      const [isEraser, setIsEraser] = useState(false)
      const [tempEraser, setTempEraser] = useState(false)

      const canvasRef = useRef(null)
      const containerRef = useRef(null)

      const connect = () => {
        const protocol = location.protocol === "https:" ? "wss:" : "ws:"
        ws = new WebSocket(protocol + "//" + location.host + "/room/" + ROOM_ID + "/ws")

        ws.onopen = () => setConnected(true)
        ws.onclose = () => {
          setConnected(false)
          setTimeout(connect, 2000)
        }
        ws.onerror = () => ws.close()
        ws.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data)
            if (data.type === "stroke") drawStroke(data.points, data.color, data.size)
            if (data.type === "clear") clearCanvas()
            if (data.type === "userCount") setUserCount(data.count)
          } catch {}
        }
      }

      useEffect(() => {
        canvasEl = canvasRef.current
        containerEl = containerRef.current
        resizeCanvas()
        connect()
        window.addEventListener("resize", resizeCanvas)
        return () => window.removeEventListener("resize", resizeCanvas)
      }, [])

      const handleStart = (e) => {
        e.preventDefault()
        if (e.button === 2 || isTwoFingerTouch(e)) setTempEraser(true)
        isDrawing = true
        currentPoints = [getCanvasCoords(e)]
      }

      const handleMove = (e) => {
        e.preventDefault()
        if (!isDrawing) return
        if (isTwoFingerTouch(e) && !tempEraser) setTempEraser(true)
        const point = getCanvasCoords(e)
        currentPoints.push(point)
        const erasing = isEraser || tempEraser
        const color = erasing ? "#ffffff" : currentColor
        if (currentPoints.length >= 2) drawStroke(currentPoints.slice(-2), color, brushSize)
      }

      const handleEnd = (e) => {
        e.preventDefault()
        if (!isDrawing) return
        isDrawing = false
        const erasing = isEraser || tempEraser
        if (currentPoints.length > 0 && ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: "stroke",
            points: currentPoints,
            color: erasing ? "#ffffff" : currentColor,
            size: brushSize
          }))
        }
        currentPoints = []
        setTempEraser(false)
      }

      const handleContextMenu = (e) => {
        e.preventDefault()
      }

      const sendClear = () => {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "clear" }))
      }

      const dotSize = Math.max(4, brushSize)
      const statusText = connected
        ? userCount + " player" + (userCount !== 1 ? "s" : "")
        : "Connecting..."

      return html\`
        <div class="app">
          <div class="header">
            <span class="room-code">\${ROOM_ID}</span>
            <span class="user-count">\${statusText}</span>
          </div>

          <div class="canvas-container" ref=\${containerRef}>
            <canvas
              ref=\${canvasRef}
              onTouchStart=\${handleStart}
              onTouchMove=\${handleMove}
              onTouchEnd=\${handleEnd}
              onTouchCancel=\${handleEnd}
              onMouseDown=\${handleStart}
              onMouseMove=\${handleMove}
              onMouseUp=\${handleEnd}
              onMouseLeave=\${handleEnd}
              onContextMenu=\${handleContextMenu}
            />
          </div>

          <div class="toolbar">
            \${COLORS.map(c => {
              const active = currentColor === c && !isEraser
              const cls = "color-btn" + (active ? " active" : "")
              const style = "background:" + c + (c === "#ffffff" ? ";border:1px solid #ccc" : "")
              return html\`
                <button
                  class=\${cls}
                  style=\${style}
                  onClick=\${() => { setCurrentColor(c); setIsEraser(false) }}
                />
              \`
            })}

            <div class="size-preview">
              <div class="size-dot" style=\${"width:" + dotSize + "px;height:" + dotSize + "px"} />
            </div>

            <input
              type="range"
              class="size-slider"
              min="2"
              max="30"
              value=\${brushSize}
              onInput=\${(e) => setBrushSize(parseInt(e.target.value))}
            />

            <button
              class=\${"tool-btn" + (isEraser ? " active" : "")}
              onClick=\${() => setIsEraser(!isEraser)}
            >Eraser</button>

            <button class="tool-btn" onClick=\${sendClear}>Clear</button>
          </div>

          \${!connected && html\`<div class="status">Reconnecting...</div>\`}
        </div>
      \`
    }

    render(html\`<\${App} />\`, document.getElementById("app"))
  </script>
</body>
</html>`

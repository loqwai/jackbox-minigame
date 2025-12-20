export const presentHtml = (roomId: string): string => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Present - Room ${roomId}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box }
    html, body, #app {
      width: 100%; height: 100%; overflow: hidden;
      background: #0f0f23;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif
    }
    .app { display: flex; flex-direction: column; height: 100%; padding: 40px }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px }
    .room-info { text-align: left }
    .join-label { font-size: 24px; color: #888; margin-bottom: 8px }
    .room-code { font-size: 72px; font-weight: bold; color: #e94560; letter-spacing: 12px }
    .user-count { font-size: 32px; color: #fff }
    .canvas-container { flex: 1; display: flex; justify-content: center; align-items: center }
    canvas {
      background: #fff; border-radius: 12px;
      box-shadow: 0 0 60px rgba(233, 69, 96, 0.3)
    }
    .status {
      position: fixed; bottom: 40px; left: 50%; transform: translateX(-50%);
      background: rgba(233, 69, 96, 0.9); color: #fff;
      padding: 16px 32px; border-radius: 8px; font-size: 20px
    }
    .url-hint {
      position: fixed; bottom: 40px; left: 50%; transform: translateX(-50%);
      color: #666; font-size: 18px
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

    let ws = null
    let canvasEl = null
    let containerEl = null

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
      const maxSize = Math.min(rect.width - 40, rect.height - 40, 800)
      canvasEl.width = maxSize
      canvasEl.height = maxSize
      canvasEl.style.width = maxSize + "px"
      canvasEl.style.height = maxSize + "px"
    }

    const App = () => {
      const [userCount, setUserCount] = useState(0)
      const [connected, setConnected] = useState(false)

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

      const statusText = connected
        ? userCount + " player" + (userCount !== 1 ? "s" : "")
        : "Connecting..."
      const urlHint = location.origin + "/room/" + ROOM_ID

      return html\`
        <div class="app">
          <div class="header">
            <div class="room-info">
              <div class="join-label">Join at:</div>
              <div class="room-code">\${ROOM_ID}</div>
            </div>
            <div class="user-count">\${statusText}</div>
          </div>

          <div class="canvas-container" ref=\${containerRef}>
            <canvas ref=\${canvasRef} />
          </div>

          \${!connected && html\`<div class="status">Reconnecting...</div>\`}
          \${connected && html\`<div class="url-hint">\${urlHint}</div>\`}
        </div>
      \`
    }

    render(html\`<\${App} />\`, document.getElementById("app"))
  </script>
</body>
</html>`

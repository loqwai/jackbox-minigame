// Main App component
import { html } from 'htm/preact'
import { useState, useRef, useCallback, useEffect } from 'preact/hooks'
import { ENEMY_COUNT, DISABLE_DURATION } from '../constants/game.js'
import { yStrokes, yEnemies, yPickups, ydoc, isHost, isSynced } from '../sync/yjs-setup.js'
import { handleSignaling, setOnPeerCountChange, setOnMessage, getPeerCount } from '../sync/webrtc.js'
import { initPaintLevels, consumePaint, reloadPaint, refillColor, hasPaint } from '../game/paint.js'
import { moveEnemy, spawnEnemy, checkPlayerCollision, respawnEnemyAwayFromPlayer } from '../game/enemies.js'
import { checkPickupCollision, spawnPickup } from '../game/pickups.js'
import { selectStrokesToBreak } from '../game/line-break.js'
import { createFluidWebGL } from '../gpu/webgl-fluid.js'
import { renderCanvas } from '../render/canvas.js'
import { getWorldCoordsFromEvent } from '../input/pointer.js'
import { calculateWheelZoom, calculateButtonZoom, resetViewToOrigin } from '../input/wheel.js'
import { createGestureState, resetGestureState, activateGesture, updateGesture } from '../input/gestures.js'
import { getDistance, getMidpoint } from '../math/geometry.js'
import { clearPeerColor } from '../state/peer-colors.js'
import { getLocalIp } from '../utils/network.js'
import { generateQrSvg } from '../utils/qr.js'
import { useCanvas } from '../hooks/use-canvas.js'
import { useOnlineStatus } from '../hooks/use-online-status.js'
import { useWebSocket } from '../hooks/use-websocket.js'
import { useGameLoop } from '../hooks/use-game-loop.js'
import { useStrokesSync, useEnemiesSync, usePickupsSync, useAwarenessSync, broadcastCursor } from '../hooks/use-yjs-sync.js'

import { Header } from './Header.js'
import { Toolbar } from './Toolbar.js'
import { Minimap } from './Minimap.js'
import { PlayerList } from './PlayerList.js'
import { CoordsDisplay } from './CoordsDisplay.js'
import { HostModal } from './HostModal.js'
import { DisabledOverlay, PaintWarning } from './Overlays.js'

export const App = ({ roomId, peerId }) => {
  // Connection state
  const [connected, setConnected] = useState(false)
  const [userCount, setUserCount] = useState(0)
  const [peerCount, setPeerCount] = useState(0)
  const online = useOnlineStatus()

  // Drawing state
  const [currentColor, setCurrentColor] = useState('#000000')
  const [brushSize, setBrushSize] = useState(5)
  const [isEraser, setIsEraser] = useState(false)
  const [tempEraser, setTempEraser] = useState(false)
  const [paintLevels, setPaintLevels] = useState(initPaintLevels)
  const [paintWarning, setPaintWarning] = useState(null)
  const [drawDisabled, setDrawDisabled] = useState(false)
  const [disabledTimer, setDisabledTimer] = useState(0)

  // View state
  const [view, setView] = useState({ zoom: 1, panX: 0, panY: 0 })
  const [myDisplayPos, setMyDisplayPos] = useState({ x: 0, y: 0 })
  const [remoteCursors, setRemoteCursors] = useState(new Map())

  // Game state
  const strokes = useRef([])
  const [, setStrokesVersion] = useState(0)
  const enemies = useRef([])
  const pickups = useRef([])
  const fluidGPU = useRef(null)
  const gpuCanvasRef = useRef(null)
  const processedStrokeCount = useRef(0)

  // Drawing refs
  const isDrawing = useRef(false)
  const currentPoints = useRef([])
  const activePointers = useRef(new Map())
  const gestureState = useRef(createGestureState())
  const myCursor = useRef({ x: 0, y: 0 })
  const viewRef = useRef(view)
  const currentColorRef = useRef(currentColor)
  const isEraserRef = useRef(isEraser)
  const brushSizeRef = useRef(brushSize)
  const paintLevelsRef = useRef(paintLevels)
  const lastCursorBroadcast = useRef(0)
  const lastDisplayUpdate = useRef(0)

  // Host modal state
  const [showHost, setShowHost] = useState(false)
  const [localIp, setLocalIp] = useState(null)
  const [qrSvg, setQrSvg] = useState(null)

  // Keep refs in sync
  useEffect(() => { viewRef.current = view }, [view])
  useEffect(() => { currentColorRef.current = currentColor }, [currentColor])
  useEffect(() => { isEraserRef.current = isEraser }, [isEraser])
  useEffect(() => { brushSizeRef.current = brushSize }, [brushSize])
  useEffect(() => { paintLevelsRef.current = paintLevels }, [paintLevels])

  // Initialize WebGL fluid system (after canvas is sized)
  useEffect(() => {
    const gpu = gpuCanvasRef.current
    const container = containerRef.current
    if (!gpu || !container) return

    const syncSize = () => {
      const rect = container.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return false
      gpu.width = rect.width
      gpu.height = rect.height
      return true
    }

    const init = () => {
      if (!syncSize()) {
        requestAnimationFrame(init)
        return
      }

      if (fluidGPU.current) return // Already initialized

      try {
        const fluid = createFluidWebGL(gpu)
        fluidGPU.current = fluid

        // Process any strokes that synced before fluid was ready
        strokes.current.forEach(stroke => {
          if (stroke?.points?.length >= 2 && stroke.color !== '#ffffff') {
            fluid.addInkFromStroke(stroke)
          }
        })
        processedStrokeCount.current = strokes.current.length
        console.log('[WebGL] Initialized, processed', strokes.current.length, 'existing strokes')
      } catch (err) {
        console.error('[WebGL] Failed to initialize:', err)
      }
    }

    requestAnimationFrame(init)
    window.addEventListener('resize', syncSize)
    return () => window.removeEventListener('resize', syncSize)
  }, [])

  // Canvas setup
  const render = useCallback(() => {
    const ctx = ctxRef.current
    const canvas = canvasRef.current
    if (!ctx || !canvas) return

    renderCanvas(ctx, canvas, {
      view: viewRef.current,
      strokes: strokes.current,
      currentPoints: currentPoints.current,
      currentColor: currentColorRef.current,
      brushSize: brushSizeRef.current,
      isEraser: isEraserRef.current,
      enemies: enemies.current,
      pickups: pickups.current,
      playerPos: myCursor.current,
      isDrawing: isDrawing.current,
      remoteCursors,
    })
  }, [remoteCursors])

  const { canvasRef, containerRef, ctxRef } = useCanvas(render)

  // Yjs sync
  useStrokesSync(useCallback((s) => {
    strokes.current = s

    if (s.length < processedStrokeCount.current) {
      processedStrokeCount.current = s.length
    }

    while (processedStrokeCount.current < s.length) {
      const stroke = s[processedStrokeCount.current]
      if (stroke?.points?.length >= 2 && stroke.color !== '#ffffff' && fluidGPU.current) {
        fluidGPU.current.addInkFromStroke(stroke)
      }
      processedStrokeCount.current++
    }

    setStrokesVersion(v => v + 1)
    render()
  }, [render]))

  // Territory sync removed - GPU simulation is local-only for now

  useEnemiesSync(useCallback((e) => { enemies.current = e }, []))
  usePickupsSync(useCallback((p) => { pickups.current = p }, []))
  useAwarenessSync(peerId, setRemoteCursors)

  // WebSocket handlers
  const handleMessage = useCallback((data) => {
    if (handleSignaling(data, wsRef.current, (id) => clearPeerColor(id))) return
    if (data.type === 'userCount') setUserCount(data.count)
  }, [])

  const wsRef = useWebSocket(
    roomId,
    peerId,
    () => setConnected(true),
    () => setConnected(false),
    handleMessage
  )

  // WebRTC callbacks
  useEffect(() => {
    setOnPeerCountChange(() => setPeerCount(getPeerCount()))
    setOnMessage(handleMessage)
  }, [handleMessage])

  // Game loop
  useGameLoop(useCallback((deltaTime, currentTime) => {
    // Spawn enemies if needed
    if (isSynced() && enemies.current.length === 0 && yEnemies.length === 0 && isHost()) {
      const newEnemies = []
      for (let i = 0; i < ENEMY_COUNT; i++) {
        newEnemies.push(spawnEnemy(myCursor.current, strokes.current, i))
      }
      enemies.current = newEnemies
      ydoc.transact(() => {
        yEnemies.delete(0, yEnemies.length)
        yEnemies.push(newEnemies)
      })
    }

    // Check player collision
    if (checkPlayerCollision(myCursor.current, enemies.current) && !drawDisabled) {
      setDrawDisabled(true)
      setDisabledTimer(DISABLE_DURATION)

      if (isHost()) {
        enemies.current = enemies.current.map(e => respawnEnemyAwayFromPlayer(e, myCursor.current))
      }
    }

    // Host updates enemies
    if (isHost() && enemies.current.length > 0) {
      enemies.current = enemies.current.map(e => moveEnemy(e, myCursor.current, deltaTime, strokes.current))

      if (currentTime % 100 < 20) {
        ydoc.transact(() => {
          yEnemies.delete(0, yEnemies.length)
          yEnemies.push(enemies.current.map(e => ({ x: e.x, y: e.y, id: e.id })))
        })
      }
    }

    // WebGPU fluid simulation
    if (fluidGPU.current) {
      fluidGPU.current.simulate(deltaTime)

      // Render GPU fluid with proper view transformation
      const canvas = canvasRef.current
      if (canvas) {
        const v = viewRef.current
        fluidGPU.current.render({
          x: -v.panX / v.zoom,
          y: -v.panY / v.zoom,
          scale: v.zoom,
          width: canvas.width,
          height: canvas.height,
        })
      }
    }

    // Reload paint
    setPaintLevels(prev => reloadPaint(prev, deltaTime))

    // Check pickup collision
    const { collected, } = checkPickupCollision(myCursor.current, pickups.current)
    if (collected.length > 0) {
      collected.forEach(p => setPaintLevels(prev => refillColor(prev, p.color)))
      ydoc.transact(() => {
        const toKeep = yPickups.toArray().filter(p => !collected.some(c => c.id === p.id))
        yPickups.delete(0, yPickups.length)
        if (toKeep.length > 0) yPickups.push(toKeep)
      })
    }

    render()
  }, [render, drawDisabled]))

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

  // Paint warning clear
  useEffect(() => {
    if (!paintWarning) return
    const timeout = setTimeout(() => setPaintWarning(null), 1500)
    return () => clearTimeout(timeout)
  }, [paintWarning])

  // Pickup spawning
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isSynced() || !isHost()) return
      if (pickups.current.length >= 5 || yPickups.length >= 5) return

      const pickup = spawnPickup(myCursor.current, pickups.current)
      if (pickup) {
        pickups.current.push(pickup)
        yPickups.push([pickup])
      }
    }, 10000)
    return () => clearInterval(interval)
  }, [])

  // Line breaking
  useEffect(() => {
    const interval = setInterval(() => {
      const toDelete = selectStrokesToBreak(enemies.current, yStrokes.toArray())
      if (toDelete.length > 0) {
        ydoc.transact(() => {
          toDelete.forEach(idx => yStrokes.delete(idx, 1))
        })
      }
    }, 10000)
    return () => clearInterval(interval)
  }, [])

  // Event handlers
  const broadcastCursorThrottled = useCallback((x, y) => {
    const now = Date.now()
    myCursor.current = { x, y }

    if (now - lastDisplayUpdate.current > 100) {
      lastDisplayUpdate.current = now
      setMyDisplayPos({ x, y })
    }

    if (now - lastCursorBroadcast.current < 50) return
    lastCursorBroadcast.current = now
    broadcastCursor(x, y, currentColorRef.current)
  }, [])

  const handlePointerDown = useCallback((e) => {
    e.preventDefault()
    e.target.setPointerCapture(e.pointerId)

    const rect = canvasRef.current.getBoundingClientRect()
    const point = getWorldCoordsFromEvent(e, rect, viewRef.current)
    broadcastCursorThrottled(point.x, point.y)

    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const pointers = Array.from(activePointers.current.values())

    if (pointers.length >= 2) {
      isDrawing.current = false
      currentPoints.current = []
      gestureState.current = activateGesture(
        gestureState.current,
        getMidpoint(pointers[0], pointers[1]),
        getDistance(pointers[0], pointers[1])
      )
      return
    }

    if (drawDisabled) return

    if (e.button === 2) setTempEraser(true)

    const erasing = e.button === 2 || isEraserRef.current
    if (!erasing && !hasPaint(paintLevelsRef.current, currentColorRef.current)) {
      setPaintWarning({ color: currentColorRef.current, key: Date.now() })
      return
    }

    isDrawing.current = true
    currentPoints.current = [point]
  }, [drawDisabled, broadcastCursorThrottled])

  const handlePointerMove = useCallback((e) => {
    e.preventDefault()

    const rect = canvasRef.current.getBoundingClientRect()
    const point = getWorldCoordsFromEvent(e, rect, viewRef.current)
    broadcastCursorThrottled(point.x, point.y)

    if (!activePointers.current.has(e.pointerId)) return
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const pointers = Array.from(activePointers.current.values())

    if (pointers.length >= 2 && gestureState.current.active) {
      const mid = getMidpoint(pointers[0], pointers[1])
      const dist = getDistance(pointers[0], pointers[1])
      const lastMid = gestureState.current.lastMid
      const lastDist = gestureState.current.lastDist

      if (lastMid && lastDist > 0) {
        const scale = dist / lastDist
        const dx = mid.x - lastMid.x
        const dy = mid.y - lastMid.y

        setView(v => {
          const newZoom = Math.max(0.01, Math.min(100, v.zoom * scale))
          const zoomRatio = newZoom / v.zoom
          return {
            zoom: newZoom,
            panX: mid.x - (mid.x - v.panX) * zoomRatio + dx,
            panY: mid.y - (mid.y - v.panY) * zoomRatio + dy
          }
        })
      }

      gestureState.current = updateGesture(gestureState.current, mid, dist)
      return
    }

    if (!isDrawing.current) return

    const erasing = isEraserRef.current || tempEraser
    if (!erasing && !hasPaint(paintLevelsRef.current, currentColorRef.current)) {
      isDrawing.current = false
      setPaintWarning({ color: currentColorRef.current, key: Date.now() })
      return
    }

    if (!erasing && currentPoints.current.length > 0) {
      const last = currentPoints.current[currentPoints.current.length - 1]
      const worldDist = getDistance(last, point)
      setPaintLevels(prev => consumePaint(prev, currentColorRef.current, worldDist, brushSizeRef.current))
    }

    currentPoints.current.push(point)
    render()
  }, [tempEraser, broadcastCursorThrottled, render])

  const handlePointerUp = useCallback((e) => {
    e.preventDefault()
    activePointers.current.delete(e.pointerId)

    if (activePointers.current.size >= 2) return

    gestureState.current = resetGestureState()

    if (!isDrawing.current) {
      setTempEraser(false)
      return
    }

    isDrawing.current = false
    const erasing = isEraserRef.current || tempEraser
    const color = erasing ? '#ffffff' : currentColorRef.current

    if (currentPoints.current.length > 0) {
      const stroke = {
        points: [...currentPoints.current],
        color,
        size: brushSizeRef.current,
        timestamp: Date.now(),
        peerId
      }
      strokes.current.push(stroke)
      yStrokes.push([stroke])
      render()
    }

    currentPoints.current = []
    setTempEraser(false)
  }, [peerId, tempEraser, render])

  const handleWheel = useCallback((e) => {
    e.preventDefault()
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const focalX = e.clientX - rect.left
    const focalY = e.clientY - rect.top
    setView(v => calculateWheelZoom(e.deltaY, focalX, focalY, v))
  }, [])

  const handleClear = useCallback(() => {
    ydoc.transact(() => {
      yStrokes.delete(0, yStrokes.length)
    })
  }, [])

  const goToPlayer = useCallback((targetPeerId) => {
    const cursor = remoteCursors.get(targetPeerId)
    if (!cursor || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    setView(v => ({
      ...v,
      panX: rect.width / 2 - cursor.x * v.zoom,
      panY: rect.height / 2 - cursor.y * v.zoom
    }))
  }, [remoteCursors])

  const showHostQr = async () => {
    setShowHost(true)
    const ip = await getLocalIp()
    if (ip) {
      setLocalIp(ip)
      setQrSvg(generateQrSvg(`http://${ip}:8787/room/${roomId}`))
    }
  }

  const selfColor = currentColor === '#ffffff' ? '#e94560' : currentColor

  return html`
    <div class="app">
      <${Header}
        roomId=${roomId}
        connected=${connected}
        userCount=${userCount}
        peerCount=${peerCount}
        online=${online}
      />

      <div class="canvas-container" ref=${containerRef} onWheel=${handleWheel}>
        <canvas
          id="infinite-canvas"
          ref=${canvasRef}
          style=${{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1 }}
          onPointerDown=${handlePointerDown}
          onPointerMove=${handlePointerMove}
          onPointerUp=${handlePointerUp}
          onPointerCancel=${handlePointerUp}
          onPointerLeave=${handlePointerUp}
          onContextMenu=${(e) => e.preventDefault()}
        />
        <canvas
          id="gpu-canvas"
          ref=${gpuCanvasRef}
          style=${{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 2 }}
        />
        <${Minimap}
          myPos=${myCursor.current}
          remoteCursors=${remoteCursors}
          enemies=${enemies.current}
          selfColor=${selfColor}
          onGoToPlayer=${goToPlayer}
        />
        <${CoordsDisplay} x=${myDisplayPos.x} y=${myDisplayPos.y} zoom=${view.zoom} />
        <${PlayerList}
          myPos=${myDisplayPos}
          selfColor=${selfColor}
          remoteCursors=${remoteCursors}
          onGoToPlayer=${goToPlayer}
        />
        ${drawDisabled && html`<${DisabledOverlay} timer=${disabledTimer} />`}
        ${paintWarning && html`<${PaintWarning} color=${paintWarning.color} warningKey=${paintWarning.key} />`}
      </div>

      <${Toolbar}
        currentColor=${currentColor}
        paintLevels=${paintLevels}
        paintWarning=${paintWarning}
        isEraser=${isEraser}
        brushSize=${brushSize}
        zoom=${view.zoom}
        onColorSelect=${(c) => { setCurrentColor(c); setIsEraser(false) }}
        onEraserToggle=${() => setIsEraser(!isEraser)}
        onBrushSizeChange=${setBrushSize}
        onClear=${handleClear}
        onZoomIn=${() => {
          const rect = containerRef.current?.getBoundingClientRect()
          if (rect) setView(calculateButtonZoom(true, rect.width, rect.height, viewRef.current))
        }}
        onZoomOut=${() => {
          const rect = containerRef.current?.getBoundingClientRect()
          if (rect) setView(calculateButtonZoom(false, rect.width, rect.height, viewRef.current))
        }}
        onResetView=${() => {
          const rect = containerRef.current?.getBoundingClientRect()
          if (rect) setView(resetViewToOrigin(rect.width, rect.height))
        }}
        onShowHost=${showHostQr}
      />

      ${showHost && html`
        <${HostModal}
          roomId=${roomId}
          localIp=${localIp}
          qrSvg=${qrSvg}
          onClose=${() => { setShowHost(false); setLocalIp(null); setQrSvg(null) }}
        />
      `}
    </div>
  `
}

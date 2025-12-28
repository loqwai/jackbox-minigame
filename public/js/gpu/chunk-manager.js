// Chunk Manager - handles infinite canvas via sparse chunk allocation
// Each chunk is a 256x256 cell region with its own GPU textures

export const CHUNK_CONFIG = {
  size: 256,              // Cells per chunk dimension
  cellSize: 8,            // World pixels per cell
  maxActiveChunks: 200,   // Memory limit
  unloadDelay: 5000,      // Ms before unloading empty chunk
  ghostCells: 1,          // Border cells for edge flow
}

export const createChunkManager = (device, config = CHUNK_CONFIG) => {
  const chunks = new Map()         // "cx,cy" -> Chunk
  const chunkActivity = new Map()  // "cx,cy" -> lastActiveTime
  const pendingUnloads = new Set()

  const worldToChunk = (worldX, worldY) => ({
    cx: Math.floor(worldX / (config.size * config.cellSize)),
    cy: Math.floor(worldY / (config.size * config.cellSize)),
  })

  const worldToLocal = (worldX, worldY) => {
    const { cx, cy } = worldToChunk(worldX, worldY)
    const chunkWorldX = cx * config.size * config.cellSize
    const chunkWorldY = cy * config.size * config.cellSize
    return {
      cx, cy,
      lx: Math.floor((worldX - chunkWorldX) / config.cellSize),
      ly: Math.floor((worldY - chunkWorldY) / config.cellSize),
    }
  }

  const chunkKey = (cx, cy) => `${cx},${cy}`

  const parseChunkKey = (key) => {
    const [cx, cy] = key.split(',').map(Number)
    return { cx, cy }
  }

  const createChunkTextures = () => {
    const texSize = config.size + config.ghostCells * 2
    const textureDesc = {
      size: [texSize, texSize],
      format: 'rgba16float',
      usage: GPUTextureUsage.STORAGE_BINDING |
             GPUTextureUsage.TEXTURE_BINDING |
             GPUTextureUsage.COPY_DST |
             GPUTextureUsage.COPY_SRC,
    }

    return {
      current: device.createTexture(textureDesc),
      next: device.createTexture(textureDesc),
      size: texSize,
    }
  }

  const createChunk = (cx, cy) => {
    const key = chunkKey(cx, cy)
    if (chunks.has(key)) return chunks.get(key)

    if (chunks.size >= config.maxActiveChunks) {
      evictOldestChunk()
    }

    const textures = createChunkTextures()
    const chunk = {
      cx, cy, key,
      textures,
      dirty: true,
      settled: false,
      cellCount: 0,
      totalVolume: 0,
      worldOrigin: {
        x: cx * config.size * config.cellSize,
        y: cy * config.size * config.cellSize,
      },
    }

    chunks.set(key, chunk)
    chunkActivity.set(key, Date.now())
    return chunk
  }

  const getChunk = (cx, cy) => chunks.get(chunkKey(cx, cy))

  const getOrCreateChunk = (cx, cy) => getChunk(cx, cy) || createChunk(cx, cy)

  const evictOldestChunk = () => {
    let oldestKey = null
    let oldestTime = Infinity

    chunkActivity.forEach((time, key) => {
      const chunk = chunks.get(key)
      if (chunk?.settled && time < oldestTime) {
        oldestTime = time
        oldestKey = key
      }
    })

    if (oldestKey) destroyChunk(oldestKey)
  }

  const destroyChunk = (key) => {
    const chunk = chunks.get(key)
    if (!chunk) return

    chunk.textures.current.destroy()
    chunk.textures.next.destroy()
    chunks.delete(key)
    chunkActivity.delete(key)
    pendingUnloads.delete(key)
  }

  const markActive = (cx, cy) => {
    const key = chunkKey(cx, cy)
    chunkActivity.set(key, Date.now())
    pendingUnloads.delete(key)
  }

  const getActiveChunks = () => {
    const result = []
    chunks.forEach((chunk) => {
      if (!chunk.settled || chunk.dirty) result.push(chunk)
    })
    return result
  }

  const getVisibleChunks = (viewport) => {
    const { x, y, width, height, scale } = viewport
    const worldLeft = x
    const worldTop = y
    const worldRight = x + width / scale
    const worldBottom = y + height / scale

    const minCx = Math.floor(worldLeft / (config.size * config.cellSize)) - 1
    const maxCx = Math.ceil(worldRight / (config.size * config.cellSize)) + 1
    const minCy = Math.floor(worldTop / (config.size * config.cellSize)) - 1
    const maxCy = Math.ceil(worldBottom / (config.size * config.cellSize)) + 1

    const visible = []
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const chunk = getChunk(cx, cy)
        if (chunk && chunk.cellCount > 0) visible.push(chunk)
      }
    }
    return visible
  }

  const getNeighborChunks = (cx, cy) => ({
    top: getChunk(cx, cy - 1),
    bottom: getChunk(cx, cy + 1),
    left: getChunk(cx - 1, cy),
    right: getChunk(cx + 1, cy),
  })

  const scheduleCleanup = () => {
    const now = Date.now()
    chunks.forEach((chunk, key) => {
      if (chunk.settled && chunk.cellCount === 0) {
        const lastActive = chunkActivity.get(key) || 0
        if (now - lastActive > config.unloadDelay) {
          pendingUnloads.add(key)
        }
      }
    })

    pendingUnloads.forEach(key => destroyChunk(key))
  }

  const swapBuffers = (chunk) => {
    const temp = chunk.textures.current
    chunk.textures.current = chunk.textures.next
    chunk.textures.next = temp
  }

  const getStats = () => ({
    activeChunks: chunks.size,
    totalCells: Array.from(chunks.values()).reduce((sum, c) => sum + c.cellCount, 0),
    totalVolume: Array.from(chunks.values()).reduce((sum, c) => sum + c.totalVolume, 0),
    memoryMB: (chunks.size * 2 * (config.size + 2) ** 2 * 8) / 1024 / 1024,
  })

  return {
    worldToChunk,
    worldToLocal,
    chunkKey,
    parseChunkKey,
    createChunk,
    getChunk,
    getOrCreateChunk,
    destroyChunk,
    markActive,
    getActiveChunks,
    getVisibleChunks,
    getNeighborChunks,
    scheduleCleanup,
    swapBuffers,
    getStats,
    chunks,
    config,
  }
}

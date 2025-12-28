// WebGPU Fluid Simulation System
// Chunked architecture for infinite canvas with Worldbox-style water physics

import { createChunkManager, CHUNK_CONFIG } from './chunk-manager.js'

const FLUID_PARAMS = {
  maxVolume: 1.0,
  minVolume: 0.001,
  flowRate: 0.12,
  surfaceTension: 0.06,
  sourceDecay: 0.997,
  sourceStrength: 0.02,
  pressureMultiplier: 1.5,
  settleThreshold: 0.002,
}

const COLOR_TO_INDEX = {
  '#ff4545': 1, '#ff9933': 2, '#ffe64d': 3, '#66e666': 4,
  '#4db8ff': 5, '#9966e6': 6, '#f280b2': 7,
}

const colorToIndex = (color) => COLOR_TO_INDEX[color?.toLowerCase()] || 0

export const createFluidGPU = async (canvas) => {
  if (!navigator.gpu) throw new Error('WebGPU not supported')

  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
  if (!adapter) throw new Error('No WebGPU adapter')

  const device = await adapter.requestDevice({
    requiredFeatures: [],
    requiredLimits: { maxStorageBufferBindingSize: 256 * 1024 * 1024 },
  })

  const context = canvas.getContext('webgpu')
  const format = navigator.gpu.getPreferredCanvasFormat()
  context.configure({ device, format, alphaMode: 'premultiplied' })

  const chunkManager = createChunkManager(device)

  const flowShaderCode = await fetch('/js/gpu/shaders/flow.wgsl').then(r => r.text())
  const renderShaderCode = await fetch('/js/gpu/shaders/render.wgsl').then(r => r.text())

  const flowModule = device.createShaderModule({ code: flowShaderCode })
  const renderModule = device.createShaderModule({ code: renderShaderCode })

  const paramsBuffer = device.createBuffer({
    size: 48,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })

  const viewBuffer = device.createBuffer({
    size: 96,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })

  const chunkUniformBuffer = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })

  const neighborFlagsBuffer = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })

  const emptyTexture = device.createTexture({
    size: [CHUNK_CONFIG.size + 2, CHUNK_CONFIG.size + 2],
    format: 'rgba16float',
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
  })

  const flowBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'read-only', format: 'rgba16float' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba16float' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    ],
  })

  const neighborBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'read-only', format: 'rgba16float' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'read-only', format: 'rgba16float' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'read-only', format: 'rgba16float' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'read-only', format: 'rgba16float' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    ],
  })

  const flowPipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [flowBindGroupLayout, neighborBindGroupLayout] }),
    compute: { module: flowModule, entryPoint: 'main' },
  })

  const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' })

  const renderBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ],
  })

  const renderPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [renderBindGroupLayout] }),
    vertex: { module: renderModule, entryPoint: 'vs_main' },
    fragment: {
      module: renderModule,
      entryPoint: 'fs_main',
      targets: [{ format, blend: {
        color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
      }}],
    },
    primitive: { topology: 'triangle-list' },
  })

  const pendingInk = []
  let time = 0

  const addInk = (worldX, worldY, volume, color) => {
    pendingInk.push({ worldX, worldY, volume, colorIndex: colorToIndex(color) })
  }

  const addInkFromStroke = (stroke) => {
    if (!stroke.points || stroke.points.length < 2) return
    if (stroke.color === '#ffffff') return

    const baseVolume = (stroke.size || 5) / 10
    const colorIndex = colorToIndex(stroke.color)
    console.log('[WebGPU] Adding ink from stroke:', stroke.color, 'colorIndex:', colorIndex, 'points:', stroke.points.length)

    for (let i = 1; i < stroke.points.length; i++) {
      const p1 = stroke.points[i - 1]
      const p2 = stroke.points[i]
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y)
      const steps = Math.max(1, Math.floor(dist / 4))

      for (let j = 0; j <= steps; j++) {
        const t = j / steps
        const x = p1.x + (p2.x - p1.x) * t
        const y = p1.y + (p2.y - p1.y) * t
        pendingInk.push({ worldX: x, worldY: y, volume: baseVolume / steps, colorIndex })
      }
    }
  }

  const flushPendingInk = () => {
    if (pendingInk.length === 0) return

    const chunkUpdates = new Map()

    pendingInk.forEach(({ worldX, worldY, volume, colorIndex }) => {
      const { cx, cy, lx, ly } = chunkManager.worldToLocal(worldX, worldY)
      const key = chunkManager.chunkKey(cx, cy)

      if (!chunkUpdates.has(key)) chunkUpdates.set(key, { cx, cy, cells: [] })
      chunkUpdates.get(key).cells.push({ lx, ly, volume, colorIndex })
    })

    chunkUpdates.forEach(({ cx, cy, cells }) => {
      const chunk = chunkManager.getOrCreateChunk(cx, cy)
      const texSize = chunk.textures.size
      const data = new Float32Array(texSize * texSize * 4)

      const encoder = device.createCommandEncoder()
      const readBuffer = device.createBuffer({
        size: texSize * texSize * 4 * 2,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      })

      cells.forEach(({ lx, ly, volume, colorIndex }) => {
        const ghost = CHUNK_CONFIG.ghostCells
        const tx = lx + ghost
        const ty = ly + ghost
        const idx = (ty * texSize + tx) * 4

        const existingVolume = data[idx]
        data[idx] = Math.min(FLUID_PARAMS.maxVolume * 1.8, existingVolume + volume)
        data[idx + 1] = Math.min(1.0, (data[idx + 1] || 0) + 0.5)
        data[idx + 3] = (colorIndex + 0.5) / 8.0
      })

      device.queue.writeTexture(
        { texture: chunk.textures.current },
        data,
        { bytesPerRow: texSize * 4 * 2, rowsPerImage: texSize },
        { width: texSize, height: texSize }
      )

      chunk.dirty = true
      chunk.settled = false
      chunk.cellCount = cells.length
      chunkManager.markActive(cx, cy)
    })

    pendingInk.length = 0
  }

  const updateParams = (dt) => {
    const data = new Float32Array([
      FLUID_PARAMS.maxVolume,
      FLUID_PARAMS.minVolume,
      FLUID_PARAMS.flowRate,
      FLUID_PARAMS.surfaceTension,
      FLUID_PARAMS.sourceDecay,
      FLUID_PARAMS.sourceStrength,
      FLUID_PARAMS.pressureMultiplier,
      FLUID_PARAMS.settleThreshold,
      dt,
      CHUNK_CONFIG.size,
      CHUNK_CONFIG.ghostCells,
      0,
    ])
    device.queue.writeBuffer(paramsBuffer, 0, data)
  }

  const simulateChunk = (encoder, chunk) => {
    const neighbors = chunkManager.getNeighborChunks(chunk.cx, chunk.cy)

    const flowBindGroup = device.createBindGroup({
      layout: flowBindGroupLayout,
      entries: [
        { binding: 0, resource: chunk.textures.current.createView() },
        { binding: 1, resource: chunk.textures.next.createView() },
        { binding: 2, resource: { buffer: paramsBuffer } },
      ],
    })

    const flags = new Uint32Array([
      neighbors.top ? 1 : 0,
      neighbors.bottom ? 1 : 0,
      neighbors.left ? 1 : 0,
      neighbors.right ? 1 : 0,
    ])
    device.queue.writeBuffer(neighborFlagsBuffer, 0, flags)

    const neighborBindGroup = device.createBindGroup({
      layout: neighborBindGroupLayout,
      entries: [
        { binding: 0, resource: (neighbors.top?.textures.current || emptyTexture).createView() },
        { binding: 1, resource: (neighbors.bottom?.textures.current || emptyTexture).createView() },
        { binding: 2, resource: (neighbors.left?.textures.current || emptyTexture).createView() },
        { binding: 3, resource: (neighbors.right?.textures.current || emptyTexture).createView() },
        { binding: 4, resource: { buffer: neighborFlagsBuffer } },
      ],
    })

    const pass = encoder.beginComputePass()
    pass.setPipeline(flowPipeline)
    pass.setBindGroup(0, flowBindGroup)
    pass.setBindGroup(1, neighborBindGroup)

    const workgroups = Math.ceil((CHUNK_CONFIG.size + CHUNK_CONFIG.ghostCells * 2) / 16)
    pass.dispatchWorkgroups(workgroups, workgroups)
    pass.end()

    chunkManager.swapBuffers(chunk)
  }

  const simulate = (dt) => {
    flushPendingInk()
    updateParams(dt)
    time += dt

    const activeChunks = chunkManager.getActiveChunks()
    if (activeChunks.length === 0) return

    const encoder = device.createCommandEncoder()
    activeChunks.forEach(chunk => simulateChunk(encoder, chunk))
    device.queue.submit([encoder.finish()])

    chunkManager.scheduleCleanup()
  }

  const updateViewUniforms = (view) => {
    const { x, y, scale, width, height } = view

    const left = x
    const right = x + width / scale
    const top = y
    const bottom = y + height / scale

    const proj = new Float32Array([
      2 / (right - left), 0, 0, 0,
      0, 2 / (top - bottom), 0, 0,
      0, 0, 1, 0,
      -(right + left) / (right - left), -(top + bottom) / (top - bottom), 0, 1,
    ])

    const data = new Float32Array(24)
    data.set(proj, 0)
    data[16] = width
    data[17] = height
    data[18] = CHUNK_CONFIG.cellSize
    data[19] = time

    device.queue.writeBuffer(viewBuffer, 0, data)
  }

  const renderChunk = (pass, chunk) => {
    const chunkData = new Float32Array([
      chunk.worldOrigin.x,
      chunk.worldOrigin.y,
      CHUNK_CONFIG.size,
      CHUNK_CONFIG.ghostCells,
    ])
    device.queue.writeBuffer(chunkUniformBuffer, 0, chunkData)

    const bindGroup = device.createBindGroup({
      layout: renderBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: viewBuffer } },
        { binding: 1, resource: { buffer: chunkUniformBuffer } },
        { binding: 2, resource: chunk.textures.current.createView() },
        { binding: 3, resource: sampler },
      ],
    })

    pass.setBindGroup(0, bindGroup)
    pass.draw(6)
  }

  const render = (view) => {
    updateViewUniforms(view)

    const visibleChunks = chunkManager.getVisibleChunks(view)

    // Always clear the GPU canvas to show it's working
    const encoder = device.createCommandEncoder()
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        loadOp: 'clear',
        clearValue: { r: 0, g: 0, b: 0, a: 0 }, // Transparent
        storeOp: 'store',
      }],
    })

    if (visibleChunks.length === 0) {
      // Debug: draw a test rectangle to verify GPU canvas is working
      pass.end()
      device.queue.submit([encoder.finish()])
      return
    }

    pass.setPipeline(renderPipeline)
    visibleChunks.forEach(chunk => renderChunk(pass, chunk))
    pass.end()

    device.queue.submit([encoder.finish()])
  }

  const getStats = () => ({
    ...chunkManager.getStats(),
    pendingInk: pendingInk.length,
    time,
  })

  const getTerritory = () => {
    const result = new Map()
    chunkManager.chunks.forEach((chunk, chunkKey) => {
      // Would need GPU readback for full sync - expensive
      // For now, return metadata only
    })
    return result
  }

  return {
    addInk,
    addInkFromStroke,
    simulate,
    render,
    getStats,
    getTerritory,
    device,
    chunkManager,
  }
}

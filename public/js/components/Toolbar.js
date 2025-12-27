// Toolbar component
import { html } from 'htm/preact'
import { COLORS } from '../constants/colors.js'
import { PaintBucket } from './PaintBucket.js'

export const Toolbar = ({
  currentColor,
  paintLevels,
  paintWarning,
  isEraser,
  brushSize,
  zoom,
  onColorSelect,
  onEraserToggle,
  onBrushSizeChange,
  onClear,
  onZoomIn,
  onZoomOut,
  onResetView,
  onShowHost
}) => html`
  <div class="toolbar">
    ${COLORS.filter(c => c !== '#ffffff').map(c => html`
      <${PaintBucket}
        key=${c + (paintWarning?.color === c ? paintWarning.key : '')}
        color=${c}
        paintLevel=${paintLevels[c] || 0}
        isActive=${currentColor === c && !isEraser}
        isEmpty=${(paintLevels[c] || 0) <= 0}
        isShaking=${paintWarning?.color === c}
        onClick=${() => onColorSelect(c)}
      />
    `)}

    <input
      type="range"
      class="size-slider"
      min="2"
      max="40"
      value=${brushSize}
      onInput=${(e) => onBrushSizeChange(parseInt(e.target.value))}
    />

    <button
      class=${'tool-btn' + (isEraser ? ' active' : '')}
      onClick=${onEraserToggle}
    >Erase</button>

    <button class="tool-btn" onClick=${onClear}>Clear</button>

    <button class="tool-btn" onClick=${onZoomOut}>-</button>
    <span class="zoom-display">${Math.round(zoom * 100)}%</span>
    <button class="tool-btn" onClick=${onZoomIn}>+</button>
    <button class="tool-btn" onClick=${onResetView}>Reset</button>
    <button class="tool-btn host-btn" onClick=${onShowHost}>Host</button>
  </div>
`

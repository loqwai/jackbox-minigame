// Coordinates display component
import { html } from 'htm/preact'

export const CoordsDisplay = ({ x, y, zoom }) => html`
  <div class="coords-display">
    <div><span class="coords-label">X:</span><span class="coords-value">${Math.round(x)}</span></div>
    <div><span class="coords-label">Y:</span><span class="coords-value">${Math.round(y)}</span></div>
    <div><span class="coords-label">Zoom:</span><span class="coords-value">${Math.round(zoom * 100)}%</span></div>
  </div>
`

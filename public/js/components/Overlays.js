// Overlay components
import { html } from 'htm/preact'

export const DisabledOverlay = ({ timer }) => html`
  <div class="disabled-overlay">
    DRAWING DISABLED
    <span class="disabled-timer">${timer}s</span>
  </div>
`

export const PaintWarning = ({ warningKey }) => html`
  <div class="paint-warning" key=${warningKey}>
    OUT OF PAINT!
  </div>
`

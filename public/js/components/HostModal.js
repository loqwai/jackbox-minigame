// Host QR modal component
import { html } from 'htm/preact'

export const HostModal = ({ roomId, localIp, qrSvg, onClose }) => html`
  <div class="modal-overlay" onClick=${onClose}>
    <div class="modal-content" onClick=${(e) => e.stopPropagation()}>
      <div class="modal-title">Host Offline Session</div>
      <div class="modal-subtitle">
        1. Enable phone hotspot<br/>
        2. Connect other devices to your hotspot<br/>
        3. Scan QR code to join
      </div>
      ${qrSvg && html`
        <div class="qr-container" dangerouslySetInnerHTML=${{ __html: qrSvg }} />
      `}
      ${localIp && html`
        <div class="url-display">http://${localIp}:8787/room/${roomId}</div>
      `}
      ${!localIp && html`
        <div class="modal-subtitle">Detecting local IP...</div>
      `}
      <button class="modal-close" onClick=${onClose}>Close</button>
    </div>
  </div>
`

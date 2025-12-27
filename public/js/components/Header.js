// Header component
import { html } from 'htm/preact'

export const Header = ({ roomId, connected, userCount, peerCount, online }) => {
  const statusText = connected
    ? `${userCount} player${userCount !== 1 ? 's' : ''}`
    : 'Connecting...'

  return html`
    <div class="header">
      <div>
        <span class="room-code">${roomId}</span>
        ${!online && html`<span class="offline-badge">OFFLINE</span>`}
      </div>
      <div>
        <span class="user-count">${statusText}</span>
        ${peerCount > 0 && html`<span class="peer-count"> (${peerCount} P2P)</span>`}
      </div>
    </div>
  `
}

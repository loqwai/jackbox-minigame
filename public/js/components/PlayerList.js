// Player list component
import { html } from 'htm/preact'
import { getPeerColor } from '../state/peer-colors.js'

export const PlayerList = ({ myPos, selfColor, remoteCursors, onGoToPlayer }) => {
  if (remoteCursors.size === 0) return null

  return html`
    <div class="player-list">
      <div class="player-list-title">Players (${remoteCursors.size + 1})</div>
      <div class="player-item">
        <div class="player-dot" style="background:${selfColor}" />
        <div class="player-name">You</div>
        <div class="player-coords">${Math.round(myPos.x)}, ${Math.round(myPos.y)}</div>
      </div>
      ${Array.from(remoteCursors.entries()).map(([peerId, cursor]) => {
        const color = getPeerColor(peerId)
        return html`
          <div class="player-item" key=${peerId}>
            <div class="player-dot" style="background:${color}" />
            <div class="player-name">P-${peerId.slice(0, 4)}</div>
            <div class="player-coords">${Math.round(cursor.x)}, ${Math.round(cursor.y)}</div>
            <button class="goto-btn" onClick=${() => onGoToPlayer(peerId)}>Go</button>
          </div>
        `
      })}
    </div>
  `
}

// Minimap component
import { html } from 'htm/preact'
import { MINIMAP_SIZE } from '../constants/game.js'
import { worldToMinimap, isInMinimapBounds, getArrowIndicator } from '../math/transforms.js'
import { getPeerColor } from '../state/peer-colors.js'

export const Minimap = ({ myPos, remoteCursors, enemies, selfColor, onGoToPlayer }) => {
  const elements = []
  const center = MINIMAP_SIZE / 2

  // Self cursor at center
  elements.push({
    type: 'cursor',
    x: center,
    y: center,
    color: selfColor,
    isSelf: true
  })

  // Remote cursors
  remoteCursors.forEach((cursor, peerId) => {
    const color = getPeerColor(peerId)
    const pos = worldToMinimap(cursor.x, cursor.y, myPos)

    if (isInMinimapBounds(pos.x, pos.y)) {
      elements.push({ type: 'cursor', x: pos.x, y: pos.y, color, isSelf: false, peerId })
    } else {
      const arrow = getArrowIndicator(cursor.x, cursor.y, myPos, color)
      elements.push({ type: 'arrow', ...arrow, peerId })
    }
  })

  // Enemies
  enemies.forEach((enemy, i) => {
    const pos = worldToMinimap(enemy.x, enemy.y, myPos)
    if (isInMinimapBounds(pos.x, pos.y, 5)) {
      elements.push({ type: 'enemy', x: pos.x, y: pos.y })
    } else {
      const arrow = getArrowIndicator(enemy.x, enemy.y, myPos, '#e94560')
      elements.push({ type: 'enemy-arrow', ...arrow })
    }
  })

  return html`
    <div class="minimap">
      <div class="minimap-inner">
        ${elements.map((el, i) => {
          if (el.type === 'cursor') {
            const cls = 'minimap-cursor' + (el.isSelf ? ' self' : ' clickable')
            const style = 'left:' + el.x + 'px;top:' + el.y + 'px;background:' + el.color
            if (el.isSelf) return html`<div key=${i} class=${cls} style=${style} />`
            return html`<div key=${i} class=${cls} style=${style} onClick=${() => onGoToPlayer(el.peerId)} title="Click to go to player" />`
          }
          if (el.type === 'arrow') {
            const style = 'left:' + el.x + 'px;top:' + el.y + 'px;border-bottom-color:' + el.color + ';transform:translate(-50%,-50%) rotate(' + el.rotation + 'deg);cursor:pointer'
            return html`<div key=${i} class="minimap-arrow" style=${style} onClick=${() => onGoToPlayer(el.peerId)} title="Click to go to player" />`
          }
          if (el.type === 'enemy') {
            const style = 'left:' + el.x + 'px;top:' + el.y + 'px;background:#e94560;width:6px;height:6px'
            return html`<div key=${i} class="minimap-cursor" style=${style} />`
          }
          if (el.type === 'enemy-arrow') {
            const style = 'left:' + el.x + 'px;top:' + el.y + 'px;border-bottom-color:#e94560;transform:translate(-50%,-50%) rotate(' + el.rotation + 'deg);opacity:0.7'
            return html`<div key=${i} class="minimap-arrow" style=${style} />`
          }
        })}
      </div>
    </div>
  `
}

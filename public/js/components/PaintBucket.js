// Paint bucket component
import { html } from 'htm/preact'
import { MAX_PAINT } from '../constants/game.js'

export const PaintBucket = ({ color, paintLevel, isActive, isEmpty, isShaking, onClick }) => {
  const fillPercent = (paintLevel / MAX_PAINT) * 100
  const cls = 'paint-bucket' +
    (isActive ? ' active' : '') +
    (isEmpty ? ' empty' : '') +
    (isShaking ? ' shake' : '')

  return html`
    <div class=${cls} onClick=${() => !isEmpty && onClick()}>
      <div class="bucket-handle" style="border-color:${color}" />
      <div class="bucket-rim" style="background:${color}" />
      <div class="bucket-body" style="background:rgba(0,0,0,0.2)">
        <div class="bucket-fill" style="background:${color};height:${fillPercent}%" />
      </div>
      ${paintLevel > 20 && html`
        <div class="paint-spill" style="background:${color}" />
        <div class="paint-drops">
          <div class="paint-drop" style="background:${color}" />
          <div class="paint-drop" style="background:${color}" />
          <div class="paint-drop" style="background:${color}" />
        </div>
      `}
      <div class="reload-bar">
        <div class="reload-progress" style="width:${fillPercent}%;background:${color}" />
      </div>
    </div>
  `
}

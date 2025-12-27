// QR code generation utility
import qrcode from 'qrcode-generator'

export const generateQrSvg = (text) => {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  return qr.createSvgTag({ cellSize: 6, margin: 2 })
}

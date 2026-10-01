import { backgroundOf, dataUrlToBlob, withOffscreenRender } from './dom'
import type { ExportContext } from '../core/types'

// Shown in place of images that can't be fetched (CORS), instead of failing.
const PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='

export async function toImage(context: ExportContext, format: 'png' | 'jpeg' | 'svg'): Promise<Blob> {
  const htmlToImage = await import('html-to-image')
  const { width, scale } = context.options

  return withOffscreenRender(context, { width, padding: 40 }, async (element) => {
    const options = {
      pixelRatio: format === 'svg' ? 1 : scale,
      backgroundColor: backgroundOf(element),
      width: element.offsetWidth,
      height: element.offsetHeight,
      skipFonts: true,
      imagePlaceholder: PLACEHOLDER,
      // The offscreen host positions the element; the clone must sit at 0,0.
      style: { margin: '0', transform: 'none' },
    }
    if (format === 'png') {
      const blob = await htmlToImage.toBlob(element, options)
      if (!blob) throw new Error('Image rendering failed')
      return blob
    }
    if (format === 'jpeg') {
      return dataUrlToBlob(await htmlToImage.toJpeg(element, { ...options, quality: 0.92 }))
    }
    const svgDataUrl = await htmlToImage.toSvg(element, options)
    const svg = decodeURIComponent(svgDataUrl.slice(svgDataUrl.indexOf(',') + 1))
    return new Blob([svg], { type: 'image/svg+xml' })
  })
}

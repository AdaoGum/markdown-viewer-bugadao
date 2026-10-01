import { buildHtmlDocument } from './dom'
import type { ExportContext } from '../core/types'

/** Opens the browser print dialog for the rendered document (vector PDF via "Save as PDF"). */
export function printDocument(context: ExportContext): Promise<void> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe')
    iframe.setAttribute('aria-hidden', 'true')
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;'
    iframe.srcdoc = buildHtmlDocument(context)
    iframe.onload = () => {
      const win = iframe.contentWindow
      if (!win) {
        iframe.remove()
        reject(new Error('Print frame unavailable'))
        return
      }
      const cleanup = () => setTimeout(() => iframe.remove(), 500)
      win.addEventListener('afterprint', cleanup, { once: true })
      // Let images settle, then print. print() blocks until the dialog closes
      // in most browsers; the fallback timer covers the ones where it doesn't.
      setTimeout(() => {
        try {
          win.focus()
          win.print()
          resolve()
        } catch (error) {
          reject(error)
        }
        setTimeout(() => iframe.remove(), 60_000)
      }, 250)
    }
    document.body.appendChild(iframe)
  })
}

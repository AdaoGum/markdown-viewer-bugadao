import { toPlainText } from './text'
import type { ExportContext } from '../core/types'

/** Copies the rendered document as rich text (with a plain-text fallback). */
export async function copyHtml(context: ExportContext): Promise<void> {
  const plain = toPlainText(context)
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([context.html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      }),
    ])
    return
  }
  await navigator.clipboard.writeText(plain)
}

export async function copyMarkdown(context: ExportContext): Promise<void> {
  await navigator.clipboard.writeText(context.markdown)
}

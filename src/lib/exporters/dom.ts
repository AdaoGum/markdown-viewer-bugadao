import { contentCss, ensureStyles } from '../core/styles'
import { escapeXml } from './shared'
import type { ExportContext } from '../core/types'

const PAGE_CSS = `
html, body { margin: 0; padding: 0; background: var(--mv-bg); }
.mv-page { max-width: 880px; margin: 0 auto; padding: 48px 32px 64px; }
@media (max-width: 640px) { .mv-page { padding: 24px 16px 40px; } }
@media print { .mv-page { max-width: none; padding: 0; } @page { margin: 16mm; } }
`

/** A complete, self-contained HTML document for the rendered Markdown. */
export function buildHtmlDocument(context: ExportContext): string {
  const { title, html, options } = context
  const author = options.author ? `\n<meta name="author" content="${escapeXml(options.author)}">` : ''
  return `<!DOCTYPE html>
<html lang="${escapeXml(options.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Markdown Viewer Bugadão">${author}
<title>${escapeXml(title)}</title>
<style>
${contentCss}
${PAGE_CSS}
</style>
</head>
<body data-mv-theme="${options.theme}">
<main class="mv-content mv-page">
${html}
</main>
</body>
</html>
`
}

function waitForImages(root: HTMLElement, timeout = 8000): Promise<void> {
  const pending = Array.from(root.querySelectorAll('img'))
    .filter((img) => !img.complete)
    .map(
      (img) =>
        new Promise<void>((resolve) => {
          img.addEventListener('load', () => resolve(), { once: true })
          img.addEventListener('error', () => resolve(), { once: true })
        }),
    )
  const timer = new Promise<void>((resolve) => setTimeout(resolve, timeout))
  return Promise.race([Promise.all(pending).then(() => undefined), timer])
}

/**
 * Renders the document into a detached-from-view element (themed, fixed
 * width) and hands it to `callback`, which captures it. The element carries
 * its own `data-mv-theme` so it still resolves colors if a library clones it
 * elsewhere in the DOM (html2pdf does).
 */
export async function withOffscreenRender<T>(
  context: ExportContext,
  settings: { width: number; padding: number },
  callback: (element: HTMLElement) => Promise<T>,
): Promise<T> {
  ensureStyles()
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${settings.width}px;pointer-events:none;`

  const element = document.createElement('div')
  element.className = 'mv-content'
  element.setAttribute('data-mv-theme', context.options.theme)
  element.style.padding = `${settings.padding}px`
  element.style.width = `${settings.width}px`
  element.innerHTML = context.html
  // Images must allow CORS to be captured onto a canvas.
  element.querySelectorAll('img').forEach((img) => {
    if (!img.src.startsWith('data:')) img.crossOrigin = 'anonymous'
  })

  host.appendChild(element)
  document.body.appendChild(host)
  try {
    await waitForImages(element)
    await document.fonts?.ready
    return await callback(element)
  } finally {
    host.remove()
  }
}

export function backgroundOf(element: HTMLElement): string {
  return getComputedStyle(element).backgroundColor || '#ffffff'
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob()
}

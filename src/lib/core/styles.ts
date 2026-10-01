import contentCss from '../styles/content.css?inline'
import viewerCss from '../styles/viewer.css?inline'

/** CSS for rendered Markdown (both themes). Embedded into HTML/EPUB exports. */
export { contentCss }

/** CSS for the viewer chrome (toolbar, menu, editor). */
export { viewerCss }

const STYLE_ID = 'markdown-viewer-bugadao-styles'

/**
 * Injects the library styles into the document once. Called automatically by
 * the components; exported for apps that render exports without mounting one.
 */
export function ensureStyles(doc: Document | undefined = globalThis.document): void {
  if (!doc || doc.getElementById(STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = `${contentCss}\n${viewerCss}`
  doc.head.prepend(style)
}

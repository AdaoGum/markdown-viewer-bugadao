import type { App, Plugin } from 'vue'
import MarkdownViewer from './components/MarkdownViewer.vue'
import MarkdownPreview from './components/MarkdownPreview.vue'
import ExportMenu from './components/ExportMenu.vue'

export { MarkdownViewer, MarkdownPreview, ExportMenu }

export { renderMarkdown, parseMarkdown, treeToHtml, extractTitle } from './core/markdown'
export { useMarkdown, useResolvedTheme } from './core/use-markdown'
export { exportMarkdown, createExportContext, runExporter, defaultExportOptions } from './core/export'
export type { ContextInput, ExportMarkdownOptions } from './core/export'
export { builtinExporters, resolveExporters } from './exporters'
export type { BuiltinFormat } from './exporters'
export { downloadBlob, sanitizeFilename } from './core/download'
export { ensureStyles, contentCss, viewerCss } from './core/styles'
export { en, ptBR, locales, resolveMessages } from './core/i18n'
export type { Messages } from './core/i18n'
export { ExportError } from './core/types'
export type {
  ExportCategory,
  ExportContext,
  ExportOptions,
  ExportResult,
  Exporter,
  RenderOptions,
  ThemeName,
  ThemeOption,
  ViewerMode,
} from './core/types'

/** Vue plugin: registers <MarkdownViewer> and <MarkdownPreview> globally. */
export const MarkdownViewerPlugin: Plugin = {
  install(app: App) {
    app.component('MarkdownViewer', MarkdownViewer)
    app.component('MarkdownPreview', MarkdownPreview)
  },
}

export default MarkdownViewerPlugin

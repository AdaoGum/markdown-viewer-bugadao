import { downloadBlob, sanitizeFilename } from './download'
import { extractTitle, parseMarkdown, treeToHtml } from './markdown'
import { resolveExporters } from '../exporters'
import type { ExportContext, ExportOptions, ExportResult, Exporter, RenderOptions } from './types'
import type { Root } from 'mdast'

export const defaultExportOptions: ExportContext['options'] = {
  theme: 'light',
  pageSize: 'a4',
  orientation: 'portrait',
  margin: 15,
  scale: 2,
  width: 820,
  lang: 'en',
}

export interface ContextInput {
  markdown: string
  /** Pre-rendered tree and HTML (the viewer passes its own to avoid re-rendering). */
  tree?: Root
  html?: string
  title?: string
  filename?: string
  render?: RenderOptions
  options?: ExportOptions
}

export function createExportContext(input: ContextInput): ExportContext {
  const tree = input.tree ?? parseMarkdown(input.markdown)
  const html = input.html ?? treeToHtml(tree, input.render)
  const title = input.title?.trim() || extractTitle(tree) || input.filename || 'Document'
  const filename = sanitizeFilename(input.filename || title)
  const options = { ...defaultExportOptions }
  for (const [key, value] of Object.entries(input.options ?? {})) {
    if (value !== undefined) (options as Record<string, unknown>)[key] = value
  }
  return { markdown: input.markdown, tree: structuredClone(tree), html, title, filename, options }
}

/** Runs one exporter and, unless `download` is false, saves the file it produced. */
export async function runExporter(exporter: Exporter, context: ExportContext, download = true): Promise<ExportResult> {
  const blob = (await exporter.run(context)) ?? undefined
  if (!blob) return { exporter }
  const filename = exporter.extension ? `${context.filename}.${exporter.extension}` : context.filename
  if (download) downloadBlob(blob, filename)
  return { exporter, blob, filename }
}

export interface ExportMarkdownOptions extends Omit<ContextInput, 'markdown'> {
  /** Save the file in the browser. Default: true. Set false to only get the Blob. */
  download?: boolean
  /** Extra exporters that can be referenced by id. */
  exporters?: Exporter[]
}

/**
 * Converts Markdown to any supported format without mounting a component.
 *
 * @example
 * const { blob } = await exportMarkdown('# Hi', 'docx', { download: false })
 */
export async function exportMarkdown(
  markdown: string,
  format: string | Exporter,
  { download = true, exporters, ...input }: ExportMarkdownOptions = {},
): Promise<ExportResult> {
  const exporter = typeof format === 'string' ? resolveExporters([format], exporters)[0] : format
  if (!exporter) throw new Error(`Unknown export format: ${String(format)}`)
  return runExporter(exporter, createExportContext({ markdown, ...input }), download)
}

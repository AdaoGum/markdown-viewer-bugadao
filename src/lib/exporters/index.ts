import { buildHtmlDocument } from './dom'
import type { Exporter } from '../core/types'

const text = (value: string, type: string) => new Blob([value], { type: `${type};charset=utf-8` })

/*
 * Built-in formats. Heavy implementations (PDF, DOCX, images, zip-based
 * formats) are dynamic imports, so an app only downloads the code for a format
 * when a user actually exports to it.
 */
export const builtinExporters: Exporter[] = [
  {
    id: 'pdf',
    label: 'PDF',
    extension: 'pdf',
    mimeType: 'application/pdf',
    category: 'document',
    run: async (ctx) => (await import('./pdf')).toPdf(ctx),
  },
  {
    id: 'docx',
    label: 'Word (DOCX)',
    extension: 'docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    category: 'document',
    run: async (ctx) => (await import('./docx')).toDocx(ctx),
  },
  {
    id: 'odt',
    label: 'OpenDocument (ODT)',
    extension: 'odt',
    mimeType: 'application/vnd.oasis.opendocument.text',
    category: 'document',
    run: async (ctx) => (await import('./odt')).toOdt(ctx),
  },
  {
    id: 'rtf',
    label: 'Rich Text (RTF)',
    extension: 'rtf',
    mimeType: 'application/rtf',
    category: 'document',
    run: async (ctx) => text(await (await import('./rtf')).toRtf(ctx), 'application/rtf'),
  },
  {
    id: 'epub',
    label: 'EPUB e-book',
    extension: 'epub',
    mimeType: 'application/epub+zip',
    category: 'document',
    run: async (ctx) => (await import('./epub')).toEpub(ctx),
  },
  {
    id: 'tex',
    label: 'LaTeX',
    extension: 'tex',
    mimeType: 'application/x-tex',
    category: 'document',
    run: async (ctx) => text((await import('./latex')).toLatex(ctx), 'application/x-tex'),
  },
  {
    id: 'html',
    label: 'HTML page',
    extension: 'html',
    mimeType: 'text/html',
    category: 'web',
    run: (ctx) => text(buildHtmlDocument(ctx), 'text/html'),
  },
  {
    id: 'md',
    label: 'Markdown',
    extension: 'md',
    mimeType: 'text/markdown',
    category: 'web',
    run: (ctx) => text(ctx.markdown, 'text/markdown'),
  },
  {
    id: 'png',
    label: 'PNG image',
    extension: 'png',
    mimeType: 'image/png',
    category: 'image',
    run: async (ctx) => (await import('./image')).toImage(ctx, 'png'),
  },
  {
    id: 'jpeg',
    label: 'JPEG image',
    extension: 'jpg',
    mimeType: 'image/jpeg',
    category: 'image',
    run: async (ctx) => (await import('./image')).toImage(ctx, 'jpeg'),
  },
  {
    id: 'svg',
    label: 'SVG image',
    extension: 'svg',
    mimeType: 'image/svg+xml',
    category: 'image',
    run: async (ctx) => (await import('./image')).toImage(ctx, 'svg'),
  },
  {
    id: 'txt',
    label: 'Plain text',
    extension: 'txt',
    mimeType: 'text/plain',
    category: 'data',
    run: async (ctx) => text((await import('./text')).toPlainText(ctx), 'text/plain'),
  },
  {
    id: 'csv',
    label: 'Tables (CSV)',
    extension: 'csv',
    mimeType: 'text/csv',
    category: 'data',
    run: async (ctx) => text((await import('./text')).toCsv(ctx), 'text/csv'),
  },
  {
    id: 'json',
    label: 'mdast tree (JSON)',
    extension: 'json',
    mimeType: 'application/json',
    category: 'data',
    run: (ctx) => text(JSON.stringify(ctx.tree, (key, value) => (key === 'position' ? undefined : value), 2), 'application/json'),
  },
  {
    id: 'print',
    label: 'Print',
    category: 'action',
    run: async (ctx) => (await import('./print')).printDocument(ctx),
  },
  {
    id: 'copy-html',
    label: 'Copy as HTML',
    category: 'action',
    run: async (ctx) => (await import('./clipboard')).copyHtml(ctx),
  },
  {
    id: 'copy-markdown',
    label: 'Copy Markdown',
    category: 'action',
    run: async (ctx) => (await import('./clipboard')).copyMarkdown(ctx),
  },
]

export type BuiltinFormat =
  | 'pdf'
  | 'docx'
  | 'odt'
  | 'rtf'
  | 'epub'
  | 'tex'
  | 'html'
  | 'md'
  | 'png'
  | 'jpeg'
  | 'svg'
  | 'txt'
  | 'csv'
  | 'json'
  | 'print'
  | 'copy-html'
  | 'copy-markdown'

/**
 * Resolves the exporters to offer: built-ins filtered and ordered by `formats`
 * (all of them when omitted), plus custom exporters. A custom exporter whose
 * id matches a built-in replaces it.
 */
export function resolveExporters(formats?: readonly string[], custom: readonly Exporter[] = []): Exporter[] {
  const byId = new Map<string, Exporter>(builtinExporters.map((exporter) => [exporter.id, exporter]))
  custom.forEach((exporter) => byId.set(exporter.id, exporter))
  if (!formats) {
    const builtinIds = builtinExporters.map((exporter) => exporter.id)
    const extra = custom.filter((exporter) => !builtinIds.includes(exporter.id))
    return [...builtinIds.map((id) => byId.get(id)!), ...extra]
  }
  return formats.map((id) => byId.get(id)).filter((exporter): exporter is Exporter => !!exporter)
}

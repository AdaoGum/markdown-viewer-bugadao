import type { Root } from 'mdast'

export type ThemeName = 'light' | 'dark'
export type ThemeOption = ThemeName | 'auto'
export type ViewerMode = 'preview' | 'split' | 'edit'

export type ExportCategory = 'document' | 'web' | 'image' | 'data' | 'action'

export interface ExportOptions {
  /** Theme used when a format renders the document visually (PDF, images, HTML, print). Default: 'light'. */
  theme?: ThemeName
  /** Paper size for PDF export. Default: 'a4'. */
  pageSize?: 'a4' | 'letter' | 'legal' | 'a3' | 'a5'
  /** Page orientation for PDF export. Default: 'portrait'. */
  orientation?: 'portrait' | 'landscape'
  /** PDF page margin in millimetres. Default: 15. */
  margin?: number
  /** Pixel ratio for raster exports (PNG, JPEG, PDF). Default: 2. */
  scale?: number
  /** Width in CSS pixels of the rendered page for image exports. Default: 820. */
  width?: number
  /** Document author written into metadata where the format supports it. */
  author?: string
  /** Language tag written into metadata (EPUB, HTML). Default: 'en'. */
  lang?: string
}

export interface ExportContext {
  /** The raw Markdown source. */
  markdown: string
  /** Parsed mdast tree (a private copy each exporter may mutate). */
  tree: Root
  /** Rendered, sanitised HTML fragment (the body of the document). */
  html: string
  /** Document title: explicit title, else the first H1, else the filename. */
  title: string
  /** Base file name, without extension. */
  filename: string
  options: Required<Omit<ExportOptions, 'author'>> & Pick<ExportOptions, 'author'>
}

export interface Exporter {
  /** Unique id, also used in the `formats` prop (e.g. 'pdf'). */
  id: string
  /** Human label shown in the export menu. */
  label: string
  /** File extension without the dot. Omit for actions that don't produce a file. */
  extension?: string
  mimeType?: string
  category: ExportCategory
  /**
   * Produces the file. Returning a Blob makes the viewer download it as
   * `${filename}.${extension}`; returning nothing means the exporter handled
   * the output itself (print dialog, clipboard, ...).
   */
  run(context: ExportContext): Promise<Blob | void> | Blob | void
}

/**
 * An expected export failure (as opposed to a bug). The `code` lets the viewer
 * show a translated message from `messages.errors`.
 */
export class ExportError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ExportError'
  }
}

export interface ExportResult {
  exporter: Exporter
  blob?: Blob
  filename?: string
}

export interface RenderOptions {
  /** Allow raw HTML inside the Markdown. It is sanitised. Default: false. */
  allowHtml?: boolean
  /** Syntax-highlight fenced code blocks. Default: true. */
  highlight?: boolean
}

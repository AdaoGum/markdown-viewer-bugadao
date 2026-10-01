import JSZip from 'jszip'
import type { RootContent, PhrasingContent, List, Table, Image } from 'mdast'
import { normalizeTree, escapeXml, loadDocumentImages, fitWidth, codeLines, type LoadedImage, type NormalizedDocument } from './shared'
import type { ExportContext } from '../core/types'

const NS = [
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"',
  'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"',
  'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"',
  'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"',
  'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"',
  'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"',
  'xmlns:xlink="http://www.w3.org/1999/xlink"',
  'xmlns:dc="http://purl.org/dc/elements/1.1/"',
  'xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"',
  'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"',
  'xmlns:loext="urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0"',
].join(' ')

const MAX_IMAGE_PX = 640
const ALIGN: Record<string, string> = { center: 'C', right: 'R' }
const pxToCm = (px: number) => `${((px * 2.54) / 96).toFixed(3)}cm`

/** Text with ODF whitespace encoding (runs of spaces, tabs). */
function odfText(value: string): string {
  return escapeXml(value)
    .replace(/\t/g, '<text:tab/>')
    .replace(/ {2,}/g, (spaces) => ` <text:s text:c="${spaces.length - 1}"/>`)
    .replace(/^ /, '<text:s/>')
}

class OdtWriter {
  pictures: { path: string; data: Uint8Array; mime: string }[] = []
  private quoteDepths = new Set<number>()
  private tables = 0

  constructor(
    private doc: NormalizedDocument,
    private images: Map<string, LoadedImage | null>,
  ) {}

  span(style: string, content: string) {
    return content ? `<text:span text:style-name="${style}">${content}</text:span>` : ''
  }

  image(node: Image): string {
    const loaded = this.images.get(node.url)
    if (!loaded) return this.span('Emphasis', odfText(`[${node.alt || 'image'}]`))
    const index = this.pictures.length + 1
    const path = `Pictures/image${index}.${loaded.type === 'png' ? 'png' : 'jpg'}`
    this.pictures.push({ path, data: loaded.data, mime: loaded.type === 'png' ? 'image/png' : 'image/jpeg' })
    const size = fitWidth(loaded.width, loaded.height, MAX_IMAGE_PX)
    const title = node.alt ? `<svg:title>${escapeXml(node.alt)}</svg:title>` : ''
    return (
      `<draw:frame draw:style-name="fr1" draw:name="Image${index}" text:anchor-type="as-char" svg:width="${pxToCm(size.width)}" svg:height="${pxToCm(size.height)}" draw:z-index="0">` +
      `<draw:image xlink:href="${path}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>${title}</draw:frame>`
    )
  }

  inline(nodes: PhrasingContent[]): string {
    return nodes
      .map((node): string => {
        switch (node.type) {
          case 'text':
            return odfText(node.value.replace(/\n/g, ' '))
          case 'strong':
            return this.span('Strong_20_Emphasis', this.inline(node.children))
          case 'emphasis':
            return this.span('Emphasis', this.inline(node.children))
          case 'delete':
            return this.span('Strikethrough', this.inline(node.children))
          case 'inlineCode':
            return this.span('Source_20_Text', odfText(node.value))
          case 'break':
            return '<text:line-break/>'
          case 'image':
            return this.image(node)
          case 'link': {
            const content = this.inline(node.children)
            if (!node.url) return content
            return `<text:a xlink:type="simple" xlink:href="${escapeXml(node.url)}" text:style-name="Internet_20_link" text:visited-style-name="Visited_20_Internet_20_Link">${content}</text:a>`
          }
          case 'footnoteReference': {
            const index = this.doc.footnoteNumber(node.identifier)
            if (!index) return ''
            const body = this.doc.footnotes[index - 1].children
              .map((child) => (child.type === 'paragraph' ? `<text:p text:style-name="Footnote">${this.inline(child.children)}</text:p>` : ''))
              .join('')
            return `<text:note text:id="ftn${index}" text:note-class="footnote"><text:note-citation>${index}</text:note-citation><text:note-body>${body}</text:note-body></text:note>`
          }
          default:
            return 'children' in node ? this.inline(node.children as PhrasingContent[]) : ''
        }
      })
      .join('')
  }

  paragraphStyle(base: string, quote: number) {
    if (!quote) return base
    this.quoteDepths.add(quote)
    return `Quote${quote}`
  }

  list(list: List, quote: number): string {
    const style = list.ordered ? 'L_Number' : 'L_Bullet'
    const items = list.children.map((item, i) => {
      const start = i === 0 && list.ordered && list.start != null && list.start !== 1 ? ` text:start-value="${list.start}"` : ''
      const task = item.checked == null ? '' : item.checked ? '☑ ' : '☐ '
      const body = item.children
        .map((child, index) => {
          if (index === 0 && child.type === 'paragraph') {
            return `<text:p text:style-name="${this.paragraphStyle('List_20_Paragraph', quote)}">${escapeXml(task)}${this.inline(child.children)}</text:p>`
          }
          return this.block(child, quote)
        })
        .join('')
      return `<text:list-item${start}>${body}</text:list-item>`
    })
    return `<text:list text:style-name="${style}">${items.join('')}</text:list>`
  }

  table(table: Table): string {
    const name = `Table${++this.tables}`
    const columns = Math.max(...table.children.map((row) => row.children.length))
    const align = (i: number) => ALIGN[table.align?.[i] ?? ''] ?? 'L'
    const rows = table.children.map((row, r) => {
      const cells = Array.from({ length: columns }, (_, c) => {
        const cell = row.children[c]
        const kind = r === 0 ? 'TH' : 'TD'
        return `<table:table-cell table:style-name="${kind}Cell" office:value-type="string"><text:p text:style-name="${kind}${align(c)}">${cell ? this.inline(cell.children) : ''}</text:p></table:table-cell>`
      })
      return `<table:table-row>${cells.join('')}</table:table-row>`
    })
    const [head, ...body] = rows
    return (
      `<table:table table:name="${name}" table:style-name="Tbl">` +
      `<table:table-column table:number-columns-repeated="${columns}"/>` +
      `<table:table-header-rows>${head}</table:table-header-rows>${body.join('')}</table:table>`
    )
  }

  block(node: RootContent, quote = 0): string {
    switch (node.type) {
      case 'heading':
        return `<text:h text:style-name="Heading_20_${node.depth}" text:outline-level="${node.depth}">${this.inline(node.children)}</text:h>`
      case 'paragraph':
        return `<text:p text:style-name="${this.paragraphStyle('Text_20_body', quote)}">${this.inline(node.children)}</text:p>`
      case 'thematicBreak':
        return '<text:p text:style-name="Horizontal_20_Line"/>'
      case 'code':
        return codeLines(node.value)
          .map((line) => `<text:p text:style-name="Preformatted_20_Text">${odfText(line)}</text:p>`)
          .join('')
      case 'blockquote':
        return node.children.map((child) => this.block(child, quote + 1)).join('')
      case 'list':
        return this.list(node, quote)
      case 'table':
        return this.table(node)
      default:
        return 'children' in node ? (node.children as RootContent[]).map((child) => this.block(child, quote)).join('') : ''
    }
  }

  automaticStyles(): string {
    const quotes = [...this.quoteDepths]
      .map(
        (depth) =>
          `<style:style style:name="Quote${depth}" style:family="paragraph" style:parent-style-name="Quotations"><style:paragraph-properties fo:margin-left="${(depth * 0.6).toFixed(1)}cm"/></style:style>`,
      )
      .join('')
    const cellAlign = (kind: string, parent: string) =>
      (['L', 'C', 'R'] as const)
        .map(
          (a) =>
            `<style:style style:name="${kind}${a}" style:family="paragraph" style:parent-style-name="${parent}"><style:paragraph-properties fo:text-align="${{ L: 'start', C: 'center', R: 'end' }[a]}"/></style:style>`,
        )
        .join('')
    const cellBorder = 'fo:border="0.5pt solid #d1d9e0" fo:padding="0.1cm"'
    return (
      '<style:style style:name="Tbl" style:family="table"><style:table-properties style:width="17cm" table:align="margins" fo:margin-bottom="0.3cm"/></style:style>' +
      `<style:style style:name="THCell" style:family="table-cell"><style:table-cell-properties fo:background-color="#f6f8fa" ${cellBorder}/></style:style>` +
      `<style:style style:name="TDCell" style:family="table-cell"><style:table-cell-properties ${cellBorder}/></style:style>` +
      cellAlign('TH', 'Table_20_Heading') +
      cellAlign('TD', 'Table_20_Contents') +
      '<style:style style:name="fr1" style:family="graphic" style:parent-style-name="Graphics"><style:graphic-properties style:vertical-pos="top" style:vertical-rel="baseline"/></style:style>' +
      quotes
    )
  }
}

function listStyle(name: string, bullets: string[] | null): string {
  const levels = Array.from({ length: 10 }, (_, i) => {
    const level = i + 1
    const props =
      `<style:list-level-properties text:list-level-position-and-space-mode="label-alignment">` +
      `<style:list-level-label-alignment text:label-followed-by="listtab" text:list-tab-stop-position="${(0.635 * level).toFixed(3)}cm" fo:text-indent="-0.635cm" fo:margin-left="${(0.635 * level).toFixed(3)}cm"/>` +
      `</style:list-level-properties>`
    return bullets
      ? `<text:list-level-style-bullet text:level="${level}" text:bullet-char="${bullets[i % bullets.length]}">${props}</text:list-level-style-bullet>`
      : `<text:list-level-style-number text:level="${level}" style:num-format="1" style:num-suffix=".">${props}</text:list-level-style-number>`
  })
  return `<text:list-style style:name="${name}">${levels.join('')}</text:list-style>`
}

function stylesXml(): string {
  const heading = (level: number, size: string) =>
    `<style:style style:name="Heading_20_${level}" style:display-name="Heading ${level}" style:family="paragraph" style:parent-style-name="Heading" style:next-style-name="Text_20_body" style:default-outline-level="${level}" style:class="text"><style:text-properties fo:font-size="${size}" fo:font-weight="bold"${level === 6 ? ' fo:color="#59636e"' : ''}/></style:style>`
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles ${NS} office:version="1.3">
<office:font-face-decls>
<style:font-face style:name="Carlito" svg:font-family="Carlito, Calibri, 'Liberation Sans', Arial" style:font-family-generic="swiss"/>
<style:font-face style:name="Liberation Mono" svg:font-family="'Liberation Mono', Consolas, 'Courier New'" style:font-family-generic="modern" style:font-pitch="fixed"/>
</office:font-face-decls>
<office:styles>
<style:default-style style:family="paragraph"><style:paragraph-properties fo:orphans="2" fo:widows="2"/><style:text-properties style:font-name="Carlito" fo:font-size="11pt" fo:color="#1f2328" fo:language="en"/></style:default-style>
<style:style style:name="Standard" style:family="paragraph" style:class="text"/>
<style:style style:name="Text_20_body" style:display-name="Text body" style:family="paragraph" style:parent-style-name="Standard" style:class="text"><style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0.25cm" fo:line-height="130%"/></style:style>
<style:style style:name="List_20_Paragraph" style:display-name="List Paragraph" style:family="paragraph" style:parent-style-name="Text_20_body"><style:paragraph-properties fo:margin-bottom="0.1cm"/></style:style>
<style:style style:name="Heading" style:family="paragraph" style:parent-style-name="Standard" style:next-style-name="Text_20_body" style:class="text"><style:paragraph-properties fo:margin-top="0.45cm" fo:margin-bottom="0.2cm" fo:keep-with-next="always"/></style:style>
${heading(1, '20pt')}${heading(2, '16pt')}${heading(3, '14pt')}${heading(4, '12pt')}${heading(5, '11pt')}${heading(6, '11pt')}
<style:style style:name="Preformatted_20_Text" style:display-name="Preformatted Text" style:family="paragraph" style:parent-style-name="Standard" style:class="html"><style:paragraph-properties fo:margin-top="0cm" fo:margin-bottom="0cm" fo:background-color="#f6f8fa" fo:padding-left="0.2cm" fo:padding-right="0.2cm" fo:border-left="0.5pt solid #d1d9e0" fo:border-right="0.5pt solid #d1d9e0" style:join-border="true"/><style:text-properties style:font-name="Liberation Mono" fo:font-size="9.5pt"/></style:style>
<style:style style:name="Quotations" style:family="paragraph" style:parent-style-name="Text_20_body" style:class="html"><style:paragraph-properties fo:margin-left="0.6cm" fo:padding-left="0.3cm" fo:border-left="2.5pt solid #d1d9e0"/><style:text-properties fo:color="#59636e"/></style:style>
<style:style style:name="Table_20_Contents" style:display-name="Table Contents" style:family="paragraph" style:parent-style-name="Standard" style:class="extra"/>
<style:style style:name="Table_20_Heading" style:display-name="Table Heading" style:family="paragraph" style:parent-style-name="Table_20_Contents" style:class="extra"><style:text-properties fo:font-weight="bold"/></style:style>
<style:style style:name="Horizontal_20_Line" style:display-name="Horizontal Line" style:family="paragraph" style:parent-style-name="Standard" style:class="html"><style:paragraph-properties fo:margin-top="0.2cm" fo:margin-bottom="0.4cm" fo:border-bottom="1.5pt solid #d1d9e0" fo:padding="0cm"/><style:text-properties fo:font-size="6pt"/></style:style>
<style:style style:name="Footnote" style:family="paragraph" style:parent-style-name="Standard" style:class="extra"><style:text-properties fo:font-size="9pt"/></style:style>
<style:style style:name="Graphics" style:family="graphic"><style:graphic-properties text:anchor-type="as-char" svg:y="0cm" style:vertical-pos="top" style:vertical-rel="baseline"/></style:style>
<style:style style:name="Strong_20_Emphasis" style:display-name="Strong Emphasis" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>
<style:style style:name="Emphasis" style:family="text"><style:text-properties fo:font-style="italic"/></style:style>
<style:style style:name="Strikethrough" style:family="text"><style:text-properties style:text-line-through-style="solid"/></style:style>
<style:style style:name="Source_20_Text" style:display-name="Source Text" style:family="text"><style:text-properties style:font-name="Liberation Mono" fo:font-size="9.5pt" fo:background-color="#f6f8fa"/></style:style>
<style:style style:name="Internet_20_link" style:display-name="Internet link" style:family="text"><style:text-properties fo:color="#0969da" style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"/></style:style>
<style:style style:name="Visited_20_Internet_20_Link" style:display-name="Visited Internet Link" style:family="text"><style:text-properties fo:color="#8250df" style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"/></style:style>
${listStyle('L_Bullet', ['•', '◦', '▪'])}
${listStyle('L_Number', null)}
<text:notes-configuration text:note-class="footnote" style:num-format="1" text:start-value="0" text:footnotes-position="page" text:start-numbering-at="document"/>
</office:styles>
<office:automatic-styles>
<style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm" fo:margin-top="2cm" fo:margin-bottom="2cm" fo:margin-left="2cm" fo:margin-right="2cm"/></style:page-layout>
</office:automatic-styles>
<office:master-styles><style:master-page style:name="Standard" style:page-layout-name="pm1"/></office:master-styles>
</office:document-styles>`
}


export async function toOdt(context: ExportContext): Promise<Blob> {
  const doc = normalizeTree(structuredClone(context.tree))
  const images = await loadDocumentImages(doc)

  const writer = new OdtWriter(doc, images)
  const body = doc.tree.children.map((node) => writer.block(node)).join('\n')

  const content = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content ${NS} office:version="1.3">
<office:automatic-styles>${writer.automaticStyles()}</office:automatic-styles>
<office:body><office:text>
${body}
</office:text></office:body>
</office:document-content>`

  const now = new Date().toISOString().replace(/\.\d+Z$/, '')
  const author = context.options.author ? `<dc:creator>${escapeXml(context.options.author)}</dc:creator><meta:initial-creator>${escapeXml(context.options.author)}</meta:initial-creator>` : ''
  const meta = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta ${NS} office:version="1.3"><office:meta><meta:generator>Markdown Viewer Bugadão</meta:generator><dc:title>${escapeXml(context.title)}</dc:title>${author}<meta:creation-date>${now}</meta:creation-date><dc:date>${now}</dc:date></office:meta></office:document-meta>`

  const pictures = writer.pictures
    .map((picture) => `<manifest:file-entry manifest:full-path="${picture.path}" manifest:media-type="${picture.mime}"/>`)
    .join('')
  const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">
<manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="application/vnd.oasis.opendocument.text"/>
<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
<manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>${pictures}
</manifest:manifest>`

  const zip = new JSZip()
  // The mimetype entry must come first and be stored uncompressed.
  zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' })
  zip.file('content.xml', content)
  zip.file('styles.xml', stylesXml())
  zip.file('meta.xml', meta)
  zip.file('META-INF/manifest.xml', manifest)
  writer.pictures.forEach((picture) => zip.file(picture.path, picture.data))
  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.oasis.opendocument.text',
    compression: 'DEFLATE',
  })
}

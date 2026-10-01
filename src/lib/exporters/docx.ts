import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  FootnoteReferenceRun,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ILevelsOptions,
  type INumberingOptions,
  type IParagraphOptions,
} from 'docx'
import type { RootContent, PhrasingContent, List, Table as MdTable, Image } from 'mdast'
import { normalizeTree, loadDocumentImages, fitWidth, codeLines, type LoadedImage, type NormalizedDocument } from './shared'
import type { ExportContext } from '../core/types'

const FONT = 'Calibri'
const MONO = 'Consolas'
const COLOR = { fg: '1F2328', muted: '59636E', link: '0969DA', shade: 'F6F8FA', border: 'D1D9E0' }
const CONTENT_WIDTH = 9026 // A4 minus 1" margins, in twips
const MAX_IMAGE_PX = 600
const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
]
const INDENT_STEP = 720
const ALIGNMENT: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
}

type Inline = TextRun | ExternalHyperlink | ImageRun | FootnoteReferenceRun
type Block = Paragraph | Table

interface Marks {
  bold?: boolean
  italics?: boolean
  strike?: boolean
  link?: boolean
  color?: string
}

interface State {
  indent: number
  quote: boolean
}

const border = (size = 4) => ({ style: BorderStyle.SINGLE, size, color: COLOR.border, space: 4 })
const shading = { type: ShadingType.CLEAR, fill: COLOR.shade, color: 'auto' }
// Quoted text is muted, like in the preview.
const marksFor = (state: State): Marks => (state.quote ? { color: COLOR.muted } : {})

function listLevels(format: (typeof LevelFormat)[keyof typeof LevelFormat], text: (level: number) => string, start = 1): ILevelsOptions[] {
  return Array.from({ length: 9 }, (_, level) => ({
    level,
    format,
    text: text(level),
    start,
    alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: INDENT_STEP * (level + 1), hanging: 360 } } },
  }))
}

class DocxWriter {
  numbering: INumberingOptions['config'][number][] = [
    { reference: 'mv-bullet', levels: listLevels(LevelFormat.BULLET, (l) => ['•', '◦', '▪'][l % 3]) },
    { reference: 'mv-task-open', levels: listLevels(LevelFormat.BULLET, () => '☐') },
    { reference: 'mv-task-done', levels: listLevels(LevelFormat.BULLET, () => '☑') },
  ]
  footnotes: Record<number, { children: Paragraph[] }> = {}
  private orderedLists = 0

  constructor(
    private doc: NormalizedDocument,
    private images: Map<string, LoadedImage | null>,
  ) {}

  run(text: string, marks: Marks, extra: Partial<ConstructorParameters<typeof TextRun>[0] & object> = {}) {
    return new TextRun({
      text,
      bold: marks.bold,
      italics: marks.italics,
      strike: marks.strike,
      color: marks.color,
      ...(marks.link ? { style: 'Hyperlink' } : {}),
      ...extra,
    })
  }

  image(node: Image, marks: Marks): Inline {
    const loaded = this.images.get(node.url)
    if (!loaded) return this.run(`[${node.alt || 'image'}]`, { ...marks, italics: true }, { color: COLOR.muted })
    const size = fitWidth(loaded.width, loaded.height, MAX_IMAGE_PX)
    return new ImageRun({
      type: loaded.type,
      data: loaded.data,
      transformation: size,
      altText: { name: node.alt || 'image', description: node.alt || undefined, title: node.title || undefined },
    })
  }

  inline(nodes: PhrasingContent[], marks: Marks = {}): Inline[] {
    return nodes.flatMap((node): Inline[] => {
      switch (node.type) {
        case 'text':
          return [this.run(node.value.replace(/\n/g, ' '), marks)]
        case 'strong':
          return this.inline(node.children, { ...marks, bold: true })
        case 'emphasis':
          return this.inline(node.children, { ...marks, italics: true })
        case 'delete':
          return this.inline(node.children, { ...marks, strike: true })
        case 'inlineCode':
          return [this.run(node.value, marks, { font: MONO, size: 20, shading })]
        case 'break':
          return [new TextRun({ break: 1 })]
        case 'image':
          return [this.image(node, marks)]
        case 'link': {
          const children = this.inline(node.children, { ...marks, link: true })
          if (!node.url || node.url.startsWith('#')) return children
          return [new ExternalHyperlink({ link: node.url, children: children as never })]
        }
        case 'footnoteReference': {
          const index = this.doc.footnoteNumber(node.identifier)
          return index ? [new FootnoteReferenceRun(index)] : []
        }
        default:
          return 'children' in node ? this.inline(node.children as PhrasingContent[], marks) : []
      }
    })
  }

  paragraph(children: Inline[], state: State, options: Partial<IParagraphOptions> = {}): Paragraph {
    return new Paragraph({
      children,
      indent: state.indent ? { left: state.indent } : undefined,
      ...(state.quote ? { border: { left: { ...border(18), space: 8 } } } : {}),
      ...options,
    })
  }

  list(list: List, state: State, level: number): Block[] {
    let reference = 'mv-bullet'
    if (list.ordered) {
      // Each ordered list gets its own definition so numbering restarts at `start`.
      reference = `mv-ol-${++this.orderedLists}`
      this.numbering.push({ reference, levels: listLevels(LevelFormat.DECIMAL, (l) => `%${l + 1}.`, list.start ?? 1) })
    }
    const itemIndent = INDENT_STEP * (level + 1)
    return list.children.flatMap((item) => {
      const itemReference = item.checked == null ? reference : item.checked ? 'mv-task-done' : 'mv-task-open'
      return item.children.flatMap((child, index): Block[] => {
        if (index === 0 && child.type === 'paragraph') {
          return [
            new Paragraph({
              children: this.inline(child.children, marksFor(state)),
              numbering: { reference: itemReference, level },
              spacing: { after: list.spread ? 160 : 60 },
            }),
          ]
        }
        if (child.type === 'list') return this.list(child, state, level + 1)
        return this.block(child, { ...state, indent: itemIndent })
      })
    })
  }

  table(table: MdTable, state: State): Block[] {
    const columns = Math.max(...table.children.map((row) => row.children.length))
    const width = Math.floor((CONTENT_WIDTH - state.indent) / columns)
    const alignment = (i: number) =>
      (ALIGNMENT[table.align?.[i] ?? ''] ?? AlignmentType.LEFT)
    const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: COLOR.border }
    return [
      new Table({
        width: { size: width * columns, type: WidthType.DXA },
        columnWidths: Array(columns).fill(width),
        indent: state.indent ? { size: state.indent, type: WidthType.DXA } : undefined,
        borders: {
          top: cellBorder,
          bottom: cellBorder,
          left: cellBorder,
          right: cellBorder,
          insideHorizontal: cellBorder,
          insideVertical: cellBorder,
        },
        rows: table.children.map(
          (row, r) =>
            new TableRow({
              tableHeader: r === 0,
              cantSplit: true,
              children: Array.from(
                { length: columns },
                (_, c) =>
                  new TableCell({
                    width: { size: width, type: WidthType.DXA },
                    margins: { top: 60, bottom: 60, left: 110, right: 110 },
                    shading: r === 0 ? shading : undefined,
                    children: [
                      new Paragraph({
                        alignment: alignment(c),
                        spacing: { after: 0 },
                        children: this.inline(row.children[c]?.children ?? [], r === 0 ? { bold: true } : {}),
                      }),
                    ],
                  }),
              ),
            }),
        ),
      }),
      new Paragraph({ children: [], spacing: { after: 120 } }),
    ]
  }

  block(node: RootContent, state: State): Block[] {
    switch (node.type) {
      case 'heading':
        return [this.paragraph(this.inline(node.children, marksFor(state)), state, { heading: HEADINGS[node.depth] })]
      case 'paragraph':
        return [this.paragraph(this.inline(node.children, marksFor(state)), state)]
      case 'thematicBreak':
        return [this.paragraph([], state, { border: { bottom: border(6) }, spacing: { after: 240 } })]
      case 'code':
        return [
          new Paragraph({
            children: codeLines(node.value).map(
              (line, i) => new TextRun({ text: line.replace(/\t/g, '    '), font: MONO, size: 19, break: i ? 1 : undefined }),
            ),
            shading,
            border: { top: border(), bottom: border(), left: border(), right: border() },
            indent: { left: state.indent + 100, right: 100 },
            spacing: { before: 60, after: 220, line: 260 },
            keepLines: true,
          }),
        ]
      case 'blockquote':
        return node.children.flatMap((child) => this.block(child, { indent: state.indent + 360, quote: true }))
      case 'list':
        return this.list(node, state, Math.round(state.indent / INDENT_STEP))
      case 'table':
        return this.table(node, state)
      default:
        return 'children' in node ? (node.children as RootContent[]).flatMap((child) => this.block(child, state)) : []
    }
  }
}


export async function toDocx(context: ExportContext): Promise<Blob> {
  const doc = normalizeTree(structuredClone(context.tree))

  const images = await loadDocumentImages(doc)

  const writer = new DocxWriter(doc, images)
  const children = doc.tree.children.flatMap((node) => writer.block(node, { indent: 0, quote: false }))
  doc.footnotes.forEach((def, i) => {
    writer.footnotes[i + 1] = {
      children: def.children.flatMap((node) => writer.block(node, { indent: 0, quote: false })).filter(
        (block): block is Paragraph => block instanceof Paragraph,
      ),
    }
  })

  const heading = (size: number, color = COLOR.fg) => ({
    run: { size, bold: true, color, font: FONT },
    paragraph: { spacing: { before: 320, after: 140 }, keepNext: true, keepLines: true },
  })

  const document = new Document({
    title: context.title,
    creator: context.options.author ?? 'Markdown Viewer Bugadão',
    lastModifiedBy: context.options.author ?? 'Markdown Viewer Bugadão',
    description: 'Generated by Markdown Viewer Bugadão',
    numbering: { config: writer.numbering },
    footnotes: writer.footnotes,
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 22, color: COLOR.fg },
          paragraph: { spacing: { after: 160, line: 276 } },
        },
        heading1: heading(40),
        heading2: heading(32),
        heading3: heading(28),
        heading4: heading(24),
        heading5: heading(22),
        heading6: heading(22, COLOR.muted),
        hyperlink: { run: { color: COLOR.link, underline: { type: 'single' } } },
      },
    },
    sections: [{ children }],
  })

  return Packer.toBlob(document)
}

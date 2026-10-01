import type { RootContent, PhrasingContent, List, Table } from 'mdast'
import { normalizeTree, codeLines, fitWidth, loadDocumentImages, type LoadedImage, type NormalizedDocument } from './shared'
import type { ExportContext } from '../core/types'

// Color table indices (1-based, 0 is "auto").
const FG = 1
const LINK = 2
const SHADE = 3
const MUTED = 4
const BORDER = 5

const HEADING_SIZE = [0, 40, 32, 28, 24, 22, 22] // half-points
const MAX_IMAGE_PX = 600
// \pard only resets paragraph formatting; \plain also resets character
// formatting, so a color or font from the previous paragraph never leaks.
const PARD = `\\pard\\plain\\f0\\fs22\\cf${FG}`

function escape(text: string): string {
  let out = ''
  for (const char of text.replace(/\r?\n/g, ' ')) {
    const code = char.codePointAt(0)!
    if (char === '\\' || char === '{' || char === '}') out += `\\${char}`
    else if (code < 128) out += char
    else if (code <= 0xffff) out += `\\u${code > 32767 ? code - 65536 : code}?`
    else {
      // Astral characters are written as a UTF-16 surrogate pair.
      const high = Math.floor((code - 0x10000) / 0x400) + 0xd800
      const low = ((code - 0x10000) % 0x400) + 0xdc00
      out += `\\u${high - 65536}?\\u${low - 65536}?`
    }
  }
  return out
}

interface BlockState {
  indent: number
  quote: boolean
}

class RtfWriter {
  constructor(
    private doc: NormalizedDocument,
    private images: Map<string, LoadedImage | null>,
  ) {}

  image(url: string, alt: string): string {
    const loaded = this.images.get(url)
    if (!loaded) return `{\\i\\cf${MUTED} [${escape(alt || 'image')}]}`
    const { width, height } = fitWidth(loaded.width, loaded.height, MAX_IMAGE_PX)
    const hex = Array.from(loaded.data, (byte) => byte.toString(16).padStart(2, '0'))
      .join('')
      .replace(/.{128}/g, '$&\n')
    const blip = loaded.type === 'png' ? '\\pngblip' : '\\jpegblip'
    // Goal sizes are in twips (15 per CSS pixel).
    return `{\\pict${blip}\\picw${loaded.width}\\pich${loaded.height}\\picwgoal${width * 15}\\pichgoal${height * 15}\n${hex}}`
  }

  inline(nodes: PhrasingContent[]): string {
    return nodes.map((node) => this.phrasing(node)).join('')
  }

  phrasing(node: PhrasingContent): string {
    switch (node.type) {
      case 'text':
        return escape(node.value)
      case 'strong':
        return `{\\b ${this.inline(node.children)}}`
      case 'emphasis':
        return `{\\i ${this.inline(node.children)}}`
      case 'delete':
        return `{\\strike ${this.inline(node.children)}}`
      case 'inlineCode':
        return `{\\f1\\fs20\\chcbpat${SHADE} ${escape(node.value)}}`
      case 'break':
        return '\\line '
      case 'link': {
        const url = node.url.replace(/["\\]/g, '')
        return `{\\field{\\*\\fldinst{HYPERLINK "${url}"}}{\\fldrslt{\\ul\\cf${LINK} ${this.inline(node.children)}}}}`
      }
      case 'image':
        return this.image(node.url, node.alt ?? '')
      case 'footnoteReference': {
        const index = this.doc.footnoteNumber(node.identifier)
        if (!index) return ''
        const def = this.doc.footnotes[index - 1]
        const body = def.children
          .map((child) => (child.type === 'paragraph' ? this.inline(child.children) : ''))
          .join(' ')
        return `{\\super\\chftn}{\\footnote\\pard\\plain\\f0\\fs18\\cf${FG} {\\super\\chftn} ${body}}`
      }
      default:
        return 'children' in node ? this.inline(node.children as PhrasingContent[]) : ''
    }
  }

  para(content: string, state: BlockState, extra = ''): string {
    const quote = state.quote ? `\\cf${MUTED}\\brdrl\\brdrs\\brdrw30\\brdrcf${BORDER}\\brsp120` : ''
    return `${PARD}\\li${state.indent}\\sa160\\sl276\\slmult1${quote}${extra} ${content}\\par\n`
  }

  list(list: List, state: BlockState): string {
    const start = list.start ?? 1
    const indent = state.indent + 360
    return list.children
      .map((item, i) => {
        let marker = list.ordered ? `${start + i}.` : '\\u8226?'
        if (item.checked != null) marker = item.checked ? '\\u9745?' : '\\u9744?'
        return item.children
          .map((child, index) => {
            if (index === 0 && child.type === 'paragraph') {
              return `${PARD}\\fi-360\\li${indent + 360}\\sa60\\tx${indent + 360} ${marker}\\tab ${this.inline(child.children)}\\par\n`
            }
            return this.block(child, { ...state, indent: indent + 360 })
          })
          .join('')
      })
      .join('')
  }

  table(table: Table, state: BlockState): string {
    const columns = Math.max(...table.children.map((row) => row.children.length))
    const cellWidth = Math.floor((9000 - state.indent) / columns)
    const border = `\\brdrs\\brdrw10\\brdrcf${BORDER}`
    const align = (i: number) => ({ left: '\\ql', center: '\\qc', right: '\\qr' })[table.align?.[i] ?? 'left'] ?? '\\ql'
    return table.children
      .map((row, r) => {
        let def = `\\trowd\\trgaph108\\trleft${state.indent}`
        if (r === 0) def += '\\trhdr'
        for (let c = 0; c < columns; c++) {
          def += `\\clbrdrt${border}\\clbrdrl${border}\\clbrdrb${border}\\clbrdrr${border}`
          if (r === 0) def += `\\clcbpat${SHADE}`
          def += `\\cellx${state.indent + cellWidth * (c + 1)}`
        }
        const cells = Array.from({ length: columns }, (_, c) => {
          const cell = row.children[c]
          const content = cell ? this.inline(cell.children) : ''
          return `${PARD}\\intbl${align(c)} ${r === 0 ? `{\\b ${content}}` : content}\\cell`
        })
        return `${def}\n${cells.join('\n')}\n\\row\n`
      })
      .join('') + `${PARD}\\sa160\\par\n`
  }

  block(node: RootContent, state: BlockState): string {
    switch (node.type) {
      case 'heading': {
        const color = node.depth === 6 ? `\\cf${MUTED}` : ''
        return `${PARD}\\li${state.indent}\\sb240\\sa120\\keepn\\b\\fs${HEADING_SIZE[node.depth]}${color} ${this.inline(node.children)}\\par\n`
      }
      case 'paragraph':
        return this.para(this.inline(node.children), state)
      case 'thematicBreak':
        return `${PARD}\\li${state.indent}\\sa240\\brdrb\\brdrs\\brdrw10\\brdrcf${BORDER}\\par\n`
      case 'code': {
        const lines = codeLines(node.value).map(escape).join('\\line ')
        return `${PARD}\\li${state.indent + 200}\\ri200\\sa160\\keep\\cbpat${SHADE}\\f1\\fs19 ${lines}\\par\n`
      }
      case 'blockquote':
        return node.children.map((child) => this.block(child, { indent: state.indent + 360, quote: true })).join('')
      case 'list':
        return this.list(node, state)
      case 'table':
        return this.table(node, state)
      default:
        return 'children' in node
          ? (node.children as RootContent[]).map((child) => this.block(child, state)).join('')
          : ''
    }
  }
}

export async function toRtf(context: ExportContext): Promise<string> {
  const doc = normalizeTree(structuredClone(context.tree))
  const writer = new RtfWriter(doc, await loadDocumentImages(doc))
  const body = doc.tree.children.map((node) => writer.block(node, { indent: 0, quote: false })).join('')
  const author = context.options.author ? `{\\author ${escape(context.options.author)}}` : ''
  return [
    '{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1',
    '{\\fonttbl{\\f0\\fswiss\\fcharset0 Calibri;}{\\f1\\fmodern\\fcharset0 Consolas;}}',
    '{\\colortbl;\\red31\\green35\\blue40;\\red9\\green105\\blue218;\\red246\\green248\\blue250;\\red89\\green99\\blue110;\\red208\\green215\\blue222;}',
    `{\\info{\\title ${escape(context.title)}}${author}}`,
    `\\paperw11906\\paperh16838\\margl1440\\margr1440\\margt1440\\margb1440\\fet0\\ftnbj`,
    `\\viewkind4\\f0\\fs22\\cf${FG}`,
    body,
    '}',
  ].join('\n')
}

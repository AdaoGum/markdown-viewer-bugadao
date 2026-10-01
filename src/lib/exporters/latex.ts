import type { RootContent, PhrasingContent, List, Table } from 'mdast'
import { normalizeTree, type NormalizedDocument } from './shared'
import type { ExportContext } from '../core/types'

const SPECIAL: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '{': '\\{',
  '}': '\\}',
  $: '\\$',
  '&': '\\&',
  '#': '\\#',
  '%': '\\%',
  _: '\\_',
  '~': '\\textasciitilde{}',
  '^': '\\textasciicircum{}',
}

function escape(text: string): string {
  return text.replace(/[\\{}$&#%_~^]/g, (char) => SPECIAL[char])
}

function escapeUrl(url: string): string {
  return url.replace(/[\\{}%#]/g, (char) => `\\${char}`)
}

const SECTIONS = ['', '\\section*', '\\subsection*', '\\subsubsection*', '\\paragraph', '\\subparagraph', '\\subparagraph']
const ALIGN: Record<string, string> = { center: 'c', right: 'r' }
const COUNTERS = ['enumi', 'enumii', 'enumiii', 'enumiv']

class LatexWriter {
  constructor(private doc: NormalizedDocument) {}

  inline(nodes: PhrasingContent[]): string {
    return nodes.map((node) => this.phrasing(node)).join('')
  }

  phrasing(node: PhrasingContent): string {
    switch (node.type) {
      case 'text':
        return escape(node.value)
      case 'strong':
        return `\\textbf{${this.inline(node.children)}}`
      case 'emphasis':
        return `\\emph{${this.inline(node.children)}}`
      case 'delete':
        return `\\sout{${this.inline(node.children)}}`
      case 'inlineCode':
        return `\\texttt{${escape(node.value)}}`
      case 'break':
        return '\\newline{}\n'
      case 'link': {
        const label = this.inline(node.children)
        if (!node.url) return label
        const plain = node.children.length === 1 && node.children[0].type === 'text' && node.children[0].value
        if (plain === node.url || `mailto:${plain}` === node.url) return `\\url{${escapeUrl(node.url)}}`
        return `\\href{${escapeUrl(node.url)}}{${label}}`
      }
      case 'image': {
        if (/^(https?:|data:)/i.test(node.url)) {
          // Remote images can't be included by TeX; keep a visible reference.
          return `\\emph{[${escape(node.alt || 'image')}]}\\footnote{\\url{${escapeUrl(node.url)}}}`
        }
        return `\\includegraphics[width=0.8\\linewidth,keepaspectratio]{${escapeUrl(node.url)}}`
      }
      case 'footnoteReference': {
        const index = this.doc.footnoteNumber(node.identifier)
        if (!index) return ''
        const body = this.doc.footnotes[index - 1].children
          .map((child) => (child.type === 'paragraph' ? this.inline(child.children) : ''))
          .join(' ')
        return `\\footnote{${body}}`
      }
      default:
        return 'children' in node ? this.inline(node.children as PhrasingContent[]) : ''
    }
  }

  list(list: List, depth: number): string {
    const env = list.ordered ? 'enumerate' : 'itemize'
    const lines = [`\\begin{${env}}`]
    if (list.ordered && list.start != null && list.start !== 1 && depth < COUNTERS.length) {
      lines.push(`\\setcounter{${COUNTERS[depth]}}{${list.start - 1}}`)
    }
    for (const item of list.children) {
      const marker = item.checked == null ? '\\item' : item.checked ? '\\item[$\\boxtimes$]' : '\\item[$\\square$]'
      const body = item.children.map((child) => this.block(child, depth + 1)).join('\n\n')
      lines.push(`${marker} ${body}`)
    }
    lines.push(`\\end{${env}}`)
    return lines.join('\n')
  }

  table(table: Table): string {
    const columns = Math.max(...table.children.map((row) => row.children.length))
    const spec = Array.from({ length: columns }, (_, i) => ALIGN[table.align?.[i] ?? ''] ?? 'l')
    const rows = table.children.map((row, r) => {
      const cells = Array.from({ length: columns }, (_, c) => {
        const cell = row.children[c]
        const content = cell ? this.inline(cell.children).replace(/\\newline\{\}\n/g, ' ') : ''
        return r === 0 ? `\\textbf{${content}}` : content
      })
      return `${cells.join(' & ')} \\\\${r === 0 ? ' \\hline\\endhead' : ''}`
    })
    return [`\\begin{longtable}{|${spec.join('|')}|}`, '\\hline', ...rows, '\\hline', '\\end{longtable}'].join('\n')
  }

  block(node: RootContent, depth = 0): string {
    switch (node.type) {
      case 'heading':
        return `${SECTIONS[node.depth]}{${this.inline(node.children)}}`
      case 'paragraph':
        return this.inline(node.children)
      case 'thematicBreak':
        return '\\medskip\n\\noindent\\rule{\\linewidth}{0.4pt}\n\\medskip'
      case 'code': {
        const value = node.value.replace(/\\end\{Verbatim\}/g, '\\end {Verbatim}')
        return `\\begin{Verbatim}[breaklines=true,frame=single,fontsize=\\small]\n${value}\n\\end{Verbatim}`
      }
      case 'blockquote':
        return `\\begin{quote}\n${node.children.map((child) => this.block(child, depth)).join('\n\n')}\n\\end{quote}`
      case 'list':
        return this.list(node, depth)
      case 'table':
        return this.table(node)
      default:
        return 'children' in node
          ? (node.children as RootContent[]).map((child) => this.block(child, depth)).join('\n\n')
          : ''
    }
  }
}

export function toLatex(context: ExportContext): string {
  const doc = normalizeTree(structuredClone(context.tree))
  const writer = new LatexWriter(doc)
  const body = doc.tree.children.map((node) => writer.block(node)).filter(Boolean).join('\n\n')
  return `% Generated by Markdown Viewer Bugadão. Compiles with pdflatex, xelatex or lualatex
% (use xelatex/lualatex for emoji and non-Latin scripts).
\\documentclass[11pt]{article}
\\usepackage{iftex}
\\ifPDFTeX
  \\usepackage[utf8]{inputenc}
  \\usepackage[T1]{fontenc}
  \\usepackage{lmodern}
\\else
  \\usepackage{fontspec}
\\fi
\\usepackage[margin=2.5cm]{geometry}
\\usepackage{graphicx}
\\usepackage{xcolor}
\\usepackage{amssymb}
\\usepackage{longtable}
\\usepackage{fvextra}
\\usepackage[normalem]{ulem}
\\usepackage[colorlinks=true,urlcolor=blue,linkcolor=blue]{hyperref}
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{0.6em}
\\hypersetup{pdftitle={${escape(context.title)}}${context.options.author ? `,pdfauthor={${escape(context.options.author)}}` : ''}}

\\begin{document}

${body}

\\end{document}
`
}

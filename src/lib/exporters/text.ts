import type { RootContent, PhrasingContent, Table, List } from 'mdast'
import { normalizeTree, codeLines, type NormalizedDocument } from './shared'
import { ExportError, type ExportContext } from '../core/types'

function inline(nodes: PhrasingContent[], doc: NormalizedDocument): string {
  return nodes
    .map((node): string => {
      switch (node.type) {
        case 'text':
          return node.value.replace(/\n/g, ' ')
        case 'inlineCode':
          return node.value
        case 'break':
          return '\n'
        case 'image':
          return node.alt ? `[${node.alt}]` : ''
        case 'link': {
          const label = inline(node.children, doc)
          return !node.url || label === node.url || `mailto:${label}` === node.url ? label : `${label} (${node.url})`
        }
        case 'footnoteReference': {
          const n = doc.footnoteNumber(node.identifier)
          return n ? `[${n}]` : ''
        }
        default:
          return 'children' in node ? inline(node.children as PhrasingContent[], doc) : ''
      }
    })
    .join('')
}

const width = (value: string) => [...value].length

/** Plain-text contents of every cell, row by row. */
export function tableRows(table: Table, doc: NormalizedDocument): string[][] {
  return table.children.map((row) => row.children.map((cell) => inline(cell.children, doc).replace(/\n/g, ' ').trim()))
}

function renderTable(table: Table, doc: NormalizedDocument): string {
  const rows = tableRows(table, doc)
  const columns = Math.max(...rows.map((row) => row.length))
  const widths = Array.from({ length: columns }, (_, i) => Math.max(3, ...rows.map((row) => width(row[i] ?? ''))))
  const pad = (value: string, i: number) => {
    const space = widths[i] - width(value)
    const align = table.align?.[i]
    if (align === 'right') return ' '.repeat(space) + value
    if (align === 'center') return ' '.repeat(Math.floor(space / 2)) + value + ' '.repeat(Math.ceil(space / 2))
    return value + ' '.repeat(space)
  }
  const line = (row: string[]) => widths.map((_, i) => pad(row[i] ?? '', i)).join(' | ').trimEnd()
  const [head, ...body] = rows
  return [line(head), widths.map((w) => '-'.repeat(w)).join('-+-'), ...body.map(line)].join('\n')
}

function renderList(list: List, doc: NormalizedDocument): string {
  const start = list.start ?? 1
  return list.children
    .map((item, index) => {
      let marker = list.ordered ? `${start + index}.` : '-'
      if (item.checked != null) marker += item.checked ? ' [x]' : ' [ ]'
      const body = blocks(item.children, doc, list.spread || item.spread ? '\n\n' : '\n')
      const indent = ' '.repeat(marker.length + 1)
      return `${marker} ${body.split('\n').join(`\n${indent}`)}`.replace(/[ ]+$/gm, '')
    })
    .join(list.spread ? '\n\n' : '\n')
}

function block(node: RootContent, doc: NormalizedDocument): string {
  switch (node.type) {
    case 'heading': {
      const text = inline(node.children, doc)
      if (node.depth <= 2) return `${text}\n${(node.depth === 1 ? '=' : '-').repeat(Math.max(3, width(text)))}`
      return text
    }
    case 'paragraph':
      return inline(node.children, doc)
    case 'thematicBreak':
      return '* * *'
    case 'code':
      return codeLines(node.value).map((line) => (line ? `    ${line}` : '')).join('\n')
    case 'blockquote':
      return blocks(node.children, doc)
        .split('\n')
        .map((line) => (line ? `> ${line}` : '>'))
        .join('\n')
    case 'list':
      return renderList(node, doc)
    case 'table':
      return renderTable(node, doc)
    default:
      return 'children' in node ? blocks(node.children as RootContent[], doc) : ''
  }
}

function blocks(nodes: RootContent[], doc: NormalizedDocument, separator = '\n\n'): string {
  return nodes
    .map((node) => block(node, doc))
    .filter((text) => text !== '')
    .join(separator)
}

export function toPlainText(context: ExportContext): string {
  const doc = normalizeTree(structuredClone(context.tree))
  let text = blocks(doc.tree.children, doc)
  if (doc.footnotes.length) {
    const notes = doc.footnotes.map((def, i) => `[${i + 1}] ${blocks(def.children, doc, ' ')}`)
    text += `\n\n---\n${notes.join('\n')}`
  }
  return `${text}\n`
}

export function toCsv(context: ExportContext): string {
  const doc = normalizeTree(structuredClone(context.tree))
  const tables: Table[] = []
  const visit = (node: RootContent) => {
    if (node.type === 'table') tables.push(node)
    else if ('children' in node) (node.children as RootContent[]).forEach(visit)
  }
  doc.tree.children.forEach(visit)
  if (!tables.length) throw new ExportError('no-tables', 'The document has no tables')

  const escape = (value: string) => (/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)
  const csv = tables
    .map((table) => tableRows(table, doc).map((row) => row.map(escape).join(',')).join('\r\n'))
    .join('\r\n\r\n')
  // BOM so Excel detects UTF-8.
  return `﻿${csv}\r\n`
}

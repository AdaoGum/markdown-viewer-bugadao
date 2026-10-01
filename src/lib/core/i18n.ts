import type { ExportCategory } from './types'

export interface Messages {
  export: string
  exporting: string
  exported: string
  exportFailed: string
  preview: string
  split: string
  edit: string
  editorLabel: string
  editorPlaceholder: string
  categories: Record<ExportCategory, string>
  /** Overrides for exporter labels, keyed by exporter id. */
  formats: Record<string, string>
  /** Messages for ExportError codes. */
  errors: Record<string, string>
}

export const en: Messages = {
  export: 'Export',
  exporting: 'Exporting {format}…',
  exported: '{format} ready',
  exportFailed: 'Could not export {format}',
  preview: 'Preview',
  split: 'Split',
  edit: 'Edit',
  editorLabel: 'Markdown source',
  editorPlaceholder: 'Write Markdown here…',
  categories: {
    document: 'Documents',
    web: 'Web',
    image: 'Images',
    data: 'Data & text',
    action: 'Actions',
  },
  formats: {},
  errors: {
    'no-tables': 'the document has no tables',
  },
}

export const ptBR: Messages = {
  export: 'Exportar',
  exporting: 'Exportando {format}…',
  exported: '{format} pronto',
  exportFailed: 'Não foi possível exportar {format}',
  preview: 'Visualizar',
  split: 'Dividir',
  edit: 'Editar',
  editorLabel: 'Código Markdown',
  editorPlaceholder: 'Escreva Markdown aqui…',
  categories: {
    document: 'Documentos',
    web: 'Web',
    image: 'Imagens',
    data: 'Dados e texto',
    action: 'Ações',
  },
  formats: {
    rtf: 'Texto rico (RTF)',
    epub: 'Livro digital (EPUB)',
    html: 'Página HTML',
    png: 'Imagem PNG',
    jpeg: 'Imagem JPEG',
    svg: 'Imagem SVG',
    txt: 'Texto simples',
    csv: 'Tabelas (CSV)',
    json: 'Árvore mdast (JSON)',
    print: 'Imprimir',
    'copy-html': 'Copiar como HTML',
    'copy-markdown': 'Copiar Markdown',
  },
  errors: {
    'no-tables': 'o documento não tem tabelas',
  },
}

export const locales: Record<string, Messages> = { en, 'pt-BR': ptBR, pt: ptBR }

export function resolveMessages(locale: string, overrides?: Partial<Messages>): Messages {
  const base = locales[locale] ?? locales[locale.split('-')[0]] ?? en
  if (!overrides) return base
  return {
    ...base,
    ...overrides,
    categories: { ...base.categories, ...overrides.categories },
    formats: { ...base.formats, ...overrides.formats },
    errors: { ...base.errors, ...overrides.errors },
  }
}

export function format(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '')
}

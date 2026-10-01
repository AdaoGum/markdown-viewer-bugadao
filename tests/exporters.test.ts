import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { createExportContext, exportMarkdown, resolveExporters, renderMarkdown, builtinExporters } from '../src/lib'
import { toPlainText, toCsv } from '../src/lib/exporters/text'
import { toRtf } from '../src/lib/exporters/rtf'
import { toLatex } from '../src/lib/exporters/latex'
import { toDocx } from '../src/lib/exporters/docx'
import { toOdt } from '../src/lib/exporters/odt'
import { toEpub } from '../src/lib/exporters/epub'
import { buildHtmlDocument } from '../src/lib/exporters/dom'

const SAMPLE = `# Relatório & Notas

Parágrafo com **negrito**, *itálico*, ~~riscado~~, \`código\` e um [link](https://example.com "título").
Quebra de linha:
segunda linha com 100% de $ e _ e # especiais {chaves} \\ barra.

## Listas

- item um
- item dois
  - aninhado
- [x] tarefa feita
- [ ] tarefa aberta

3. três
4. quatro

> Citação com **ênfase**
>
> > aninhada

\`\`\`ts
const x: number = 1 // comentário
if (x < 2) console.log("<ok>")
\`\`\`

| Nome | Qtd | Preço |
| :--- | :-: | ----: |
| Maçã, verde | 2 | 1,50 |
| "Pera" | 10 | 3 |

---

Referência[^1] e [link ref][ref] <b>html</b> emoji 🎉.

[ref]: https://example.org/ref
[^1]: Nota de rodapé com *itálico*.
`

const context = () => createExportContext({ markdown: SAMPLE, filename: 'relatorio' })

function parseXml(xml: string) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const error = doc.querySelector('parsererror')
  if (error) throw new Error(`Invalid XML: ${error.textContent}\n${xml.slice(0, 500)}`)
  return doc
}

describe('render', () => {
  it('renders GFM with highlighting and slugs', () => {
    const { html } = renderMarkdown(SAMPLE)
    expect(html).toContain('<h1 id="relatório--notas">')
    expect(html).toContain('<del>riscado</del>')
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('class="hljs-keyword"')
    expect(html).toContain('<table>')
    expect(html).toContain('data-footnote-ref')
    // Raw HTML is dropped unless allowHtml is set.
    expect(html).not.toContain('<b>html</b>')
  })

  it('sanitises raw HTML when allowed', () => {
    const { html } = renderMarkdown('<b>ok</b><script>alert(1)</script><img src=x onerror="alert(1)">', { allowHtml: true })
    expect(html).toContain('<b>ok</b>')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('onerror')
  })

  it('tolerates unknown code languages', () => {
    expect(renderMarkdown('```nonexistent-lang\nx\n```').html).toContain('<pre><code')
  })
})

describe('context', () => {
  it('derives title and a safe filename', () => {
    const ctx = createExportContext({ markdown: '# Olá: mundo/teste?' })
    expect(ctx.title).toBe('Olá: mundo/teste?')
    expect(ctx.filename).toBe('Ola-mundoteste')
  })

  it('resolves formats in order and lets custom exporters override', () => {
    const custom = { id: 'pdf', label: 'Custom', category: 'document' as const, run: () => undefined }
    const list = resolveExporters(['md', 'pdf'], [custom])
    expect(list.map((e) => e.label)).toEqual(['Markdown', 'Custom'])
    expect(resolveExporters().length).toBe(builtinExporters.length)
  })
})

describe('text formats', () => {
  it('plain text keeps structure', () => {
    const text = toPlainText(context())
    expect(text).toContain('Relatório & Notas\n=================')
    expect(text).toContain('- [x] tarefa feita')
    expect(text).toContain('  - aninhado')
    expect(text).toContain('3. três\n4. quatro')
    expect(text).toContain('> Citação com ênfase')
    expect(text).toContain('    const x: number = 1')
    expect(text).toContain('link (https://example.com)')
    expect(text).toContain('link ref (https://example.org/ref)')
    expect(text).toMatch(/Nome\s+\|\s+Qtd\s+\|\s+Preço/)
    expect(text).toContain('[1] Nota de rodapé com itálico.')
  })

  it('csv quotes cells and prefixes a BOM', () => {
    const csv = toCsv(context())
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('Nome,Qtd,Preço\r\n"Maçã, verde",2,"1,50"\r\n"""Pera""",10,3')
  })

  it('csv fails clearly without tables', () => {
    expect(() => toCsv(createExportContext({ markdown: 'no tables' }))).toThrow(/no tables/)
  })

  it('rtf escapes braces, backslashes and unicode', async () => {
    const rtf = await toRtf(context())
    expect(rtf.startsWith('{\\rtf1')).toBe(true)
    expect(rtf).toContain('\\{chaves\\} \\\\ barra')
    expect(rtf).toContain('Relat\\u243?rio')
    expect(rtf).toContain('\\u-10180?\\u-8311?') // 🎉 as surrogate pair
    expect(rtf).toContain('HYPERLINK "https://example.com"')
    expect(rtf).toContain('\\footnote')
    // Braces must balance.
    const unescaped = rtf.replace(/\\[\\{}]/g, '')
    expect(unescaped.split('{').length).toBe(unescaped.split('}').length)
  })

  it('latex escapes specials and maps structure', () => {
    const tex = toLatex(context())
    expect(tex).toContain('\\section*{Relatório \\& Notas}')
    expect(tex).toContain('100\\% de \\$ e \\_ e \\# especiais \\{chaves\\} \\textbackslash{} barra')
    expect(tex).toContain('\\item[$\\boxtimes$] tarefa feita')
    expect(tex).toContain('\\setcounter{enumi}{2}')
    expect(tex).toContain('\\begin{Verbatim}')
    expect(tex).toContain('\\begin{longtable}{|l|c|r|}')
    expect(tex).toContain('\\footnote{Nota de rodapé com \\emph{itálico}.}')
    expect(tex).toContain('\\href{https://example.com}{link}')
  })

  it('json drops positions', async () => {
    const { blob } = await exportMarkdown('# a', 'json', { download: false })
    const json = JSON.parse(await blob!.text())
    expect(json.type).toBe('root')
    expect(JSON.stringify(json)).not.toContain('position')
  })

  it('markdown export round-trips the source', async () => {
    const { blob, filename } = await exportMarkdown(SAMPLE, 'md', { download: false, filename: 'x' })
    expect(filename).toBe('x.md')
    expect(await blob!.text()).toBe(SAMPLE)
  })
})

describe('html', () => {
  it('builds a standalone themed document', () => {
    const html = buildHtmlDocument({ ...context(), options: { ...context().options, theme: 'dark', lang: 'pt-BR' } })
    expect(html).toMatch(/^<!DOCTYPE html>/)
    expect(html).toContain('<html lang="pt-BR">')
    expect(html).toContain('<title>Relatório &amp; Notas</title>')
    expect(html).toContain('data-mv-theme="dark"')
    expect(html).toContain('.mv-content')
  })
})

describe('zip-based documents', () => {
  it('docx is a valid OOXML package', async () => {
    const zip = await JSZip.loadAsync(await (await toDocx(context())).arrayBuffer())
    const xml = await zip.file('word/document.xml')!.async('string')
    parseXml(xml)
    expect(xml).toContain('Relatório &amp; Notas')
    expect(xml).toContain('<w:pStyle w:val="Heading1"/>')
    expect(xml).toContain('Consolas')
    expect(xml).toContain('<w:tbl>')
    expect(xml).toContain('w:footnoteReference')
    const numbering = await zip.file('word/numbering.xml')!.async('string')
    expect(numbering).toContain('☑')
    expect(numbering).toContain('<w:start w:val="3"/>')
    const footnotes = await zip.file('word/footnotes.xml')!.async('string')
    expect(footnotes).toContain('Nota de rodapé com')
    const rels = await zip.file('word/_rels/document.xml.rels')!.async('string')
    expect(rels).toContain('https://example.com')
    expect(rels).toContain('https://example.org/ref')
  })

  it('odt is a valid OpenDocument package', async () => {
    const zip = await JSZip.loadAsync(await (await toOdt(context())).arrayBuffer())
    expect(Object.keys(zip.files)[0]).toBe('mimetype')
    expect(await zip.file('mimetype')!.async('string')).toBe('application/vnd.oasis.opendocument.text')
    for (const name of ['content.xml', 'styles.xml', 'meta.xml', 'META-INF/manifest.xml']) {
      parseXml(await zip.file(name)!.async('string'))
    }
    const content = await zip.file('content.xml')!.async('string')
    expect(content).toContain('<text:h text:style-name="Heading_20_1" text:outline-level="1">Relatório &amp; Notas</text:h>')
    expect(content).toContain('text:start-value="3"')
    expect(content).toContain('<text:note ')
    expect(content).toContain('Quote2')
    expect(content).toContain('<table:table-header-rows>')
    expect(content).toContain('if (x &lt; 2)')
  })

  it('epub is a valid EPUB 3 package', async () => {
    const zip = await JSZip.loadAsync(await (await toEpub(context())).arrayBuffer())
    expect(Object.keys(zip.files)[0]).toBe('mimetype')
    const files = ['META-INF/container.xml', 'OEBPS/content.opf', 'OEBPS/nav.xhtml', 'OEBPS/content.xhtml']
    for (const name of files) parseXml(await zip.file(name)!.async('string'))
    const content = await zip.file('OEBPS/content.xhtml')!.async('string')
    expect(content).toContain('☑')
    expect(content).not.toContain('<input')
    const nav = await zip.file('OEBPS/nav.xhtml')!.async('string')
    expect(nav).toContain('href="content.xhtml#listas"')
  })
})

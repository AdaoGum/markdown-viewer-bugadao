import JSZip from 'jszip'
import { contentCss } from '../core/styles'
import { escapeXml, loadImage, uuid } from './shared'
import type { ExportContext } from '../core/types'

interface NavEntry {
  id: string
  text: string
  depth: number
  children: NavEntry[]
}

function buildNav(entries: { id: string; text: string; depth: number }[]): NavEntry[] {
  const root: NavEntry = { id: '', text: '', depth: 0, children: [] }
  const stack = [root]
  for (const entry of entries) {
    const node = { ...entry, children: [] }
    while (stack.length > 1 && stack[stack.length - 1].depth >= entry.depth) stack.pop()
    stack[stack.length - 1].children.push(node)
    stack.push(node)
  }
  return root.children
}

function navList(entries: NavEntry[]): string {
  if (!entries.length) return ''
  const items = entries.map(
    (entry) => `<li><a href="content.xhtml#${escapeXml(entry.id)}">${escapeXml(entry.text)}</a>${navList(entry.children)}</li>`,
  )
  return `<ol>${items.join('')}</ol>`
}

const xhtml = (title: string, lang: string, body: string, head = '') => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}" xml:lang="${lang}">
<head>
<meta charset="UTF-8"/>
<title>${escapeXml(title)}</title>${head}
</head>
${body}
</html>
`

export async function toEpub(context: ExportContext): Promise<Blob> {
  const { title, options } = context
  const lang = escapeXml(options.lang)
  const zip = new JSZip()
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
  )

  // Re-serialise the HTML as XHTML, embedding images and replacing form
  // controls (task-list checkboxes) with text.
  const parsed = new DOMParser().parseFromString(`<!DOCTYPE html><html><body>${context.html}</body></html>`, 'text/html')
  const body = parsed.body

  body.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.replaceWith(parsed.createTextNode((input as HTMLInputElement).hasAttribute('checked') ? '☑' : '☐'))
  })

  const manifestImages: string[] = []
  let imageIndex = 0
  for (const img of Array.from(body.querySelectorAll('img'))) {
    const loaded = await loadImage(img.getAttribute('src') ?? '')
    if (!loaded) {
      const span = parsed.createElement('em')
      span.textContent = `[${img.getAttribute('alt') || 'image'}]`
      img.replaceWith(span)
      continue
    }
    const name = `images/image${++imageIndex}.${loaded.type === 'png' ? 'png' : 'jpg'}`
    zip.file(`OEBPS/${name}`, loaded.data)
    manifestImages.push(
      `<item id="img${imageIndex}" href="${name}" media-type="${loaded.type === 'png' ? 'image/png' : 'image/jpeg'}"/>`,
    )
    img.setAttribute('src', name)
    if (!img.hasAttribute('alt')) img.setAttribute('alt', '')
  }

  const headings = Array.from(body.querySelectorAll('h1, h2, h3'))
    .filter((heading) => heading.id)
    .map((heading) => ({ id: heading.id, text: heading.textContent?.trim() ?? '', depth: Number(heading.tagName[1]) }))

  const serializer = new XMLSerializer()
  const content = Array.from(body.childNodes)
    .map((node) => serializer.serializeToString(node))
    .join('')
    // XMLSerializer repeats the namespace on every top-level element.
    .replace(/ xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/g, '')

  const css = `${contentCss}\nbody { margin: 0; padding: 0 4%; }`
  zip.file('OEBPS/style.css', css)
  zip.file(
    'OEBPS/content.xhtml',
    xhtml(
      title,
      lang,
      `<body data-mv-theme="light"><section class="mv-content" epub:type="bodymatter">${content}</section></body>`,
      '\n<link rel="stylesheet" type="text/css" href="style.css"/>',
    ),
  )

  const tocEntries = headings.length ? navList(buildNav(headings)) : `<ol><li><a href="content.xhtml">${escapeXml(title)}</a></li></ol>`
  zip.file(
    'OEBPS/nav.xhtml',
    xhtml(title, lang, `<body><nav epub:type="toc" id="toc"><h1>${escapeXml(title)}</h1>${tocEntries}</nav></body>`),
  )

  const id = `urn:uuid:${uuid()}`
  const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
  const creator = options.author ? `<dc:creator>${escapeXml(options.author)}</dc:creator>` : ''
  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${lang}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="book-id">${id}</dc:identifier>
<dc:title>${escapeXml(title)}</dc:title>
<dc:language>${lang}</dc:language>${creator}
<meta property="dcterms:modified">${modified}</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="content" href="content.xhtml" media-type="application/xhtml+xml"/>
<item id="css" href="style.css" media-type="text/css"/>
${manifestImages.join('\n')}
</manifest>
<spine>
<itemref idref="content"/>
</spine>
</package>`,
  )

  return zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip', compression: 'DEFLATE' })
}

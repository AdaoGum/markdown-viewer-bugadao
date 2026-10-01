import type {
  Root,
  Parent,
  RootContent,
  PhrasingContent,
  Definition,
  FootnoteDefinition,
  FootnoteReference,
} from 'mdast'

export type AnyNode = Root | RootContent

export interface NormalizedDocument {
  tree: Root
  /** Footnote definitions in the order they are first referenced. */
  footnotes: FootnoteDefinition[]
  /** 1-based footnote number for an identifier, or undefined when unreferenced. */
  footnoteNumber(identifier: string): number | undefined
}

const BLOCK_TAG_BREAK = /<\/?(br|p|div|li|tr|h[1-6])\b[^>]*>/gi

function stripTags(html: string): string {
  return html
    .replace(BLOCK_TAG_BREAK, ' ')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

/**
 * Rewrites the tree into the small node vocabulary every non-HTML exporter
 * understands: link/image references become links/images, definitions are
 * dropped, raw HTML becomes plain text (or a line break for <br>), and footnote
 * definitions are pulled out of the flow and numbered by first reference.
 */
export function normalizeTree(tree: Root): NormalizedDocument {
  const definitions = new Map<string, Definition>()
  const footnoteDefs = new Map<string, FootnoteDefinition>()

  const collect = (node: AnyNode) => {
    if (node.type === 'definition') definitions.set(node.identifier, node)
    else if (node.type === 'footnoteDefinition') footnoteDefs.set(node.identifier, node)
    if ('children' in node) node.children.forEach((child) => collect(child as AnyNode))
  }
  collect(tree)

  const order: string[] = []

  const rewrite = (parent: Parent, inline: boolean) => {
    const next: (RootContent | PhrasingContent)[] = []
    for (const child of parent.children as RootContent[]) {
      switch (child.type) {
        case 'definition':
        case 'footnoteDefinition':
          continue
        case 'linkReference': {
          const def = definitions.get(child.identifier)
          const link = { type: 'link', url: def?.url ?? '', title: def?.title, children: child.children } as const
          rewrite(link as unknown as Parent, true)
          next.push(link as PhrasingContent)
          continue
        }
        case 'imageReference': {
          const def = definitions.get(child.identifier)
          next.push({ type: 'image', url: def?.url ?? '', title: def?.title, alt: child.alt })
          continue
        }
        case 'html': {
          if (inline && /^<br\s*\/?>$/i.test(child.value.trim())) {
            next.push({ type: 'break' })
            continue
          }
          const text = stripTags(child.value)
          if (inline) {
            if (text) next.push({ type: 'text', value: text })
          } else if (text.trim()) {
            next.push({ type: 'paragraph', children: [{ type: 'text', value: text.trim() }] })
          }
          continue
        }
        case 'footnoteReference':
          if (footnoteDefs.has(child.identifier) && !order.includes(child.identifier)) {
            order.push(child.identifier)
          }
          next.push(child)
          continue
      }
      if ('children' in child) {
        const childInline = child.type === 'paragraph' || child.type === 'heading' || child.type === 'tableCell' || inline
        rewrite(child as Parent, childInline)
      }
      next.push(child)
    }
    parent.children = next as Parent['children']
  }

  rewrite(tree, false)
  // Footnote bodies may themselves reference other footnotes.
  for (let i = 0; i < order.length; i++) rewrite(footnoteDefs.get(order[i])!, false)

  return {
    tree,
    footnotes: order.map((id) => footnoteDefs.get(id)!),
    footnoteNumber: (id) => {
      const index = order.indexOf(id)
      return index === -1 ? undefined : index + 1
    },
  }
}

export function isFootnoteReference(node: AnyNode): node is FootnoteReference {
  return node.type === 'footnoteReference'
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // Characters that are illegal in XML 1.0 documents.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
}

export interface LoadedImage {
  data: Uint8Array
  type: 'png' | 'jpg'
  width: number
  height: number
}

function canvasToPng(source: CanvasImageSource, width: number, height: number): Promise<LoadedImage | null> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return Promise.resolve(null)
  context.drawImage(source, 0, 0, width, height)
  return new Promise((resolve) => {
    try {
      canvas.toBlob(async (blob) => {
        if (!blob) return resolve(null)
        resolve({ data: new Uint8Array(await blob.arrayBuffer()), type: 'png', width, height })
      }, 'image/png')
    } catch {
      // Tainted canvas (cross-origin image without CORS headers).
      resolve(null)
    }
  })
}

function loadViaElement(src: string): Promise<LoadedImage | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const width = img.naturalWidth || 300
      const height = img.naturalHeight || 150
      canvasToPng(img, width, height).then(resolve, () => resolve(null))
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
}

const imageCache = new Map<string, Promise<LoadedImage | null>>()

/**
 * Loads an image so it can be embedded in a binary document. PNG and JPEG are
 * kept as-is; everything else (SVG, GIF, WebP, ...) is rasterised to PNG.
 * Resolves to null when the image can't be read (network or CORS failure).
 */
export function loadImage(src: string): Promise<LoadedImage | null> {
  if (!src || typeof document === 'undefined') return Promise.resolve(null)
  let pending = imageCache.get(src)
  if (!pending) {
    pending = (async () => {
      try {
        const response = await fetch(src)
        if (!response.ok) throw new Error(String(response.status))
        const blob = await response.blob()
        const bitmap = await createImageBitmap(blob)
        const { width, height } = bitmap
        if (blob.type === 'image/png' || blob.type === 'image/jpeg') {
          bitmap.close()
          const data = new Uint8Array(await blob.arrayBuffer())
          return { data, type: blob.type === 'image/png' ? 'png' : 'jpg', width, height } as LoadedImage
        }
        const png = await canvasToPng(bitmap, width, height)
        bitmap.close()
        return png
      } catch {
        return loadViaElement(src)
      }
    })()
    imageCache.set(src, pending)
    // Don't pin failures forever; the image may become reachable later.
    pending.then((result) => result || imageCache.delete(src))
  }
  return pending
}

/** Scales (width, height) down to fit within maxWidth, keeping the aspect ratio. */
export function fitWidth(width: number, height: number, maxWidth: number) {
  if (width <= maxWidth) return { width, height }
  return { width: maxWidth, height: Math.round((height * maxWidth) / width) }
}

/** Splits code into lines, dropping one trailing newline. */
export function codeLines(value: string): string[] {
  return value.replace(/\n$/, '').split('\n')
}

/** Loads every image referenced by the document (body and footnotes), keyed by URL. */
export async function loadDocumentImages(doc: NormalizedDocument): Promise<Map<string, LoadedImage | null>> {
  const urls = new Set<string>()
  const visit = (nodes: RootContent[]) => {
    for (const node of nodes) {
      if (node.type === 'image' && node.url) urls.add(node.url)
      if ('children' in node) visit(node.children as RootContent[])
    }
  }
  visit(doc.tree.children)
  doc.footnotes.forEach((def) => visit(def.children))
  const images = new Map<string, LoadedImage | null>()
  await Promise.all([...urls].map(async (url) => images.set(url, await loadImage(url))))
  return images
}

/** RFC 4122 v4 UUID; crypto.randomUUID is only available in secure contexts. */
export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

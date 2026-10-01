import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeSlug from 'rehype-slug'
import rehypeHighlight from 'rehype-highlight'
import rehypeStringify from 'rehype-stringify'
import { toString } from 'mdast-util-to-string'
import type { Root, Heading } from 'mdast'
import type { RenderOptions } from './types'

const parser = unified().use(remarkParse).use(remarkGfm)

// Task-list checkboxes come out of remark-gfm as <input>, which the default
// schema already allows; keep their checked/disabled state.
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    input: [...(defaultSchema.attributes?.input ?? []), 'checked', 'disabled'],
  },
}

type HtmlProcessor = ReturnType<typeof createHtmlProcessor>
const htmlProcessors = new Map<string, HtmlProcessor>()

function createHtmlProcessor({ allowHtml = false, highlight = true }: RenderOptions) {
  // Order matters: sanitise before slug/highlight so their ids and classes survive.
  const processor = unified().use(remarkRehype, { allowDangerousHtml: allowHtml })
  if (allowHtml) processor.use(rehypeRaw).use(rehypeSanitize, sanitizeSchema)
  processor.use(rehypeSlug)
  if (highlight) processor.use(rehypeHighlight, { detect: false })
  return processor.use(rehypeStringify)
}

function getHtmlProcessor(options: RenderOptions): HtmlProcessor {
  const key = `${!!options.allowHtml}:${options.highlight !== false}`
  let processor = htmlProcessors.get(key)
  if (!processor) {
    processor = createHtmlProcessor(options)
    htmlProcessors.set(key, processor)
  }
  return processor
}

/** Parses Markdown (CommonMark + GFM) into an mdast tree. */
export function parseMarkdown(markdown: string): Root {
  return parser.runSync(parser.parse(markdown)) as Root
}

/** Converts an mdast tree to an HTML fragment. The tree is not mutated. */
export function treeToHtml(tree: Root, options: RenderOptions = {}): string {
  const processor = getHtmlProcessor(options)
  const hast = processor.runSync(structuredClone(tree) as never)
  return processor.stringify(hast as never)
}

/** Parses and renders Markdown in one go. */
export function renderMarkdown(markdown: string, options: RenderOptions = {}) {
  const tree = parseMarkdown(markdown)
  return { tree, html: treeToHtml(tree, options) }
}

/** Plain text of the first level-1 heading, if any. */
export function extractTitle(tree: Root): string | undefined {
  const heading = tree.children.find((node): node is Heading => node.type === 'heading' && node.depth === 1)
  const title = heading ? toString(heading).trim() : ''
  return title || undefined
}

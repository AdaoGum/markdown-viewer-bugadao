import { computed, onScopeDispose, ref, toValue, type MaybeRefOrGetter } from 'vue'
import { extractTitle, parseMarkdown, treeToHtml } from './markdown'
import type { RenderOptions, ThemeName, ThemeOption } from './types'

/** Reactive Markdown rendering: the mdast tree, HTML and detected title. */
export function useMarkdown(source: MaybeRefOrGetter<string>, options: MaybeRefOrGetter<RenderOptions> = {}) {
  const tree = computed(() => parseMarkdown(toValue(source) ?? ''))
  const html = computed(() => treeToHtml(tree.value, toValue(options)))
  const title = computed(() => extractTitle(tree.value))
  return { tree, html, title }
}

/** Resolves 'auto' against the OS color scheme, following changes live. */
export function useResolvedTheme(theme: MaybeRefOrGetter<ThemeOption>) {
  const prefersDark = ref(false)
  if (typeof window !== 'undefined' && window.matchMedia) {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    prefersDark.value = query.matches
    const onChange = (event: MediaQueryListEvent) => (prefersDark.value = event.matches)
    query.addEventListener('change', onChange)
    onScopeDispose(() => query.removeEventListener('change', onChange))
  }
  return computed<ThemeName>(() => {
    const value = toValue(theme)
    if (value === 'auto') return prefersDark.value ? 'dark' : 'light'
    return value
  })
}

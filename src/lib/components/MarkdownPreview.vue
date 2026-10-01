<script setup lang="ts">
import { ref } from 'vue'
import { ensureStyles } from '../core/styles'
import { useMarkdown, useResolvedTheme } from '../core/use-markdown'
import type { ThemeOption } from '../core/types'

/** Render-only Markdown block, without toolbar or export menu. */
const props = withDefaults(
  defineProps<{
    source: string
    theme?: ThemeOption
    allowHtml?: boolean
    highlight?: boolean
  }>(),
  { theme: 'light', allowHtml: false, highlight: true },
)

ensureStyles()

const { html, tree, title } = useMarkdown(
  () => props.source,
  () => ({ allowHtml: props.allowHtml, highlight: props.highlight }),
)
const resolvedTheme = useResolvedTheme(() => props.theme)
const element = ref<HTMLElement>()

defineExpose({ element, html, tree, title })
</script>

<template>
  <div ref="element" class="mv-content" :data-mv-theme="resolvedTheme" v-html="html" />
</template>

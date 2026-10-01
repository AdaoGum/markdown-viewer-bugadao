<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import ExportMenu from './ExportMenu.vue'
import Icon from './Icon.vue'
import { ensureStyles } from '../core/styles'
import { useMarkdown, useResolvedTheme } from '../core/use-markdown'
import { createExportContext, runExporter } from '../core/export'
import { format, resolveMessages, type Messages } from '../core/i18n'
import { resolveExporters } from '../exporters'
import { ExportError, type ExportOptions, type ExportResult, type Exporter, type ThemeOption, type ViewerMode } from '../core/types'

const props = withDefaults(
  defineProps<{
    /** Markdown source. Use with v-model when `editable`. */
    modelValue?: string
    /** Initial / controlled layout. Supports v-model:mode. */
    mode?: ViewerMode
    /** Show the editor and the preview/split/edit switch. */
    editable?: boolean
    /** Export formats to offer, in order (ids). All built-ins when omitted. */
    formats?: string[]
    /** Additional or replacement exporters. */
    exporters?: Exporter[]
    /** Base name for exported files. Defaults to the document title. */
    filename?: string
    /** Document title for metadata. Defaults to the first H1. */
    title?: string
    theme?: ThemeOption
    /** Options passed to exporters (page size, theme for visual exports, ...). */
    exportOptions?: ExportOptions
    /** Render raw HTML inside the Markdown (sanitised). */
    allowHtml?: boolean
    highlight?: boolean
    /** Show the toolbar. */
    toolbar?: boolean
    /** Show the document title in the toolbar. */
    showTitle?: boolean
    locale?: string
    messages?: Partial<Messages>
    /** Height of the component (CSS length or px number). Auto when omitted. */
    height?: string | number
  }>(),
  {
    modelValue: '',
    mode: undefined,
    editable: false,
    theme: 'light',
    allowHtml: false,
    highlight: true,
    toolbar: true,
    showTitle: true,
    locale: 'en',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:mode': [mode: ViewerMode]
  export: [result: ExportResult]
  'export-error': [payload: { exporter: Exporter; error: unknown }]
}>()

defineSlots<{
  'toolbar-start'?: () => unknown
  'toolbar-end'?: () => unknown
}>()

ensureStyles()

const source = ref(props.modelValue)
watch(
  () => props.modelValue,
  (value) => {
    if (value !== source.value) source.value = value
  },
)

function onInput(event: Event) {
  source.value = (event.target as HTMLTextAreaElement).value
  emit('update:modelValue', source.value)
}

const localMode = ref<ViewerMode>(props.mode ?? (props.editable ? 'split' : 'preview'))
watch(
  () => props.mode,
  (value) => {
    if (value) localMode.value = value
  },
)
const activeMode = computed<ViewerMode>(() => (props.editable ? localMode.value : 'preview'))

function setMode(mode: ViewerMode) {
  localMode.value = mode
  emit('update:mode', mode)
}

const { tree, html, title: detectedTitle } = useMarkdown(source, () => ({
  allowHtml: props.allowHtml,
  highlight: props.highlight,
}))
const resolvedTheme = useResolvedTheme(() => props.theme)
const t = computed(() => resolveMessages(props.locale, props.messages))
const availableExporters = computed(() => resolveExporters(props.formats, props.exporters))
const displayTitle = computed(() => props.title || detectedTitle.value || props.filename || '')

const rootStyle = computed(() => {
  if (props.height == null) return undefined
  return { height: typeof props.height === 'number' ? `${props.height}px` : props.height }
})

// Editor → preview proportional scroll sync in split mode.
const editorEl = ref<HTMLTextAreaElement>()
const previewPane = ref<HTMLElement>()
const previewEl = ref<HTMLElement>()

function syncScroll() {
  const editor = editorEl.value
  const pane = previewPane.value
  if (!editor || !pane || activeMode.value !== 'split') return
  const max = editor.scrollHeight - editor.clientHeight
  const ratio = max > 0 ? editor.scrollTop / max : 0
  pane.scrollTop = ratio * (pane.scrollHeight - pane.clientHeight)
}

function onEditorKeydown(event: KeyboardEvent) {
  if (event.key !== 'Tab' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return
  event.preventDefault()
  const editor = event.target as HTMLTextAreaElement
  // execCommand keeps the native undo stack; fall back to setRangeText.
  if (!document.execCommand?.('insertText', false, '  ')) {
    editor.setRangeText('  ', editor.selectionStart, editor.selectionEnd, 'end')
    onInput(event)
  }
}

// Export flow and status toast.
const busy = ref<string | null>(null)
const status = ref<{ kind: 'info' | 'success' | 'error'; text: string } | null>(null)
let statusTimer: ReturnType<typeof setTimeout> | undefined

function showStatus(kind: 'info' | 'success' | 'error', text: string, duration = 0) {
  clearTimeout(statusTimer)
  status.value = { kind, text }
  if (duration) statusTimer = setTimeout(() => (status.value = null), duration)
}

onBeforeUnmount(() => clearTimeout(statusTimer))

function getContext() {
  return createExportContext({
    markdown: source.value,
    tree: tree.value,
    html: html.value,
    title: displayTitle.value || undefined,
    filename: props.filename,
    options: { lang: props.locale, ...props.exportOptions },
  })
}

function findExporter(target: string | Exporter): Exporter {
  if (typeof target !== 'string') return target
  const exporter = availableExporters.value.find((item) => item.id === target) ?? resolveExporters([target], props.exporters)[0]
  if (!exporter) throw new Error(`Unknown export format: ${target}`)
  return exporter
}

/**
 * Exports the current document. Resolves with the produced file (if any);
 * rejects if the exporter fails. Pass `download: false` to only get the Blob.
 */
async function exportAs(target: string | Exporter, { download = true } = {}): Promise<ExportResult> {
  const exporter = findExporter(target)
  const label = t.value.formats[exporter.id] ?? exporter.label
  busy.value = exporter.id
  showStatus('info', format(t.value.exporting, { format: label }))
  try {
    const result = await runExporter(exporter, getContext(), download)
    showStatus('success', format(t.value.exported, { format: label }), 2200)
    emit('export', result)
    return result
  } catch (error) {
    const message = error instanceof ExportError ? (t.value.errors[error.code] ?? error.message) : (error as Error)?.message
    const detail = message ? `: ${message}` : ''
    showStatus('error', format(t.value.exportFailed, { format: label }) + detail, 5000)
    emit('export-error', { exporter, error })
    throw error
  } finally {
    busy.value = null
  }
}

function onSelect(exporter: Exporter) {
  // Failures are reported through the toast and the export-error event.
  exportAs(exporter).catch(() => {})
}

defineExpose({
  exportAs,
  getContext,
  getHtml: () => html.value,
  getTree: () => tree.value,
  previewElement: previewEl,
  exporters: availableExporters,
})

const modes: { id: ViewerMode; icon: string; key: 'preview' | 'split' | 'edit' }[] = [
  { id: 'preview', icon: 'eye', key: 'preview' },
  { id: 'split', icon: 'split', key: 'split' },
  { id: 'edit', icon: 'edit', key: 'edit' },
]
</script>

<template>
  <div class="mv-viewer" :data-mv-theme="resolvedTheme" :style="rootStyle">
    <div v-if="toolbar" class="mv-toolbar">
      <slot name="toolbar-start" />
      <div v-if="editable" class="mv-segmented" role="group">
        <button
          v-for="item in modes"
          :key="item.id"
          type="button"
          :aria-pressed="activeMode === item.id"
          :title="t[item.key]"
          @click="setMode(item.id)"
        >
          <Icon :name="item.icon" />
          <span>{{ t[item.key] }}</span>
        </button>
      </div>
      <div v-if="showTitle && displayTitle" class="mv-toolbar-title" :title="displayTitle">{{ displayTitle }}</div>
      <div v-else class="mv-toolbar-spacer" />
      <slot name="toolbar-end" />
      <ExportMenu
        v-if="availableExporters.length"
        :exporters="availableExporters"
        :messages="t"
        :busy="busy"
        @select="onSelect"
      />
    </div>

    <div class="mv-body" :data-mode="activeMode">
      <div v-if="activeMode !== 'preview'" class="mv-pane">
        <textarea
          ref="editorEl"
          class="mv-editor"
          :value="source"
          :aria-label="t.editorLabel"
          :placeholder="t.editorPlaceholder"
          spellcheck="false"
          @input="onInput"
          @keydown="onEditorKeydown"
          @scroll="syncScroll"
        />
      </div>
      <div v-if="activeMode !== 'edit'" ref="previewPane" class="mv-pane">
        <div ref="previewEl" class="mv-content mv-preview" :data-mv-theme="resolvedTheme" v-html="html" />
      </div>
    </div>

    <Transition name="mv-fade">
      <div v-if="status" class="mv-status" :data-kind="status.kind" role="status" aria-live="polite">
        <span v-if="status.kind === 'info'" class="mv-spinner" aria-hidden="true" />
        <Icon v-else :name="status.kind === 'error' ? 'alert' : 'check'" />
        {{ status.text }}
      </div>
    </Transition>
  </div>
</template>

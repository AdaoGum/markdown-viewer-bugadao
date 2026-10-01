<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from 'vue'
import {
  MarkdownViewer,
  MarkdownPreview,
  builtinExporters,
  ExportError,
  useResolvedTheme,
  ptBR,
  type ExportOptions,
  type ExportResult,
  type Exporter,
  type ThemeOption,
} from '@bugadao/markdown-viewer'
import sample from './sample.md?raw'
import { apiMd, formatDescriptions, installMd, recipesMd } from './content'

// Site theme, remembered per browser.
function readPref<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T) || fallback
  } catch {
    return fallback
  }
}
function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage unavailable (private mode); preference just won't persist.
  }
}

const themePref = ref<ThemeOption>(readPref('mv-demo-theme', 'auto'))
const theme = useResolvedTheme(themePref)
watch(themePref, (value) => writePref('mv-demo-theme', value))
watch(theme, (value) => (document.documentElement.dataset.theme = value), { immediate: true })

const locale = ref<'pt-BR' | 'en'>(readPref('mv-demo-locale', 'pt-BR'))
watch(locale, (value) => writePref('mv-demo-locale', value))

// Demo document and export settings.
const markdown = ref(sample)
const filename = ref('guia-markdown')
const pageSize = ref<NonNullable<ExportOptions['pageSize']>>('a4')
const orientation = ref<NonNullable<ExportOptions['orientation']>>('portrait')
const exportTheme = ref<'light' | 'dark'>('light')
const exportOptions = computed<ExportOptions>(() => ({
  pageSize: pageSize.value,
  orientation: orientation.value,
  theme: exportTheme.value,
  author: 'Markdown Viewer Bugadão',
}))

const viewer = useTemplateRef<InstanceType<typeof MarkdownViewer>>('viewer')

// Open / drop a Markdown file.
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const dragging = ref(false)
let dragDepth = 0

async function loadFile(file: File | undefined) {
  if (!file) return
  markdown.value = await file.text()
  filename.value = file.name.replace(/\.(md|markdown|mdown|txt)$/i, '')
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  loadFile(input.files?.[0])
  input.value = ''
}

function onDragEnter(event: DragEvent) {
  if (!event.dataTransfer?.types.includes('Files')) return
  dragDepth++
  dragging.value = true
}
function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1)
  if (!dragDepth) dragging.value = false
}
function onDrop(event: DragEvent) {
  dragDepth = 0
  dragging.value = false
  loadFile(event.dataTransfer?.files[0])
}

function resetSample() {
  markdown.value = sample
  filename.value = 'guia-markdown'
}

// Export log, fed by the component's events.
interface LogEntry {
  id: number
  ok: boolean
  label: string
  detail: string
  time: string
}
const log = ref<LogEntry[]>([])
let logId = 0

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function pushLog(entry: Omit<LogEntry, 'id' | 'time'>) {
  const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  log.value = [{ id: ++logId, time, ...entry }, ...log.value].slice(0, 6)
}

function onExport(result: ExportResult) {
  pushLog({
    ok: true,
    label: labelOf(result.exporter),
    detail: result.blob ? `${result.filename} · ${formatSize(result.blob.size)}` : 'concluído',
  })
}

function onExportError({ exporter, error }: { exporter: Exporter; error: unknown }) {
  const detail = error instanceof ExportError ? (ptBR.errors[error.code] ?? error.message) : String((error as Error)?.message ?? error)
  pushLog({ ok: false, label: labelOf(exporter), detail })
}

const labelOf = (exporter: Exporter) => ptBR.formats[exporter.id] ?? exporter.label

// Format gallery.
const categories = [
  { id: 'document', title: 'Documentos' },
  { id: 'web', title: 'Web' },
  { id: 'image', title: 'Imagens' },
  { id: 'data', title: 'Dados e texto' },
  { id: 'action', title: 'Ações' },
] as const
const gallery = categories.map((category) => ({
  ...category,
  items: builtinExporters.filter((exporter) => exporter.category === category.id),
}))
const fileFormatCount = builtinExporters.filter((exporter) => exporter.extension).length

const running = ref<string | null>(null)
async function exportFromGallery(id: string) {
  running.value = id
  try {
    document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    await viewer.value?.exportAs(id)
  } catch {
    // Already reported by the viewer's toast and the export log.
  } finally {
    running.value = null
  }
}
</script>

<template>
  <header class="site-header">
    <div class="container header-row">
      <a class="brand" href="#top">
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="7" fill="currentColor" />
          <path d="M7 22V10h3l3 4 3-4h3v12h-3v-7l-3 4-3-4v7zM22 16h3v-6h2v6h3l-4 6z" fill="var(--bg)" />
        </svg>
        <span class="brand-name">Markdown Viewer <span class="brand-umbrella">Bugadão</span></span>
      </a>
      <nav class="site-nav" aria-label="Seções">
        <a href="#demo">Demo</a>
        <a href="#formatos">Formatos</a>
        <a href="#instalacao">Instalação</a>
        <a href="#api">API</a>
      </nav>
      <label class="theme-select">
        <span class="sr-only">Tema</span>
        <select v-model="themePref">
          <option value="auto">Tema: sistema</option>
          <option value="light">Tema: claro</option>
          <option value="dark">Tema: escuro</option>
        </select>
      </label>
    </div>
  </header>

  <main id="top">
    <section class="hero container">
      <p class="eyebrow">Componente Vue 3 · TypeScript · 100% no navegador</p>
      <h1>Visualize Markdown e exporte para <span class="accent">{{ fileFormatCount }} formatos</span> com um clique.</h1>
      <p class="lead">
        PDF, Word, LibreOffice, EPUB, HTML, RTF, LaTeX, imagens, CSV e mais. Importe o
        <code>&lt;MarkdownViewer&gt;</code> no seu projeto e ganhe editor, pré-visualização e exportação prontos.
      </p>
      <div class="hero-actions">
        <a class="button primary" href="#demo">Testar agora</a>
        <a class="button" href="#instalacao">Instalar</a>
      </div>
      <ul class="format-strip" aria-label="Formatos suportados">
        <li v-for="exporter in builtinExporters.filter((e) => e.extension)" :key="exporter.id">{{ exporter.extension }}</li>
      </ul>
    </section>

    <section id="demo" class="section container">
      <div class="section-head">
        <h2>Demo ao vivo</h2>
        <p>Edite o texto, arraste um arquivo <code>.md</code> para cá ou abra um do seu computador. Depois, exporte.</p>
      </div>

      <div class="controls">
        <div class="control-group">
          <button type="button" class="button small" @click="fileInput?.click()">Abrir arquivo…</button>
          <input ref="fileInput" type="file" accept=".md,.markdown,.mdown,.txt,text/markdown,text/plain" hidden @change="onFileChange" />
          <button type="button" class="button small" @click="resetSample">Restaurar exemplo</button>
          <button type="button" class="button small" @click="markdown = ''">Limpar</button>
        </div>
        <div class="control-group">
          <label class="field">
            <span>Arquivo</span>
            <input v-model="filename" type="text" spellcheck="false" />
          </label>
          <label class="field">
            <span>Papel</span>
            <select v-model="pageSize">
              <option value="a4">A4</option>
              <option value="letter">Carta</option>
              <option value="legal">Ofício</option>
              <option value="a5">A5</option>
            </select>
          </label>
          <label class="field">
            <span>Orientação</span>
            <select v-model="orientation">
              <option value="portrait">Retrato</option>
              <option value="landscape">Paisagem</option>
            </select>
          </label>
          <label class="field">
            <span>Tema do arquivo</span>
            <select v-model="exportTheme">
              <option value="light">Claro</option>
              <option value="dark">Escuro</option>
            </select>
          </label>
          <label class="field">
            <span>Idioma do componente</span>
            <select v-model="locale">
              <option value="pt-BR">Português</option>
              <option value="en">English</option>
            </select>
          </label>
        </div>
      </div>

      <div
        class="demo-frame"
        :class="{ dragging }"
        @dragenter.prevent="onDragEnter"
        @dragover.prevent
        @dragleave="onDragLeave"
        @drop.prevent="onDrop"
      >
        <MarkdownViewer
          ref="viewer"
          v-model="markdown"
          editable
          :theme="theme"
          :locale="locale"
          :filename="filename"
          :export-options="exportOptions"
          :height="680"
          @export="onExport"
          @export-error="onExportError"
        />
        <div v-if="dragging" class="drop-overlay">Solte o arquivo Markdown aqui</div>
      </div>

      <div class="log" aria-live="polite">
        <h3>Exportações recentes</h3>
        <p v-if="!log.length" class="muted">Nada exportado ainda. Os eventos <code>@export</code> e <code>@export-error</code> do componente aparecem aqui.</p>
        <ul v-else>
          <li v-for="entry in log" :key="entry.id" :class="{ error: !entry.ok }">
            <span class="log-time">{{ entry.time }}</span>
            <strong>{{ entry.label }}</strong>
            <span class="log-detail">{{ entry.detail }}</span>
          </li>
        </ul>
      </div>
    </section>

    <section id="formatos" class="section container">
      <div class="section-head">
        <h2>Formatos</h2>
        <p>Cada formato é carregado sob demanda: o código de PDF, DOCX ou imagens só é baixado quando alguém exporta.</p>
      </div>
      <div v-for="group in gallery" :key="group.id" class="format-group">
        <h3>{{ group.title }}</h3>
        <div class="format-grid">
          <article v-for="exporter in group.items" :key="exporter.id" class="format-card">
            <div class="format-card-head">
              <span class="ext">{{ exporter.extension ?? '⚡' }}</span>
              <h4>{{ labelOf(exporter) }}</h4>
            </div>
            <p>{{ formatDescriptions[exporter.id] }}</p>
            <button type="button" class="button small" :disabled="running === exporter.id" @click="exportFromGallery(exporter.id)">
              {{ running === exporter.id ? 'Exportando…' : exporter.extension ? 'Exportar a demo' : 'Executar' }}
            </button>
          </article>
        </div>
      </div>
    </section>

    <section id="instalacao" class="section container">
      <div class="section-head">
        <h2>Instalação</h2>
        <p>Vue 3.3+ como dependência <em>peer</em>. Funciona com Vite, Nuxt (client-side) e qualquer bundler ESM.</p>
      </div>
      <div class="doc-grid">
        <MarkdownPreview class="doc" :source="installMd" :theme="theme" />
        <MarkdownPreview class="doc" :source="recipesMd" :theme="theme" />
      </div>
    </section>

    <section id="api" class="section container">
      <div class="section-head">
        <h2>API</h2>
        <p>Também exportados: <code>MarkdownPreview</code>, <code>exportMarkdown</code>, <code>renderMarkdown</code>, <code>useMarkdown</code>, <code>builtinExporters</code> e os tipos.</p>
      </div>
      <MarkdownPreview class="doc" :source="apiMd" :theme="theme" />
    </section>
  </main>

  <footer class="site-footer">
    <div class="container">
      Markdown Viewer Bugadão · <code>@bugadao/markdown-viewer</code> · MIT · feito com Vue 3, unified, docx, JSZip, html2pdf.js e html-to-image.
    </div>
  </footer>
</template>

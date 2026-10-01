// Copy for the demo page. The snippets and API tables are Markdown rendered
// with <MarkdownPreview>, so the page uses the library to document itself.

export const formatDescriptions: Record<string, string> = {
  pdf: 'Documento paginado pronto para imprimir ou enviar, com links clicáveis.',
  docx: 'Word nativo: títulos, listas numeradas, tabelas, imagens e notas de rodapé reais.',
  odt: 'OpenDocument para LibreOffice e Google Docs, com estilos editáveis.',
  rtf: 'Rich Text universal: abre no WordPad, TextEdit e em qualquer processador de texto.',
  epub: 'Livro digital EPUB 3, com sumário gerado a partir dos títulos.',
  tex: 'Fonte LaTeX pronta para compilar com pdflatex, xelatex ou lualatex.',
  html: 'Página única e autocontida, com CSS e realce de código embutidos.',
  md: 'O próprio Markdown, para salvar ou versionar.',
  png: 'Imagem em alta resolução (2×) do documento renderizado.',
  jpeg: 'Imagem compacta, boa para compartilhar em chats.',
  svg: 'Imagem vetorial do documento renderizado.',
  txt: 'Texto limpo, com tabelas alinhadas e links por extenso.',
  csv: 'Todas as tabelas do documento, prontas para o Excel ou Sheets.',
  json: 'Árvore sintática mdast, para processar o documento em código.',
  print: 'Abre a impressão do navegador (PDF vetorial via “Salvar como PDF”).',
  'copy-html': 'Copia como texto formatado para colar no Gmail, Docs, Notion…',
  'copy-markdown': 'Copia o código-fonte Markdown para a área de transferência.',
}

export const installMd = `
\`\`\`bash
npm install @bugadao/markdown-viewer
\`\`\`

Use o componente em qualquer SFC. Os estilos são injetados automaticamente, sem precisar importar CSS:

\`\`\`vue
<script setup lang="ts">
import { ref } from 'vue'
import { MarkdownViewer } from '@bugadao/markdown-viewer'

const markdown = ref('# Olá, mundo!')
</script>

<template>
  <MarkdownViewer v-model="markdown" editable locale="pt-BR" :height="600" />
</template>
\`\`\`

Ou registre globalmente como plugin:

\`\`\`ts
import { createApp } from 'vue'
import MarkdownViewerBugadao from '@bugadao/markdown-viewer'
import App from './App.vue'

createApp(App).use(MarkdownViewerBugadao).mount('#app')
\`\`\`
`

export const recipesMd = `
### Só alguns formatos, na ordem que você quiser

\`\`\`vue
<MarkdownViewer :model-value="doc" :formats="['pdf', 'docx', 'html', 'copy-markdown']" />
\`\`\`

### Exportar por código, sem interface

\`\`\`ts
import { exportMarkdown } from '@bugadao/markdown-viewer'

// Baixa o arquivo direto no navegador
await exportMarkdown(markdown, 'pdf', { filename: 'contrato', options: { pageSize: 'letter' } })

// Ou só obtém o Blob, para enviar a uma API
const { blob } = await exportMarkdown(markdown, 'docx', { download: false })
await fetch('/api/upload', { method: 'POST', body: blob })
\`\`\`

### Chamar a exportação pelo componente

\`\`\`vue
<script setup lang="ts">
import { useTemplateRef } from 'vue'
import { MarkdownViewer } from '@bugadao/markdown-viewer'

const viewer = useTemplateRef('viewer')
const salvar = () => viewer.value?.exportAs('docx')
</script>

<template>
  <MarkdownViewer ref="viewer" :model-value="doc" :toolbar="false" />
  <button @click="salvar">Baixar .docx</button>
</template>
\`\`\`

### Criar um formato próprio

\`\`\`ts
import type { Exporter } from '@bugadao/markdown-viewer'

const slides: Exporter = {
  id: 'slides',
  label: 'Slides (HTML)',
  extension: 'html',
  category: 'web',
  run: (ctx) => new Blob([minhaConversao(ctx.tree, ctx.title)], { type: 'text/html' }),
}
\`\`\`

\`\`\`vue
<MarkdownViewer :model-value="doc" :exporters="[slides]" />
\`\`\`
`

export const apiMd = `
### Props

| Prop | Tipo | Padrão | Descrição |
| :--- | :--- | :--- | :--- |
| \`modelValue\` | \`string\` | \`''\` | Conteúdo Markdown (use \`v-model\` com \`editable\`). |
| \`editable\` | \`boolean\` | \`false\` | Mostra o editor e os modos Visualizar / Dividir / Editar. |
| \`mode\` | \`'preview' \\| 'split' \\| 'edit'\` | automático | Layout inicial; aceita \`v-model:mode\`. |
| \`formats\` | \`string[]\` | todos | Formatos oferecidos no menu, na ordem dada. |
| \`exporters\` | \`Exporter[]\` | \`[]\` | Exportadores extras ou substitutos (mesmo \`id\`). |
| \`filename\` | \`string\` | título | Nome base dos arquivos exportados. |
| \`title\` | \`string\` | primeiro H1 | Título usado nos metadados dos arquivos. |
| \`theme\` | \`'light' \\| 'dark' \\| 'auto'\` | \`'light'\` | Tema do componente. |
| \`exportOptions\` | \`ExportOptions\` | — | \`pageSize\`, \`orientation\`, \`margin\`, \`scale\`, \`theme\`, \`author\`… |
| \`allowHtml\` | \`boolean\` | \`false\` | Renderiza HTML bruto do Markdown (sanitizado). |
| \`highlight\` | \`boolean\` | \`true\` | Realce de sintaxe nos blocos de código. |
| \`toolbar\` | \`boolean\` | \`true\` | Mostra a barra de ferramentas. |
| \`locale\` | \`string\` | \`'en'\` | \`'en'\` ou \`'pt-BR'\`. |
| \`messages\` | \`Partial<Messages>\` | — | Sobrescreve textos da interface. |
| \`height\` | \`string \\| number\` | auto | Altura do componente. |

### Eventos

| Evento | Payload | Quando |
| :--- | :--- | :--- |
| \`update:modelValue\` | \`string\` | O texto foi editado. |
| \`update:mode\` | \`ViewerMode\` | O modo de visualização mudou. |
| \`export\` | \`{ exporter, blob?, filename? }\` | Uma exportação terminou. |
| \`export-error\` | \`{ exporter, error }\` | Uma exportação falhou. |

### Métodos (via \`ref\`)

| Método | Retorno | Descrição |
| :--- | :--- | :--- |
| \`exportAs(format, { download })\` | \`Promise<ExportResult>\` | Exporta no formato indicado. |
| \`getHtml()\` | \`string\` | HTML renderizado. |
| \`getTree()\` | \`Root\` | Árvore mdast do documento. |
| \`getContext()\` | \`ExportContext\` | Contexto completo passado aos exportadores. |

### Slots

\`toolbar-start\` e \`toolbar-end\` recebem botões extras na barra de ferramentas.
`

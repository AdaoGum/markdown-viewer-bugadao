# Markdown Viewer Bugadão

`@bugadao/markdown-viewer`: componente **Vue 3** para visualizar e editar Markdown, com exportação para 14 formatos de arquivo e 3 ações, tudo no navegador:

| Documentos | Web | Imagens | Dados e texto | Ações |
| :-- | :-- | :-- | :-- | :-- |
| PDF, DOCX (Word), ODT (LibreOffice), RTF, EPUB, LaTeX | HTML autocontido, Markdown | PNG, JPEG, SVG | TXT, CSV (tabelas), JSON (mdast) | Imprimir, copiar como HTML, copiar Markdown |

- CommonMark + GFM: tabelas, listas de tarefas, notas de rodapé, riscado, autolinks, realce de sintaxe.
- DOCX, ODT e RTF são documentos editáveis de verdade: títulos com estilo, listas numeradas, tabelas, imagens embutidas e notas de rodapé nativas. Não são imagens coladas numa página.
- Cada formato é carregado sob demanda (`import()` dinâmico). O código de PDF/DOCX só é baixado quando alguém exporta.
- Tema claro, escuro ou automático; interface em inglês ou português (textos sobrescrevíveis).
- Estilos injetados automaticamente, sem precisar importar CSS.
- Tipado em TypeScript.

## Rodando o projeto

```bash
npm install
npm run dev          # site de demonstração em http://localhost:5173
npm test             # testes dos exportadores (Vitest + jsdom)
npm run typecheck
npm run build        # biblioteca em dist/ + site em dist-demo/
```

Scripts separados: `npm run build:lib` (pacote npm) e `npm run build:demo` (site estático; `base: './'`, pode ser publicado em qualquer pasta).

## Publicando o site (markdown.bugadao.com)

O site de demonstração fica no **Cloudflare Pages**, projeto `markdown-viewer-bugadao` (Direct Upload), no mesmo esquema do site do LoL. O DNS de `bugadao.com` está na **Hostinger**, então o subdomínio é um CNAME lá.

Primeira vez:

1. Autentique o wrangler, se ainda não estiver (`npx wrangler whoami` para conferir): `npx wrangler login`
2. Crie o projeto: `npx wrangler pages project create markdown-viewer-bugadao --production-branch=main`
3. Publique: `npm run deploy:site` e confira `https://markdown-viewer-bugadao.pages.dev`
4. Cloudflare → **Workers & Pages → markdown-viewer-bugadao → Custom domains → Set up a custom domain** → `markdown.bugadao.com`
5. Hostinger → **Domínios → bugadao.com → DNS**: CNAME `markdown` → `markdown-viewer-bugadao.pages.dev` (TTL 300)
6. Aguarde o domínio ficar **Active** no Pages e abra `https://markdown.bugadao.com`

Atualizações: só `npm run deploy:site` (roda os testes, gera o site e publica).

> Se o DNS de `bugadao.com` for migrado para a Cloudflare, inclua o CNAME `markdown` na conferência dos registros importados, senão o site cai quando a troca de nameservers propagar.

## Estrutura

```
src/lib/                 a biblioteca (é o que vai para o npm)
  components/            MarkdownViewer, MarkdownPreview, ExportMenu
  core/                  pipeline Markdown (unified/remark/rehype), i18n, API de exportação
  exporters/             um arquivo por formato + registro (index.ts)
  styles/                content.css (documento) e viewer.css (interface)
src/demo/                site de demonstração, que importa '@bugadao/markdown-viewer' como um app real
tests/                   testes dos exportadores
```

## Uso

```bash
npm install @bugadao/markdown-viewer
```

> O pacote ainda não foi publicado. Para publicar, crie antes a organização **bugadao** em npmjs.com (grátis para pacotes públicos) e rode `npm run build:lib && npm publish`. O `publishConfig.access: public` já está no `package.json`, necessário porque pacotes com escopo são privados por padrão.
> Para testar localmente em outro projeto antes disso: `npm pack` aqui e `npm install ../caminho/bugadao-markdown-viewer-0.1.0.tgz` lá.

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { MarkdownViewer } from '@bugadao/markdown-viewer'

const markdown = ref('# Olá, mundo!')
</script>

<template>
  <MarkdownViewer v-model="markdown" editable locale="pt-BR" :height="600" />
</template>
```

Registro global:

```ts
import MarkdownViewerBugadao from '@bugadao/markdown-viewer'
app.use(MarkdownViewerBugadao) // registra <MarkdownViewer> e <MarkdownPreview>
```

Somente alguns formatos, na ordem desejada:

```vue
<MarkdownViewer :model-value="doc" :formats="['pdf', 'docx', 'html', 'copy-markdown']" />
```

Exportar por código, sem componente:

```ts
import { exportMarkdown } from '@bugadao/markdown-viewer'

await exportMarkdown(markdown, 'pdf', { filename: 'contrato', options: { pageSize: 'letter' } })

const { blob } = await exportMarkdown(markdown, 'docx', { download: false })
```

Formato personalizado:

```ts
import type { Exporter } from '@bugadao/markdown-viewer'

const slides: Exporter = {
  id: 'slides',
  label: 'Slides (HTML)',
  extension: 'html',
  category: 'web',
  run: (ctx) => new Blob([converter(ctx.tree)], { type: 'text/html' }),
}
// <MarkdownViewer :exporters="[slides]" />
```

`ctx` (`ExportContext`) traz `markdown`, `tree` (mdast), `html`, `title`, `filename` e `options`. Um exportador com o mesmo `id` de um nativo o substitui.

## API

### `<MarkdownViewer>`

| Prop | Tipo | Padrão | |
| :-- | :-- | :-- | :-- |
| `modelValue` | `string` | `''` | Conteúdo (use `v-model` com `editable`). |
| `editable` | `boolean` | `false` | Editor + modos Visualizar / Dividir / Editar. |
| `mode` | `'preview' \| 'split' \| 'edit'` | auto | Layout; aceita `v-model:mode`. |
| `formats` | `string[]` | todos | Ids dos formatos oferecidos, na ordem. |
| `exporters` | `Exporter[]` | `[]` | Exportadores extras ou substitutos. |
| `filename` | `string` | título | Nome base dos arquivos. |
| `title` | `string` | primeiro H1 | Título nos metadados. |
| `theme` | `'light' \| 'dark' \| 'auto'` | `'light'` | Tema do componente. |
| `exportOptions` | `ExportOptions` | — | `theme`, `pageSize`, `orientation`, `margin`, `scale`, `width`, `author`, `lang`. |
| `allowHtml` | `boolean` | `false` | Permite HTML bruto no Markdown (sanitizado com rehype-sanitize). |
| `highlight` | `boolean` | `true` | Realce de sintaxe. |
| `toolbar` / `showTitle` | `boolean` | `true` | Barra de ferramentas / título nela. |
| `locale` | `string` | `'en'` | `'en'` ou `'pt-BR'`. |
| `messages` | `Partial<Messages>` | — | Sobrescreve textos. |
| `height` | `string \| number` | auto | Altura do componente. |

Eventos: `update:modelValue`, `update:mode`, `export` (`{ exporter, blob?, filename? }`), `export-error` (`{ exporter, error }`).

Métodos via `ref`: `exportAs(format, { download? })`, `getHtml()`, `getTree()`, `getContext()`.

Slots: `toolbar-start`, `toolbar-end`.

### Outros exports

`MarkdownPreview` (só renderização), `ExportMenu`, `exportMarkdown`, `renderMarkdown`, `parseMarkdown`, `treeToHtml`, `useMarkdown`, `builtinExporters`, `resolveExporters`, `createExportContext`, `runExporter`, `downloadBlob`, `ensureStyles`, `contentCss`, `ExportError`, `en`, `ptBR` e todos os tipos.

## Observações por formato

- **PDF**: gerado com html2pdf.js (a página é rasterizada, então o texto não é selecionável; os links continuam clicáveis). Para PDF vetorial com texto selecionável, use a ação **Imprimir** → "Salvar como PDF".
- **Imagens remotas** só entram em DOCX/ODT/RTF/EPUB/PNG/PDF se o servidor delas permitir CORS. Caso contrário, viram o texto alternativo.
- **LaTeX**: compila com pdflatex; para emoji e escritas não latinas, use xelatex/lualatex. Imagens remotas viram uma referência em nota de rodapé.
- **CSV**: exporta todas as tabelas do documento, separadas por uma linha em branco, com BOM UTF-8 para o Excel.
- **SSR/Nuxt**: renderize o componente só no cliente (`<ClientOnly>`), porque as exportações usam APIs do navegador.

## Licença

MIT

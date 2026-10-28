# Markdown Viewer Bugadão — instruções para IAs

Componente Vue 3 (`@bugadao/markdown-viewer`, em `src/lib/`) + site de demonstração
(`src/demo/`, publicado em markdown.bugadao.com). Uso, API, estrutura e deploy estão no
[`README.md`](README.md) — ele é a documentação principal; mantenha-o em dia.

## Regras que valem sempre

1. **Commit, push e publicação no npm são do dono.** Deixe staged e entregue a mensagem
   de commit. O pacote ainda não está no npm (falta a organização `bugadao` lá).
2. **Formato novo**: a implementação vai num módulo de `src/lib/exporters/` (um por formato
   ou família, ex.: `text.ts` faz TXT e CSV) e entra na lista `builtinExporters` do
   `exporters/index.ts` **carregada por `import()` dentro do `run`**, como os outros. Nunca
   importe esse módulo (nem a biblioteca pesada dele) no topo do `index.ts`: ele iria para o
   pacote de todo mundo, mesmo de quem nunca exporta. Teste em `tests/`.
3. **`src/demo/` importa o pacote como um app de verdade** (`'@bugadao/markdown-viewer'`),
   nunca `../lib/...`: é o que garante que a API pública funciona.
4. **HTML bruto é sanitizado** (`rehype-sanitize`) e só entra com `allowHtml`. Não afrouxe
   o schema sem motivo — o componente roda Markdown de terceiros.
5. Textos da interface existem em inglês e pt-BR (`core/i18n`): texto novo vai nos dois.

## Economia de contexto

- Para entender um formato, abra só o módulo dele em `src/lib/exporters/` e o teste
  correspondente em `tests/`, não a pasta inteira.
- `dist/`, `dist-demo/` (bundles de até ~900 KB) e `package-lock.json` estão bloqueados
  no `.claude/settings.json`. Tamanho de pacote se confere pela saída do build.

## Antes de dizer "pronto"

```bash
npm test && npm run typecheck && npm run build
```

Publicar o site: `npm run deploy:site` (Cloudflare Pages `markdown-viewer-bugadao`).
Confira https://markdown.bugadao.com depois.

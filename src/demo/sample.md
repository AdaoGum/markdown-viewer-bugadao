# Guia rápido de Markdown

Markdown é um jeito de formatar texto usando só caracteres comuns do teclado. Você escreve à **esquerda** e o resultado aparece à **direita**, na hora.

Cada seção abaixo mostra *como escrever* e, logo depois, *o resultado*. Experimente: altere qualquer linha do editor e veja a visualização mudar.

![Você escreve, o viewer mostra, você exporta](./fluxo-markdown.svg)

## 1. Títulos

Comece a linha com `#`. Quanto mais `#`, menor o título:

```md
# Título principal
## Seção
### Subseção
```

### Assim fica uma subseção

## 2. Ênfase no texto

```md
**negrito**, *itálico*, ~~riscado~~ e `código`
```

Resultado: **negrito**, *itálico*, ~~riscado~~ e `código`.

Dá para combinar: ***negrito e itálico ao mesmo tempo***.

## 3. Links

```md
[texto do link](https://www.markdownguide.org)
```

Resultado: [Guia oficial de Markdown](https://www.markdownguide.org). Endereços soltos também viram link: https://commonmark.org

## 4. Listas

Use `-` para itens soltos e dois espaços para criar um subitem:

```md
- Frutas
  - Maçã
  - Banana
- Legumes
```

- Frutas
  - Maçã
  - Banana
- Legumes

Para uma lista numerada, use `1.`, `2.` e assim por diante:

1. Escreva o texto
2. Confira a visualização
3. Exporte no formato que precisar

## 5. Lista de tarefas

```md
- [x] Tarefa concluída
- [ ] Tarefa pendente
```

- [x] Aprender títulos
- [x] Aprender listas
- [ ] Aprender tabelas
- [ ] Exportar este guia em PDF

## 6. Tabelas

Separe as colunas com `|`. Na segunda linha, os `:` definem o alinhamento:

```md
| Sintaxe    | Resultado  |
| :--------- | :--------: |
| `**texto**` | **texto** |
```

| Você escreve  | Você obtém       | Atalho comum |
| :------------ | :--------------: | -----------: |
| `**texto**`   | **negrito**      |     Ctrl + B |
| `*texto*`     | *itálico*        |     Ctrl + I |
| `~~texto~~`   | ~~riscado~~      |            — |
| `` `texto` `` | `código`         |            — |

## 7. Citações

Comece a linha com `>`. Use `>>` para uma citação dentro de outra:

```md
> Texto citado.
>
> > Citação aninhada.
```

> Escreva para ser entendido, não para impressionar.
>
> > Uma citação pode ter outra dentro dela.

## 8. Blocos de código

Coloque o código entre três crases e diga a linguagem para ativar as cores:

~~~md
```js
console.log('Olá!')
```
~~~

```js
// Conta quantas palavras tem um texto
function contarPalavras(texto) {
  return texto.trim().split(/\s+/).length
}

console.log(contarPalavras('Markdown é simples')) // 3
```

## 9. Imagens

Igual a um link, mas com `!` na frente. O texto entre colchetes descreve a imagem:

```md
![descrição da imagem](endereço-da-imagem.png)
```

A imagem do começo deste guia foi inserida assim.

## 10. Notas de rodapé, quebras e linhas

Uma nota de rodapé usa `[^1]` no texto[^1] e a explicação no fim do documento.

Para quebrar a linha sem abrir um novo parágrafo,  
termine a linha com dois espaços.

Três hífens (`---`) desenham uma linha horizontal:

---

Pronto! Agora use o botão **Exportar** para salvar este guia em PDF, Word, EPUB ou no formato que preferir.

[^1]: Nas exportações para DOCX, ODT, RTF e LaTeX, isto vira uma nota de rodapé de verdade, no pé da página.

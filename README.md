# Visualizador IFC

Visualizador de modelos IFC para publicar no GitHub Pages. Não precisa de build,
servidor ou instalação — são só arquivos estáticos.

## Estrutura

```
index.html        página principal
style.css         estilos (tema claro/escuro)
app.js            lógica do visualizador (three.js + web-ifc-three)
wasm/web-ifc.wasm  mecanismo de leitura de IFC (precisa ficar nesta pasta)
```

`three.js` e `web-ifc-three` são carregados de um CDN (jsdelivr) direto no
navegador — não precisam ser baixados. Só o `web-ifc.wasm` precisa estar
junto do site, por isso ele já vem incluído na pasta `wasm/`.

## Publicar no GitHub Pages

1. Crie um repositório novo no GitHub (ou use um existente).
2. Envie estes 4 itens para a raiz do repositório, mantendo a pasta `wasm/`:
   - `index.html`
   - `style.css`
   - `app.js`
   - `wasm/web-ifc.wasm`
3. No repositório, vá em **Settings → Pages** e em "Branch" escolha o branch
   com esses arquivos (ex.: `main`) e a pasta `/root`.
4. Aguarde alguns minutos e acesse o link que o GitHub Pages fornecer.

## Uso

- Clique em **Abrir IFC** no topo (ou arraste um arquivo `.ifc` para a janela).
- **Botão esquerdo do mouse**: gira o modelo. **Botão direito**: pan.
  **Roda do mouse**: zoom.
- Clique em um elemento para ver suas propriedades (incluindo os parâmetros
  de texto exportados do Revit, como NOME, CODIGO, FACE etc.) na barra
  lateral direita.
- Barra de ferramentas à esquerda: ajustar à janela, alternar órbita/pan,
  wireframe, plano de corte, explodir por pavimento, medir distância,
  mostrar/ocultar árvore do modelo, e restaurar elementos ocultos/isolados.
- Aba **Modelo**, na barra lateral, mostra a árvore espacial do IFC
  (Projeto → Terreno → Edificação → Pavimento → Elementos).

## Observações técnicas

- O visualizador roda 100% no navegador da pessoa que acessa a página —
  nenhum arquivo IFC é enviado a um servidor.
- Testado com arquivos exportados do Revit com **Psets do Revit** habilitados
  na exportação IFC (é exatamente essa configuração que você já validou).
- Para modelos muito grandes (dezenas de milhares de elementos), o
  carregamento inicial e a construção da árvore podem demorar alguns
  segundos — isso é esperado.

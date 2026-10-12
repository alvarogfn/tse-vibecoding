# Tarefas — Página /2-turno

> Migração concluída: código em TypeScript (`tsc -b` limpo, zero `any`) e CSS via UnoCSS (`uno.config.ts` com paleta + 60 shortcuts, `index.css` só com base). Build: `tsc -b && vite build`.
> 2º turno NO AR (ele 6258): `ROUND2_LIVE` + `USE_ROUND2_GEO` ligados; cards, legendas, mapas por UF e preditor consomem os endpoints reais.

## 1. Layout dos mapas
- [x] Colocar o mapa do Brasil à **esquerda** e o mapa de Minas Gerais à **direita** (inverter a ordem atual).

## 2. Mapa de Minas Gerais (apuração estadual)
- [x] O SVG de Minas Gerais serve para ver a apuração **no próprio estado de Minas Gerais** (votos para presidente em MG).
- [x] **Não** é para mostrar quem vai ser o governador.
- [x] Colorir cada **microrregião** de azul/vermelho com base em quem está ganhando naquela região (Flávio Bolsonaro = azul, Lula = vermelho).
- [x] Agrupar os municípios por microrregião (o SVG já contém paths `micro_31xxxxx`; mapear cada `mun_xxxxxxx` à sua micro).
- [x] Enquanto não soubermos quais serão os endpoints do segundo turno, deixar **tudo em cinza claro**.

## 2b. Mapa do Brasil (perspectiva do país — mesmas regras do item 2)
- [x] O SVG do Brasil mostra a apuração **presidencial no país**.
- [x] Colorir cada **UF** de azul/vermelho com base em quem está ganhando naquele estado (Flávio Bolsonaro = azul, Lula = vermelho) — estrutura pronta via `ufWinners` + flag `USE_ROUND2_GEO`.
- [x] Enquanto não soubermos quais serão os endpoints do segundo turno, deixar **tudo em cinza claro**.
- [x] Nomes das UFs já vêm no próprio SVG (`title`), equivalente ao item 3 na perspectiva do país.

## 3. Nomes das cidades de Minas Gerais
- [x] Descobrir os nomes das cidades e exibi-los nos tooltips/labels **ao invés do código do IBGE**.
- [x] Usar o endpoint ViaCEP (https://viacep.com.br/).
- [x] Fazer **cache do ViaCEP em JSON bruto** (arquivo local) para não estourar o rate-limit.
- [x] ⚠️ Observação técnica (resolvida): confirmado que o ViaCEP só resolve CEP → cidade/IBGE, sem consulta reversa nem listagem — por isso o cache em JSON bruto (`public/data/mg-municipios.json`, 853 municípios) foi gerado da API de localidades do IBGE em request único no build, com zero chamadas em runtime. De quebra, o mesmo JSON preencheu o agrupamento mun → micro (fórmula `micro_31 + meso + seq`, conferida 66/66 com o SVG).

## 4. Previsão do vencedor com TensorFlow.js
- [x] Instalar a biblioteca [`@tensorflow/tfjs`](https://www.npmjs.com/package/@tensorflow/tfjs).
- [x] Usar machine learning para tentar prever o vencedor com base nos dados que já temos.
- [x] Construir um **gráfico de linhas (chart)** com:
  - Uma linha para cada estado;
  - Uma linha mais grossa em **azul** para o Brasil todo;
  - Uma linha mais grossa em **vermelha** para o Lula.
- [x] O gráfico deve estar **preenchido em % de acordo com a apuração**: urnas 100% apuradas = 100% do gráfico.
  - Ex.: com 10% de apuração, somente 10% do gráfico (da esquerda para a direita) contém o histórico; os outros 90% são **estimativas** do TensorFlow.js.
- [x] Estimativas baseadas nos dados de apuração do **primeiro turno por tempo** + dados já apurados das urnas.
- [x] Se necessário, usar **pesquisas eleitorais** e os dados do 1º turno para **ponderar** as estimativas.
- [x] Fazer as ponderações **por estado** em vez de por país; depois juntar tudo e usar os dados estimados dos estados para a previsão do país.
- [x] Levar em consideração os estados mais pró-Lula e os mais pró-PT nos pesos.
- [x] Preenchimento **independente por linha**: se a apuração do país está em 10% mas a de um estado já está em 50%, as linhas azul/vermelha do país preenchem 10% do gráfico e a linha do estado preenche 50%.
- [x] As estimativas do TensorFlow.js devem ser **tracejadas e em tons mais claros** que o histórico.

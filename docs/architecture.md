# Arquitetura — React / UnoCSS / TypeScript / Separação de camadas

> Escopo deste doc: só as 4 áreas pedidas. Build de referência: `tsc -b && vite build`. Base: `/tse-vibecoding/`.

## 1. React

- React 18 + `jsx: react-jsx`. `main.tsx` importa `virtual:uno.css` primeiro, monta em `StrictMode`.
- Rotas no modo declarativo (`BrowserRouter` + `Routes`/`Route` + `Navigate`). `basename` deriva de `import.meta.env.BASE_URL`. `postbuild` copia `dist/index.html` → `dist/404.html` (fallback do gh-pages estático).
- Componentes são **apresentacionais**: recebem tudo por props, não fazem `fetch`, não parseiam, não conhecem URL.
  - Toda props tem `interface` exportada (`CandCardProps`, `MapCardProps`). Todo componente exportado anota `: React.JSX.Element`.
  - Variação por composição (`children` em `MapCard`) e callbacks (`onClick`, `onPin`, `onHover`). Página passa handlers estáveis via `useCallback` (`handleMunHover`, `brFill`, `munFill`).
  - Dados derivados com `useMemo` (`raceById`, `presTop2`, `presColors`, `predictorInputs`, `projected`). Nunca recalcular parse/cores dentro do JSX.
  - Estado local só para UI isolada (`Avatar` guarda `err` do `onError` e cai para `avatar-fallback` com iniciais). Estado de UI da página vive em hook próprio (`useFirstTurnUI`), nunca espalhado no `page.tsx`.
  - Listas com chave estável (`c.key`, `computeItemKey={(_idx, c) => c.key}`). Lista longa usa `Virtuoso`; lista curta usa `.map` direto.
  - `ChartJS.register(...)` uma vez no `page.tsx`, nunca em componente.
  - Falha isolada por seção: `ErrorBoundary` por coluna/UF (`title` = nome da seção). Sem `title`, renderiza só o bloco `.err`. Coluna com erro nunca apaga o painel.
- Contrato Fail-Safe nos hooks (ver §4): componente consome `{ data, error, loading }` e rende `hint`/`err`/skeleton — nunca `try/catch` no JSX, nunca `throw` em hook de dados.

## 2. UnoCSS

- Plugin `UnoCSS()` no `vite.config.ts` + `presetUno()` + `presetAttributify()`. Sem `presetIcons`. Paleta no `theme.colors` (`bg/card/card2/ink/muted/accent/accentdim/line`).
- `uno.config.ts` é a **única fonte de estilo**: ~60 `shortcuts` em forma string. `safelist: Object.keys(shortcuts)` — imuniza contra o extrator (ex.: `pin-btn${...}` em template literal é extraído como `pin-btn$`, nunca como `pin-btn`).
- JSX usa **só tokens** (`topbar`, `column`, `cand`, `st-card`, `search`...). Não escrever utilitários crus no JSX para o que já tem token.
- Sem briga de cascade: modificadores standalone (`ghost`, `small`, `ok`, `bad`, `clickable`, `selected`, `on`, `scroll`) vêm **depois** das bases; override real usa **variante combinada** (`btn-ghost`, `btn-sm`, `btn-ghost-sm`, `summary-ok`, `summary-bad`, `cand-clickable`, `cand-selected`, `pin-btn-on`, `cards-scroll`). O flip futuro troca `btn ghost small` pelo token único.
- Valores arbitrários (`text-[11px]`, `w-[350px]`, `border-t-[3px]`) e responsivo (`max-[900px]:`, `max-[1200px]:`) vivem **dentro** do shortcut, não no JSX.
- `src/index.css` só para o que o Uno não expressa: seletores de elemento/combinadores (`.topbar h1`, `.select option`, `.sub-race + .sub-race`, `.cand-pct b`), pseudo-elementos de scrollbar por classe, regra de `body` no mobile. Nada de classe de componente duplicada lá.
- `style={{...}}` só para valor dinâmico (`background: color`, `flex`, `height`, `maxHeight`). Estático sempre via `className`.

## 3. TypeScript

- `strict: true`, `tsc -b` limpo, **zero `any`**. Dado externo é `unknown` e estreita (`String(...)`, `Number.isFinite`, `parseFloat`, type predicate `(c): c is Candidate`).
- `verbatimModuleSyntax: true` → tipos sempre via `import type` separado. `isolatedModules`, `moduleResolution: bundler`, `allowImportingTsExtensions`.
- Imports com alias `@/*` e **extensão `.js`** mesmo partindo de `.ts` (`@/lib/tse.js`, `@/helpers/jws.js`). Constantes de módulo para valores estáveis.
- Todo contrato público tem tipo explícito: `Props`, resultado de hook (`FirstTurnUIResult`, `SecondTurnTopData`), API (`*PathParams`, `*Response`), modelos (`Race`, `ParsedRace`, `Candidate`, `SvgPath`, `UFWinner`). Função exportada anota retorno (`React.JSX.Element`, `Promise<void>`, `string`, `number`).
- Payload externo (TSE/IBGE) modelado como **estrutural pragmático**: tudo opcional + índice `[k: string]: unknown`. Internos (`Candidate`, `ParsedRace`) são estritos. Conversão na borda via `toInt`, `parseBrInt`, `parseBrPct` (pct **não** remove ponto de milhar — `12.5` ≠ `125`), `sharePct` com guarda `if (!validos) return 0`.
- Erro tipado: `HttpError(message, status?)`; hooks convertem com `String((e as Error)?.message || e)` a partir de `catch (e: unknown)`. Único `!` permitido é o `getElementById('root')!` no `main.tsx`.
- `tsconfig` com `paths: { "@/*": ["src/*"] }` + `vite-tsconfig-paths`. `resolveJsonModule: true` para o cache bruto (`mg-municipios.json`).

## 4. Separação em `api` / `hooks` / lógica fora de componentes

```
src/api/        → template PATH_* + PathParams + Response + builder puro (buildRaceFile). Sem fetch, sem React.
src/hooks/      → lifecycle genérico reutilizável (useFetch, usePolling, useSvgMap) + hook fino por endpoint.
src/helpers/ + src/lib/ → funções puras, sem import de React. Parse, formatação, domínio.
src/components/ → apresentacionais compartilhados (Avatar, ErrorBoundary).
src/pages/<rota>/ → feature isolada: page.tsx orquestra; components/ apresenta; hooks/ orquestra dados/UI.
```

- `src/api/`: só declara. Ex.: `PATH_RACE_FIND_BY_ID = '.../{ciclo}/{ele}/dados/{scope}/{file}.jws'`. Re-export em `index.ts`. Nunca importar `helpers` ou `hooks` aqui.
- `src/hooks/`: compõe `mountURL(PATH_*, { pathParams })` + `useFetch<T>(url, STABLE, parse)`.
  - `options` e `parse` entram nas deps do `useFetch` → **têm que ser estáveis** (const de módulo como `NO_STORE`, `FORCE_CACHE`, `decodeJwsText`, ou `useCallback`). Literal inline causa refetch infinito.
  - Shape fixo `{ data, error, loading, refetch }`. Fail-Safe: resolve `{ data: null, error }`, nunca dá `throw`. `useFetch` descarta resposta fora de ordem por `idRef`; `usePolling` tem guarda `busy` + `enabled` e engole erro do tick.
  - Parse continua no hook (`parseRace(RACE_PRES, br.data)` dentro de `useMemo`), não no componente.
- `src/helpers/` + `src/lib/`: puro e sem lifecycle (comentário `// Puro` no que é puro). Ex.: `decodeJwsPayload`, `mountURL` (troca global + `encodeURIComponent`, lança se sobrar `{placeholder}`), `parseRace`, `calcQuociente`, `fmtInt/fmtPct`, `fuzzyFilter`, `hasRealCount`, `finalistColor`. `HttpError` mora em `helpers/http-error.ts`.
- `src/pages/<rota>/`: `page.tsx` só orquestra (chama hooks, `useMemo`/`useCallback`, rende `components/`). `components/` recebe dado pronto. `hooks/` da página (`useSecondTurnTop`, `useRacesPolling`, `useUFsSweep`, `useFirstTurnUI`, `useMgGeo`) orquestra — hook de UI (`useFirstTurnUI`) **não busca rede**. Nunca importar de outra página (`first-turn` não importa de `second-turn`).
- Fluxo único: `api` (template) → `helpers` (`mountURL`, `jws`) → `hooks` (`useFetch`/`usePolling`) → `lib/helpers` (parse) → `page` (memo) → `components` (props).

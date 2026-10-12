import { defineConfig, presetAttributify, presetUno } from 'unocss'

// UnoCSS config — segue o exemplo oficial vite-react:
// presetUno (utilitários Wind) + presetAttributify, sem presetIcons.
// Paleta do dashboard (era :root em src/index.css) + TODAS as classes de
// componente portadas 1:1 como shortcuts (forma string).
// Todas as classes de componente portadas 1:1 (forma string).
// O `safelist` deriva das chaves: cada token é a API pública de estilo
// (o JSX do flip futuro usa os combinados) e isso imuniza contra
// peculiaridades do extrator — ex.: `pin-btn${...}` no template literal
// é extraído como `pin-btn$`, nunca como `pin-btn`.
const shortcuts: Record<string, string> = {
    // ---- topbar ----
    'topbar': 'bg-black text-accent py-[6px] px-3 flex items-center gap-2 h-11 flex-none border-b-2 border-accent',
    'sub': 'text-[11px] text-[#e7e5e4] whitespace-nowrap overflow-hidden text-ellipsis',
    'spacer': 'flex-1',
    'badge': 'text-[11px] bg-black text-accent border border-accentdim px-2 py-[2px] rounded-[20px] whitespace-nowrap',
    'btn': 'bg-accent text-black border-0 rounded-md px-[9px] py-[5px] text-[11px] font-extrabold cursor-pointer whitespace-nowrap disabled:opacity-60 disabled:cursor-default',
    'select': 'bg-black text-accent border border-accentdim rounded-md px-[6px] py-1 text-[11px] font-semibold cursor-pointer whitespace-nowrap',

    // ---- modificadores standalone (o JSX atual usa `btn ghost small`, `summary ok` etc.;
    // definidos DEPOIS das bases para que vençam no cascade) ----
    'ghost': 'bg-transparent text-accent border border-accentdim font-semibold',
    'small': 'px-2 py-1 text-[11px]',
    'ok': 'border-accent',
    'bad': 'border-line',
    'clickable': 'cursor-pointer hover:border-accentdim',
    'selected': 'border-accent bg-[#1c1a05]',
    'on': 'text-accent',
    'scroll': 'overflow-y-auto min-h-0 pr-[2px]',

    // ---- layout principal ----
    'page': 'h-screen flex flex-col bg-bg max-[900px]:h-auto max-[900px]:min-h-screen',
    'wrap': 'flex-1 min-h-0 max-w-[1920px] w-full mx-auto pt-2 px-[10px] pb-[6px] flex flex-col',
    'grid-races': 'flex-1 min-h-0 flex gap-2 overflow-x-auto overflow-y-hidden pb-1',
    'column': 'bg-card border border-line border-t-[3px] border-t-accent rounded-lg p-2 w-[350px] flex-[0_0_350px] min-h-0 flex flex-col overflow-hidden max-[1200px]:basis-[320px] max-[1200px]:w-[320px]',
    'col-title': 'text-xs font-extrabold uppercase tracking-[0.5px] text-accent mb-[6px] whitespace-nowrap',
    'sub-race': 'flex flex-col min-h-0',
    'race-head': 'flex items-baseline gap-[6px]',
    'meta': 'text-[10px] text-muted ml-auto whitespace-nowrap',
    'summary': 'text-[10px] leading-[1.4] text-[#e7e5e4] bg-card2 border border-line rounded-md px-[6px] py-[3px] mt-1 mb-[6px] whitespace-normal break-words',

    // ---- cards de candidato ----
    'cards': 'flex flex-col gap-1',
    'cand': 'border border-line rounded-[7px] px-[6px] py-1 bg-card2 flex flex-row items-center gap-[6px]',
    'cand-mid': 'flex-1 min-w-0',
    'cand-name': 'font-extrabold text-[10px] leading-[1.2] uppercase text-white whitespace-nowrap overflow-hidden text-ellipsis',
    'pos': 'text-accent font-extrabold mr-[2px]',
    'dot': 'inline-block w-[7px] h-[7px] rounded-full mr-1',
    'cand-party': 'text-[9px] text-muted whitespace-nowrap overflow-hidden text-ellipsis',
    'cand-pct': 'ml-auto text-right flex-none',
    'search': 'bg-black text-ink border border-line rounded-md px-2 py-1 text-[11px] w-full mb-[6px] flex-none placeholder:text-muted focus:outline-none focus:border-accent',
    'avatar': 'w-[26px] h-[26px] rounded-full object-cover bg-black flex-none border-[1.5px] border-accent',
    'avatar-fallback': 'w-[26px] h-[26px] rounded-full flex items-center justify-center bg-black text-accent border-[1.5px] border-accent font-extrabold text-[10px] flex-none',

    // ---- gráficos / estados ----
    'chart-box': 'flex-1 min-h-[150px] relative mt-[6px]',
    'chart-title': 'text-[10px] text-muted mt-[6px]',
    'hint': 'text-[10px] text-muted',
    'err': 'bg-[#1c0505] border border-[#7f1d1d] text-[#fca5a5] px-[6px] py-1 rounded-md text-[11px] my-1',
    'footer': 'flex-none pt-1 text-[10px] text-muted whitespace-nowrap overflow-hidden text-ellipsis',
    'ce-detail': 'border border-accent rounded-md bg-[#1c1a05] text-[#e7e5e4] text-[10px] leading-[1.45] px-[6px] py-1 whitespace-normal break-words',

    // ---- partidos ----
    'party': 'border border-line rounded-[7px] px-[6px] py-[5px] bg-card2 flex flex-col gap-[2px]',
    'party-name': 'font-extrabold text-[11px] text-accent uppercase whitespace-nowrap overflow-hidden text-ellipsis',
    'party-row': 'text-[10px] text-[#e7e5e4] leading-[1.45]',
    'party-top': 'text-muted',
    'pin-btn': 'bg-transparent border-0 text-muted cursor-pointer text-[13px] px-[2px] py-0 flex-none leading-none hover:text-accent',

    // ---- 2º turno ----
    'st-grid': 'flex-1 min-h-0 flex gap-2 max-[900px]:flex-col max-[900px]:overflow-visible',
    'st-card': 'bg-card border border-line border-t-[3px] border-t-accent rounded-lg p-2 flex-[1_1_0] min-w-0 min-h-0 flex flex-col overflow-hidden max-[900px]:min-h-[70vh]',
    'st-legend': 'flex gap-2 flex-wrap mt-[2px] mb-[6px] flex-none',
    'st-leg-item': 'flex items-center gap-[6px] bg-card2 border border-line rounded-[7px] px-2 py-1 text-[11px]',
    'st-leg-name': 'font-extrabold text-white uppercase',
    'st-leg-party': 'text-muted text-[10px]',
    'st-leg-pct': 'text-accent text-xs',
    'st-map': 'flex-1 min-h-0 flex items-center justify-center overflow-hidden',
    'st-svg': 'w-full h-full max-h-[68vh] max-[900px]:max-h-[60vh]',

    // ---- variantes COMBINADAS (regra única: sem briga de ordem no cascade;
    // utilitários de override vêm DEPOIS da base expandida).
    // Um passe futuro troca o JSX multi-classe por estes tokens únicos. ----
    'btn-ghost': 'btn bg-transparent text-accent border border-accentdim font-semibold',
    'btn-sm': 'btn px-2 py-1',
    'btn-ghost-sm': 'btn-ghost px-2 py-1',
    'summary-ok': 'summary border-accent',
    'summary-bad': 'summary border-line',
    'cand-clickable': 'cand cursor-pointer hover:border-accentdim',
    'cand-selected': 'cand border-accent bg-[#1c1a05]',
    'pin-btn-on': 'pin-btn text-accent',
    'cards-scroll': 'cards overflow-y-auto min-h-0 pr-[2px]',
}

export default defineConfig({
  presets: [
    presetUno(),
    presetAttributify(),
  ],
  theme: {
    colors: {
      bg: '#050505',
      card: '#101010',
      card2: '#161616',
      ink: '#fafafa',
      muted: '#a1a1aa',
      accent: '#facc15',
      accentdim: '#a16207',
      line: '#27272a',
    },
  },
  shortcuts,
  safelist: Object.keys(shortcuts),
})

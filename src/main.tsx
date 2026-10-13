import 'virtual:uno.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import SecondTurn from '@/pages/second-turn/page'
import FirstTurn from '@/pages/first-turn/page'
import './index.css'

// Modo declarativo do React Router (<BrowserRouter> + <Routes>/<Route>).
// basename = base do Vite (/tse-vibecoding). No gh-pages (estático, sem fallback
// SPA) o 404.html — cópia do index.html gerada pelo `postbuild` — garante que
// /tse-vibecoding/2-turno abra direto a rota do 2º turno.
const basename = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')

// Mock da apuração (`pnpm run dev:mock` → VITE_MOCK=1): intercepta os
// endpoints ele6258 com dados simulados (MSW). Import dinâmico p/ não pesar
// no bundle principal; no build de produção a flag não existe e nada muda.
async function enableMocking(): Promise<void> {
  if (import.meta.env.VITE_MOCK !== 'true') return
  const { worker } = await import('./mocks/browser.js')
  await worker.start({
    onUnhandledFrame: 'bypass',
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
  })
}

enableMocking().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <BrowserRouter basename={basename}>
        <Routes>
          <Route path="/" element={<Navigate to="/2-turno" replace />} />
          <Route path="2-turno" element={<SecondTurn />} />
          <Route path="1-turno" element={<FirstTurn />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </React.StrictMode>,
  )
})

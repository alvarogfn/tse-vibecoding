import 'virtual:uno.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import App from './App.tsx'
import SegundoTurno from './pages/SegundoTurno.tsx'
import './index.css'

// Modo declarativo do React Router (<BrowserRouter> + <Routes>/<Route>).
// basename = base do Vite (/tse-vibecoding). No gh-pages (estático, sem fallback
// SPA) o 404.html — cópia do index.html gerada pelo `postbuild` — garante que
// /tse-vibecoding/2-turno abra direto a rota do 2º turno.
const basename = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <Routes>
        <Route index element={<App />} />
        <Route path="2-turno" element={<SegundoTurno />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)

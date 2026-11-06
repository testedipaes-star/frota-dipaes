import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { SessaoProvider } from '@/lib/sessao'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessaoProvider>
      <App />
    </SessaoProvider>
  </StrictMode>,
)

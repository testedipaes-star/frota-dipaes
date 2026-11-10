import { createClient } from '@supabase/supabase-js'

/** Build de prévia (npm run build:previa): telas com dados de exemplo, sem banco. */
export const PREVIA = import.meta.env.VITE_PREVIA === '1'

const url = (import.meta.env.VITE_SUPABASE_URL as string) || 'https://previa.invalid'
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || 'previa'

export const supabase = createClient(url, key, {
  auth: { persistSession: !PREVIA, autoRefreshToken: !PREVIA },
})

export type PerfilDemo = 'motorista' | 'frota' | 'gestor'

/**
 * Modo demonstração: na prévia, o perfil escolhido no login; em desenvolvimento,
 * ?demo=motorista, ?demo=frota ou ?demo=gestor na URL. Nunca ativo no build de produção.
 */
let atual: PerfilDemo | null = null
function lerInicial(): PerfilDemo | null {
  if (typeof window === 'undefined' || PREVIA || !import.meta.env.DEV) return null
  const p = new URLSearchParams(window.location.search).get('demo')
  try {
    if (p) sessionStorage.setItem('demo', p)
    const v = p ?? sessionStorage.getItem('demo')
    return v === 'motorista' || v === 'frota' || v === 'gestor' ? v : null
  } catch {
    return p === 'motorista' || p === 'frota' || p === 'gestor' ? p : null
  }
}
atual = lerInicial()

export const demoAtivo = () => PREVIA || atual !== null
export const perfilDemo = () => atual
export function definirDemo(p: PerfilDemo | null) {
  atual = p
  try {
    if (p) sessionStorage.setItem('demo', p)
    else sessionStorage.removeItem('demo')
  } catch {
    /* prévia sem armazenamento */
  }
  window.dispatchEvent(new Event('demo-mudou'))
}

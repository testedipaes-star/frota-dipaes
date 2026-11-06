import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase, demoAtivo, perfilDemo } from './supabase'
import { meuPerfil } from './api'
import type { Usuario } from './tipos'

interface Sessao {
  carregando: boolean
  logado: boolean
  usuario: Usuario | null
  recarregar: () => Promise<void>
}

const Ctx = createContext<Sessao>({ carregando: true, logado: false, usuario: null, recarregar: async () => {} })

export function SessaoProvider({ children }: { children: ReactNode }) {
  const [carregando, setCarregando] = useState(true)
  const [logado, setLogado] = useState(false)
  const [usuario, setUsuario] = useState<Usuario | null>(null)

  const recarregar = useCallback(async () => {
    try {
      const u = await meuPerfil()
      setUsuario(u)
      if (demoAtivo()) setLogado(perfilDemo() !== null)
      else setLogado(!!(await supabase.auth.getSession()).data.session)
    } catch {
      setUsuario(null)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    recarregar()
    const aoMudarDemo = () => recarregar()
    window.addEventListener('demo-mudou', aoMudarDemo)
    if (demoAtivo()) return () => window.removeEventListener('demo-mudou', aoMudarDemo)
    const { data } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT' || evento === 'USER_UPDATED') {
        setTimeout(recarregar, 0)
      }
    })
    return () => {
      data.subscription.unsubscribe()
      window.removeEventListener('demo-mudou', aoMudarDemo)
    }
  }, [recarregar])

  return <Ctx.Provider value={{ carregando, logado, usuario, recarregar }}>{children}</Ctx.Provider>
}

export const useSessao = () => useContext(Ctx)

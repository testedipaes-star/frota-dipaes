import { BrowserRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { Loader2, LogOut } from 'lucide-react'
import { PREVIA } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { useSessao } from '@/lib/sessao'
import { sair } from '@/lib/api'
import LoginPage, { LoginShell } from '@/pages/LoginPage'
import TrocarSenhaPage from '@/pages/TrocarSenhaPage'
import AppLayout from '@/pages/AppLayout'
import InicioMotorista from '@/pages/motorista/InicioPage'
import ChecklistPage from '@/pages/motorista/ChecklistPage'
import HojePage from '@/pages/frota/HojePage'
import ChecklistDetalhePage from '@/pages/frota/ChecklistDetalhePage'
import PendenciasPage from '@/pages/frota/PendenciasPage'
import HistoricoPage from '@/pages/frota/HistoricoPage'
import VeiculosPage from '@/pages/frota/VeiculosPage'
import ItensPage from '@/pages/frota/ItensPage'
import UsuariosPage from '@/pages/frota/UsuariosPage'

function Roteador({ inicio, children }: { inicio: string; children: ReactNode }) {
  return PREVIA ? <MemoryRouter initialEntries={[inicio]}>{children}</MemoryRouter> : <BrowserRouter>{children}</BrowserRouter>
}

function FaixaPrevia() {
  if (!PREVIA) return null
  return <div className="sticky top-0 z-50 bg-info px-4 py-1.5 text-center text-xs font-medium text-white">Prévia · dados de exemplo · nada é salvo</div>
}

export default function App() {
  return (
    <>
      <FaixaPrevia />
      <Conteudo />
    </>
  )
}

function Conteudo() {
  const { carregando, logado, usuario } = useSessao()
  if (carregando)
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
      </div>
    )
  if (!logado) return <LoginPage />
  if (!usuario || usuario.situacao !== 'ativo')
    return (
      <LoginShell titulo="Acesso não liberado" apoio="Seu login existe, mas não está ligado a um cadastro ativo. Fale com a Frota.">
        <Button variant="outline" className="w-full" onClick={sair}>
          <LogOut /> Sair
        </Button>
      </LoginShell>
    )
  if (usuario.precisa_trocar_senha) return <TrocarSenhaPage />

  const painel = usuario.perfil !== 'motorista'
  const edita = usuario.perfil === 'frota' || usuario.perfil === 'admin'
  return (
    <Roteador inicio={painel ? '/hoje' : '/'}>
      <Routes>
        {painel ? (
          <Route element={<AppLayout />}>
            <Route path="/hoje" element={<HojePage />} />
            <Route path="/checklists/:id" element={<ChecklistDetalhePage />} />
            <Route path="/pendencias" element={<PendenciasPage />} />
            <Route path="/historico" element={<HistoricoPage />} />
            {edita && <Route path="/veiculos" element={<VeiculosPage />} />}
            {edita && <Route path="/itens" element={<ItensPage />} />}
            {edita && <Route path="/usuarios" element={<UsuariosPage />} />}
            {edita && <Route path="/papel/:veiculoId" element={<ChecklistPage papel />} />}
            <Route path="*" element={<Navigate to="/hoje" replace />} />
          </Route>
        ) : (
          <>
            <Route path="/" element={<InicioMotorista />} />
            <Route path="/checklist/:veiculoId" element={<ChecklistPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}
      </Routes>
    </Roteador>
  )
}

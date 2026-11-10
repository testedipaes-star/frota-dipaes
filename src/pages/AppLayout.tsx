import { NavLink, Outlet } from 'react-router-dom'
import logo from '@/assets/logo-dipaes.png'
import { ClipboardList, History, LayoutDashboard, ListChecks, LogOut, Truck, Users, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { sair } from '@/lib/api'
import { useSessao } from '@/lib/sessao'
import { PERFIL_LABEL, type Perfil } from '@/lib/tipos'
import { cn } from '@/lib/utils'

interface ItemMenu {
  para: string
  rotulo: string
  curto?: string
  icone: LucideIcon
  perfis?: Perfil[]
}

const ITENS: ItemMenu[] = [
  { para: '/hoje', rotulo: 'Hoje', icone: LayoutDashboard },
  { para: '/pendencias', rotulo: 'Pendências', icone: ClipboardList },
  { para: '/historico', rotulo: 'Histórico', icone: History },
  { para: '/veiculos', rotulo: 'Veículos', icone: Truck, perfis: ['frota', 'admin'] },
  { para: '/itens', rotulo: 'Itens do checklist', curto: 'Itens', icone: ListChecks, perfis: ['frota', 'admin'] },
  { para: '/usuarios', rotulo: 'Usuários', icone: Users, perfis: ['frota', 'admin'] },
]

export default function AppLayout() {
  const { usuario } = useSessao()
  const itens = ITENS.filter((i) => !i.perfis || (usuario && i.perfis.includes(usuario.perfil)))

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-[232px] flex-none flex-col bg-gradient-to-b from-primary to-primary-hover text-white lg:flex">
        <div className="flex h-[76px] items-center justify-center border-b border-white/15">
          <img src={logo} alt="Dipães do Brasil" className="w-[130px]" />
        </div>
        <nav className="flex flex-col gap-1.5 p-3">
          {itens.map(({ para, rotulo, icone: Icone }) => (
            <NavLink
              key={para}
              to={para}
              className={({ isActive }) => cn('flex items-center gap-3 rounded-lg px-3.5 py-2.5 font-heading text-base font-semibold transition-colors', isActive ? 'bg-white/18' : 'hover:bg-white/10')}
            >
              <Icone className="size-5" />
              {rotulo}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-white/15 p-4 text-xs">
          <div className="truncate font-semibold">{usuario?.nome}</div>
          <div className="truncate opacity-85">{usuario ? PERFIL_LABEL[usuario.perfil] : ''}</div>
          <button onClick={sair} className="mt-3 flex items-center gap-2 rounded-md px-2 py-1.5 font-medium hover:bg-white/10">
            <LogOut className="size-4" /> Sair
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-[76px] items-center justify-between border-b border-border bg-card px-4 sm:px-7">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary px-2 py-1.5 lg:hidden">
              <img src={logo} alt="Dipães do Brasil" className="w-[84px]" />
            </div>
            <span className="eyebrow hidden sm:inline">Checklist de Frota Dipães</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground md:inline">{usuario?.nome}</span>
            <Button variant="outline" size="sm" onClick={sair}>
              <LogOut /> Sair
            </Button>
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 pb-[calc(96px+env(safe-area-inset-bottom,0px))] sm:p-7 sm:pb-[calc(96px+env(safe-area-inset-bottom,0px))] lg:pb-7">
          <Outlet />
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex items-start overflow-x-auto border-t border-border bg-card lg:hidden"
        style={{ height: 'calc(64px + env(safe-area-inset-bottom, 0px))', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {itens.map(({ para, rotulo, curto, icone: Icone }) => (
          <NavLink
            key={para}
            to={para}
            className={({ isActive }) =>
              cn('flex h-16 min-w-[64px] shrink-0 grow basis-auto flex-col items-center justify-center gap-1 whitespace-nowrap px-1 font-heading text-[11.2px] font-semibold', isActive ? 'text-primary' : 'text-muted-foreground')
            }
          >
            <Icone className="size-5 flex-none" />
            {curto ?? rotulo}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

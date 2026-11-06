import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, ClipboardList, FileText, Loader2, RefreshCw, ShieldAlert, Timer, Truck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Aviso, Dialog, Input, PageHeader, StatCard, Vazio } from '@/components/ui/misc'
import { ResultadoBadge } from '@/components/status'
import { IconeTipo } from '@/pages/motorista/InicioPage'
import { lerConfig, listarVeiculos, painelDia } from '@/lib/api'
import { TIPO_LABEL, type LinhaPainel, type Veiculo } from '@/lib/tipos'
import { cn, dataBR, duracao, hojeSP, horaBR, km, placaBR } from '@/lib/utils'

export default function HojePage() {
  const [data, setData] = useState(hojeSP())
  const [linhas, setLinhas] = useState<LinhaPainel[]>([])
  const [tempoMin, setTempoMin] = useState(120)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [papel, setPapel] = useState(false)
  const [veiculos, setVeiculos] = useState<Veiculo[]>([])
  const navigate = useNavigate()

  const carregar = useCallback(async () => {
    setErro('')
    try {
      const [l, cfg] = await Promise.all([painelDia(data), lerConfig()])
      setLinhas(l)
      setTempoMin(cfg.regras.tempo_minimo_seg)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setCarregando(false)
    }
  }, [data])

  useEffect(() => {
    setCarregando(true)
    carregar()
    if (data !== hojeSP()) return
    const t = window.setInterval(carregar, 60000) // atualiza sozinho a cada minuto
    return () => window.clearInterval(t)
  }, [carregar, data])

  const bloqueados = linhas.filter((l) => l.liberacao === 'aguardando' || l.liberacao === 'mantido_bloqueado')
  const feitos = linhas.filter((l) => l.checklist_id)
  const atrasadas = linhas.reduce((s, l) => s + l.pendencias_atrasadas, 0)
  const abertas = linhas.reduce((s, l) => s + l.pendencias_abertas, 0)

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titulo="Hoje"
        apoio={`Checklists de ${dataBR(data)}. Atualiza sozinho a cada minuto.`}
        acoes={
          <>
            <Input type="date" value={data} max={hojeSP()} onChange={(e) => e.target.value && setData(e.target.value)} className="w-[150px]" />
            <Button variant="outline" onClick={carregar}>
              <RefreshCw /> Atualizar
            </Button>
            <Button variant="outline" onClick={async () => (setVeiculos(await listarVeiculos(true)), setPapel(true))}>
              <FileText /> Lançar folha de papel
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard rotulo="Veículos ativos" valor={linhas.length} legenda="cadastrados" icone={<Truck />} />
        <StatCard rotulo="Com checklist" valor={`${feitos.length}/${linhas.length}`} legenda="fizeram checklist no dia" icone={<CheckCircle2 />} tom={feitos.length === linhas.length && linhas.length ? 'success' : 'neutro'} />
        <StatCard rotulo="Aguardando Frota" valor={bloqueados.length} legenda="veículos bloqueados" icone={<ShieldAlert />} tom={bloqueados.length ? 'destructive' : 'neutro'} />
        <StatCard rotulo="Pendências" valor={abertas} legenda={`${atrasadas} atrasada${atrasadas === 1 ? '' : 's'}`} icone={<ClipboardList />} tom={atrasadas ? 'warning' : 'neutro'} />
      </div>

      {bloqueados.length > 0 && (
        <Aviso tom="destructive">
          <b>{bloqueados.length === 1 ? '1 veículo aguarda' : `${bloqueados.length} veículos aguardam`} a liberação da Frota.</b> Abra o checklist, veja as fotos e libere ou mantenha bloqueado.
        </Aviso>
      )}
      {erro && <Aviso tom="destructive">{erro}</Aviso>}

      {carregando ? (
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      ) : linhas.length === 0 ? (
        <Vazio>
          Nenhum veículo cadastrado. <Link to="/veiculos" className="font-semibold text-primary">Cadastre os veículos</Link> para começar.
        </Vazio>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {linhas.map((l) => {
            const bloq = l.liberacao === 'aguardando' || l.liberacao === 'mantido_bloqueado'
            const rapido = l.duracao_seg != null && l.duracao_seg < tempoMin
            return (
              <button
                key={l.veiculo_id}
                disabled={!l.checklist_id}
                onClick={() => navigate(`/checklists/${l.checklist_id}`)}
                className={cn(
                  'flex flex-col gap-3 rounded-xl border bg-card p-4 text-left transition-colors enabled:hover:border-primary',
                  bloq && 'border-destructive/50 bg-destructive/5',
                  !l.checklist_id && 'border-dashed',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 flex-none items-center justify-center rounded-lg bg-accent text-primary">
                      <IconeTipo tipo={l.tipo} className="size-5" />
                    </span>
                    <div>
                      <p className="font-heading text-lg font-bold leading-tight">{placaBR(l.placa)}</p>
                      <p className="text-xs text-muted-foreground">
                        {TIPO_LABEL[l.tipo]}
                        {l.modelo ? ` · ${l.modelo}` : ''}
                      </p>
                    </div>
                  </div>
                  <ResultadoBadge r={l.resultado} liberacao={l.liberacao} />
                </div>
                {l.checklist_id ? (
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <span className="text-muted-foreground">Motorista</span>
                    <span className="truncate font-medium">{l.motorista}</span>
                    <span className="text-muted-foreground">Saída · retorno</span>
                    <span className="font-medium">
                      {horaBR(l.enviado_em)} · {l.retorno_em ? horaBR(l.retorno_em) : 'na rua'}
                    </span>
                    <span className="text-muted-foreground">Itens NOK</span>
                    <span className={cn('font-medium', l.qtd_nok_critico ? 'text-destructive' : l.qtd_nok ? 'text-warning' : '')}>
                      {l.qtd_nok ?? 0}
                      {l.qtd_nok_critico ? ` (${l.qtd_nok_critico} crítico${l.qtd_nok_critico > 1 ? 's' : ''})` : ''}
                    </span>
                    <span className="text-muted-foreground">Preenchimento</span>
                    <span className={cn('flex items-center gap-1 font-medium', rapido && 'text-warning')}>
                      {rapido && <Timer className="size-3.5" />}
                      {l.origem === 'papel' ? 'folha de papel' : duracao(l.duracao_seg)}
                    </span>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Sem checklist {data === hojeSP() ? 'até agora' : 'neste dia'}. Último km {km(l.km_atual)}.</p>
                )}
                {(l.pendencias_abertas > 0 || l.checklists_no_dia > 1) && (
                  <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
                    {l.pendencias_abertas > 0 && (
                      <span className={cn('flex items-center gap-1', l.pendencias_atrasadas && 'font-semibold text-destructive')}>
                        <AlertTriangle className="size-3.5" /> {l.pendencias_abertas} pendência{l.pendencias_abertas > 1 ? 's' : ''}
                        {l.pendencias_atrasadas ? ` · ${l.pendencias_atrasadas} atrasada${l.pendencias_atrasadas > 1 ? 's' : ''}` : ''}
                      </span>
                    )}
                    {l.checklists_no_dia > 1 && <span>{l.checklists_no_dia} checklists no dia (troca de motorista)</span>}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}

      <Dialog aberto={papel} onFechar={() => setPapel(false)} titulo="Lançar folha de papel">
        <p className="mb-3 text-sm text-muted-foreground">Use quando o motorista fez o checklist no papel (celular sem bateria ou quebrado). Escolha o veículo:</p>
        <div className="flex flex-col gap-2">
          {veiculos.map((v) => (
            <Button key={v.id} variant="outline" className="h-11 justify-start" onClick={() => navigate(`/papel/${v.id}`)}>
              <IconeTipo tipo={v.tipo} /> {placaBR(v.placa)} · {TIPO_LABEL[v.tipo]}
            </Button>
          ))}
        </div>
      </Dialog>
    </div>
  )
}

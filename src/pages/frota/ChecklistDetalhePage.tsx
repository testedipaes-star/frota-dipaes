import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Camera, Loader2, ShieldAlert, ShieldCheck, Timer, Triangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Aviso, Card, Dialog, Field } from '@/components/ui/misc'
import { ResultadoBadge } from '@/components/status'
import { checklistDetalhe, lerConfig, liberarChecklist } from '@/lib/api'
import { TIPO_LABEL, type Checklist, type Foto, type RespostaGravada } from '@/lib/tipos'
import { cn, dataBR, dataHoraBR, duracao, horaBR, km, placaBR } from '@/lib/utils'

export default function ChecklistDetalhePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [c, setC] = useState<Checklist | null>(null)
  const [respostas, setRespostas] = useState<RespostaGravada[]>([])
  const [fotos, setFotos] = useState<Foto[]>([])
  const [erro, setErro] = useState('')
  const [tempoMin, setTempoMin] = useState(120)
  const [obs, setObs] = useState('')
  const [salvando, setSalvando] = useState<'' | 'liberar' | 'bloquear'>('')
  const [ampliada, setAmpliada] = useState<Foto | null>(null)
  const [soNok, setSoNok] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const [d, cfg] = await Promise.all([checklistDetalhe(id!), lerConfig()])
      setC(d.checklist)
      setRespostas(d.respostas)
      setFotos(d.fotos)
      setTempoMin(cfg.regras.tempo_minimo_seg)
    } catch (e) {
      setErro((e as Error).message)
    }
  }, [id])
  useEffect(() => {
    carregar()
  }, [carregar])

  const fotosPorItem = useMemo(() => {
    const m = new Map<string, Foto[]>()
    fotos.forEach((f) => f.item_id && m.set(f.item_id, [...(m.get(f.item_id) ?? []), f]))
    return m
  }, [fotos])

  const grupos = useMemo(() => {
    const g: { nome: string; itens: RespostaGravada[] }[] = []
    for (const r of respostas) {
      if (soNok && r.resposta !== 'nok') continue
      const ult = g.at(-1)
      if (ult && ult.nome === r.grupo) ult.itens.push(r)
      else g.push({ nome: r.grupo, itens: [r] })
    }
    return g
  }, [respostas, soNok])

  async function decidir(liberar: boolean) {
    setErro('')
    if (obs.trim().length < 3) return setErro('Escreva a observação: o que foi feito ou avaliado.')
    setSalvando(liberar ? 'liberar' : 'bloquear')
    try {
      await liberarChecklist(c!.id, liberar, obs)
      setObs('')
      await carregar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando('')
    }
  }

  if (!c)
    return erro ? <Aviso tom="destructive">{erro}</Aviso> : <Loader2 className="size-6 animate-spin text-muted-foreground" />

  const precisaDecidir = c.liberacao === 'aguardando' || c.liberacao === 'mantido_bloqueado'
  const rapido = c.duracao_seg != null && c.duracao_seg < tempoMin

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <button onClick={() => navigate(-1)} className="mb-2 flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary">
            <ArrowLeft className="size-3.5" /> Voltar
          </button>
          <h1 className="page-title">
            {placaBR(c.placa)} · {dataBR(c.data)}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {TIPO_LABEL[c.tipo]}
            {c.veiculo?.modelo ? ` · ${c.veiculo.modelo}` : ''} · {c.motorista?.nome}
            {c.origem === 'papel' ? ' · lançado da folha de papel' : ''}
          </p>
        </div>
        <ResultadoBadge r={c.resultado} liberacao={c.liberacao} />
      </div>

      {precisaDecidir && (
        <Card className="border-destructive/40 bg-destructive/5 p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 size-6 flex-none text-destructive" />
            <div className="flex-1">
              <p className="font-heading text-lg font-bold text-destructive">{c.liberacao === 'aguardando' ? 'Veículo aguardando liberação' : 'Veículo mantido bloqueado'}</p>
              <p className="text-sm">
                {c.qtd_nok_critico} item{c.qtd_nok_critico > 1 ? 's' : ''} crítico{c.qtd_nok_critico > 1 ? 's' : ''} com NOK. Veja as fotos abaixo antes de decidir.
              </p>
              {c.liberacao === 'mantido_bloqueado' && <p className="mt-1 text-sm text-muted-foreground">Última decisão: {c.obs_liberacao} ({c.liberador?.nome}, {dataHoraBR(c.liberado_em)})</p>}
              <div className="mt-3 flex flex-col gap-3">
                <Field label="Observação da Frota (obrigatória)">
                  <textarea
                    value={obs}
                    onChange={(e) => setObs(e.target.value)}
                    placeholder="Ex.: lâmpada trocada no pátio, testado OK"
                    className="min-h-[64px] w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  />
                </Field>
                {erro && <Aviso tom="destructive">{erro}</Aviso>}
                <div className="flex flex-wrap gap-2">
                  <Button variant="success" onClick={() => decidir(true)} loading={salvando === 'liberar'}>
                    {!salvando && <ShieldCheck />} Liberar saída
                  </Button>
                  {c.liberacao === 'aguardando' && (
                    <Button variant="destructive" onClick={() => decidir(false)} loading={salvando === 'bloquear'}>
                      Manter bloqueado
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}
      {c.liberacao === 'liberado' && (
        <Aviso tom="success">
          Liberado por {c.liberador?.nome} em {dataHoraBR(c.liberado_em)}: {c.obs_liberacao}
        </Aviso>
      )}

      <Card className="grid grid-cols-2 gap-x-6 gap-y-3 p-4 text-sm sm:grid-cols-4">
        <Info rotulo="Saída" valor={`${horaBR(c.enviado_em)} · ${km(c.km_saida)}`} />
        <Info rotulo="Retorno" valor={c.retorno_em ? `${horaBR(c.retorno_em)} · ${km(c.km_retorno)}` : 'na rua'} />
        <Info rotulo="Rodado" valor={c.km_retorno != null ? km(c.km_retorno - c.km_saida) : '—'} />
        <Info rotulo="Combustível na saída" valor={c.combustivel} />
        <Info rotulo={c.tipo === 'leve' ? 'Destino' : 'Rota'} valor={c.rota ?? '—'} />
        {c.tipo === 'frigorifico' && <Info rotulo="Temperatura do baú" valor={`saída ${c.temp_saida ?? '—'} °C · retorno ${c.temp_retorno ?? '—'} °C`} />}
        <Info
          rotulo="Preenchimento"
          valor={
            <span className={cn('flex items-center gap-1', rapido && 'font-semibold text-warning')}>
              {rapido && <Timer className="size-3.5" />}
              {c.origem === 'papel' ? 'folha de papel' : duracao(c.duracao_seg)}
              {rapido ? ' (rápido demais)' : ''}
            </span>
          }
        />
        <Info rotulo="Itens NOK" valor={`${c.qtd_nok} (${c.qtd_nok_critico} crítico${c.qtd_nok_critico === 1 ? '' : 's'})`} />
        {c.observacoes && (
          <div className="col-span-2 sm:col-span-4">
            <Info rotulo="Observações do motorista" valor={c.observacoes} />
          </div>
        )}
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="font-heading text-lg font-bold">Itens verificados</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={soNok} onChange={(e) => setSoNok(e.target.checked)} className="size-4 accent-[var(--primary)]" /> Só NOK
        </label>
      </div>

      {grupos.map((g) => (
        <section key={g.nome} className="flex flex-col gap-1.5">
          <h3 className="eyebrow text-primary-hover">{g.nome}</h3>
          <Card className="divide-y divide-border">
            {g.itens.map((r) => {
              const fs = fotosPorItem.get(r.item_id) ?? []
              return (
                <div key={r.item_id} className={cn('flex flex-col gap-2 p-3', r.resposta === 'nok' && 'bg-destructive/5')}>
                  <div className="flex items-start gap-3">
                    <span className="w-6 flex-none text-right font-heading font-bold text-muted-foreground">{r.numero}</span>
                    <p className="flex-1 text-sm">
                      {r.texto}
                      {r.critico && <Triangle className="ml-1.5 inline size-3 -translate-y-px fill-primary text-primary" />}
                      {r.foto_obrigatoria && <Camera className="ml-1.5 inline size-3.5 -translate-y-px text-info" />}
                    </p>
                    <span className={cn('rounded-md px-2 py-0.5 text-xs font-bold', r.resposta === 'ok' ? 'bg-success-bg text-success' : 'bg-destructive text-white')}>{r.resposta.toUpperCase()}</span>
                  </div>
                  {r.descricao && <p className="pl-9 text-sm font-medium text-destructive">{r.descricao}</p>}
                  {fs.length > 0 && (
                    <div className="flex flex-wrap gap-2 pl-9">
                      {fs.map((f) => (
                        <button key={f.id} onClick={() => setAmpliada(f)} className="size-20 overflow-hidden rounded-lg border border-border bg-muted">
                          {f.url && <img src={f.url} alt={`Foto do item ${r.numero}`} className="size-full object-cover" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </Card>
        </section>
      ))}

      <Dialog aberto={!!ampliada} onFechar={() => setAmpliada(null)} titulo="Foto" largura="max-w-3xl">
        {ampliada?.url && <img src={ampliada.url} alt="" className="w-full rounded-lg" />}
      </Dialog>
    </div>
  )
}

function Info({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <div className="font-medium">{valor}</div>
    </div>
  )
}

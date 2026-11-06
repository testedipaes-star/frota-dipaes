import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import logo from '@/assets/logo-dipaes.png'
import { AlertTriangle, ArrowLeft, ChevronRight, CloudOff, Loader2, LogOut, RefreshCw, Snowflake, Truck, Car } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Aviso, Card, Dialog, Field, Input } from '@/components/ui/misc'
import { ResultadoBadge } from '@/components/status'
import { listarVeiculos, meusChecklists, pendenciasAbertasVeiculo, registrarRetorno, sair } from '@/lib/api'
import { lerRascunhos, processarFila, type Rascunho } from '@/lib/rascunho'
import { useSessao } from '@/lib/sessao'
import { TIPO_LABEL, type Checklist, type TipoVeiculo, type Veiculo } from '@/lib/tipos'
import { dataBR, hojeSP, horaBR, km, placaBR } from '@/lib/utils'

export const IconeTipo = ({ tipo, className }: { tipo: TipoVeiculo; className?: string }) =>
  tipo === 'frigorifico' ? <Snowflake className={className} /> : tipo === 'leve' ? <Car className={className} /> : <Truck className={className} />

/** Cabeçalho simples do app do motorista (sem barra lateral). */
export function TopoMotorista({ titulo, voltar }: { titulo?: string; voltar?: () => void }) {
  const { usuario } = useSessao()
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 bg-gradient-to-r from-primary to-primary-hover px-4 text-white">
      <div className="flex min-w-0 items-center gap-3">
        {voltar ? (
          <button onClick={voltar} className="rounded-md p-1.5 hover:bg-white/15" aria-label="Voltar">
            <ArrowLeft className="size-5" />
          </button>
        ) : (
          <img src={logo} alt="Dipães do Brasil" className="w-[84px]" />
        )}
        <span className="truncate font-heading text-lg font-bold">{titulo ?? 'Checklist de Frota'}</span>
      </div>
      {!voltar && (
        <button onClick={sair} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium hover:bg-white/15">
          <LogOut className="size-4" /> {usuario?.nome.split(' ')[0]}
        </button>
      )}
    </header>
  )
}

export default function InicioMotorista() {
  const { usuario } = useSessao()
  const navigate = useNavigate()
  const [veiculos, setVeiculos] = useState<Veiculo[]>([])
  const [meus, setMeus] = useState<Checklist[]>([])
  const [rascunhos, setRascunhos] = useState<Rascunho[]>([])
  const [pendencias, setPendencias] = useState<Record<string, number>>({})
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [escolhendo, setEscolhendo] = useState(false)
  const [retorno, setRetorno] = useState<Checklist | null>(null)
  const [enviandoFila, setEnviandoFila] = useState(false)

  const carregar = useCallback(async () => {
    setErro('')
    setRascunhos(await lerRascunhos())
    try {
      const [v, m] = await Promise.all([listarVeiculos(true), meusChecklists()])
      setVeiculos(v)
      setMeus(m)
      const contagem: Record<string, number> = {}
      await Promise.all(v.map(async (x) => (contagem[x.id] = (await pendenciasAbertasVeiculo(x.id)).length)))
      setPendencias(contagem)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setCarregando(false)
    }
  }, [])

  const tentarFila = useCallback(async () => {
    setEnviandoFila(true)
    try {
      const r = await processarFila()
      if (r.enviados.length) await carregar()
      else setRascunhos(await lerRascunhos())
    } finally {
      setEnviandoFila(false)
    }
  }, [carregar])

  useEffect(() => {
    carregar().then(tentarFila)
    const online = () => tentarFila()
    window.addEventListener('online', online)
    return () => window.removeEventListener('online', online)
  }, [carregar, tentarFila])

  const hoje = hojeSP()
  const deHoje = meus.filter((c) => c.data === hoje)
  const anteriores = meus.filter((c) => c.data !== hoje).slice(0, 10)
  const fila = rascunhos.filter((r) => r.estado === 'na_fila')
  const emEdicao = rascunhos.filter((r) => r.estado === 'editando' && r.motorista_id === undefined)

  return (
    <div className="min-h-screen bg-background">
      <TopoMotorista />
      <main className="mx-auto flex max-w-xl flex-col gap-5 p-4 pb-16">
        <div>
          <p className="eyebrow">{dataBR(hoje)}</p>
          <h1 className="page-title">Olá, {usuario?.nome.split(' ')[0]}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Faça o checklist antes da primeira saída do veículo.</p>
        </div>

        {fila.length > 0 && (
          <Aviso tom="warning">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <CloudOff className="size-4 flex-none" />
                {fila.length === 1 ? '1 checklist aguardando internet para enviar.' : `${fila.length} checklists aguardando internet para enviar.`}
              </span>
              <Button size="sm" variant="outline" onClick={tentarFila} loading={enviandoFila}>
                {!enviandoFila && <RefreshCw />} Tentar
              </Button>
            </div>
          </Aviso>
        )}

        {emEdicao.map((r) => (
          <Card key={r.id} className="flex items-center justify-between gap-3 border-primary/40 bg-accent p-4">
            <div>
              <p className="font-semibold">Checklist em andamento · {placaBR(r.placa)}</p>
              <p className="text-xs text-muted-foreground">{Object.keys(r.respostas).length} itens respondidos{r.erro ? ` · ${r.erro}` : ''}</p>
            </div>
            <Button onClick={() => navigate(`/checklist/${r.veiculo_id}`)}>Continuar</Button>
          </Card>
        ))}

        <Button size="field" className="w-full" onClick={() => setEscolhendo(true)}>
          <Truck /> Novo checklist
        </Button>

        {erro && <Aviso tom="destructive">{erro}</Aviso>}

        <section className="flex flex-col gap-2.5">
          <h2 className="font-heading text-lg font-bold">Hoje</h2>
          {carregando ? (
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          ) : deHoje.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum checklist enviado hoje.</p>
          ) : (
            deHoje.map((c) => <CartaoChecklist key={c.id} c={c} onRetorno={() => setRetorno(c)} />)
          )}
        </section>

        {anteriores.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="font-heading text-lg font-bold">Últimos dias</h2>
            {anteriores.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5 text-sm">
                <span>
                  <b>{placaBR(c.placa)}</b> · {dataBR(c.data)}
                </span>
                <ResultadoBadge r={c.resultado} liberacao={c.liberacao} />
              </div>
            ))}
          </section>
        )}
      </main>

      <Dialog aberto={escolhendo} onFechar={() => setEscolhendo(false)} titulo="Qual veículo?">
        <div className="flex flex-col gap-2">
          {veiculos.map((v) => (
            <button
              key={v.id}
              onClick={() => navigate(`/checklist/${v.id}`)}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5 text-left hover:border-primary hover:bg-accent"
            >
              <span className="flex size-11 flex-none items-center justify-center rounded-lg bg-accent text-primary">
                <IconeTipo tipo={v.tipo} className="size-6" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-heading text-lg font-bold leading-tight">{placaBR(v.placa)}</span>
                <span className="block text-xs text-muted-foreground">
                  {TIPO_LABEL[v.tipo]}
                  {v.modelo ? ` · ${v.modelo}` : ''}
                </span>
                {pendencias[v.id] > 0 && (
                  <span className="mt-1 flex items-center gap-1 text-xs font-medium text-warning">
                    <AlertTriangle className="size-3.5" /> {pendencias[v.id]} pendência{pendencias[v.id] > 1 ? 's' : ''} em aberto
                  </span>
                )}
              </span>
              <ChevronRight className="size-5 text-muted-foreground" />
            </button>
          ))}
          {!veiculos.length && <p className="text-sm text-muted-foreground">Nenhum veículo cadastrado. Fale com a Frota.</p>}
        </div>
      </Dialog>

      <DialogRetorno c={retorno} onFechar={() => setRetorno(null)} onFeito={carregar} />
    </div>
  )
}

function CartaoChecklist({ c, onRetorno }: { c: Checklist; onRetorno: () => void }) {
  const bloqueado = c.liberacao === 'aguardando' || c.liberacao === 'mantido_bloqueado'
  return (
    <Card className={bloqueado ? 'border-destructive/40 bg-destructive/5 p-4' : 'p-4'}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-heading text-lg font-bold leading-tight">{placaBR(c.placa)}</p>
          <p className="text-xs text-muted-foreground">
            Saída {horaBR(c.enviado_em)} · {km(c.km_saida)}
            {c.retorno_em ? ` · Retorno ${horaBR(c.retorno_em)} · ${km(c.km_retorno)}` : ''}
          </p>
        </div>
        <ResultadoBadge r={c.resultado} liberacao={c.liberacao} />
      </div>
      {c.liberacao === 'aguardando' && <p className="mt-3 text-sm font-semibold text-destructive">Não saia com o veículo. Aguarde a liberação da Frota.</p>}
      {c.liberacao === 'mantido_bloqueado' && <p className="mt-3 text-sm font-semibold text-destructive">Veículo mantido bloqueado: {c.obs_liberacao}</p>}
      {c.liberacao === 'liberado' && <p className="mt-3 text-sm text-success">Liberado pela Frota: {c.obs_liberacao}</p>}
      {!c.retorno_em && !bloqueado && (
        <Button variant="outline" className="mt-3 w-full" onClick={onRetorno}>
          Registrar retorno
        </Button>
      )}
    </Card>
  )
}

function DialogRetorno({ c, onFechar, onFeito }: { c: Checklist | null; onFechar: () => void; onFeito: () => void }) {
  const [kmRet, setKmRet] = useState('')
  const [temp, setTemp] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  useEffect(() => {
    setKmRet('')
    setTemp('')
    setErro('')
  }, [c])
  if (!c) return null
  async function salvar() {
    setErro('')
    const n = Number(kmRet)
    if (!kmRet || Number.isNaN(n)) return setErro('Informe o km no retorno.')
    if (n < c!.km_saida) return setErro(`O km de retorno não pode ser menor que o de saída (${c!.km_saida}).`)
    setSalvando(true)
    try {
      await registrarRetorno(c!.id, n, temp ? Number(temp.replace(',', '.')) : null)
      onFechar()
      onFeito()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }
  return (
    <Dialog aberto onFechar={onFechar} titulo={`Retorno · ${placaBR(c.placa)}`}>
      <div className="flex flex-col gap-4">
        <Field label="Km no retorno" ajuda={`Saída com ${km(c.km_saida)}.`}>
          <Input inputMode="numeric" value={kmRet} onChange={(e) => setKmRet(e.target.value.replace(/\D/g, ''))} className="h-12 text-lg" />
        </Field>
        {c.tipo === 'frigorifico' && (
          <Field label="Temperatura do baú no retorno (°C)">
            <Input inputMode="decimal" value={temp} onChange={(e) => setTemp(e.target.value)} className="h-12 text-lg" />
          </Field>
        )}
        {erro && <Aviso tom="destructive">{erro}</Aviso>}
        <Button size="lg" onClick={salvar} loading={salvando}>
          Registrar retorno
        </Button>
      </div>
    </Dialog>
  )
}

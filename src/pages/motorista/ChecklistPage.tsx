import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, Camera, CheckCircle2, CloudOff, Loader2, ShieldAlert, ShieldCheck, Triangle, X, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Aviso, Card, Dialog, Field, Input, Select } from '@/components/ui/misc'
import { listarItens, listarUsuarios, listarVeiculos, pendenciasAbertasVeiculo, situacaoChecklist, SemRede } from '@/lib/api'
import { comprimirFoto } from '@/lib/fotos'
import { apagarRascunho, enviarRascunho, lerRascunhos, salvarRascunho, type Rascunho } from '@/lib/rascunho'
import { COMBUSTIVEIS, TIPO_LABEL, type Item, type Liberacao, type Pendencia, type RetornoEnvio, type Usuario, type Veiculo } from '@/lib/tipos'
import { cn, diaMes, hojeSP, km, placaBR, somarDias, uuid } from '@/lib/utils'
import { IconeTipo, TopoMotorista } from './InicioPage'

const MAX_FOTOS = 4

type Etapa = 'preencher' | 'enviando' | 'resultado' | 'fila'

export default function ChecklistPage({ papel = false }: { papel?: boolean }) {
  const { veiculoId } = useParams()
  const navigate = useNavigate()
  const voltar = () => navigate(papel ? '/hoje' : '/')
  const [veiculo, setVeiculo] = useState<Veiculo | null>(null)
  const [itens, setItens] = useState<Item[]>([])
  const [pendencias, setPendencias] = useState<Pendencia[]>([])
  const [motoristas, setMotoristas] = useState<Usuario[]>([])
  const [r, setR] = useState<Rascunho | null>(null)
  const [erro, setErro] = useState('')
  const [etapa, setEtapa] = useState<Etapa>('preencher')
  const [progresso, setProgresso] = useState({ feitas: 0, total: 0 })
  const [resultado, setResultado] = useState<RetornoEnvio | null>(null)
  const [faltas, setFaltas] = useState<{ id: string; texto: string }[] | null>(null)
  const [confirmar, setConfirmar] = useState(false)
  const [confirmarKm, setConfirmarKm] = useState('')
  const [verPendencias, setVerPendencias] = useState(true)
  const salvarTimer = useRef<number>()

  // Carrega veículo, itens, pendências e o rascunho (continua de onde parou)
  useEffect(() => {
    ;(async () => {
      try {
        const vs = await listarVeiculos(true)
        const v = vs.find((x) => x.id === veiculoId)
        if (!v) throw new Error('Veículo não encontrado ou inativo.')
        const [its, pds] = await Promise.all([listarItens(v.tipo), pendenciasAbertasVeiculo(v.id)])
        const ativos = its.filter((i) => i.ativo).sort((a, b) => a.numero - b.numero)
        setVeiculo(v)
        setItens(ativos)
        setPendencias(pds)
        if (papel) setMotoristas((await listarUsuarios()).filter((u) => u.situacao === 'ativo'))
        const existente = (await lerRascunhos()).find((x) => x.veiculo_id === v.id && x.estado === 'editando' && (x.motorista_id !== undefined) === papel)
        const novo: Rascunho = existente ?? {
          id: uuid(), veiculo_id: v.id, placa: v.placa, tipo: v.tipo, iniciado_em: new Date().toISOString(), atualizado_em: new Date().toISOString(),
          km_saida: '', combustivel: '', rota: '', temp_saida: '', observacoes: '', respostas: {}, fotos: {}, numeros: {}, estado: 'editando',
          ...(papel ? { motorista_id: '', data: hojeSP() } : {}),
        }
        // descarta respostas de itens que não existem mais (lista de itens alterada no meio)
        novo.respostas = Object.fromEntries(Object.entries(novo.respostas).filter(([id]) => ativos.some((i) => i.id === id)))
        novo.numeros = Object.fromEntries(ativos.map((i) => [i.id, i.numero]))
        setR(novo)
        if (existente?.erro) setErro(existente.erro)
      } catch (e) {
        setErro((e as Error).message)
      }
    })()
  }, [veiculoId, papel])

  const atualizar = useCallback((fn: (x: Rascunho) => void) => {
    setR((atual) => {
      if (!atual) return atual
      const novo: Rascunho = { ...atual, respostas: { ...atual.respostas }, fotos: { ...atual.fotos } }
      fn(novo)
      window.clearTimeout(salvarTimer.current)
      salvarTimer.current = window.setTimeout(() => salvarRascunho(novo), 300)
      return novo
    })
  }, [])

  const grupos = useMemo(() => {
    const g: { nome: string; itens: Item[] }[] = []
    for (const i of itens) {
      const ult = g.at(-1)
      if (ult && ult.nome === i.grupo) ult.itens.push(i)
      else g.push({ nome: i.grupo, itens: [i] })
    }
    return g
  }, [itens])

  const pendPorItem = useMemo(() => new Map(pendencias.filter((p) => p.item_id).map((p) => [p.item_id!, p])), [pendencias])

  if (!r || !veiculo) {
    return (
      <div className="min-h-screen bg-background">
        {!papel && <TopoMotorista titulo="Checklist" voltar={voltar} />}
        <div className="mx-auto max-w-xl p-4">{erro ? <Aviso tom="destructive">{erro}</Aviso> : <Loader2 className="size-6 animate-spin text-muted-foreground" />}</div>
      </div>
    )
  }

  const respondidos = itens.filter((i) => r.respostas[i.id]).length
  const precisaFoto = (i: Item) => !papel && (i.foto_obrigatoria || r.respostas[i.id]?.resposta === 'nok')
  const comFoto = itens.filter((i) => precisaFoto(i) && (r.fotos[i.id]?.length ?? 0) > 0).length
  const totalFoto = itens.filter(precisaFoto).length
  const nokCritico = itens.some((i) => i.critico && r.respostas[i.id]?.resposta === 'nok')
  const nok = itens.some((i) => r.respostas[i.id]?.resposta === 'nok')

  function verificar(): { id: string; texto: string }[] {
    const f: { id: string; texto: string }[] = []
    if (papel && !r!.motorista_id) f.push({ id: 'cabecalho', texto: 'Escolha o motorista da folha.' })
    if (!r!.km_saida) f.push({ id: 'cabecalho', texto: 'Informe o km na saída.' })
    else if (veiculo!.km_atual != null && Number(r!.km_saida) < veiculo!.km_atual && (!papel || r!.data === hojeSP()))
      f.push({ id: 'cabecalho', texto: `O km de saída é menor que o último registrado (${km(veiculo!.km_atual)}).` })
    if (!r!.combustivel) f.push({ id: 'cabecalho', texto: 'Marque o combustível na saída.' })
    if (veiculo!.tipo === 'frigorifico' && !r!.temp_saida.trim()) f.push({ id: 'cabecalho', texto: 'Informe a temperatura do baú na saída.' })
    for (const i of itens) {
      const resp = r!.respostas[i.id]
      if (!resp) f.push({ id: `item-${i.id}`, texto: `Item ${i.numero}: marque OK ou NOK.` })
      else if (resp.resposta === 'nok' && (resp.descricao ?? '').trim().length < 3) f.push({ id: `item-${i.id}`, texto: `Item ${i.numero}: descreva o problema.` })
      if (precisaFoto(i) && !(r!.fotos[i.id]?.length ?? 0)) f.push({ id: `item-${i.id}`, texto: `Item ${i.numero}: tire a foto.` })
    }
    return f
  }

  function revisar() {
    const f = verificar()
    if (f.length) setFaltas(f)
    else setConfirmar(true)
  }

  async function enviar(rascunho: Rascunho) {
    setConfirmar(false)
    setConfirmarKm('')
    setEtapa('enviando')
    setErro('')
    try {
      const ret = await enviarRascunho(rascunho, (feitas, total) => setProgresso({ feitas, total }))
      setResultado(ret)
      setEtapa('resultado')
    } catch (e) {
      if (e instanceof SemRede || (e as { semRede?: boolean }).semRede) return setEtapa('fila')
      const msg = (e as Error).message
      setEtapa('preencher')
      if (msg.startsWith('KM_CONFIRMAR')) setConfirmarKm(msg.replace(/^KM_CONFIRMAR:\s*/, ''))
      else setErro(msg)
    }
  }

  if (etapa === 'enviando')
    return (
      <Tela papel={papel} voltar={voltar}>
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <Loader2 className="size-10 animate-spin text-primary" />
          <p className="font-heading text-xl font-bold">Enviando checklist…</p>
          {progresso.total > 0 && (
            <p className="text-sm text-muted-foreground">
              Fotos {progresso.feitas} de {progresso.total}
            </p>
          )}
          <p className="text-xs text-muted-foreground">Não feche o app. Se a internet cair, ele fica guardado no celular.</p>
        </Card>
      </Tela>
    )

  if (etapa === 'fila')
    return (
      <Tela papel={papel} voltar={voltar}>
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <CloudOff className="size-10 text-warning" />
          <p className="font-heading text-xl font-bold">Sem internet agora</p>
          <p className="text-sm text-muted-foreground">O checklist ficou salvo no celular, com as fotos, e será enviado sozinho quando a internet voltar.</p>
          {nokCritico && <Aviso tom="destructive">Há item crítico NOK: não saia com o veículo. Avise a Frota por telefone.</Aviso>}
          <Button className="mt-2 w-full" onClick={voltar}>
            Voltar ao início
          </Button>
        </Card>
      </Tela>
    )

  if (etapa === 'resultado' && resultado) return <TelaResultado papel={papel} voltar={voltar} ret={resultado} placa={veiculo.placa} />

  return (
    <div className={cn('min-h-screen bg-background', !papel && 'pb-28')}>
      {!papel && <TopoMotorista titulo={placaBR(veiculo.placa)} voltar={voltar} />}
      <main className={cn('mx-auto flex max-w-xl flex-col gap-4', papel ? 'pb-28' : 'p-4')}>
        {papel && (
          <div>
            <p className="eyebrow">Contingência</p>
            <h1 className="page-title">Lançar folha de papel · {placaBR(veiculo.placa)}</h1>
            <p className="mt-1 text-xs text-muted-foreground">Copie a folha preenchida pelo motorista. Fotos não são exigidas.</p>
          </div>
        )}

        <Card className="flex items-center gap-3 p-4">
          <span className="flex size-12 flex-none items-center justify-center rounded-lg bg-accent text-primary">
            <IconeTipo tipo={veiculo.tipo} className="size-6" />
          </span>
          <div className="min-w-0">
            <p className="font-heading text-xl font-bold leading-tight">{placaBR(veiculo.placa)}</p>
            <p className="text-xs text-muted-foreground">
              {TIPO_LABEL[veiculo.tipo]}
              {veiculo.modelo ? ` · ${veiculo.modelo}` : ''} · último km {km(veiculo.km_atual)}
            </p>
          </div>
        </Card>

        {pendencias.length > 0 && (
          <Card className="border-warning-border bg-warning-bg p-4">
            <button className="flex w-full items-center justify-between gap-2 text-left text-sm font-semibold text-warning" onClick={() => setVerPendencias((x) => !x)}>
              <span className="flex items-center gap-2">
                <AlertTriangle className="size-4" /> {pendencias.length} pendência{pendencias.length > 1 ? 's' : ''} já registrada{pendencias.length > 1 ? 's' : ''} neste veículo
              </span>
              <span className="text-xs font-medium">{verPendencias ? 'ocultar' : 'ver'}</span>
            </button>
            {verPendencias && (
              <ul className="mt-2 flex flex-col gap-1.5 text-sm">
                {pendencias.map((p) => (
                  <li key={p.id} className="text-foreground">
                    {p.numero_item ? <b>{p.numero_item}. </b> : null}
                    {p.problema ?? p.oque} <span className="text-xs text-muted-foreground">desde {diaMes(p.inicio)}</span>
                  </li>
                ))}
                <li className="text-xs text-muted-foreground">Se o problema continua, marque NOK de novo. Se foi resolvido, marque OK.</li>
              </ul>
            )}
          </Card>
        )}

        <Card id="cabecalho" className="flex flex-col gap-4 p-4">
          <h2 className="font-heading text-lg font-bold">Saída</h2>
          {papel && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Motorista da folha">
                <Select value={r.motorista_id ?? ''} onChange={(e) => atualizar((x) => (x.motorista_id = e.target.value))}>
                  <option value="">Escolha…</option>
                  {motoristas.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Data da folha">
                <Input type="date" value={r.data ?? ''} max={hojeSP()} min={somarDias(hojeSP(), -31)} onChange={(e) => atualizar((x) => (x.data = e.target.value))} />
              </Field>
            </div>
          )}
          <Field label="Km na saída" ajuda={veiculo.km_atual != null ? `Último registrado: ${km(veiculo.km_atual)}` : undefined}>
            <Input inputMode="numeric" className="h-12 text-lg" value={r.km_saida} onChange={(e) => atualizar((x) => ((x.km_saida = e.target.value.replace(/\D/g, '')), (x.km_confirmado = false)))} />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Combustível na saída</span>
            <div className="grid grid-cols-5 gap-1.5">
              {COMBUSTIVEIS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => atualizar((x) => (x.combustivel = c))}
                  className={cn('h-11 rounded-lg border text-sm font-semibold', r.combustivel === c ? 'border-primary bg-primary text-white' : 'border-border bg-card')}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <Field label={veiculo.tipo === 'leve' ? 'Destino / finalidade' : 'Rota / destino do dia'}>
            <Input value={r.rota} onChange={(e) => atualizar((x) => (x.rota = e.target.value))} />
          </Field>
          {veiculo.tipo === 'frigorifico' && (
            <Field label="Temperatura do baú na saída (°C)" ajuda="Só carregar com o baú na temperatura programada.">
              <Input inputMode="decimal" className="h-12 text-lg" value={r.temp_saida} onChange={(e) => atualizar((x) => (x.temp_saida = e.target.value.replace(/[^0-9,.-]/g, '')))} />
            </Field>
          )}
        </Card>

        <p className="flex items-start gap-2 px-1 text-xs text-muted-foreground">
          <Triangle className="mt-0.5 size-3.5 flex-none fill-primary text-primary" />
          Item crítico: se der NOK, o veículo não sai até a Frota liberar. Os demais NOK: o veículo sai e a Frota é avisada.
        </p>

        {grupos.map((g) => (
          <section key={g.nome} className="flex flex-col gap-2">
            <h2 className="flex items-baseline justify-between px-1 font-heading text-base font-bold uppercase tracking-wide text-primary-hover">
              {g.nome}
              <span className="font-sans text-xs font-medium normal-case tracking-normal text-muted-foreground">
                {g.itens.filter((i) => r.respostas[i.id]).length}/{g.itens.length}
              </span>
            </h2>
            {g.itens.map((i) => (
              <LinhaItem key={i.id} item={i} r={r} papel={papel} pendencia={pendPorItem.get(i.id)} atualizar={atualizar} />
            ))}
          </section>
        ))}

        <Card className="p-4">
          <Field label="Observações (opcional)">
            <textarea
              className="min-h-[72px] w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              value={r.observacoes}
              onChange={(e) => atualizar((x) => (x.observacoes = e.target.value))}
            />
          </Field>
        </Card>
        {erro && <Aviso tom="destructive">{erro}</Aviso>}
      </main>

      <div className={cn('fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card px-4 py-3', papel && 'lg:left-[232px]', papel && 'bottom-[calc(64px+env(safe-area-inset-bottom,0px))] lg:bottom-0')} style={papel ? undefined : { paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}>
        <div className="mx-auto flex max-w-xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(respondidos / Math.max(1, itens.length)) * 100}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {respondidos} de {itens.length} itens{totalFoto ? ` · ${comFoto} de ${totalFoto} fotos` : ''}
            </p>
          </div>
          <Button size="lg" onClick={revisar}>
            Revisar e enviar
          </Button>
        </div>
      </div>

      <Dialog aberto={!!faltas} onFechar={() => setFaltas(null)} titulo="Falta completar">
        <ul className="flex flex-col gap-1">
          {(faltas ?? []).slice(0, 12).map((f, k) => (
            <li key={k}>
              <button
                className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                onClick={() => {
                  setFaltas(null)
                  setTimeout(() => document.getElementById(f.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
                }}
              >
                {f.texto}
              </button>
            </li>
          ))}
          {(faltas?.length ?? 0) > 12 && <li className="px-2 text-xs text-muted-foreground">e mais {faltas!.length - 12}.</li>}
        </ul>
      </Dialog>

      <Dialog aberto={confirmar} onFechar={() => setConfirmar(false)} titulo="Enviar checklist">
        <div className="flex flex-col gap-4">
          {nokCritico ? (
            <Aviso tom="destructive">Há item crítico (▲) com NOK. O veículo fica <b>bloqueado</b> até a Frota liberar.</Aviso>
          ) : nok ? (
            <Aviso tom="warning">Há itens NOK. O veículo pode sair; a Frota recebe as pendências.</Aviso>
          ) : (
            <Aviso tom="success">Todos os itens OK.</Aviso>
          )}
          <p className="text-sm text-muted-foreground">Depois de enviado, o checklist não pode ser alterado.</p>
          <Button size="lg" onClick={() => enviar(r)}>
            Enviar agora
          </Button>
        </div>
      </Dialog>

      <Dialog aberto={!!confirmarKm} onFechar={() => setConfirmarKm('')} titulo="Confira o km">
        <div className="flex flex-col gap-4">
          <Aviso tom="warning">{confirmarKm}</Aviso>
          <p className="text-sm">
            Km digitado: <b>{km(Number(r.km_saida))}</b>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => (setConfirmarKm(''), document.getElementById('cabecalho')?.scrollIntoView({ behavior: 'smooth' }))}>
              Corrigir
            </Button>
            <Button
              onClick={() => {
                const novo = { ...r, km_confirmado: true }
                setR(novo)
                enviar(novo)
              }}
            >
              Está certo
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}

function Tela({ papel, voltar, children }: { papel: boolean; voltar: () => void; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      {!papel && <TopoMotorista titulo="Checklist" voltar={voltar} />}
      <main className={cn('mx-auto max-w-xl', !papel && 'p-4')}>{children}</main>
    </div>
  )
}

function LinhaItem({ item: i, r, papel, pendencia, atualizar }: { item: Item; r: Rascunho; papel: boolean; pendencia?: Pendencia; atualizar: (fn: (x: Rascunho) => void) => void }) {
  const resp = r.respostas[i.id]
  const fotos = r.fotos[i.id] ?? []
  const precisaFoto = !papel && (i.foto_obrigatoria || resp?.resposta === 'nok')
  const [lendo, setLendo] = useState(false)
  const [erroFoto, setErroFoto] = useState('')

  async function adicionarFoto(arq: File | undefined) {
    if (!arq) return
    setErroFoto('')
    setLendo(true)
    try {
      const blob = await comprimirFoto(arq)
      atualizar((x) => (x.fotos[i.id] = [...(x.fotos[i.id] ?? []), { id: uuid(), blob }]))
    } catch (e) {
      setErroFoto((e as Error).message)
    } finally {
      setLendo(false)
    }
  }

  return (
    <div id={`item-${i.id}`} className={cn('scroll-mt-20 rounded-xl border bg-card p-3', resp?.resposta === 'nok' ? 'border-destructive/40' : resp ? 'border-success-border' : 'border-border')}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 w-6 flex-none text-right font-heading text-base font-bold text-muted-foreground">{i.numero}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] leading-snug">
            {i.texto}
            {i.critico && <Triangle className="ml-1.5 inline size-3.5 -translate-y-px fill-primary text-primary" aria-label="item crítico" />}
            {i.foto_obrigatoria && !papel && <Camera className="ml-1.5 inline size-4 -translate-y-px text-info" aria-label="foto obrigatória" />}
          </p>
          {pendencia && <p className="mt-1 text-xs text-warning">Pendência aberta desde {diaMes(pendencia.inicio)}: {pendencia.problema}</p>}
        </div>
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-2 pl-9">
        <button
          type="button"
          onClick={() => atualizar((x) => (x.respostas[i.id] = { resposta: 'ok' }))}
          className={cn('flex h-11 items-center justify-center gap-1.5 rounded-lg border text-sm font-bold', resp?.resposta === 'ok' ? 'border-success-solid bg-success-solid text-white' : 'border-border bg-card text-foreground')}
        >
          <CheckCircle2 className="size-4" /> OK
        </button>
        <button
          type="button"
          onClick={() => atualizar((x) => (x.respostas[i.id] = { resposta: 'nok', descricao: x.respostas[i.id]?.descricao ?? '' }))}
          className={cn('flex h-11 items-center justify-center gap-1.5 rounded-lg border text-sm font-bold', resp?.resposta === 'nok' ? 'border-destructive bg-destructive text-white' : 'border-border bg-card text-foreground')}
        >
          <XCircle className="size-4" /> NOK
        </button>
      </div>
      {resp?.resposta === 'nok' && (
        <div className="mt-2.5 pl-9">
          <textarea
            placeholder="Descreva o problema (obrigatório)"
            className="min-h-[64px] w-full rounded-lg border border-destructive/40 bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-destructive/30"
            value={resp.descricao ?? ''}
            onChange={(e) => atualizar((x) => (x.respostas[i.id] = { resposta: 'nok', descricao: e.target.value }))}
          />
        </div>
      )}
      {(precisaFoto || fotos.length > 0) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-9">
          {fotos.map((f) => (
            <Miniatura key={f.id} blob={f.blob} onRemover={f.caminho ? undefined : () => atualizar((x) => (x.fotos[i.id] = (x.fotos[i.id] ?? []).filter((y) => y.id !== f.id)))} />
          ))}
          {fotos.length < MAX_FOTOS && (
            <label className={cn('flex size-16 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed text-[11px] font-semibold', fotos.length ? 'border-border text-muted-foreground' : 'border-info bg-info-bg text-info')}>
              {lendo ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />}
              Foto
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => (adicionarFoto(e.target.files?.[0]), (e.target.value = ''))} />
            </label>
          )}
          {precisaFoto && !fotos.length && <span className="text-xs text-info">Foto obrigatória</span>}
          {erroFoto && <span className="text-xs text-destructive">{erroFoto}</span>}
        </div>
      )}
    </div>
  )
}

function Miniatura({ blob, onRemover }: { blob: Blob; onRemover?: () => void }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return (
    <span className="relative size-16 overflow-hidden rounded-lg border border-border bg-muted">
      {url && <img src={url} alt="" className="size-full object-cover" />}
      {onRemover && (
        <button type="button" onClick={onRemover} className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white" aria-label="Remover foto">
          <X className="size-3.5" />
        </button>
      )}
    </span>
  )
}

function TelaResultado({ papel, voltar, ret, placa }: { papel: boolean; voltar: () => void; ret: RetornoEnvio; placa: string }) {
  const [lib, setLib] = useState<Liberacao>(ret.liberacao)
  const [obs, setObs] = useState<string | null>(null)
  // Não liberado: consulta a cada 20 s até a Frota decidir
  useEffect(() => {
    if (papel || lib !== 'aguardando') return
    const t = window.setInterval(async () => {
      try {
        const s = await situacaoChecklist(ret.id)
        if (s && s.liberacao !== 'aguardando') {
          setLib(s.liberacao)
          setObs(s.obs_liberacao)
        }
      } catch {
        /* sem internet: tenta de novo */
      }
    }, 20000)
    return () => window.clearInterval(t)
  }, [lib, ret.id, papel])

  useEffect(() => {
    // rascunho já foi apagado no envio; garante limpeza se veio de reenvio
    apagarRascunho(ret.id)
  }, [ret.id])

  const cfg =
    lib === 'aguardando'
      ? { cor: 'border-destructive bg-destructive text-white', icone: <ShieldAlert className="size-14" />, titulo: 'NÃO SAIA', texto: 'Há item crítico com NOK. A Frota foi avisada e precisa liberar o veículo. Esta tela atualiza sozinha.' }
      : lib === 'mantido_bloqueado'
        ? { cor: 'border-destructive bg-destructive text-white', icone: <ShieldAlert className="size-14" />, titulo: 'Veículo bloqueado', texto: obs ?? 'A Frota manteve o veículo bloqueado.' }
        : lib === 'liberado'
          ? { cor: 'border-success-solid bg-success-solid text-white', icone: <ShieldCheck className="size-14" />, titulo: 'Liberado pela Frota', texto: obs ?? '' }
          : ret.resultado === 'ressalva'
            ? { cor: 'border-warning-border bg-warning-bg text-warning', icone: <AlertTriangle className="size-14" />, titulo: 'Liberado com ressalva', texto: 'O veículo pode sair. Os itens NOK viraram pendências para a Frota.' }
            : { cor: 'border-success-solid bg-success-solid text-white', icone: <ShieldCheck className="size-14" />, titulo: 'Liberado', texto: 'Todos os itens OK. Boa viagem.' }

  return (
    <Tela papel={papel} voltar={voltar}>
      <div className={cn('flex flex-col items-center gap-3 rounded-2xl border p-8 text-center', cfg.cor)}>
        {cfg.icone}
        <p className="font-heading text-3xl font-bold">{cfg.titulo}</p>
        <p className="font-heading text-lg font-semibold opacity-90">{placaBR(placa)}</p>
        {cfg.texto && <p className="text-sm opacity-95">{cfg.texto}</p>}
      </div>
      {(ret.pendencias_novas > 0 || ret.pendencias_somadas > 0) && (
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {ret.pendencias_novas > 0 && `${ret.pendencias_novas} pendência${ret.pendencias_novas > 1 ? 's' : ''} nova${ret.pendencias_novas > 1 ? 's' : ''}`}
          {ret.pendencias_novas > 0 && ret.pendencias_somadas > 0 && ' · '}
          {ret.pendencias_somadas > 0 && `${ret.pendencias_somadas} já registrada${ret.pendencias_somadas > 1 ? 's' : ''} (ocorrência somada)`}
        </p>
      )}
      {ret.reenvio && <p className="mt-2 text-center text-xs text-muted-foreground">Este checklist já tinha sido recebido antes.</p>}
      <Button size="lg" variant="outline" className="mt-5 w-full" onClick={voltar}>
        Voltar ao início
      </Button>
    </Tela>
  )
}

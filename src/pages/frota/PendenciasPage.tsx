import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, Loader2, Plus, Settings2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Aviso, Dialog, Field, Input, PageHeader, Select } from '@/components/ui/misc'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { StatusPendenciaBadge } from '@/components/status'
import {
  adicionarNota, apagarNota, criarPendencia, eventosPendencia, lerConfig, listarPendencias, listarVeiculos, salvarConfig, salvarPendencia, todasNotas,
} from '@/lib/api'
import { exportar5W2H } from '@/lib/excel'
import { useSessao } from '@/lib/sessao'
import { ABERTAS, STATUS_LABEL, type ConfigPlano, type EventoPendencia, type NotaTipo, type Pendencia, type StatusPendencia, type Veiculo } from '@/lib/tipos'
import { cn, dataBR, dataHoraBR, diaMes, diasEntre, hojeSP, placaBR, somarDias } from '@/lib/utils'

const LANES: { id: StatusPendencia; hint: string }[] = [
  { id: 'nao_iniciada', hint: 'a fazer' },
  { id: 'andamento', hint: 'fazendo' },
  { id: 'standby', hint: 'aguardando' },
  { id: 'concluida', hint: 'feito' },
  { id: 'cancelada', hint: '' },
]
const NOTA_LABEL: Record<NotaTipo, string> = { resultado: 'Resultado', problema: 'Problema', proximo: 'Próximo passo' }
const CAMPO_LABEL: Record<string, string> = { oque: 'O que', porque: 'Por que', responsavel: 'Responsável', envolvidos: 'Envolvidos', onde: 'Onde', como: 'Como', quanto: 'Quanto' }
const ARQUIVO_DIAS = 30

const atrasada = (p: Pendencia, hoje: string) => ABERTAS.includes(p.status) && p.status !== 'standby' && !!p.prazo && p.prazo < hoje
const corPostit = (p: Pendencia) => (p.critico ? 'bg-[#ff9fcf]' : p.item_id ? 'bg-[#fff06a]' : 'bg-[#8fdcf5]')

export default function PendenciasPage() {
  const hoje = hojeSP()
  const [lista, setLista] = useState<Pendencia[]>([])
  const [notas, setNotas] = useState<EventoPendencia[]>([])
  const [veiculos, setVeiculos] = useState<Veiculo[]>([])
  const [plano, setPlano] = useState<ConfigPlano | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [vista, setVista] = useState<'quadro' | 'tabela'>(() => {
    try {
      return localStorage.getItem('pend-vista') === 'tabela' ? 'tabela' : 'quadro'
    } catch {
      return 'quadro'
    }
  })
  const [placa, setPlaca] = useState('')
  const [busca, setBusca] = useState('')
  const [aberta, setAberta] = useState<Pendencia | null>(null)
  const [nova, setNova] = useState(false)
  const [ajustes, setAjustes] = useState(false)
  const [exportar, setExportar] = useState(false)
  const [mover, setMover] = useState<{ p: Pendencia; para: StatusPendencia } | null>(null)
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [sobre, setSobre] = useState<StatusPendencia | null>(null)
  const [verCanceladas, setVerCanceladas] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const [l, n, v, c] = await Promise.all([listarPendencias(), todasNotas(), listarVeiculos(), lerConfig()])
      setLista(l)
      setNotas(n)
      setVeiculos(v)
      setPlano(c.plano)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setCarregando(false)
    }
  }, [])
  useEffect(() => {
    carregar()
  }, [carregar])

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return lista.filter((p) => (!placa || p.veiculo_id === placa) && (!q || [p.oque, p.porque, p.responsavel, p.envolvidos, p.como].join(' ').toLowerCase().includes(q)))
  }, [lista, placa, busca])

  const abertas = lista.filter((p) => ABERTAS.includes(p.status))
  const nAtrasadas = abertas.filter((p) => atrasada(p, hoje)).length
  const nCriticas = abertas.filter((p) => p.critico).length
  const ultimaNota = (id: string) => notas.filter((n) => n.pendencia_id === id).at(-1)

  async function moverPara(p: Pendencia, para: StatusPendencia) {
    if (p.status === para) return
    if (para === 'concluida' || para === 'standby' || para === 'cancelada') return setMover({ p, para })
    await salvarPendencia(p.id, { status: para })
    await carregar()
  }

  function soltar(e: DragEvent, para: StatusPendencia) {
    e.preventDefault()
    setSobre(null)
    const p = lista.find((x) => x.id === arrastando)
    setArrastando(null)
    if (p) moverPara(p, para)
  }

  function mudarVista(v: 'quadro' | 'tabela') {
    setVista(v)
    try {
      localStorage.setItem('pend-vista', v)
    } catch {
      /* sem armazenamento */
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        titulo="Pendências"
        apoio={plano?.objetivo ?? 'Plano de ação 5W2H da frota'}
        acoes={
          <>
            <div className="inline-flex h-9 overflow-hidden rounded-lg border border-border">
              {(['quadro', 'tabela'] as const).map((v) => (
                <button key={v} onClick={() => mudarVista(v)} className={cn('px-3 text-sm font-semibold', vista === v ? 'bg-foreground text-background' : 'bg-card')}>
                  {v === 'quadro' ? 'Quadro' : 'Tabela 5W2H'}
                </button>
              ))}
            </div>
            <Button variant="outline" onClick={() => setAjustes(true)}>
              <Settings2 /> Ajustes
            </Button>
            <Button variant="outline" onClick={() => setExportar(true)} disabled={!lista.length}>
              <Download /> Exportar Excel 5W2H
            </Button>
            <Button onClick={() => setNova(true)}>
              <Plus /> Nova pendência
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <span>
          <b className="text-foreground">{abertas.length}</b> abertas
        </span>
        <span className={nAtrasadas ? 'text-destructive' : ''}>
          <b className={nAtrasadas ? 'text-destructive' : 'text-foreground'}>{nAtrasadas}</b> atrasadas
        </span>
        <span>
          <b className="text-foreground">{nCriticas}</b> de itens críticos
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block size-3 rounded-sm bg-[#ff9fcf]" /> crítico <i className="ml-2 inline-block size-3 rounded-sm bg-[#fff06a]" /> comum <i className="ml-2 inline-block size-3 rounded-sm bg-[#8fdcf5]" /> lançada à mão
        </span>
        <div className="ml-auto flex gap-2">
          <Select value={placa} onChange={(e) => setPlaca(e.target.value)} className="h-8 w-[140px] text-xs">
            <option value="">Todas as placas</option>
            {veiculos.map((v) => (
              <option key={v.id} value={v.id}>
                {placaBR(v.placa)}
              </option>
            ))}
          </Select>
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar…" className="h-8 w-[160px] text-xs" />
        </div>
      </div>
      {erro && <Aviso tom="destructive">{erro}</Aviso>}

      {carregando ? (
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      ) : vista === 'quadro' ? (
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 sm:-mx-7 sm:px-7">
          {LANES.map((l) => {
            const doLane = filtradas
              .filter((p) => p.status === l.id && !(l.id === 'concluida' && p.fim && diasEntre(p.fim, hoje) > ARQUIVO_DIAS))
              .sort((a, b) => (a.prazo ?? '9').localeCompare(b.prazo ?? '9') || a.ordem - b.ordem)
            const fechada = l.id === 'cancelada' && !verCanceladas
            return (
              <section
                key={l.id}
                onDragOver={(e) => (e.preventDefault(), setSobre(l.id))}
                onDragLeave={() => setSobre((s) => (s === l.id ? null : s))}
                onDrop={(e) => soltar(e, l.id)}
                className={cn(
                  'flex min-h-[420px] snap-start flex-col rounded-xl border bg-[#eceeed]',
                  fechada ? 'w-11 flex-none cursor-pointer' : 'w-[78vw] flex-none sm:w-[260px] lg:flex-1',
                  l.id === 'standby' && 'bg-[repeating-linear-gradient(135deg,rgba(29,78,216,.06)_0_10px,transparent_10px_20px)]',
                  sobre === l.id ? 'border-primary ring-1 ring-primary' : 'border-border',
                )}
                onClick={fechada ? () => setVerCanceladas(true) : undefined}
              >
                <div className={cn('flex items-baseline gap-2 border-b border-border px-3 py-2.5', fechada && 'flex-col items-center border-0 px-0')}>
                  <h2 className={cn('font-heading text-sm font-bold uppercase tracking-wide', fechada && '[writing-mode:vertical-rl] rotate-180')}>{STATUS_LABEL[l.id]}</h2>
                  <span className="text-xs text-muted-foreground">{doLane.length}</span>
                  {!fechada && l.hint && <span className="ml-auto text-[11px] text-muted-foreground">{l.hint}</span>}
                </div>
                {!fechada && (
                  <div className="flex flex-1 flex-col gap-2.5 p-2.5">
                    {doLane.map((p, k) => {
                      const atr = atrasada(p, hoje)
                      const ult = ultimaNota(p.id)
                      return (
                        <article
                          key={p.id}
                          draggable
                          onDragStart={() => setArrastando(p.id)}
                          onDragEnd={() => (setArrastando(null), setSobre(null))}
                          onClick={() => setAberta(p)}
                          style={{ transform: `rotate(${((k % 5) - 2) * 0.4}deg)` }}
                          className={cn(
                            'relative cursor-pointer select-none rounded-[2px_2px_3px_14px] p-2.5 text-[#2a2920] shadow-[0_1px_1px_rgba(20,30,30,.12),0_6px_14px_-6px_rgba(20,30,30,.35)] transition-transform hover:!rotate-0',
                            corPostit(p),
                            arrastando === p.id && 'opacity-30',
                            atr && 'outline outline-2 outline-offset-2 outline-[#b23a2c]',
                          )}
                        >
                          {atr && <span className="absolute -top-2 right-2 rotate-2 rounded bg-[#b23a2c] px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-white">ATRASADA</span>}
                          <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-black/55">
                            <span>{p.veiculo ? placaBR(p.veiculo.placa) : ''}</span>
                            <span>{p.numero_item ? `item ${p.numero_item}${p.critico ? ' ▲' : ''}` : 'manual'}</span>
                          </div>
                          <h3 className="mt-1 font-hand text-[15px] font-bold leading-tight">{p.texto_item ?? (p.veiculo ? p.oque.replace(`${p.veiculo.placa} · `, '') : p.oque)}</h3>
                          {p.problema && <p className="mt-1 line-clamp-2 text-[11.5px] leading-snug text-black/65">{p.problema}</p>}
                          {ult && p.status !== 'nao_iniciada' && <p className="mt-1.5 line-clamp-2 border-l-2 border-black/20 pl-1.5 font-hand text-[12.5px] leading-tight">{ult.texto}</p>}
                          <div className="mt-2 flex flex-wrap items-center gap-1 text-[10px]">
                            {p.status === 'concluida' ? (
                              <span className="rounded bg-black/10 px-1.5 py-px font-semibold">✓ {diaMes(p.fim)}</span>
                            ) : p.prazo ? (
                              <span className={cn('rounded px-1.5 py-px font-semibold', atr ? 'bg-[#b23a2c] text-white' : 'bg-black/10')}>
                                {atr ? `atrasada ${diasEntre(p.prazo, hoje)}d` : p.prazo === hoje ? 'vence hoje' : `até ${diaMes(p.prazo)}`}
                              </span>
                            ) : (
                              <span className="rounded border border-dashed border-black/30 px-1.5">sem prazo</span>
                            )}
                            {p.ocorrencias > 1 && <span className="rounded bg-black/10 px-1.5 py-px font-semibold">{p.ocorrencias}× apontado</span>}
                            {p.responsavel && <span className="ml-auto max-w-[45%] truncate text-black/55">{p.responsavel}</span>}
                          </div>
                        </article>
                      )
                    })}
                    {!doLane.length && <div className="rounded-lg border border-dashed border-border-strong px-2 py-6 text-center text-xs text-muted-foreground">Arraste um post-it para cá.</div>}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      ) : (
        <Table className="min-w-[1200px]">
          <THead>
            <TR>
              <TH>O que</TH>
              <TH>Por que</TH>
              <TH>Quem</TH>
              <TH>Onde</TH>
              <TH>Como</TH>
              <TH>Quanto</TH>
              <TH>Quando</TH>
              <TH>Status</TH>
              <TH>Resultados</TH>
            </TR>
          </THead>
          <TBody>
            {filtradas
              .slice()
              .sort((a, b) => ['andamento', 'standby', 'nao_iniciada', 'concluida', 'cancelada'].indexOf(a.status) - ['andamento', 'standby', 'nao_iniciada', 'concluida', 'cancelada'].indexOf(b.status) || (a.prazo ?? '9').localeCompare(b.prazo ?? '9'))
              .map((p) => (
                <TR key={p.id} className="cursor-pointer align-top" onClick={() => setAberta(p)}>
                  <TD className="min-w-[220px] border-l-[6px] font-semibold" style={{ borderLeftColor: p.critico ? '#ff9fcf' : p.item_id ? '#fff06a' : '#8fdcf5' }}>
                    {p.oque}
                  </TD>
                  <TD className="min-w-[180px] text-xs">{p.porque}</TD>
                  <TD className="text-xs">{[p.responsavel, p.envolvidos].filter(Boolean).join(' · ') || '—'}</TD>
                  <TD className="text-xs">{p.onde ?? '—'}</TD>
                  <TD className="min-w-[140px] text-xs">{p.como ?? '—'}</TD>
                  <TD className="text-xs">{p.quanto ?? '—'}</TD>
                  <TD className={cn('whitespace-nowrap text-xs', atrasada(p, hoje) && 'font-bold text-destructive')}>{p.prazo ? dataBR(p.prazo) : 'sem prazo'}</TD>
                  <TD>
                    <StatusPendenciaBadge s={p.status} atrasada={atrasada(p, hoje)} />
                  </TD>
                  <TD className="min-w-[160px] whitespace-pre-wrap text-xs">
                    {notas
                      .filter((n) => n.pendencia_id === p.id && n.nota_tipo === 'resultado')
                      .map((n) => `${diaMes(n.data)} – ${n.texto}`)
                      .join('\n') || '—'}
                  </TD>
                </TR>
              ))}
          </TBody>
        </Table>
      )}

      {aberta && <EditorPendencia p={aberta} onFechar={() => setAberta(null)} onMudou={carregar} onMover={(para) => moverPara(aberta, para)} />}
      {mover && (
        <DialogMover
          {...mover}
          onFechar={() => setMover(null)}
          onFeito={async () => {
            setMover(null)
            setAberta(null)
            await carregar()
          }}
        />
      )}
      {nova && <DialogNova veiculos={veiculos} onFechar={() => setNova(false)} onFeito={() => (setNova(false), carregar())} />}
      {ajustes && plano && <DialogAjustes plano={plano} onFechar={() => setAjustes(false)} onFeito={() => (setAjustes(false), carregar())} />}
      {exportar && plano && <DialogExportar lista={lista} notas={notas} plano={plano} onFechar={() => setExportar(false)} />}
    </div>
  )
}

function Area({ value, onChange, placeholder, linhas = 2 }: { value: string; onChange: (v: string) => void; placeholder?: string; linhas?: number }) {
  return (
    <textarea
      rows={linhas}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
    />
  )
}

function EditorPendencia({ p, onFechar, onMudou, onMover }: { p: Pendencia; onFechar: () => void; onMudou: () => Promise<void>; onMover: (s: StatusPendencia) => void }) {
  const navigate = useNavigate()
  const [f, setF] = useState({ oque: p.oque, porque: p.porque ?? '', responsavel: p.responsavel ?? '', envolvidos: p.envolvidos ?? '', onde: p.onde ?? '', como: p.como ?? '', quanto: p.quanto ?? '', prazo: p.prazo ?? '' })
  const [eventos, setEventos] = useState<EventoPendencia[]>([])
  const [notaTipo, setNotaTipo] = useState<NotaTipo>('proximo')
  const [notaTexto, setNotaTexto] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const { usuario } = useSessao()
  const hoje = hojeSP()

  const carregarEventos = useCallback(async () => setEventos(await eventosPendencia(p.id)), [p.id])
  useEffect(() => {
    carregarEventos()
  }, [carregarEventos])

  async function salvar() {
    setErro('')
    if (f.oque.trim().length < 3) return setErro('Preencha o "O que".')
    setSalvando(true)
    try {
      await salvarPendencia(p.id, {
        oque: f.oque.trim(), porque: f.porque.trim() || null, responsavel: f.responsavel.trim() || null, envolvidos: f.envolvidos.trim() || null,
        onde: f.onde.trim() || null, como: f.como.trim() || null, quanto: f.quanto.trim() || null, prazo: f.prazo || null,
      })
      await onMudou()
      onFechar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  async function registrarNota() {
    if (!notaTexto.trim()) return
    await adicionarNota(p.id, notaTipo, notaTexto.trim(), hoje)
    setNotaTexto('')
    await carregarEventos()
    await onMudou()
  }

  const descreve = (e: EventoPendencia) => {
    if (e.tipo === 'criada') return { t: 'Criada', d: e.texto }
    if (e.tipo === 'ocorrencia') return { t: 'Apontado de novo no checklist', d: e.texto }
    if (e.tipo === 'ok_marcado') return { t: 'Motorista marcou OK', d: e.texto }
    if (e.tipo === 'nota') return { t: NOTA_LABEL[e.nota_tipo!], d: e.texto }
    if (e.tipo === 'status') return { t: 'Status', d: `${STATUS_LABEL[e.de as StatusPendencia] ?? e.de} → ${STATUS_LABEL[e.para as StatusPendencia] ?? e.para}` }
    if (e.tipo === 'prazo') return { t: 'Prazo', d: `${e.de ? dataBR(e.de) : 'sem prazo'} → ${e.para ? dataBR(e.para) : 'sem prazo'}` }
    return { t: CAMPO_LABEL[e.campo ?? ''] ?? e.campo ?? 'Campo', d: `${e.de || '—'} → ${e.para || '—'}` }
  }

  const campo = (k: keyof typeof f, rotulo: string, w: string, linhas = 1) => (
    <Field label={`${rotulo}`}>
      {linhas > 1 ? <Area value={f[k]} onChange={(v) => setF({ ...f, [k]: v })} linhas={linhas} /> : <Input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder={w} />}
    </Field>
  )

  return (
    <Dialog aberto onFechar={onFechar} titulo={`${p.veiculo ? placaBR(p.veiculo.placa) + ' · ' : ''}${p.numero_item ? `item ${p.numero_item}` : 'pendência'}`} largura="max-w-3xl">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-1.5">
          {LANES.map((l) => (
            <button
              key={l.id}
              onClick={() => onMover(l.id)}
              className={cn('h-8 rounded-full border px-3 text-xs font-semibold', p.status === l.id ? 'border-primary bg-primary text-white' : 'border-border bg-card hover:border-primary')}
            >
              {STATUS_LABEL[l.id]}
            </button>
          ))}
          {p.checklist_origem && (
            <Button size="sm" variant="link" onClick={() => navigate(`/checklists/${p.checklist_origem}`)}>
              Ver checklist de origem
            </Button>
          )}
        </div>
        {p.ocorrencias > 1 && <Aviso tom="warning">Apontado {p.ocorrencias} vezes · última em {dataBR(p.ultima_ocorrencia)}</Aviso>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">{campo('oque', 'O que fazer? (ação)', '', 2)}</div>
          <div className="sm:col-span-2">{campo('porque', 'Por que? (motivo)', '', 2)}</div>
          {campo('responsavel', 'Quem? Responsável', 'Ex.: Frota, Oficina X')}
          {campo('envolvidos', 'Quem? Envolvidos', '')}
          {campo('onde', 'Onde?', 'Placa, oficina')}
          {campo('quanto', 'Quanto?', 'Ex.: R$ 120,00')}
          <div className="sm:col-span-2">{campo('como', 'Como? (providência)', 'O que será feito', 2)}</div>
          <Field label="Quando? (prazo)">
            <Input type="date" value={f.prazo} onChange={(e) => setF({ ...f, prazo: e.target.value })} />
          </Field>
          <div className="flex items-end text-xs text-muted-foreground">
            Início {dataBR(p.inicio)}
            {p.fim ? ` · concluída ${dataBR(p.fim)}` : ''}
          </div>
        </div>
        {erro && <Aviso tom="destructive">{erro}</Aviso>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onFechar}>
            Fechar
          </Button>
          <Button onClick={salvar} loading={salvando}>
            Salvar 5W2H
          </Button>
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <h3 className="eyebrow">Acompanhamento</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[150px_1fr_auto]">
            <Select value={notaTipo} onChange={(e) => setNotaTipo(e.target.value as NotaTipo)}>
              {(Object.keys(NOTA_LABEL) as NotaTipo[]).map((t) => (
                <option key={t} value={t}>
                  {NOTA_LABEL[t]}
                </option>
              ))}
            </Select>
            <Input value={notaTexto} onChange={(e) => setNotaTexto(e.target.value)} placeholder="Registrar andamento (vai para o 5W2H)" onKeyDown={(e) => e.key === 'Enter' && registrarNota()} />
            <Button variant="outline" onClick={registrarNota} disabled={!notaTexto.trim()}>
              Registrar
            </Button>
          </div>
          <ul className="flex flex-col">
            {eventos
              .slice()
              .reverse()
              .map((e) => {
                const { t, d } = descreve(e)
                return (
                  <li key={e.id} className="grid grid-cols-[92px_1fr_auto] gap-3 border-t border-dashed border-border py-2 text-sm">
                    <span className="text-[11px] text-muted-foreground">{dataHoraBR(e.quando)}</span>
                    <span className="min-w-0">
                      <b className={cn('mr-1 text-xs uppercase tracking-wide', e.nota_tipo === 'resultado' ? 'text-success' : e.nota_tipo === 'problema' ? 'text-destructive' : e.tipo === 'ok_marcado' ? 'text-info' : 'text-primary-hover')}>{t}</b>
                      <span className="break-words">{d}</span>
                      {e.autor?.nome && <span className="text-xs text-muted-foreground"> · {e.autor.nome}</span>}
                    </span>
                    {e.tipo === 'nota' && e.autor_id === usuario?.id ? (
                      <button onClick={async () => (await apagarNota(e.id), await carregarEventos(), await onMudou())} className="text-muted-foreground hover:text-destructive" aria-label="Apagar nota">
                        <Trash2 className="size-4" />
                      </button>
                    ) : (
                      <span />
                    )}
                  </li>
                )
              })}
          </ul>
        </div>
      </div>
    </Dialog>
  )
}

function DialogMover({ p, para, onFechar, onFeito }: { p: Pendencia; para: StatusPendencia; onFechar: () => void; onFeito: () => void }) {
  const cfg = {
    concluida: { titulo: 'Concluir pendência', pergunta: 'O que foi feito?', tipo: 'resultado' as NotaTipo, ph: 'Ex.: lâmpada da seta trocada e testada' },
    standby: { titulo: 'Colocar em stand-by', pergunta: 'Por que parou? O que está aguardando?', tipo: 'problema' as NotaTipo, ph: 'Ex.: aguardando peça do fornecedor' },
    cancelada: { titulo: 'Cancelar pendência', pergunta: 'Por que foi cancelada?', tipo: 'problema' as NotaTipo, ph: 'Ex.: apontamento indevido, item estava OK' },
  }[para as 'concluida' | 'standby' | 'cancelada']
  const [texto, setTexto] = useState('')
  const [quanto, setQuanto] = useState(p.quanto ?? '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  async function confirmar() {
    setErro('')
    if (texto.trim().length < 3) return setErro('Escreva o motivo: ele vai para o 5W2H.')
    setSalvando(true)
    try {
      await adicionarNota(p.id, cfg.tipo, texto.trim(), hojeSP())
      await salvarPendencia(p.id, { status: para, ...(para === 'concluida' ? { quanto: quanto.trim() || null } : {}) })
      onFeito()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }
  return (
    <Dialog aberto onFechar={onFechar} titulo={cfg.titulo}>
      <div className="flex flex-col gap-4">
        <p className="text-sm font-semibold">{p.oque}</p>
        <Field label={cfg.pergunta}>
          <Area value={texto} onChange={setTexto} placeholder={cfg.ph} linhas={3} />
        </Field>
        {para === 'concluida' && (
          <Field label="Quanto custou? (opcional)">
            <Input value={quanto} onChange={(e) => setQuanto(e.target.value)} placeholder="Ex.: R$ 35,00" />
          </Field>
        )}
        {erro && <Aviso tom="destructive">{erro}</Aviso>}
        <Button onClick={confirmar} loading={salvando}>
          Confirmar
        </Button>
      </div>
    </Dialog>
  )
}

function DialogNova({ veiculos, onFechar, onFeito }: { veiculos: Veiculo[]; onFechar: () => void; onFeito: () => void }) {
  const [veiculoId, setVeiculoId] = useState(veiculos[0]?.id ?? '')
  const [oque, setOque] = useState('')
  const [porque, setPorque] = useState('')
  const [prazo, setPrazo] = useState(somarDias(hojeSP(), 7))
  const [responsavel, setResponsavel] = useState('Frota')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  async function salvar() {
    setErro('')
    const v = veiculos.find((x) => x.id === veiculoId)
    if (!v) return setErro('Escolha o veículo.')
    if (oque.trim().length < 3) return setErro('Descreva o que precisa ser feito.')
    setSalvando(true)
    try {
      await criarPendencia({ veiculo_id: v.id, oque: `${v.placa} · ${oque.trim()}`, porque: porque.trim() || null, prazo: prazo || null, responsavel: responsavel.trim() || null, onde: `${v.placa}${v.modelo ? ' · ' + v.modelo : ''}` })
      onFeito()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }
  return (
    <Dialog aberto onFechar={onFechar} titulo="Nova pendência">
      <div className="flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">Para o que não veio do checklist: revisão, documento a vencer, conserto programado.</p>
        <Field label="Veículo">
          <Select value={veiculoId} onChange={(e) => setVeiculoId(e.target.value)}>
            {veiculos.map((v) => (
              <option key={v.id} value={v.id}>
                {placaBR(v.placa)}
                {v.modelo ? ` · ${v.modelo}` : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="O que fazer?">
          <Input value={oque} onChange={(e) => setOque(e.target.value)} placeholder="Ex.: Revisão dos 240 mil km" />
        </Field>
        <Field label="Por que?">
          <Input value={porque} onChange={(e) => setPorque(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Responsável">
            <Input value={responsavel} onChange={(e) => setResponsavel(e.target.value)} />
          </Field>
          <Field label="Prazo">
            <Input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
          </Field>
        </div>
        {erro && <Aviso tom="destructive">{erro}</Aviso>}
        <Button onClick={salvar} loading={salvando}>
          Criar
        </Button>
      </div>
    </Dialog>
  )
}

function DialogAjustes({ plano, onFechar, onFeito }: { plano: ConfigPlano; onFechar: () => void; onFeito: () => void }) {
  const [objetivo, setObjetivo] = useState(plano.objetivo)
  const [responsavel, setResponsavel] = useState(plano.responsavel)
  const [salvando, setSalvando] = useState(false)
  return (
    <Dialog aberto onFechar={onFechar} titulo="Ajustes do 5W2H">
      <div className="flex flex-col gap-4">
        <Field label="Objetivo ou título do plano">
          <Input value={objetivo} onChange={(e) => setObjetivo(e.target.value)} />
        </Field>
        <Field label="Responsável pelo plano">
          <Input value={responsavel} onChange={(e) => setResponsavel(e.target.value)} />
        </Field>
        <Button
          loading={salvando}
          onClick={async () => {
            setSalvando(true)
            await salvarConfig('plano', { ...plano, objetivo: objetivo.trim(), responsavel: responsavel.trim() })
            onFeito()
          }}
        >
          Salvar
        </Button>
      </div>
    </Dialog>
  )
}

function DialogExportar({ lista, notas, plano, onFechar }: { lista: Pendencia[]; notas: EventoPendencia[]; plano: ConfigPlano; onFechar: () => void }) {
  const [modo, setModo] = useState<'abertas' | 'periodo'>('abertas')
  const [de, setDe] = useState(somarDias(hojeSP(), -30))
  const [ate, setAte] = useState(hojeSP())
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState('')
  const selecionadas = modo === 'abertas' ? lista.filter((p) => ABERTAS.includes(p.status)) : lista.filter((p) => p.inicio <= ate && (p.fim ?? '9999') >= de)
  async function gerar() {
    setGerando(true)
    setErro('')
    try {
      const blob = await exportar5W2H(selecionadas, notas, plano, hojeSP())
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `5W2H_Frota_${hojeSP()}.xlsx`
      a.click()
      onFechar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setGerando(false)
    }
  }
  return (
    <Dialog aberto onFechar={onFechar} titulo="Exportar Excel 5W2H">
      <div className="flex flex-col gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" checked={modo === 'abertas'} onChange={() => setModo('abertas')} className="accent-[var(--primary)]" /> Só as abertas (não iniciada, em andamento, stand-by)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" checked={modo === 'periodo'} onChange={() => setModo('periodo')} className="accent-[var(--primary)]" /> Todas as que estiveram abertas no período
        </label>
        {modo === 'periodo' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="De">
              <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
            </Field>
            <Field label="Até">
              <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
            </Field>
          </div>
        )}
        <p className="text-xs text-muted-foreground">{selecionadas.length} pendências no arquivo, no layout do plano de ação do Edson.</p>
        {erro && <Aviso tom="destructive">{erro}</Aviso>}
        <Button onClick={gerar} loading={gerando} disabled={!selecionadas.length}>
          {!gerando && <Download />} Baixar Excel
        </Button>
      </div>
    </Dialog>
  )
}

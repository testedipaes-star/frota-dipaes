import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Download, Loader2, Timer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Aviso, Field, Input, PageHeader, Select, Vazio } from '@/components/ui/misc'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { ResultadoBadge } from '@/components/status'
import { historico, lerConfig, listarUsuarios, listarVeiculos } from '@/lib/api'
import type { Checklist, Resultado, Usuario, Veiculo } from '@/lib/tipos'
import { dataBR, duracao, hojeSP, horaBR, km, placaBR, somarDias } from '@/lib/utils'

export default function HistoricoPage() {
  const [de, setDe] = useState(somarDias(hojeSP(), -30))
  const [ate, setAte] = useState(hojeSP())
  const [veiculoId, setVeiculoId] = useState('')
  const [motoristaId, setMotoristaId] = useState('')
  const [resultado, setResultado] = useState<Resultado | ''>('')
  const [lista, setLista] = useState<Checklist[]>([])
  const [veiculos, setVeiculos] = useState<Veiculo[]>([])
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [tempoMin, setTempoMin] = useState(120)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    Promise.all([listarVeiculos(), listarUsuarios(), lerConfig()]).then(([v, u, c]) => {
      setVeiculos(v)
      setUsuarios(u)
      setTempoMin(c.regras.tempo_minimo_seg)
    })
  }, [])

  useEffect(() => {
    setCarregando(true)
    setErro('')
    historico({ de, ate, veiculo_id: veiculoId || undefined, motorista_id: motoristaId || undefined, resultado })
      .then(setLista)
      .catch((e) => setErro((e as Error).message))
      .finally(() => setCarregando(false))
  }, [de, ate, veiculoId, motoristaId, resultado])

  function exportarCsv() {
    const cab = ['Data', 'Placa', 'Motorista', 'Saída', 'Km saída', 'Retorno', 'Km retorno', 'Combustível', 'Rota', 'Resultado', 'Liberação', 'NOK', 'NOK críticos', 'Preenchimento (s)', 'Origem']
    const linhas = lista.map((c) => [dataBR(c.data), c.placa, c.motorista?.nome ?? '', horaBR(c.enviado_em), c.km_saida, c.retorno_em ? horaBR(c.retorno_em) : '', c.km_retorno ?? '', c.combustivel, c.rota ?? '', c.resultado, c.liberacao, c.qtd_nok, c.qtd_nok_critico, c.duracao_seg ?? '', c.origem])
    const csv = [cab, ...linhas].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `checklists_${de}_a_${ate}.csv`
    a.click()
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titulo="Histórico"
        apoio="Todos os checklists enviados. Clique numa linha para ver itens e fotos."
        acoes={
          <Button variant="outline" onClick={exportarCsv} disabled={!lista.length}>
            <Download /> Exportar CSV
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Field label="De">
          <Input type="date" value={de} onChange={(e) => e.target.value && setDe(e.target.value)} />
        </Field>
        <Field label="Até">
          <Input type="date" value={ate} onChange={(e) => e.target.value && setAte(e.target.value)} />
        </Field>
        <Field label="Veículo">
          <Select value={veiculoId} onChange={(e) => setVeiculoId(e.target.value)}>
            <option value="">Todos</option>
            {veiculos.map((v) => (
              <option key={v.id} value={v.id}>
                {placaBR(v.placa)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Motorista">
          <Select value={motoristaId} onChange={(e) => setMotoristaId(e.target.value)}>
            <option value="">Todos</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Resultado">
          <Select value={resultado} onChange={(e) => setResultado(e.target.value as Resultado | '')}>
            <option value="">Todos</option>
            <option value="liberado">Liberado</option>
            <option value="ressalva">Com ressalva</option>
            <option value="nao_liberado">Não liberado</option>
          </Select>
        </Field>
      </div>
      {erro && <Aviso tom="destructive">{erro}</Aviso>}
      {carregando ? (
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      ) : !lista.length ? (
        <Vazio>Nenhum checklist no período.</Vazio>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Data</TH>
              <TH>Placa</TH>
              <TH>Motorista</TH>
              <TH>Saída</TH>
              <TH>Retorno</TH>
              <TH>NOK</TH>
              <TH>Preenchimento</TH>
              <TH>Resultado</TH>
            </TR>
          </THead>
          <TBody>
            {lista.map((c) => (
              <TR key={c.id} className="cursor-pointer" onClick={() => navigate(`/checklists/${c.id}`)}>
                <TD className="whitespace-nowrap">{dataBR(c.data)}</TD>
                <TD className="whitespace-nowrap font-semibold">{placaBR(c.placa)}</TD>
                <TD>{c.motorista?.nome}</TD>
                <TD className="whitespace-nowrap">
                  {horaBR(c.enviado_em)} · {km(c.km_saida)}
                </TD>
                <TD className="whitespace-nowrap">{c.retorno_em ? `${horaBR(c.retorno_em)} · ${km(c.km_retorno)}` : '—'}</TD>
                <TD>
                  {c.qtd_nok}
                  {c.qtd_nok_critico ? <span className="text-destructive"> ({c.qtd_nok_critico}▲)</span> : null}
                </TD>
                <TD className="whitespace-nowrap">
                  {c.origem === 'papel' ? (
                    'papel'
                  ) : (
                    <span className={c.duracao_seg != null && c.duracao_seg < tempoMin ? 'flex items-center gap-1 font-semibold text-warning' : ''}>
                      {c.duracao_seg != null && c.duracao_seg < tempoMin && <Timer className="size-3.5" />}
                      {duracao(c.duracao_seg)}
                    </span>
                  )}
                </TD>
                <TD>
                  <ResultadoBadge r={c.resultado} liberacao={c.liberacao} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  )
}

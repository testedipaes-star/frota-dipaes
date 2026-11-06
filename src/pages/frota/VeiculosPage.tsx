import { useCallback, useEffect, useState } from 'react'
import { Loader2, Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Aviso, Badge, Dialog, Field, Input, PageHeader, Select, Vazio } from '@/components/ui/misc'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { listarVeiculos, salvarVeiculo } from '@/lib/api'
import { TIPO_LABEL, type TipoVeiculo, type Veiculo } from '@/lib/tipos'
import { km, normalizarPlaca, placaBR, placaValida } from '@/lib/utils'

type Form = { id?: string; placa: string; modelo: string; tipo: TipoVeiculo; ativo: boolean; km_atual: string; observacao: string }
const VAZIO: Form = { placa: '', modelo: '', tipo: 'bau', ativo: true, km_atual: '', observacao: '' }

export default function VeiculosPage() {
  const [lista, setLista] = useState<Veiculo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [form, setForm] = useState<Form | null>(null)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    setLista(await listarVeiculos())
    setCarregando(false)
  }, [])
  useEffect(() => {
    carregar()
  }, [carregar])

  async function salvar() {
    if (!form) return
    setErro('')
    const placa = normalizarPlaca(form.placa)
    if (!placaValida(placa)) return setErro('Placa inválida. Use o formato ABC1234 ou ABC1D23.')
    setSalvando(true)
    try {
      await salvarVeiculo({ id: form.id, placa, modelo: form.modelo.trim() || null, tipo: form.tipo, ativo: form.ativo, km_atual: form.km_atual ? Number(form.km_atual) : null, observacao: form.observacao.trim() || null })
      setForm(null)
      await carregar()
    } catch (e) {
      const m = (e as Error).message
      setErro(/duplicate|unique/i.test(m) ? 'Já existe um veículo com essa placa.' : m)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titulo="Veículos"
        apoio="Placas que aparecem para o motorista escolher. O tipo define qual checklist é usado."
        acoes={
          <Button onClick={() => (setErro(''), setForm({ ...VAZIO }))}>
            <Plus /> Novo veículo
          </Button>
        }
      />
      {carregando ? (
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      ) : !lista.length ? (
        <Vazio>Nenhum veículo cadastrado ainda.</Vazio>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Placa</TH>
              <TH>Modelo / prefixo</TH>
              <TH>Tipo</TH>
              <TH>Último km</TH>
              <TH>Situação</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {lista.map((v) => (
              <TR key={v.id}>
                <TD className="font-semibold">{placaBR(v.placa)}</TD>
                <TD>{v.modelo ?? '—'}</TD>
                <TD>{TIPO_LABEL[v.tipo]}</TD>
                <TD>{km(v.km_atual)}</TD>
                <TD>{v.ativo ? <Badge tom="success">Ativo</Badge> : <Badge>Inativo</Badge>}</TD>
                <TD className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => (setErro(''), setForm({ id: v.id, placa: v.placa, modelo: v.modelo ?? '', tipo: v.tipo, ativo: v.ativo, km_atual: v.km_atual?.toString() ?? '', observacao: v.observacao ?? '' }))}
                  >
                    <Pencil /> Editar
                  </Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <Dialog aberto={!!form} onFechar={() => setForm(null)} titulo={form?.id ? 'Editar veículo' : 'Novo veículo'}>
        {form && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Placa">
                <Input value={placaBR(form.placa)} onChange={(e) => setForm({ ...form, placa: normalizarPlaca(e.target.value) })} placeholder="ABC-1D23" autoCapitalize="characters" />
              </Field>
              <Field label="Tipo">
                <Select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoVeiculo })}>
                  {(Object.keys(TIPO_LABEL) as TipoVeiculo[]).map((t) => (
                    <option key={t} value={t}>
                      {TIPO_LABEL[t]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Modelo / prefixo">
              <Input value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} placeholder="Ex.: Accelo 815" />
            </Field>
            <Field label="Km atual" ajuda="O checklist recusa km de saída menor que este. Ajuste aqui se o hodômetro foi trocado.">
              <Input inputMode="numeric" value={form.km_atual} onChange={(e) => setForm({ ...form, km_atual: e.target.value.replace(/\D/g, '') })} />
            </Field>
            <Field label="Observação">
              <Input value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} className="size-4 accent-[var(--primary)]" /> Ativo (aparece para o motorista)
            </label>
            {erro && <Aviso tom="destructive">{erro}</Aviso>}
            <Button onClick={salvar} loading={salvando}>
              Salvar
            </Button>
          </div>
        )}
      </Dialog>
    </div>
  )
}

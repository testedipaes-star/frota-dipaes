import { useCallback, useEffect, useState } from 'react'
import { Camera, Loader2, Pencil, Plus, Triangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Aviso, Dialog, Field, Input, PageHeader } from '@/components/ui/misc'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { listarItens, salvarItem } from '@/lib/api'
import { TIPO_LABEL, type Item, type TipoVeiculo } from '@/lib/tipos'
import { cn } from '@/lib/utils'

export default function ItensPage() {
  const [tipo, setTipo] = useState<TipoVeiculo>('bau')
  const [itens, setItens] = useState<Item[]>([])
  const [carregando, setCarregando] = useState(true)
  const [form, setForm] = useState<(Partial<Item> & { tipo: TipoVeiculo; numero: number; grupo: string; texto: string }) | null>(null)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    setItens(await listarItens(tipo))
    setCarregando(false)
  }, [tipo])
  useEffect(() => {
    setCarregando(true)
    carregar()
  }, [carregar])

  async function alternar(i: Item, campo: 'critico' | 'foto_obrigatoria' | 'ativo') {
    await salvarItem({ ...i, [campo]: !i[campo] })
    await carregar()
  }

  async function salvar() {
    if (!form) return
    setErro('')
    if (form.texto.trim().length < 3 || !form.grupo.trim()) return setErro('Preencha o grupo e o texto do item.')
    setSalvando(true)
    try {
      await salvarItem({ ...form, texto: form.texto.trim(), grupo: form.grupo.trim() })
      setForm(null)
      await carregar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  const grupos = [...new Set(itens.map((i) => i.grupo))]

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titulo="Itens do checklist"
        apoio="Alterar um item vale para os próximos checklists. Os já enviados guardam o texto do dia."
        acoes={
          <Button onClick={() => (setErro(''), setForm({ tipo, numero: (itens.at(-1)?.numero ?? 0) + 1, grupo: grupos.at(-1) ?? '', texto: '', critico: false, foto_obrigatoria: false, ativo: true }))}>
            <Plus /> Novo item
          </Button>
        }
      />
      <div className="flex flex-wrap gap-2">
        {(Object.keys(TIPO_LABEL) as TipoVeiculo[]).map((t) => (
          <button key={t} onClick={() => setTipo(t)} className={cn('h-9 rounded-full border px-4 text-sm font-semibold', tipo === t ? 'border-primary bg-primary text-white' : 'border-border bg-card')}>
            {TIPO_LABEL[t]}
          </button>
        ))}
      </div>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Triangle className="size-3 fill-primary text-primary" /> Crítico: NOK bloqueia o veículo
        </span>
        <span className="flex items-center gap-1">
          <Camera className="size-3.5 text-info" /> Foto obrigatória mesmo quando OK (verificação externa)
        </span>
      </p>
      {carregando ? (
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Nº</TH>
              <TH>Grupo</TH>
              <TH>Item</TH>
              <TH className="text-center">Crítico</TH>
              <TH className="text-center">Foto</TH>
              <TH className="text-center">Ativo</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {itens.map((i) => (
              <TR key={i.id} className={i.ativo ? '' : 'opacity-50'}>
                <TD className="font-semibold">{i.numero}</TD>
                <TD className="whitespace-nowrap text-xs text-muted-foreground">{i.grupo}</TD>
                <TD className="min-w-[240px]">{i.texto}</TD>
                {(['critico', 'foto_obrigatoria', 'ativo'] as const).map((c) => (
                  <TD key={c} className="text-center">
                    <input type="checkbox" checked={i[c]} onChange={() => alternar(i, c)} className="size-4 accent-[var(--primary)]" aria-label={c} />
                  </TD>
                ))}
                <TD className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => (setErro(''), setForm({ ...i }))}>
                    <Pencil /> Editar
                  </Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <Dialog aberto={!!form} onFechar={() => setForm(null)} titulo={form?.id ? `Item ${form.numero}` : 'Novo item'}>
        {form && (
          <div className="flex flex-col gap-4">
            <Aviso tom="info">Item novo entra no fim da lista de {TIPO_LABEL[form.tipo]}. Para tirar um item, desmarque "Ativo" (o histórico fica preservado).</Aviso>
            <Field label="Grupo">
              <Input value={form.grupo} onChange={(e) => setForm({ ...form, grupo: e.target.value })} list="grupos" />
              <datalist id="grupos">
                {grupos.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </Field>
            <Field label="Texto do item">
              <Input value={form.texto} onChange={(e) => setForm({ ...form, texto: e.target.value })} />
            </Field>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={!!form.critico} onChange={(e) => setForm({ ...form, critico: e.target.checked })} className="size-4 accent-[var(--primary)]" /> Crítico
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={!!form.foto_obrigatoria} onChange={(e) => setForm({ ...form, foto_obrigatoria: e.target.checked })} className="size-4 accent-[var(--primary)]" /> Foto obrigatória
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={form.ativo ?? true} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} className="size-4 accent-[var(--primary)]" /> Ativo
              </label>
            </div>
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

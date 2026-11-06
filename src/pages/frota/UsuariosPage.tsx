import { useCallback, useEffect, useState } from 'react'
import { KeyRound, Loader2, Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Aviso, Badge, Dialog, Field, Input, PageHeader, Select } from '@/components/ui/misc'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { gerarAcesso, listarUsuarios, salvarUsuario } from '@/lib/api'
import { PERFIL_LABEL, SITUACAO_LABEL, type Perfil, type Situacao, type Usuario } from '@/lib/tipos'
import { cpfOculto, cpfValido, formatarCpf } from '@/lib/utils'

type Form = { id: string | null; nome: string; cpf: string; perfil: Perfil; situacao: Situacao; telefone: string }

export default function UsuariosPage() {
  const [lista, setLista] = useState<Usuario[]>([])
  const [carregando, setCarregando] = useState(true)
  const [form, setForm] = useState<Form | null>(null)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [acesso, setAcesso] = useState<{ nome: string; login: string; senha: string } | null>(null)
  const [gerando, setGerando] = useState('')
  const [erroLista, setErroLista] = useState('')

  const carregar = useCallback(async () => {
    setLista(await listarUsuarios())
    setCarregando(false)
  }, [])
  useEffect(() => {
    carregar()
  }, [carregar])

  async function salvar() {
    if (!form) return
    setErro('')
    if (form.nome.trim().length < 3) return setErro('Informe o nome completo.')
    if (form.cpf && !cpfValido(form.cpf)) return setErro('CPF inválido. Confira os 11 números.')
    setSalvando(true)
    try {
      await salvarUsuario(form.id, { nome: form.nome.trim(), cpf: form.cpf, perfil: form.perfil, situacao: form.situacao, telefone: form.telefone })
      setForm(null)
      await carregar()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  async function gerar(u: Usuario) {
    setErroLista('')
    setGerando(u.id)
    try {
      const r = await gerarAcesso(u.id)
      setAcesso({ nome: u.nome, ...r })
      await carregar()
    } catch (e) {
      setErroLista((e as Error).message)
    } finally {
      setGerando('')
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titulo="Usuários"
        apoio="Login é o CPF. Gere o acesso para receber uma senha provisória; no primeiro acesso a pessoa cria a própria senha."
        acoes={
          <Button onClick={() => (setErro(''), setForm({ id: null, nome: '', cpf: '', perfil: 'motorista', situacao: 'ativo', telefone: '' }))}>
            <Plus /> Novo usuário
          </Button>
        }
      />
      {erroLista && <Aviso tom="destructive">{erroLista}</Aviso>}
      {carregando ? (
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Nome</TH>
              <TH>Login</TH>
              <TH>Perfil</TH>
              <TH>Situação</TH>
              <TH>Acesso</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {lista.map((u) => (
              <TR key={u.id}>
                <TD className="font-medium">{u.nome}</TD>
                <TD className="whitespace-nowrap">{u.cpf ? cpfOculto(u.cpf) : u.login ?? <span className="text-destructive">sem CPF</span>}</TD>
                <TD>{PERFIL_LABEL[u.perfil]}</TD>
                <TD>
                  <Badge tom={u.situacao === 'ativo' ? 'success' : 'secondary'}>{SITUACAO_LABEL[u.situacao]}</Badge>
                </TD>
                <TD className="whitespace-nowrap text-xs">{!u.auth_user_id ? 'não gerado' : u.precisa_trocar_senha ? 'senha provisória' : 'ativo'}</TD>
                <TD className="whitespace-nowrap text-right">
                  <Button size="sm" variant="ghost" onClick={() => gerar(u)} loading={gerando === u.id} disabled={u.situacao === 'desligado'}>
                    {gerando !== u.id && <KeyRound />} {u.auth_user_id ? 'Nova senha' : 'Gerar acesso'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => (setErro(''), setForm({ id: u.id, nome: u.nome, cpf: u.cpf ? formatarCpf(u.cpf) : '', perfil: u.perfil, situacao: u.situacao, telefone: u.telefone ?? '' }))}
                  >
                    <Pencil /> Editar
                  </Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <Dialog aberto={!!form} onFechar={() => setForm(null)} titulo={form?.id ? 'Editar usuário' : 'Novo usuário'}>
        {form && (
          <div className="flex flex-col gap-4">
            <Field label="Nome completo">
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </Field>
            <Field label="CPF (login)">
              <Input value={form.cpf} inputMode="numeric" onChange={(e) => setForm({ ...form, cpf: formatarCpf(e.target.value) })} placeholder="000.000.000-00" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Perfil">
                <Select value={form.perfil} onChange={(e) => setForm({ ...form, perfil: e.target.value as Perfil })}>
                  {(Object.keys(PERFIL_LABEL) as Perfil[]).map((p) => (
                    <option key={p} value={p}>
                      {PERFIL_LABEL[p]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Situação">
                <Select value={form.situacao} onChange={(e) => setForm({ ...form, situacao: e.target.value as Situacao })}>
                  {(Object.keys(SITUACAO_LABEL) as Situacao[]).map((s) => (
                    <option key={s} value={s}>
                      {SITUACAO_LABEL[s]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Telefone (opcional)">
              <Input value={form.telefone} inputMode="tel" onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
            </Field>
            {erro && <Aviso tom="destructive">{erro}</Aviso>}
            <Button onClick={salvar} loading={salvando}>
              Salvar
            </Button>
          </div>
        )}
      </Dialog>

      <Dialog aberto={!!acesso} onFechar={() => setAcesso(null)} titulo="Acesso gerado">
        {acesso && (
          <div className="flex flex-col gap-4">
            <p className="text-sm">
              Passe para <b>{acesso.nome}</b>. A senha aparece só agora; no primeiro acesso o sistema pede uma senha nova.
            </p>
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-surface-subtle p-4">
              <div>
                <p className="eyebrow">Login</p>
                <p className="font-heading text-xl font-bold">{acesso.login}</p>
              </div>
              <div>
                <p className="eyebrow">Senha provisória</p>
                <p className="font-heading text-xl font-bold">{acesso.senha}</p>
              </div>
            </div>
            <Button onClick={() => setAcesso(null)}>Pronto</Button>
          </div>
        )}
      </Dialog>
    </div>
  )
}

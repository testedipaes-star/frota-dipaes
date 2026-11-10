import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Copy, KeyRound, Loader2, Pencil, Plus, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Aviso, Badge, Dialog, Field, Input, PageHeader, Select } from '@/components/ui/misc'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { gerarAcesso, listarUsuarios, salvarUsuario } from '@/lib/api'
import { useSessao } from '@/lib/sessao'
import { PERFIL_AJUDA, PERFIL_LABEL, SITUACAO_LABEL, type Perfil, type Situacao, type Usuario } from '@/lib/tipos'
import { cn, cpfOculto, cpfValido, formatarCpf, soDigitos } from '@/lib/utils'

type Form = { id: string | null; nome: string; cpf: string; perfil: Perfil; situacao: Situacao; telefone: string }
type Credencial = { id: string; nome: string; login: string; senha: string }
type LinhaLote = { nome: string; cpf: string; erro?: string; feito?: boolean }

const ORDEM_PERFIL: Perfil[] = ['motorista', 'frota', 'gestor', 'admin']
const PLURAL: Record<Perfil, string> = { motorista: 'Motoristas', frota: 'Frota', gestor: 'Gestores', admin: 'Administradores' }

/** Mensagem pronta para mandar ao funcionário pelo WhatsApp. */
function mensagem(c: Credencial) {
  const endereco = typeof window !== 'undefined' ? window.location.origin : ''
  return [
    `Olá, ${c.nome.split(' ')[0]}! Este é o seu acesso ao Checklist de Frota Dipães:`,
    endereco,
    `Login: ${c.login}`,
    `Senha provisória: ${c.senha}`,
    'No primeiro acesso o sistema pede para você criar a sua senha. No celular, abra o link e toque em "Adicionar à tela inicial" para instalar.',
  ].join('\n')
}

async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    return false
  }
}

export default function UsuariosPage() {
  const { usuario: eu } = useSessao()
  const admin = eu?.perfil === 'admin'
  const perfisPermitidos: Perfil[] = admin ? ORDEM_PERFIL : ['motorista']
  const podeMexer = (u: Usuario) => admin || u.perfil === 'motorista'

  const [lista, setLista] = useState<Usuario[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtro, setFiltro] = useState<Perfil | ''>('')
  const [busca, setBusca] = useState('')
  const [form, setForm] = useState<Form | null>(null)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [credenciais, setCredenciais] = useState<Credencial[]>([])
  const [gerando, setGerando] = useState('')
  const [erroLista, setErroLista] = useState('')
  const [lote, setLote] = useState(false)

  const carregar = useCallback(async () => {
    setLista(await listarUsuarios())
    setCarregando(false)
  }, [])
  useEffect(() => {
    carregar()
  }, [carregar])

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return lista
      .filter((u) => (!filtro || u.perfil === filtro) && (!q || u.nome.toLowerCase().includes(q) || (u.cpf ?? '').includes(soDigitos(q) || '§')))
      .sort((a, b) => ORDEM_PERFIL.indexOf(a.perfil) - ORDEM_PERFIL.indexOf(b.perfil) || a.nome.localeCompare(b.nome))
  }, [lista, filtro, busca])

  const semAcesso = lista.filter((u) => !u.auth_user_id && u.situacao === 'ativo' && u.cpf && podeMexer(u))
  const contagem = (p: Perfil) => lista.filter((u) => u.perfil === p && u.situacao === 'ativo').length

  async function salvar() {
    if (!form) return
    setErro('')
    if (form.nome.trim().length < 3) return setErro('Informe o nome completo.')
    if (form.cpf && !cpfValido(form.cpf)) return setErro('CPF inválido. Confira os 11 números.')
    if (!form.cpf && !form.id) return setErro('Informe o CPF: ele é o login da pessoa.')
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

  async function gerar(usuarios: Usuario[]) {
    setErroLista('')
    const novas: Credencial[] = []
    const falhas: string[] = []
    for (const u of usuarios) {
      setGerando(u.id)
      try {
        const r = await gerarAcesso(u.id)
        novas.push({ id: u.id, nome: u.nome, ...r })
      } catch (e) {
        falhas.push(`${u.nome}: ${(e as Error).message}`)
      }
    }
    setGerando('')
    if (falhas.length) setErroLista(falhas.join(' · '))
    if (novas.length) setCredenciais(novas)
    await carregar()
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        titulo="Usuários"
        apoio={admin ? 'Motoristas fazem o checklist, a Frota cuida da operação e os gestores acompanham. O login de todos é o CPF.' : 'Cadastre os motoristas e gere o acesso de cada um. Gestores e usuários Frota são cadastrados pelo administrador.'}
        acoes={
          <>
            {semAcesso.length > 0 && (
              <Button variant="outline" onClick={() => gerar(semAcesso)} loading={!!gerando}>
                {!gerando && <KeyRound />} Gerar {semAcesso.length} acesso{semAcesso.length > 1 ? 's' : ''} pendente{semAcesso.length > 1 ? 's' : ''}
              </Button>
            )}
            <Button variant="outline" onClick={() => setLote(true)}>
              <Users /> Cadastrar vários
            </Button>
            <Button onClick={() => (setErro(''), setForm({ id: null, nome: '', cpf: '', perfil: 'motorista', situacao: 'ativo', telefone: '' }))}>
              <Plus /> Novo usuário
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setFiltro('')} className={cn('h-9 rounded-full border px-4 text-sm font-semibold', !filtro ? 'border-primary bg-primary text-white' : 'border-border bg-card')}>
          Todos <span className="opacity-75">{lista.filter((u) => u.situacao === 'ativo').length}</span>
        </button>
        {ORDEM_PERFIL.map((p) => (
          <button key={p} onClick={() => setFiltro(p)} className={cn('h-9 rounded-full border px-4 text-sm font-semibold', filtro === p ? 'border-primary bg-primary text-white' : 'border-border bg-card')}>
            {PLURAL[p]} <span className="opacity-75">{contagem(p)}</span>
          </button>
        ))}
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome ou CPF…" className="ml-auto h-9 w-[220px]" />
      </div>

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
            {visiveis.map((u) => (
              <TR key={u.id} className={u.situacao !== 'ativo' ? 'opacity-60' : ''}>
                <TD className="font-medium">{u.nome}</TD>
                <TD className="whitespace-nowrap">{u.cpf ? cpfOculto(u.cpf) : u.login ?? <span className="text-destructive">sem CPF</span>}</TD>
                <TD>{PERFIL_LABEL[u.perfil]}</TD>
                <TD>
                  <Badge tom={u.situacao === 'ativo' ? 'success' : 'secondary'}>{SITUACAO_LABEL[u.situacao]}</Badge>
                </TD>
                <TD className="whitespace-nowrap text-xs">
                  {!u.auth_user_id ? <span className="font-semibold text-warning">não gerado</span> : u.precisa_trocar_senha ? 'senha provisória' : <span className="text-success">ativo</span>}
                </TD>
                <TD className="whitespace-nowrap text-right">
                  {podeMexer(u) && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => gerar([u])} loading={gerando === u.id} disabled={u.situacao === 'desligado' || !!gerando}>
                        {gerando !== u.id && <KeyRound />} {u.auth_user_id ? 'Nova senha' : 'Gerar acesso'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => (setErro(''), setForm({ id: u.id, nome: u.nome, cpf: u.cpf ? formatarCpf(u.cpf) : '', perfil: u.perfil, situacao: u.situacao, telefone: u.telefone ?? '' }))}
                      >
                        <Pencil /> Editar
                      </Button>
                    </>
                  )}
                </TD>
              </TR>
            ))}
            {!visiveis.length && (
              <TR>
                <TD colSpan={6} className="py-8 text-center text-muted-foreground">
                  Nenhum usuário {filtro ? `com perfil ${PERFIL_LABEL[filtro]}` : ''} ainda.
                </TD>
              </TR>
            )}
          </TBody>
        </Table>
      )}

      <Dialog aberto={!!form} onFechar={() => setForm(null)} titulo={form?.id ? 'Editar usuário' : 'Novo usuário'}>
        {form && (
          <div className="flex flex-col gap-4">
            <Field label="Nome completo">
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </Field>
            <Field label="CPF (é o login)">
              <Input value={form.cpf} inputMode="numeric" onChange={(e) => setForm({ ...form, cpf: formatarCpf(e.target.value) })} placeholder="000.000.000-00" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Perfil">
                <Select value={form.perfil} onChange={(e) => setForm({ ...form, perfil: e.target.value as Perfil })} disabled={perfisPermitidos.length === 1}>
                  {perfisPermitidos.map((p) => (
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
            <p className="-mt-2 text-xs text-muted-foreground">{PERFIL_AJUDA[form.perfil]} Afastado ou desligado não consegue entrar.</p>
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

      {lote && (
        <DialogLote
          perfis={perfisPermitidos}
          existentes={lista}
          onFechar={() => setLote(false)}
          onFeito={async (gerarAgora) => {
            setLote(false)
            const atual = await listarUsuarios()
            setLista(atual)
            if (gerarAgora) await gerar(atual.filter((u) => !u.auth_user_id && u.situacao === 'ativo' && u.cpf && (admin || u.perfil === 'motorista')))
          }}
        />
      )}

      <Dialog aberto={credenciais.length > 0} onFechar={() => setCredenciais([])} titulo={credenciais.length === 1 ? 'Acesso gerado' : `${credenciais.length} acessos gerados`} largura="max-w-2xl">
        <DialogCredenciais lista={credenciais} onFechar={() => setCredenciais([])} />
      </Dialog>
    </div>
  )
}

function DialogCredenciais({ lista, onFechar }: { lista: Credencial[]; onFechar: () => void }) {
  const [copiado, setCopiado] = useState('')
  const [falhou, setFalhou] = useState(false)
  async function copiarUm(id: string, texto: string) {
    const ok = await copiar(texto)
    setFalhou(!ok)
    if (ok) setCopiado(id)
  }
  return (
    <div className="flex flex-col gap-4">
      <Aviso tom="warning">As senhas aparecem só agora. Copie a mensagem de cada pessoa e mande pelo WhatsApp. Se perder, gere uma nova senha.</Aviso>
      <div className="flex max-h-[55vh] flex-col gap-2 overflow-y-auto">
        {lista.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-subtle p-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{c.nome}</p>
              <p className="text-sm">
                Login <b className="font-heading">{c.login}</b> · Senha <b className="font-heading select-all">{c.senha}</b>
              </p>
            </div>
            <Button size="sm" variant={copiado === c.id ? 'success' : 'outline'} onClick={() => copiarUm(c.id, mensagem(c))}>
              {copiado === c.id ? <Check /> : <Copy />} {copiado === c.id ? 'Copiada' : 'Copiar mensagem'}
            </Button>
          </div>
        ))}
      </div>
      {falhou && <Aviso tom="destructive">O navegador não deixou copiar. Selecione a senha com o dedo ou o mouse e copie manualmente.</Aviso>}
      <div className="flex flex-wrap justify-end gap-2">
        {lista.length > 1 && (
          <Button variant="outline" onClick={() => copiarUm('todos', lista.map(mensagem).join('\n\n———\n\n'))}>
            {copiado === 'todos' ? <Check /> : <Copy />} Copiar todas
          </Button>
        )}
        <Button onClick={onFechar}>Pronto</Button>
      </div>
    </div>
  )
}

function DialogLote({ perfis, existentes, onFechar, onFeito }: { perfis: Perfil[]; existentes: Usuario[]; onFechar: () => void; onFeito: (gerarAgora: boolean) => void }) {
  const [texto, setTexto] = useState('')
  const [perfil, setPerfil] = useState<Perfil>('motorista')
  const [linhas, setLinhas] = useState<LinhaLote[] | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [gerarAgora, setGerarAgora] = useState(true)

  function conferir() {
    const cpfsExistentes = new Set(existentes.map((u) => u.cpf).filter(Boolean))
    const vistos = new Set<string>()
    const l: LinhaLote[] = texto
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => {
        // aceita "Nome; CPF", "Nome, CPF", "Nome<TAB>CPF" (colado do Excel) ou "Nome CPF"
        const m = x.match(/^(.*?)[\s;,\t]+([\d.\-\s]{11,14})$/)
        const nome = (m ? m[1] : x).replace(/[;,\t]+$/, '').trim()
        const cpf = soDigitos(m ? m[2] : '')
        let erro: string | undefined
        if (nome.length < 3) erro = 'nome muito curto'
        else if (!cpf) erro = 'falta o CPF'
        else if (!cpfValido(cpf)) erro = 'CPF inválido'
        else if (cpfsExistentes.has(cpf)) erro = 'já cadastrado'
        else if (vistos.has(cpf)) erro = 'repetido na lista'
        vistos.add(cpf)
        return { nome, cpf, erro }
      })
    setLinhas(l)
  }

  async function cadastrar() {
    if (!linhas) return
    setSalvando(true)
    const atual = [...linhas]
    for (let i = 0; i < atual.length; i++) {
      if (atual[i].erro || atual[i].feito) continue
      try {
        await salvarUsuario(null, { nome: atual[i].nome, cpf: atual[i].cpf, perfil, situacao: 'ativo', telefone: '' })
        atual[i] = { ...atual[i], feito: true }
      } catch (e) {
        atual[i] = { ...atual[i], erro: (e as Error).message }
      }
      setLinhas([...atual])
    }
    setSalvando(false)
    if (atual.some((x) => x.feito) && atual.every((x) => x.feito || x.erro)) onFeito(gerarAgora)
  }

  const validas = linhas?.filter((x) => !x.erro && !x.feito).length ?? 0

  return (
    <Dialog aberto onFechar={onFechar} titulo="Cadastrar vários" largura="max-w-2xl">
      <div className="flex flex-col gap-4">
        {!linhas ? (
          <>
            <p className="text-sm text-muted-foreground">Um funcionário por linha: nome e CPF. Pode colar direto do Excel (coluna de nome e coluna de CPF).</p>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={10}
              placeholder={'Douglas Alexandre da Silva Pereira; 111.444.777-35\nEniton Silva dos Santos; 390.533.447-05'}
              className="w-full rounded-lg border border-input bg-card px-3 py-2 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
            <Field label="Perfil de todos">
              <Select value={perfil} onChange={(e) => setPerfil(e.target.value as Perfil)} disabled={perfis.length === 1}>
                {perfis.map((p) => (
                  <option key={p} value={p}>
                    {PERFIL_LABEL[p]}
                  </option>
                ))}
              </Select>
            </Field>
            <Button onClick={conferir} disabled={!texto.trim()}>
              Conferir lista
            </Button>
          </>
        ) : (
          <>
            <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-border">
              {linhas.map((x, i) => (
                <div key={i} className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 text-sm last:border-0">
                  <span className="min-w-0">
                    <b>{x.nome || '—'}</b> <span className="text-muted-foreground">{x.cpf ? formatarCpf(x.cpf) : ''}</span>
                  </span>
                  {x.feito ? <Badge tom="success">cadastrado</Badge> : x.erro ? <Badge tom="destructive">{x.erro}</Badge> : <Badge tom="outline">pronto</Badge>}
                </div>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={gerarAgora} onChange={(e) => setGerarAgora(e.target.checked)} className="size-4 accent-[var(--primary)]" /> Gerar os acessos logo depois (mensagens prontas para o WhatsApp)
            </label>
            <div className="flex flex-wrap justify-between gap-2">
              <Button variant="outline" onClick={() => setLinhas(null)} disabled={salvando}>
                Corrigir lista
              </Button>
              <Button onClick={cadastrar} loading={salvando} disabled={!validas}>
                Cadastrar {validas} {validas === 1 ? 'pessoa' : 'pessoas'}
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  )
}

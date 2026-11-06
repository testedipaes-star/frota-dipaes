import { supabase, demoAtivo } from './supabase'
import { loginParaEmail } from './utils'
import type {
  Checklist, ConfigPlano, ConfigRegras, EventoPendencia, Foto, Item, LinhaPainel, NotaTipo, Pendencia,
  RespostaGravada, RetornoEnvio, Resultado, TipoVeiculo, Usuario, Veiculo,
} from './tipos'

/** Erro de rede (sem internet): o app guarda e tenta de novo depois. */
export class SemRede extends Error {
  semRede = true
}

function falha(e: unknown): never {
  const err = e as { message?: string; name?: string } | null
  const msg = err?.message ?? String(e)
  if (/Failed to fetch|NetworkError|Load failed|network|fetch failed/i.test(msg)) throw new SemRede('Sem internet no momento.')
  throw new Error(msg.replace(/^.*?ERROR:\s*/, ''))
}

async function rodar<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  let r: { data: T; error: unknown }
  try {
    r = await p
  } catch (e) {
    falha(e)
  }
  if (r.error) falha(r.error)
  return r.data
}

export interface PayloadChecklist {
  id: string
  veiculo_id: string
  iniciado_em: string | null
  km_saida: number
  km_confirmado?: boolean
  combustivel: string
  rota: string
  temp_saida: number | null
  observacoes: string
  respostas: { item_id: string; resposta: 'ok' | 'nok'; descricao?: string }[]
  fotos: { item_id: string; caminho: string }[]
  motorista_id?: string
  data?: string
}

export interface FiltroHistorico {
  de: string
  ate: string
  veiculo_id?: string
  motorista_id?: string
  resultado?: Resultado | ''
}

const SEL_CHECKLIST = '*, motorista:usuarios!checklists_motorista_id_fkey(nome), liberador:usuarios!checklists_liberado_por_fkey(nome), veiculo:veiculos(modelo)'
const SEL_PENDENCIA = '*, veiculo:veiculos(placa, modelo, tipo)'

const real = {
  async entrar(login: string, senha: string) {
    const { error } = await supabase.auth.signInWithPassword({ email: loginParaEmail(login), password: senha })
    if (error) {
      if (/Invalid login/i.test(error.message)) throw new Error('CPF ou senha incorretos.')
      falha(error)
    }
  },
  async sair() {
    await supabase.auth.signOut()
  },
  async trocarSenha(nova: string) {
    const { error } = await supabase.auth.updateUser({ password: nova })
    if (error) falha(error)
    await rodar(supabase.rpc('marcar_senha_trocada'))
  },
  async meuPerfil(): Promise<Usuario | null> {
    const { data: s } = await supabase.auth.getSession()
    if (!s.session) return null
    return rodar(supabase.from('usuarios').select('*').eq('auth_user_id', s.session.user.id).maybeSingle()) as Promise<Usuario | null>
  },
  async meuAuthId(): Promise<string> {
    const { data } = await supabase.auth.getSession()
    if (!data.session) throw new Error('Sessão expirada. Entre de novo.')
    return data.session.user.id
  },

  // Cadastros
  async listarVeiculos(apenasAtivos = false): Promise<Veiculo[]> {
    let q = supabase.from('veiculos').select('*').order('placa')
    if (apenasAtivos) q = q.eq('ativo', true)
    return rodar(q) as Promise<Veiculo[]>
  },
  async salvarVeiculo(v: Partial<Veiculo> & { placa: string; tipo: TipoVeiculo }) {
    const dados = { placa: v.placa, modelo: v.modelo || null, tipo: v.tipo, ativo: v.ativo ?? true, km_atual: v.km_atual ?? null, observacao: v.observacao || null }
    if (v.id) await rodar(supabase.from('veiculos').update(dados).eq('id', v.id))
    else await rodar(supabase.from('veiculos').insert(dados))
  },
  async listarItens(tipo?: TipoVeiculo): Promise<Item[]> {
    let q = supabase.from('itens').select('*').order('tipo').order('numero')
    if (tipo) q = q.eq('tipo', tipo)
    return rodar(q) as Promise<Item[]>
  },
  async salvarItem(i: Partial<Item> & { tipo: TipoVeiculo; numero: number; grupo: string; texto: string }) {
    const dados = { tipo: i.tipo, numero: i.numero, grupo: i.grupo, texto: i.texto, critico: !!i.critico, foto_obrigatoria: !!i.foto_obrigatoria, ativo: i.ativo ?? true }
    if (i.id) await rodar(supabase.from('itens').update(dados).eq('id', i.id))
    else await rodar(supabase.from('itens').insert(dados))
  },
  async listarUsuarios(): Promise<Usuario[]> {
    return rodar(supabase.from('usuarios').select('*').order('nome')) as Promise<Usuario[]>
  },
  async salvarUsuario(id: string | null, dados: Record<string, string>) {
    return rodar(supabase.rpc('salvar_usuario', { p_id: id, p_dados: dados })) as Promise<string>
  },
  async gerarAcesso(usuarioId: string): Promise<{ login: string; senha: string }> {
    const { data, error } = await supabase.functions.invoke('admin-usuarios', { body: { acao: 'gerar_acesso', usuario_id: usuarioId } })
    if (error) {
      let msg = error.message
      try {
        const corpo = await (error as { context?: Response }).context?.json()
        if (corpo?.erro) msg = corpo.erro
      } catch {
        /* sem corpo */
      }
      throw new Error(msg)
    }
    if (data?.erro) throw new Error(data.erro)
    return data
  },
  async lerConfig(): Promise<{ plano: ConfigPlano; regras: ConfigRegras }> {
    const linhas = (await rodar(supabase.from('config').select('*'))) as { chave: string; valor: unknown }[]
    const m = Object.fromEntries(linhas.map((l) => [l.chave, l.valor]))
    return { plano: m.plano as ConfigPlano, regras: m.regras as ConfigRegras }
  },
  async salvarConfig(chave: 'plano' | 'regras', valor: unknown) {
    await rodar(supabase.from('config').update({ valor }).eq('chave', chave))
  },

  // Checklist do motorista
  async enviarFoto(caminho: string, blob: Blob) {
    const { error } = await supabase.storage.from('checklist-fotos').upload(caminho, blob, { contentType: 'image/jpeg', upsert: false })
    if (error && !/exists|duplicate/i.test(error.message)) falha(error)
  },
  async enviarChecklist(p: PayloadChecklist): Promise<RetornoEnvio> {
    return rodar(supabase.rpc('enviar_checklist', { p })) as Promise<RetornoEnvio>
  },
  async meusChecklists(dias = 30): Promise<Checklist[]> {
    const desde = new Date(Date.now() - dias * 864e5).toISOString().slice(0, 10)
    const eu = await real.meuPerfil()
    if (!eu) return []
    return rodar(supabase.from('checklists').select(SEL_CHECKLIST).eq('motorista_id', eu.id).gte('data', desde).order('enviado_em', { ascending: false })) as Promise<Checklist[]>
  },
  async situacaoChecklist(id: string): Promise<Pick<Checklist, 'liberacao' | 'obs_liberacao' | 'liberado_em'> | null> {
    return rodar(supabase.from('checklists').select('liberacao, obs_liberacao, liberado_em').eq('id', id).maybeSingle()) as never
  },
  async registrarRetorno(id: string, kmRetorno: number, temp: number | null) {
    await rodar(supabase.rpc('registrar_retorno', { p_checklist: id, p_km: kmRetorno, p_temp: temp }))
  },
  async pendenciasAbertasVeiculo(veiculoId: string): Promise<Pendencia[]> {
    return rodar(supabase.from('pendencias').select(SEL_PENDENCIA).eq('veiculo_id', veiculoId).in('status', ['nao_iniciada', 'andamento', 'standby']).order('inicio')) as Promise<Pendencia[]>
  },

  // Frota
  async painelDia(data: string): Promise<LinhaPainel[]> {
    return rodar(supabase.rpc('painel_dia', { p_data: data })) as Promise<LinhaPainel[]>
  },
  async checklistDetalhe(id: string): Promise<{ checklist: Checklist; respostas: RespostaGravada[]; fotos: Foto[] }> {
    const checklist = (await rodar(supabase.from('checklists').select(SEL_CHECKLIST).eq('id', id).single())) as Checklist
    const respostas = (await rodar(supabase.from('respostas').select('*').eq('checklist_id', id).order('numero'))) as RespostaGravada[]
    const fotos = (await rodar(supabase.from('fotos').select('*').eq('checklist_id', id).order('caminho'))) as Foto[]
    if (fotos.length) {
      const { data } = await supabase.storage.from('checklist-fotos').createSignedUrls(fotos.map((f) => f.caminho), 3600)
      const mapa = new Map((data ?? []).map((d) => [d.path, d.signedUrl]))
      fotos.forEach((f) => (f.url = mapa.get(f.caminho) ?? undefined))
    }
    return { checklist, respostas, fotos }
  },
  async liberarChecklist(id: string, liberar: boolean, obs: string) {
    await rodar(supabase.rpc('liberar_checklist', { p_checklist: id, p_liberar: liberar, p_obs: obs }))
  },
  async historico(f: FiltroHistorico): Promise<Checklist[]> {
    let q = supabase.from('checklists').select(SEL_CHECKLIST).gte('data', f.de).lte('data', f.ate).order('enviado_em', { ascending: false }).limit(500)
    if (f.veiculo_id) q = q.eq('veiculo_id', f.veiculo_id)
    if (f.motorista_id) q = q.eq('motorista_id', f.motorista_id)
    if (f.resultado) q = q.eq('resultado', f.resultado)
    return rodar(q) as Promise<Checklist[]>
  },
  async listarPendencias(): Promise<Pendencia[]> {
    return rodar(supabase.from('pendencias').select(SEL_PENDENCIA).order('ordem')) as Promise<Pendencia[]>
  },
  async salvarPendencia(id: string, campos: Partial<Pendencia>) {
    const { veiculo: _v, ...resto } = campos
    void _v
    await rodar(supabase.from('pendencias').update(resto).eq('id', id))
  },
  async criarPendencia(dados: Partial<Pendencia> & { veiculo_id: string; oque: string }) {
    const { veiculo: _v, ...resto } = dados
    void _v
    await rodar(supabase.from('pendencias').insert({ ...resto, item_id: null, ordem: Date.now() / 1000 }))
  },
  async eventosPendencia(id: string): Promise<EventoPendencia[]> {
    return rodar(supabase.from('pendencia_eventos').select('*, autor:usuarios(nome)').eq('pendencia_id', id).order('quando')) as Promise<EventoPendencia[]>
  },
  async todasNotas(): Promise<EventoPendencia[]> {
    return rodar(supabase.from('pendencia_eventos').select('*').eq('tipo', 'nota').order('quando')) as Promise<EventoPendencia[]>
  },
  async adicionarNota(pendenciaId: string, tipo: NotaTipo, texto: string, data: string) {
    const eu = await real.meuPerfil()
    await rodar(supabase.from('pendencia_eventos').insert({ pendencia_id: pendenciaId, tipo: 'nota', nota_tipo: tipo, texto, data, autor_id: eu?.id }))
  },
  async apagarNota(id: string) {
    await rodar(supabase.from('pendencia_eventos').delete().eq('id', id))
  },
}

export type Api = typeof real

async function backend(): Promise<Api> {
  return demoAtivo() ? (await import('./demo')).demo : real
}

function via<K extends keyof Api>(k: K): Api[K] {
  return (async (...args: unknown[]) => {
    const b = await backend()
    return (b[k] as (...a: unknown[]) => unknown)(...args)
  }) as Api[K]
}

export const entrar = via('entrar')
export const sair = via('sair')
export const trocarSenha = via('trocarSenha')
export const meuPerfil = via('meuPerfil')
export const meuAuthId = via('meuAuthId')
export const listarVeiculos = via('listarVeiculos')
export const salvarVeiculo = via('salvarVeiculo')
export const listarItens = via('listarItens')
export const salvarItem = via('salvarItem')
export const listarUsuarios = via('listarUsuarios')
export const salvarUsuario = via('salvarUsuario')
export const gerarAcesso = via('gerarAcesso')
export const lerConfig = via('lerConfig')
export const salvarConfig = via('salvarConfig')
export const enviarFoto = via('enviarFoto')
export const enviarChecklist = via('enviarChecklist')
export const meusChecklists = via('meusChecklists')
export const situacaoChecklist = via('situacaoChecklist')
export const registrarRetorno = via('registrarRetorno')
export const pendenciasAbertasVeiculo = via('pendenciasAbertasVeiculo')
export const painelDia = via('painelDia')
export const checklistDetalhe = via('checklistDetalhe')
export const liberarChecklist = via('liberarChecklist')
export const historico = via('historico')
export const listarPendencias = via('listarPendencias')
export const salvarPendencia = via('salvarPendencia')
export const criarPendencia = via('criarPendencia')
export const eventosPendencia = via('eventosPendencia')
export const todasNotas = via('todasNotas')
export const adicionarNota = via('adicionarNota')
export const apagarNota = via('apagarNota')

/**
 * Modo demonstração (prévia e ?demo= em desenvolvimento): o mesmo contrato da api, em memória.
 * Repete as regras do banco (enviar_checklist) para a prévia se comportar como o sistema real.
 */
import itensBase from './itens-demo.json'
import { perfilDemo, definirDemo } from './supabase'
import { hojeSP, somarDias, uuid } from './utils'
import type { Api, FiltroHistorico, PayloadChecklist } from './api'
import type {
  Checklist, ConfigPlano, ConfigRegras, EventoPendencia, Foto, Item, LinhaPainel, NotaTipo, Pendencia, RespostaGravada,
  RetornoEnvio, TipoVeiculo, Usuario, Veiculo,
} from './tipos'

const hoje = hojeSP()
const agoraMenos = (min: number) => new Date(Date.now() - min * 60000).toISOString()

const usuarios: Usuario[] = [
  { id: 'u-adm', auth_user_id: 'a-adm', nome: 'Mauro Bom Junior', cpf: null, login: 'admin', perfil: 'admin', situacao: 'ativo', telefone: null, precisa_trocar_senha: false },
  { id: 'u-frota', auth_user_id: 'a-frota', nome: 'Responsável Frota', cpf: '52998224725', login: null, perfil: 'frota', situacao: 'ativo', telefone: null, precisa_trocar_senha: false },
  { id: 'u-gestor', auth_user_id: 'a-gestor', nome: 'Gestor Logística', cpf: '15350946056', login: null, perfil: 'gestor', situacao: 'ativo', telefone: null, precisa_trocar_senha: false },
  { id: 'u-douglas', auth_user_id: 'a-douglas', nome: 'Douglas Alexandre', cpf: '11144477735', login: null, perfil: 'motorista', situacao: 'ativo', telefone: null, precisa_trocar_senha: false },
  { id: 'u-creonti', auth_user_id: 'a-creonti', nome: 'Creonti Maximo', cpf: '39053344705', login: null, perfil: 'motorista', situacao: 'ativo', telefone: null, precisa_trocar_senha: false },
]

const veiculos: Veiculo[] = [
  { id: 'v1', placa: 'QJA1B23', modelo: 'Accelo 815', tipo: 'bau', ativo: true, km_atual: 182340, observacao: null },
  { id: 'v2', placa: 'RKT4C56', modelo: 'Accelo 815', tipo: 'bau', ativo: true, km_atual: 95410, observacao: null },
  { id: 'v3', placa: 'MLP7D89', modelo: 'Delivery 11.180', tipo: 'frigorifico', ativo: true, km_atual: 240115, observacao: null },
  { id: 'v4', placa: 'BRZ2E34', modelo: 'Strada', tipo: 'leve', ativo: true, km_atual: 61022, observacao: null },
]

const itens: Item[] = (itensBase as Omit<Item, 'id' | 'ativo'>[]).map((i) => ({ ...i, id: `i-${i.tipo}-${i.numero}`, ativo: true }))

const plano: ConfigPlano = { objetivo: 'Pendências da frota — checklist diário de veículos', responsavel: 'Frota', setor: 'Frota' }
const regras: ConfigRegras = { prazo_critico_dias: 0, prazo_comum_dias: 7, salto_km: 1500, tempo_minimo_seg: 120 }

const checklists: Checklist[] = []
const respostas = new Map<string, RespostaGravada[]>()
const fotos: (Foto & { checklist_id: string })[] = []
const fotoDados = new Map<string, string>()
const pendencias: Pendencia[] = []
const eventos: EventoPendencia[] = []

// Imagem de exemplo (desenho simples de caminhão) para as fotos da prévia
const FOTO_EXEMPLO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 220"><rect width="320" height="220" fill="#d9dee3"/><rect x="40" y="60" width="160" height="90" fill="#f6f5f3" stroke="#73757a" stroke-width="3"/><path d="M200 90h50l30 30v30h-80z" fill="#f17b3e" stroke="#73757a" stroke-width="3"/><circle cx="90" cy="160" r="18" fill="#2f3033"/><circle cx="240" cy="160" r="18" fill="#2f3033"/><text x="160" y="205" font-family="sans-serif" font-size="14" text-anchor="middle" fill="#73757a">foto de exemplo</text></svg>`,
  )

const eu = () => {
  const p = perfilDemo()
  return p === 'motorista' ? usuarios.find((u) => u.id === 'u-douglas')! : p === 'frota' ? usuarios[0] : p === 'gestor' ? usuarios.find((u) => u.id === 'u-gestor')! : null
}
const nomeDe = (id: string | null) => usuarios.find((u) => u.id === id)?.nome ?? null
const comJoins = (c: Checklist): Checklist => ({
  ...c,
  motorista: { nome: nomeDe(c.motorista_id) ?? '' },
  liberador: c.liberado_por ? { nome: nomeDe(c.liberado_por) ?? '' } : null,
  veiculo: { modelo: veiculos.find((v) => v.id === c.veiculo_id)?.modelo ?? null },
})
const pendComVeiculo = (p: Pendencia): Pendencia => {
  const v = veiculos.find((x) => x.id === p.veiculo_id)!
  return { ...p, veiculo: { placa: v.placa, modelo: v.modelo, tipo: v.tipo } }
}
const espera = (ms = 150) => new Promise((r) => setTimeout(r, ms))
const aberta = (p: Pendencia) => p.status === 'nao_iniciada' || p.status === 'andamento' || p.status === 'standby'
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

function evento(e: Partial<EventoPendencia> & { pendencia_id: string; tipo: EventoPendencia['tipo'] }) {
  eventos.push({ id: uuid(), nota_tipo: null, data: hoje, texto: null, campo: null, de: null, para: null, checklist_id: null, autor_id: eu()?.id ?? null, quando: new Date().toISOString(), ...e })
}

/** Mesmas regras de public.enviar_checklist */
function enviar(p: PayloadChecklist, motoristaId: string, papel: boolean, dataForcada?: string): RetornoEnvio {
  const ex = checklists.find((c) => c.id === p.id)
  if (ex) return { id: ex.id, resultado: ex.resultado, liberacao: ex.liberacao, reenvio: true, pendencias_novas: 0, pendencias_somadas: 0 }
  const v = veiculos.find((x) => x.id === p.veiculo_id && x.ativo)
  if (!v) throw new Error('Veículo não encontrado ou inativo.')
  const data = dataForcada ?? (papel && p.data ? p.data : hoje)
  if (p.km_saida == null || Number.isNaN(p.km_saida)) throw new Error('Informe o km na saída.')
  if (data === hoje && v.km_atual != null && p.km_saida < v.km_atual)
    throw new Error(`O km de saída (${p.km_saida}) é menor que o último km registrado deste veículo (${v.km_atual}). Confira o painel.`)
  if (data === hoje && v.km_atual != null && p.km_saida - v.km_atual > regras.salto_km && !p.km_confirmado)
    throw new Error(`KM_CONFIRMAR: o km de saída está ${p.km_saida - v.km_atual} km acima do último registrado. Confirme se está certo.`)
  if (!['Reserva', '1/4', '1/2', '3/4', 'Cheio'].includes(p.combustivel)) throw new Error('Informe o combustível na saída.')
  if (v.tipo === 'frigorifico' && p.temp_saida == null) throw new Error('Informe a temperatura do baú na saída.')
  const doTipo = itens.filter((i) => i.tipo === v.tipo && i.ativo)
  const resp = new Map(p.respostas.map((r) => [r.item_id, r]))
  const faltam = doTipo.filter((i) => !resp.has(i.id)).map((i) => i.numero)
  if (faltam.length) throw new Error(`Faltam responder os itens: ${faltam.join(', ')}.`)
  const semDesc = doTipo.filter((i) => resp.get(i.id)!.resposta === 'nok' && (resp.get(i.id)!.descricao ?? '').trim().length < 3).map((i) => i.numero)
  if (semDesc.length) throw new Error(`Descreva o problema dos itens NOK: ${semDesc.join(', ')}.`)
  if (!papel) {
    const semFoto = doTipo.filter((i) => (resp.get(i.id)!.resposta === 'nok' || i.foto_obrigatoria) && !p.fotos.some((f) => f.item_id === i.id)).map((i) => i.numero)
    if (semFoto.length) throw new Error(`Faltam fotos dos itens: ${semFoto.join(', ')}.`)
  }
  const nok = doTipo.filter((i) => resp.get(i.id)!.resposta === 'nok')
  const nokCrit = nok.filter((i) => i.critico)
  const resultado = nokCrit.length ? 'nao_liberado' : nok.length ? 'ressalva' : 'liberado'
  const liberacao = nokCrit.length ? 'aguardando' : 'nao_precisa'
  const c: Checklist = {
    id: p.id, veiculo_id: v.id, motorista_id: motoristaId, tipo: v.tipo, placa: v.placa, data, origem: papel ? 'papel' : 'app',
    iniciado_em: p.iniciado_em, enviado_em: new Date().toISOString(),
    duracao_seg: p.iniciado_em ? Math.round((Date.now() - Date.parse(p.iniciado_em)) / 1000) : null,
    km_saida: p.km_saida, combustivel: p.combustivel, rota: p.rota || null, temp_saida: p.temp_saida, observacoes: p.observacoes || null,
    km_retorno: null, temp_retorno: null, retorno_em: null, resultado, qtd_nok: nok.length, qtd_nok_critico: nokCrit.length, liberacao,
    liberado_por: null, liberado_em: null, obs_liberacao: null,
  }
  checklists.unshift(c)
  respostas.set(c.id, doTipo.map((i) => ({ item_id: i.id, numero: i.numero, grupo: i.grupo, texto: i.texto, critico: i.critico, foto_obrigatoria: i.foto_obrigatoria, resposta: resp.get(i.id)!.resposta, descricao: resp.get(i.id)!.descricao ?? null })))
  p.fotos.forEach((f) => fotos.push({ id: uuid(), checklist_id: c.id, item_id: f.item_id, caminho: f.caminho }))
  v.km_atual = Math.max(v.km_atual ?? 0, p.km_saida)
  const motorista = nomeDe(motoristaId) ?? ''
  let novas = 0
  let somadas = 0
  for (const i of nok) {
    const desc = resp.get(i.id)!.descricao!.trim()
    const pd = pendencias.find((x) => x.veiculo_id === v.id && x.item_id === i.id && aberta(x))
    if (pd) {
      pd.ocorrencias += 1
      pd.ultima_ocorrencia = data
      if (!(pd.envolvidos ?? '').includes(motorista)) pd.envolvidos = [pd.envolvidos, motorista].filter(Boolean).join(', ')
      pd.porque = (pd.porque ?? '').replace(/ Ocorrências: \d+\.$/, '') + ` Ocorrências: ${pd.ocorrencias}.`
      evento({ pendencia_id: pd.id, tipo: 'ocorrencia', texto: desc, checklist_id: c.id, autor_id: motoristaId, data })
      somadas++
    } else {
      const nova: Pendencia = {
        id: uuid(), veiculo_id: v.id, item_id: i.id, numero_item: i.numero, texto_item: i.texto, critico: i.critico, problema: desc,
        oque: `${v.placa} · ${i.texto}: ${desc}`,
        porque: `NOK no checklist de ${data.split('-').reverse().join('/')} (item ${i.numero})${i.critico ? ', item crítico: veículo bloqueado até liberação.' : '.'} Ocorrências: 1.`,
        responsavel: null, envolvidos: motorista, onde: `${v.placa}${v.modelo ? ' · ' + v.modelo : ''}`, como: null, quanto: null,
        inicio: data, prazo: somarDias(data, i.critico ? regras.prazo_critico_dias : regras.prazo_comum_dias), fim: null, status: 'nao_iniciada',
        ocorrencias: 1, ultima_ocorrencia: data, checklist_origem: c.id, ordem: Date.now() / 1000, criado_em: new Date().toISOString(), atualizado_em: new Date().toISOString(),
      }
      pendencias.push(nova)
      evento({ pendencia_id: nova.id, tipo: 'criada', texto: desc, checklist_id: c.id, autor_id: motoristaId, data })
      novas++
    }
  }
  for (const i of doTipo.filter((x) => resp.get(x.id)!.resposta === 'ok')) {
    const pd = pendencias.find((x) => x.veiculo_id === v.id && x.item_id === i.id && aberta(x))
    if (pd) evento({ pendencia_id: pd.id, tipo: 'ok_marcado', texto: `Marcado OK no checklist de ${ddmm(data)} por ${motorista}. Conferir e concluir.`, checklist_id: c.id, autor_id: motoristaId, data })
  }
  return { id: c.id, resultado, liberacao, reenvio: false, pendencias_novas: novas, pendencias_somadas: somadas }
}

// Dados de exemplo: dois checklists hoje e um de ontem
;(function semear() {
  const respTudoOk = (tipo: TipoVeiculo) => itens.filter((i) => i.tipo === tipo).map((i) => ({ item_id: i.id, resposta: 'ok' as const }))
  const fotosDe = (id: string, tipo: TipoVeiculo, extra: number[] = []) =>
    itens.filter((i) => i.tipo === tipo && (i.foto_obrigatoria || extra.includes(i.numero))).map((i) => {
      const caminho = `a-demo/${id}/${i.numero}-1.jpg`
      fotoDados.set(caminho, FOTO_EXEMPLO)
      return { item_id: i.id, caminho }
    })
  const ontem = somarDias(hoje, -1)
  // ontem: estepe NOK no QJA1B23
  const c0 = uuid()
  enviar({
    id: c0, veiculo_id: 'v1', iniciado_em: null, km_saida: 182100, combustivel: 'Cheio', rota: 'Joinville e Jaraguá', temp_saida: null, observacoes: '',
    respostas: respTudoOk('bau').map((r) => (r.item_id === 'i-bau-6' ? { ...r, resposta: 'nok' as const, descricao: 'Estepe com pressão baixa' } : r)),
    fotos: fotosDe(c0, 'bau', [6]),
  }, 'u-douglas', false, ontem)
  checklists[0].enviado_em = new Date(Date.now() - 864e5).toISOString()
  checklists[0].km_retorno = 182340
  checklists[0].retorno_em = new Date(Date.now() - 864e5 + 9 * 36e5).toISOString()
  // hoje: QJA1B23 com seta (crítico) e estepe de novo → aguardando liberação
  const c1 = uuid()
  enviar({
    id: c1, veiculo_id: 'v1', iniciado_em: agoraMenos(40), km_saida: 182340, combustivel: '3/4', rota: 'Blumenau', temp_saida: null, observacoes: '',
    respostas: respTudoOk('bau').map((r) =>
      r.item_id === 'i-bau-6' ? { ...r, resposta: 'nok' as const, descricao: 'Estepe ainda murcho' }
      : r.item_id === 'i-bau-18' ? { ...r, resposta: 'nok' as const, descricao: 'Seta traseira esquerda não acende' } : r),
    fotos: fotosDe(c1, 'bau', [6, 18]),
  }, 'u-douglas', false)
  // hoje: RKT4C56 tudo OK
  const c2 = uuid()
  enviar({
    id: c2, veiculo_id: 'v2', iniciado_em: agoraMenos(75), km_saida: 95410, combustivel: 'Cheio', rota: 'Itajaí e Navegantes', temp_saida: null, observacoes: '',
    respostas: respTudoOk('bau'), fotos: fotosDe(c2, 'bau'),
  }, 'u-creonti', false)
  checklists[0].enviado_em = agoraMenos(68)
  // pendência lançada à mão
  pendencias.push({
    id: uuid(), veiculo_id: 'v3', item_id: null, numero_item: null, texto_item: null, critico: false, problema: null,
    oque: 'MLP7D89 · Revisão dos 240 mil km', porque: 'Plano de manutenção preventiva.', responsavel: 'Frota', envolvidos: 'Oficina', onde: 'MLP7D89 · Delivery 11.180',
    como: 'Agendar com a concessionária', quanto: null, inicio: somarDias(hoje, -5), prazo: somarDias(hoje, -1), fim: null, status: 'andamento',
    ocorrencias: 1, ultima_ocorrencia: null, checklist_origem: null, ordem: 1, criado_em: new Date().toISOString(), atualizado_em: new Date().toISOString(),
  })
  eventos.forEach((e) => (e.autor_id = e.autor_id ?? 'u-douglas'))
})()

export const demo: Api = {
  async entrar() {
    throw new Error('Na prévia, escolha abaixo como entrar.')
  },
  async sair() {
    definirDemo(null)
  },
  async trocarSenha() {},
  async meuPerfil() {
    return eu()
  },
  async meuAuthId() {
    return 'a-demo'
  },
  async listarVeiculos(apenasAtivos = false) {
    await espera()
    return veiculos.filter((v) => !apenasAtivos || v.ativo).map((v) => ({ ...v }))
  },
  async salvarVeiculo(v) {
    if (veiculos.some((x) => x.placa === v.placa && x.id !== v.id)) throw new Error('Já existe um veículo com essa placa.')
    if (v.id) Object.assign(veiculos.find((x) => x.id === v.id)!, v)
    else veiculos.push({ id: uuid(), modelo: null, ativo: true, km_atual: null, observacao: null, ...v })
  },
  async listarItens(tipo) {
    await espera()
    return itens.filter((i) => !tipo || i.tipo === tipo).map((i) => ({ ...i }))
  },
  async salvarItem(i) {
    if (i.id) Object.assign(itens.find((x) => x.id === i.id)!, i)
    else itens.push({ id: uuid(), critico: false, foto_obrigatoria: false, ativo: true, ...i })
  },
  async listarUsuarios() {
    return usuarios.map((u) => ({ ...u }))
  },
  async salvarUsuario(id, dados) {
    if (id) Object.assign(usuarios.find((u) => u.id === id)!, { nome: dados.nome, cpf: dados.cpf?.replace(/\D/g, '') || null, perfil: dados.perfil, situacao: dados.situacao })
    else usuarios.push({ id: uuid(), auth_user_id: null, nome: dados.nome, cpf: dados.cpf?.replace(/\D/g, '') || null, login: null, perfil: dados.perfil as Usuario['perfil'], situacao: 'ativo', telefone: null, precisa_trocar_senha: true })
    return id ?? ''
  },
  async gerarAcesso(id) {
    const u = usuarios.find((x) => x.id === id)!
    u.auth_user_id = u.auth_user_id ?? 'a-' + u.id
    u.precisa_trocar_senha = true
    const c = u.cpf ?? ''
    return { login: c ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : u.login ?? '', senha: `rota-${1000 + Math.floor(Math.random() * 9000)}` }
  },
  async lerConfig() {
    return { plano: { ...plano }, regras: { ...regras } }
  },
  async salvarConfig(chave, valor) {
    Object.assign(chave === 'plano' ? plano : regras, valor)
  },
  async enviarFoto(caminho, blob) {
    await espera(80)
    fotoDados.set(caminho, URL.createObjectURL(blob))
  },
  async enviarChecklist(p) {
    await espera(400)
    const papel = !!p.motorista_id
    return enviar(p, papel ? p.motorista_id! : eu()!.id, papel)
  },
  async meusChecklists() {
    return checklists.filter((c) => c.motorista_id === eu()?.id).map(comJoins)
  },
  async situacaoChecklist(id) {
    const c = checklists.find((x) => x.id === id)
    return c ? { liberacao: c.liberacao, obs_liberacao: c.obs_liberacao, liberado_em: c.liberado_em } : null
  },
  async registrarRetorno(id, kmRetorno, temp) {
    const c = checklists.find((x) => x.id === id)!
    if (kmRetorno < c.km_saida) throw new Error(`O km de retorno não pode ser menor que o de saída (${c.km_saida}).`)
    if (c.tipo === 'frigorifico' && temp == null) throw new Error('Informe a temperatura do baú no retorno.')
    Object.assign(c, { km_retorno: kmRetorno, temp_retorno: temp, retorno_em: c.retorno_em ?? new Date().toISOString() })
    const v = veiculos.find((x) => x.id === c.veiculo_id)!
    v.km_atual = Math.max(v.km_atual ?? 0, kmRetorno)
  },
  async pendenciasAbertasVeiculo(veiculoId) {
    return pendencias.filter((p) => p.veiculo_id === veiculoId && aberta(p)).map(pendComVeiculo)
  },
  async painelDia(data): Promise<LinhaPainel[]> {
    await espera()
    const linhas = veiculos.filter((v) => v.ativo).map((v) => {
      const doDia = checklists.filter((c) => c.veiculo_id === v.id && c.data === data)
      const c = doDia[0]
      const abertas = pendencias.filter((p) => p.veiculo_id === v.id && aberta(p))
      return {
        veiculo_id: v.id, placa: v.placa, modelo: v.modelo, tipo: v.tipo, km_atual: v.km_atual,
        checklist_id: c?.id ?? null, motorista: c ? nomeDe(c.motorista_id) : null, enviado_em: c?.enviado_em ?? null, retorno_em: c?.retorno_em ?? null,
        resultado: c?.resultado ?? null, liberacao: c?.liberacao ?? null, qtd_nok: c?.qtd_nok ?? null, qtd_nok_critico: c?.qtd_nok_critico ?? null,
        duracao_seg: c?.duracao_seg ?? null, origem: c?.origem ?? null, checklists_no_dia: doDia.length,
        pendencias_abertas: abertas.length, pendencias_atrasadas: abertas.filter((p) => p.status !== 'standby' && p.prazo && p.prazo < hoje).length,
      }
    })
    const peso = (l: LinhaPainel) => (l.liberacao === 'aguardando' || l.liberacao === 'mantido_bloqueado' ? 0 : l.checklist_id ? 2 : 1)
    return linhas.sort((a, b) => peso(a) - peso(b) || a.placa.localeCompare(b.placa))
  },
  async checklistDetalhe(id) {
    await espera()
    const c = checklists.find((x) => x.id === id)
    if (!c) throw new Error('Checklist não encontrado.')
    return {
      checklist: comJoins(c),
      respostas: respostas.get(id) ?? [],
      fotos: fotos.filter((f) => f.checklist_id === id).map((f) => ({ ...f, url: fotoDados.get(f.caminho) ?? FOTO_EXEMPLO })),
    }
  },
  async liberarChecklist(id, liberar, obs) {
    const c = checklists.find((x) => x.id === id)!
    if (obs.trim().length < 3) throw new Error('Escreva a observação da liberação (o que foi feito ou avaliado).')
    Object.assign(c, { liberacao: liberar ? 'liberado' : 'mantido_bloqueado', liberado_por: eu()!.id, liberado_em: new Date().toISOString(), obs_liberacao: obs.trim() })
  },
  async historico(f: FiltroHistorico) {
    await espera()
    return checklists
      .filter((c) => c.data >= f.de && c.data <= f.ate && (!f.veiculo_id || c.veiculo_id === f.veiculo_id) && (!f.motorista_id || c.motorista_id === f.motorista_id) && (!f.resultado || c.resultado === f.resultado))
      .map(comJoins)
  },
  async listarPendencias() {
    await espera()
    return pendencias.map(pendComVeiculo)
  },
  async salvarPendencia(id, campos) {
    const p = pendencias.find((x) => x.id === id)!
    if (campos.status && campos.status !== p.status) {
      evento({ pendencia_id: id, tipo: 'status', campo: 'status', de: p.status, para: campos.status })
      p.fim = campos.status === 'concluida' ? hoje : null
    }
    if ('prazo' in campos && campos.prazo !== p.prazo) evento({ pendencia_id: id, tipo: 'prazo', campo: 'prazo', de: p.prazo, para: campos.prazo ?? null })
    for (const k of ['oque', 'porque', 'responsavel', 'envolvidos', 'onde', 'como', 'quanto'] as const) {
      if (k in campos && (campos[k] ?? null) !== (p[k] ?? null)) evento({ pendencia_id: id, tipo: 'campo', campo: k, de: p[k], para: campos[k] ?? null })
    }
    const { veiculo: _v, ...resto } = campos
    void _v
    Object.assign(p, resto, { atualizado_em: new Date().toISOString() })
  },
  async criarPendencia(dados) {
    const v = veiculos.find((x) => x.id === dados.veiculo_id)!
    const p: Pendencia = {
      id: uuid(), item_id: null, numero_item: null, texto_item: null, critico: false, problema: null, porque: null, responsavel: null, envolvidos: null,
      onde: `${v.placa}${v.modelo ? ' · ' + v.modelo : ''}`, como: null, quanto: null, inicio: hoje, prazo: null, fim: null, status: 'nao_iniciada', ocorrencias: 1,
      ultima_ocorrencia: null, checklist_origem: null, ordem: Date.now() / 1000, criado_em: new Date().toISOString(), atualizado_em: new Date().toISOString(),
      ...dados,
    }
    pendencias.push(p)
    evento({ pendencia_id: p.id, tipo: 'criada', texto: 'Lançada pela Frota.' })
  },
  async eventosPendencia(id) {
    return eventos.filter((e) => e.pendencia_id === id).map((e) => ({ ...e, autor: e.autor_id ? { nome: nomeDe(e.autor_id) ?? '' } : null }))
  },
  async todasNotas() {
    return eventos.filter((e) => e.tipo === 'nota')
  },
  async adicionarNota(pendenciaId: string, tipo: NotaTipo, texto: string, data: string) {
    evento({ pendencia_id: pendenciaId, tipo: 'nota', nota_tipo: tipo, texto, data })
  },
  async apagarNota(id) {
    const i = eventos.findIndex((e) => e.id === id)
    if (i >= 0) eventos.splice(i, 1)
  },
}

export type Perfil = 'motorista' | 'frota' | 'admin'
export type Situacao = 'ativo' | 'afastado' | 'desligado'
export type TipoVeiculo = 'bau' | 'frigorifico' | 'leve'
export type Resposta = 'ok' | 'nok'
export type Resultado = 'liberado' | 'ressalva' | 'nao_liberado'
export type Liberacao = 'nao_precisa' | 'aguardando' | 'liberado' | 'mantido_bloqueado'
export type StatusPendencia = 'nao_iniciada' | 'andamento' | 'standby' | 'concluida' | 'cancelada'
export type NotaTipo = 'resultado' | 'problema' | 'proximo'

export const COMBUSTIVEIS = ['Reserva', '1/4', '1/2', '3/4', 'Cheio'] as const

export interface Usuario {
  id: string
  auth_user_id: string | null
  nome: string
  cpf: string | null
  login: string | null
  perfil: Perfil
  situacao: Situacao
  telefone: string | null
  precisa_trocar_senha: boolean
}

export interface Veiculo {
  id: string
  placa: string
  modelo: string | null
  tipo: TipoVeiculo
  ativo: boolean
  km_atual: number | null
  observacao: string | null
}

export interface Item {
  id: string
  tipo: TipoVeiculo
  numero: number
  grupo: string
  texto: string
  critico: boolean
  foto_obrigatoria: boolean
  ativo: boolean
}

export interface Checklist {
  id: string
  veiculo_id: string
  motorista_id: string
  tipo: TipoVeiculo
  placa: string
  data: string
  origem: 'app' | 'papel'
  iniciado_em: string | null
  enviado_em: string
  duracao_seg: number | null
  km_saida: number
  combustivel: string
  rota: string | null
  temp_saida: number | null
  observacoes: string | null
  km_retorno: number | null
  temp_retorno: number | null
  retorno_em: string | null
  resultado: Resultado
  qtd_nok: number
  qtd_nok_critico: number
  liberacao: Liberacao
  liberado_por: string | null
  liberado_em: string | null
  obs_liberacao: string | null
  motorista?: { nome: string } | null
  liberador?: { nome: string } | null
  veiculo?: { modelo: string | null } | null
}

export interface RespostaGravada {
  item_id: string
  numero: number
  grupo: string
  texto: string
  critico: boolean
  foto_obrigatoria: boolean
  resposta: Resposta
  descricao: string | null
}

export interface Foto {
  id: string
  item_id: string | null
  caminho: string
  url?: string
}

export interface Pendencia {
  id: string
  veiculo_id: string
  item_id: string | null
  numero_item: number | null
  texto_item: string | null
  critico: boolean
  problema: string | null
  oque: string
  porque: string | null
  responsavel: string | null
  envolvidos: string | null
  onde: string | null
  como: string | null
  quanto: string | null
  inicio: string
  prazo: string | null
  fim: string | null
  status: StatusPendencia
  ocorrencias: number
  ultima_ocorrencia: string | null
  checklist_origem: string | null
  ordem: number
  criado_em: string
  atualizado_em: string
  veiculo?: { placa: string; modelo: string | null; tipo: TipoVeiculo } | null
}

export interface EventoPendencia {
  id: string
  pendencia_id: string
  tipo: 'criada' | 'ocorrencia' | 'ok_marcado' | 'nota' | 'status' | 'prazo' | 'campo'
  nota_tipo: NotaTipo | null
  data: string
  texto: string | null
  campo: string | null
  de: string | null
  para: string | null
  checklist_id: string | null
  autor_id: string | null
  quando: string
  autor?: { nome: string } | null
}

export interface LinhaPainel {
  veiculo_id: string
  placa: string
  modelo: string | null
  tipo: TipoVeiculo
  km_atual: number | null
  checklist_id: string | null
  motorista: string | null
  enviado_em: string | null
  retorno_em: string | null
  resultado: Resultado | null
  liberacao: Liberacao | null
  qtd_nok: number | null
  qtd_nok_critico: number | null
  duracao_seg: number | null
  origem: string | null
  checklists_no_dia: number
  pendencias_abertas: number
  pendencias_atrasadas: number
}

export interface ConfigPlano {
  objetivo: string
  responsavel: string
  setor: string
}

export interface ConfigRegras {
  prazo_critico_dias: number
  prazo_comum_dias: number
  salto_km: number
  tempo_minimo_seg: number
}

export interface RetornoEnvio {
  id: string
  resultado: Resultado
  liberacao: Liberacao
  reenvio: boolean
  pendencias_novas: number
  pendencias_somadas: number
}

export const TIPO_LABEL: Record<TipoVeiculo, string> = { bau: 'Caminhão baú', frigorifico: 'Caminhão frigorífico', leve: 'Carro leve' }
export const PERFIL_LABEL: Record<Perfil, string> = { motorista: 'Motorista', frota: 'Frota', admin: 'Administrador' }
export const SITUACAO_LABEL: Record<Situacao, string> = { ativo: 'Ativo', afastado: 'Afastado', desligado: 'Desligado' }
export const STATUS_LABEL: Record<StatusPendencia, string> = {
  nao_iniciada: 'Não iniciada',
  andamento: 'Em andamento',
  standby: 'Stand-by',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
}
export const ABERTAS: StatusPendencia[] = ['nao_iniciada', 'andamento', 'standby']

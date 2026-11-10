// Gera ou redefine o acesso (login = CPF + senha provisória) de um usuário do Checklist de Frota.
// Administrador gera acesso de qualquer perfil; a Frota, só de motoristas.
import { createClient } from 'npm:@supabase/supabase-js@2.49.4'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const cpfFormatado = (c: string) => c.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')

// Senha provisória fácil de ditar: palavra curta + 4 dígitos (ex.: pneu-4821)
function senhaProvisoria(): string {
  const palavras = ['pneu', 'rota', 'frota', 'bau', 'placa', 'farol', 'motor', 'estrada']
  const n = new Uint32Array(2)
  crypto.getRandomValues(n)
  return `${palavras[n[0] % palavras.length]}-${String(1000 + (n[1] % 9000))}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return resposta({ erro: 'Método não permitido.' }, 405)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  const { data: quem, error: erroQuem } = await admin.auth.getUser(token)
  if (erroQuem || !quem.user) return resposta({ erro: 'Sessão inválida. Entre de novo.' }, 401)
  const { data: chamador } = await admin.from('usuarios').select('id, perfil, situacao').eq('auth_user_id', quem.user.id).maybeSingle()
  if (!chamador || chamador.situacao !== 'ativo' || !['admin', 'frota'].includes(chamador.perfil)) {
    return resposta({ erro: 'Só a Frota e o administrador geram acessos.' }, 403)
  }

  let corpo: { acao?: string; usuario_id?: string }
  try {
    corpo = await req.json()
  } catch {
    return resposta({ erro: 'Pedido inválido.' }, 400)
  }
  if (corpo.acao !== 'gerar_acesso' || !corpo.usuario_id) return resposta({ erro: 'Ação desconhecida.' }, 400)

  const { data: alvo } = await admin.from('usuarios').select('id, nome, cpf, login, auth_user_id, situacao, perfil').eq('id', corpo.usuario_id).maybeSingle()
  if (!alvo) return resposta({ erro: 'Usuário não encontrado.' }, 404)
  if (chamador.perfil === 'frota' && alvo.perfil !== 'motorista') return resposta({ erro: 'A Frota gera acesso só de motoristas.' }, 403)
  if (!alvo.cpf && !alvo.login) return resposta({ erro: 'Cadastre o CPF da pessoa antes de gerar o acesso. O CPF é o login.' }, 400)
  if (alvo.situacao === 'desligado') return resposta({ erro: 'Usuário desligado não recebe acesso.' }, 400)

  const email = `${alvo.cpf ?? alvo.login}@frota.local`
  const senha = senhaProvisoria()
  let authId = alvo.auth_user_id as string | null

  if (authId) {
    const { error } = await admin.auth.admin.updateUserById(authId, { email, password: senha, email_confirm: true })
    if (error) return resposta({ erro: `Não foi possível redefinir a senha: ${error.message}` }, 500)
  } else {
    const { data, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome: alvo.nome } })
    if (error) return resposta({ erro: `Não foi possível criar o acesso: ${error.message}` }, 500)
    authId = data.user.id
  }

  const { error: erroVinculo } = await admin.from('usuarios').update({ auth_user_id: authId, precisa_trocar_senha: true }).eq('id', alvo.id)
  if (erroVinculo) return resposta({ erro: `Acesso criado, mas não foi possível ligar ao cadastro: ${erroVinculo.message}` }, 500)

  return resposta({ login: alvo.cpf ? cpfFormatado(alvo.cpf) : alvo.login, senha })
})

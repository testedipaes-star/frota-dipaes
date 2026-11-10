import { useState, type FormEvent, type ReactNode } from 'react'
import logo from '@/assets/logo-dipaes.png'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, Input, Aviso } from '@/components/ui/misc'
import { entrar } from '@/lib/api'
import { formatarCpf } from '@/lib/utils'
import { PREVIA, definirDemo } from '@/lib/supabase'

export function LoginShell({ titulo, apoio, children }: { titulo: string; apoio: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-card md:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-login-from to-login-to p-[55px] text-white md:flex md:flex-col">
        <div className="absolute -left-24 -top-24 size-80 rounded-full bg-white/12" />
        <div className="absolute -bottom-48 -right-48 size-[520px] rounded-full bg-white/12" />
        <div className="absolute -left-40 top-[42%] h-40 w-[160%] -rotate-[13deg] border-y-[28px] border-white/16" />
        <img src={logo} alt="Dipães do Brasil" className="relative w-[130px]" />
        <div className="relative mt-auto max-w-md">
          <p className="font-heading text-[35px] font-bold leading-[1.1]">Todo veículo conferido antes de sair.</p>
          <p className="mt-3 text-sm opacity-90">Checklist diário no celular, liberação pela Frota e pendências no 5W2H, em um único lugar.</p>
        </div>
      </div>
      <div className="flex items-center justify-center px-6 py-10 md:p-[55px]">
        <div className="w-full max-w-[360px]">
          <div className="mb-8 flex items-center gap-3">
            <div className="rounded-lg bg-primary px-2.5 py-1.5">
              <img src={logo} alt="Dipães do Brasil" className="w-[76px]" />
            </div>
            <span className="text-xs tracking-[1px] text-muted-foreground">Checklist de Frota</span>
          </div>
          <h1 className="font-heading text-[28px] font-bold leading-tight">{titulo}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{apoio}</p>
          <div className="mt-6">{children}</div>
          <p className="mt-8 text-center text-xs text-muted-foreground">Acesso exclusivo para equipe autorizada • Dipães do Brasil</p>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  const [login, setLogin] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    if (!login.trim() || !senha) return setErro('Preencha o CPF e a senha.')
    setEnviando(true)
    try {
      await entrar(login, senha)
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <LoginShell titulo="Bem-vindo" apoio="Entre com seus dados para acessar o sistema.">
      <form onSubmit={enviar} className="flex flex-col gap-4">
        <Field label="CPF" ajuda="Digite só os números do seu CPF.">
          <Input
            value={login}
            onChange={(e) => setLogin(/[a-z]/i.test(e.target.value) ? e.target.value : formatarCpf(e.target.value))}
            inputMode="numeric"
            autoComplete="username"
            autoCapitalize="none"
            placeholder="000.000.000-00"
          />
        </Field>
        <Field label="Senha">
          <Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" placeholder="••••••••" />
        </Field>
        {erro && <Aviso tom="destructive">{erro}</Aviso>}
        <Button type="submit" size="lg" className="w-full" loading={enviando}>
          {enviando ? 'Entrando…' : 'Entrar no sistema'}
          {!enviando && <ArrowRight />}
        </Button>
        <p className="text-center text-xs text-muted-foreground">Esqueceu a senha? Peça uma nova senha provisória à Frota.</p>
      </form>
      {PREVIA && (
        <div className="mt-6 flex flex-col gap-2 rounded-xl border border-info-border bg-info-bg p-4">
          <p className="text-sm font-semibold text-info">Prévia com dados de exemplo</p>
          <p className="text-xs text-info">Nenhum dado real é usado e nada é salvo. Escolha como entrar:</p>
          <div className="mt-1 grid grid-cols-3 gap-2">
            <Button type="button" variant="outline" onClick={() => definirDemo('motorista')}>
              Motorista
            </Button>
            <Button type="button" variant="outline" onClick={() => definirDemo('frota')}>
              Frota
            </Button>
            <Button type="button" variant="outline" onClick={() => definirDemo('gestor')}>
              Gestor
            </Button>
          </div>
        </div>
      )}
    </LoginShell>
  )
}

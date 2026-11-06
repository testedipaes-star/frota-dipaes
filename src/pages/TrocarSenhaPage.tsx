import { useState, type FormEvent } from 'react'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Aviso, Field, Input } from '@/components/ui/misc'
import { sair, trocarSenha } from '@/lib/api'
import { useSessao } from '@/lib/sessao'
import { LoginShell } from './LoginPage'

export default function TrocarSenhaPage() {
  const { usuario, recarregar } = useSessao()
  const [nova, setNova] = useState('')
  const [confirma, setConfirma] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro('')
    if (nova.length < 6) return setErro('A senha precisa ter pelo menos 6 caracteres.')
    if (nova !== confirma) return setErro('As duas senhas não são iguais.')
    setEnviando(true)
    try {
      await trocarSenha(nova)
      await recarregar()
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <LoginShell titulo="Crie sua senha" apoio={`Olá, ${usuario?.nome.split(' ')[0] ?? ''}. Troque a senha provisória por uma só sua.`}>
      <form onSubmit={enviar} className="flex flex-col gap-4">
        <Field label="Nova senha" ajuda="Pelo menos 6 caracteres.">
          <Input type="password" value={nova} onChange={(e) => setNova(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label="Repita a nova senha">
          <Input type="password" value={confirma} onChange={(e) => setConfirma(e.target.value)} autoComplete="new-password" />
        </Field>
        {erro && <Aviso tom="destructive">{erro}</Aviso>}
        <Button type="submit" size="lg" className="w-full" loading={enviando}>
          {enviando ? 'Salvando…' : 'Salvar senha'}
          {!enviando && <ArrowRight />}
        </Button>
        <Button type="button" variant="ghost" onClick={sair}>
          Sair
        </Button>
      </form>
    </LoginShell>
  )
}

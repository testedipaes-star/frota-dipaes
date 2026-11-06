import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Data de hoje no horário de Brasília, no formato AAAA-MM-DD. */
export function hojeSP(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

export function somarDias(iso: string, dias: number): string {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5)
}

export function dataBR(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export function diaMes(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}`
}

export function horaBR(ts: string | null | undefined): string {
  if (!ts) return '—'
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(ts))
}

export function dataHoraBR(ts: string | null | undefined): string {
  if (!ts) return '—'
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(ts))
}

export function duracao(seg: number | null | undefined): string {
  if (seg == null) return '—'
  const m = Math.floor(seg / 60)
  const s = seg % 60
  return m ? `${m} min ${String(s).padStart(2, '0')} s` : `${s} s`
}

export const km = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('pt-BR') + ' km')

export const soDigitos = (s: string) => s.replace(/\D/g, '')

export function cpfValido(cpf: string): boolean {
  const c = soDigitos(cpf)
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false
  const dv = (n: number) => {
    let s = 0
    for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i)
    const d = 11 - (s % 11)
    return d >= 10 ? 0 : d
  }
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10])
}

export function formatarCpf(v: string): string {
  const c = soDigitos(v).slice(0, 11)
  return c
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4')
}

export function cpfOculto(cpf: string | null | undefined): string {
  if (!cpf) return ''
  const c = soDigitos(cpf)
  return c.length === 11 ? `***.${c.slice(3, 6)}.${c.slice(6, 9)}-**` : ''
}

/** Login = CPF (ou texto, para o administrador inicial), convertido no e-mail interno do Supabase Auth. */
export function loginParaEmail(login: string): string {
  const t = login.trim().toLowerCase()
  const base = /^[\d.\-\s]+$/.test(t) ? soDigitos(t) : t.replace(/[^a-z0-9._-]/g, '')
  return `${base}@frota.local`
}

/** Placa sem traço e maiúscula: abc-1d23 → ABC1D23 */
export const normalizarPlaca = (p: string) => p.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7)
export const placaValida = (p: string) => /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(p)
/** ABC1D23 → ABC-1D23 */
export const placaBR = (p: string) => (p.length === 7 ? `${p.slice(0, 3)}-${p.slice(3)}` : p)

export function uuid(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
    })
  }
}

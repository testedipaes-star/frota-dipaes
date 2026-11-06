import { forwardRef, type InputHTMLAttributes, type LabelHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type HTMLAttributes } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'h-9 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:bg-background/50 disabled:opacity-50',
      className,
    )}
    {...props}
  />
))
Input.displayName = 'Input'

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'h-9 w-full rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50',
      className,
    )}
    {...props}
  >
    {children}
  </select>
))
Select.displayName = 'Select'

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-sm font-medium leading-none', className)} {...props} />
}

export function Field({ label, children, erro, ajuda }: { label: string; children: ReactNode; erro?: string; ajuda?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
      {ajuda && !erro && <span className="text-xs text-muted-foreground">{ajuda}</span>}
      {erro && <span className="text-xs text-destructive">{erro}</span>}
    </div>
  )
}

type Tom = 'default' | 'secondary' | 'outline' | 'destructive' | 'success' | 'warning' | 'info'
const TOM: Record<Tom, string> = {
  default: 'bg-primary text-primary-foreground border-transparent',
  secondary: 'bg-muted text-foreground border-transparent',
  outline: 'bg-card border-border text-foreground',
  destructive: 'bg-destructive/10 text-destructive border-destructive/20',
  success: 'bg-success-bg text-success border-success-border',
  warning: 'bg-warning-bg text-warning border-warning-border',
  info: 'bg-info-bg text-info border-info-border',
}

export function Badge({ tom = 'secondary', ponto, className, children }: { tom?: Tom; ponto?: boolean; className?: string; children: ReactNode }) {
  return (
    <span className={cn('inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-semibold', TOM[tom], className)}>
      {ponto && <span className="size-[7px] rounded-full bg-current" />}
      {children}
    </span>
  )
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-xl border border-border bg-card', className)} {...props} />
}

type TomStat = 'neutro' | 'success' | 'warning' | 'info' | 'destructive'
const STAT: Record<TomStat, string> = {
  neutro: 'bg-card border-border text-foreground',
  success: 'bg-success-bg border-success-border text-success',
  warning: 'bg-warning-bg border-warning-border text-warning',
  info: 'bg-info-bg border-info-border text-info',
  destructive: 'bg-destructive/5 border-destructive/20 text-destructive',
}

export function StatCard({ rotulo, valor, legenda, icone, tom = 'neutro' }: { rotulo: string; valor: ReactNode; legenda: string; icone: ReactNode; tom?: TomStat }) {
  return (
    <div className={cn('rounded-xl border p-4', STAT[tom])}>
      <div className="flex items-center justify-between text-xs font-semibold [&_svg]:size-4">
        {rotulo}
        {icone}
      </div>
      <div className={cn('stat-value mt-2 tabular-nums', tom === 'neutro' && 'text-primary')}>{valor}</div>
      <div className="text-[11px] leading-4 text-muted-foreground">{legenda}</div>
    </div>
  )
}

export function Dialog({ aberto, onFechar, titulo, children, largura = 'max-w-lg' }: { aberto: boolean; onFechar: () => void; titulo: string; children: ReactNode; largura?: string }) {
  if (!aberto) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onMouseDown={onFechar}>
      <div
        role="dialog"
        aria-modal="true"
        className={cn('max-h-[92vh] w-full overflow-y-auto rounded-t-xl border border-border bg-card sm:rounded-xl', largura)}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-bold">{titulo}</h2>
          <button onClick={onFechar} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-primary" aria-label="Fechar">
            <X className="size-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function PageHeader({ titulo, apoio, acoes }: { titulo: string; apoio?: string; acoes?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="page-title">{titulo}</h1>
        {apoio && <p className="mt-1 text-xs text-muted-foreground">{apoio}</p>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  )
}

export function Aviso({ tom = 'info', children }: { tom?: 'info' | 'warning' | 'success' | 'destructive'; children: ReactNode }) {
  const c = {
    info: 'bg-info-bg border-info-border text-info',
    warning: 'bg-warning-bg border-warning-border text-warning',
    success: 'bg-success-bg border-success-border text-success',
    destructive: 'bg-destructive/5 border-destructive/20 text-destructive',
  }[tom]
  return <div className={cn('rounded-lg border px-3 py-2.5 text-sm', c)}>{children}</div>
}

export function Vazio({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-border-strong bg-card px-4 py-10 text-center text-sm text-muted-foreground">{children}</div>
}

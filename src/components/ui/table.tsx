import { useEffect, useRef, useState, type HTMLAttributes, type TdHTMLAttributes, type ThHTMLAttributes } from 'react'
import { MoveHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Tabela com rolagem lateral. No celular, quando há colunas escondidas à direita,
 * mostra um aviso "deslize para o lado" e um degradê na borda, que somem ao chegar no fim.
 */
export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  const caixa = useRef<HTMLDivElement>(null)
  const [maisADireita, setMaisADireita] = useState(false)
  const [rolavel, setRolavel] = useState(false)

  useEffect(() => {
    const el = caixa.current
    if (!el) return
    const medir = () => {
      const sobra = el.scrollWidth - el.clientWidth
      setRolavel(sobra > 4)
      setMaisADireita(sobra - el.scrollLeft > 4)
    }
    medir()
    el.addEventListener('scroll', medir, { passive: true })
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => {
      el.removeEventListener('scroll', medir)
      ro.disconnect()
    }
  }, [])

  return (
    <div className="w-full">
      {rolavel && (
        <p className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground lg:hidden">
          <MoveHorizontal className="size-3.5" /> Deslize a tabela para o lado para ver todas as colunas.
        </p>
      )}
      <div className="relative">
        <div ref={caixa} className="w-full overflow-x-auto overscroll-x-contain rounded-xl border border-border bg-card [-webkit-overflow-scrolling:touch]">
          <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
        </div>
        {maisADireita && <div className="pointer-events-none absolute inset-y-px right-px w-10 rounded-r-xl bg-gradient-to-l from-card to-transparent" />}
      </div>
    </div>
  )
}
export function THead(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className="bg-surface-subtle" {...props} />
}
export function TBody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className="[&_tr:last-child]:border-0" {...props} />
}
export function TR({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('border-b border-border transition-colors hover:bg-surface-subtle', className)} {...props} />
}
export function TH({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn('h-10 whitespace-nowrap px-3 text-left align-middle text-xs font-semibold text-muted-foreground', className)} {...props} />
}
export function TD({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-3 py-2.5 align-middle', className)} {...props} />
}

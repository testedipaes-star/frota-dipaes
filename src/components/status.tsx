import { Badge } from '@/components/ui/misc'
import type { Liberacao, Resultado, StatusPendencia } from '@/lib/tipos'
import { STATUS_LABEL } from '@/lib/tipos'

const RES: Record<Resultado, { rotulo: string; tom: 'success' | 'warning' | 'destructive' }> = {
  liberado: { rotulo: 'Liberado', tom: 'success' },
  ressalva: { rotulo: 'Liberado com ressalva', tom: 'warning' },
  nao_liberado: { rotulo: 'Não liberado', tom: 'destructive' },
}

export function ResultadoBadge({ r, liberacao }: { r: Resultado | null; liberacao?: Liberacao | null }) {
  if (!r) return <Badge tom="outline">Sem checklist</Badge>
  if (r === 'nao_liberado' && liberacao === 'liberado') return <Badge tom="success" ponto>Liberado pela Frota</Badge>
  if (r === 'nao_liberado' && liberacao === 'aguardando') return <Badge tom="destructive" ponto>Aguardando Frota</Badge>
  if (r === 'nao_liberado' && liberacao === 'mantido_bloqueado') return <Badge tom="destructive" ponto>Bloqueado</Badge>
  return (
    <Badge tom={RES[r].tom} ponto>
      {RES[r].rotulo}
    </Badge>
  )
}

const ST: Record<StatusPendencia, string> = {
  nao_iniciada: 'bg-[#e6e6e6] text-foreground border-transparent',
  andamento: 'bg-[#ffd966] text-foreground border-transparent',
  standby: 'bg-[#cfe2f3] text-foreground border-transparent',
  concluida: 'bg-[#c6e0b4] text-foreground border-transparent',
  cancelada: 'bg-[#d9d9d9] text-muted-foreground border-transparent',
}

export function StatusPendenciaBadge({ s, atrasada }: { s: StatusPendencia; atrasada?: boolean }) {
  if (atrasada) return <Badge className="border-transparent bg-[#ff9a9c] text-foreground">Atrasada</Badge>
  return <Badge className={ST[s]}>{STATUS_LABEL[s]}</Badge>
}

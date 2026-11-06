/**
 * Rascunho e fila de envio no próprio celular (IndexedDB, guarda as fotos também).
 * O checklist é salvo a cada toque; se o envio falhar por falta de internet, fica na fila e é reenviado sozinho.
 */
import { enviarChecklist, enviarFoto, meuAuthId, SemRede, type PayloadChecklist } from './api'
import type { RetornoEnvio, TipoVeiculo } from './tipos'

export interface FotoRascunho {
  id: string
  blob: Blob
  caminho?: string // preenchido depois de enviada
}

export interface Rascunho {
  id: string
  veiculo_id: string
  placa: string
  tipo: TipoVeiculo
  iniciado_em: string
  atualizado_em: string
  km_saida: string
  km_confirmado?: boolean
  combustivel: string
  rota: string
  temp_saida: string
  observacoes: string
  respostas: Record<string, { resposta: 'ok' | 'nok'; descricao?: string }>
  fotos: Record<string, FotoRascunho[]>
  numeros: Record<string, number> // item_id → nº do item (para o nome do arquivo)
  estado: 'editando' | 'na_fila'
  erro?: string
  motorista_id?: string // folha de papel lançada pela Frota
  data?: string
}

const BANCO = 'frota-dipaes'
const LOJA = 'rascunhos'
let memoria: Map<string, Rascunho> | null = null // sem IndexedDB (navegador privado): só em memória

function abrir(): Promise<IDBDatabase | null> {
  return new Promise((ok) => {
    try {
      const req = indexedDB.open(BANCO, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(LOJA, { keyPath: 'id' })
      req.onsuccess = () => ok(req.result)
      req.onerror = () => ok(null)
    } catch {
      ok(null)
    }
  })
}

async function loja<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const db = await abrir()
  if (!db) return undefined
  return new Promise((ok, erro) => {
    const tx = db.transaction(LOJA, modo)
    const req = fn(tx.objectStore(LOJA))
    tx.oncomplete = () => ok(req.result)
    tx.onerror = () => erro(tx.error)
  })
}

export async function salvarRascunho(r: Rascunho) {
  r.atualizado_em = new Date().toISOString()
  const feito = await loja('readwrite', (s) => s.put(r)).then(() => true, () => false)
  if (!feito || memoria) (memoria ??= new Map()).set(r.id, r)
}

export async function lerRascunhos(): Promise<Rascunho[]> {
  const todos = ((await loja('readonly', (s) => s.getAll() as IDBRequest<Rascunho[]>).catch(() => undefined)) ?? []) as Rascunho[]
  const mem = memoria ? [...memoria.values()] : []
  const mapa = new Map([...todos, ...mem].map((r) => [r.id, r]))
  return [...mapa.values()].sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em))
}

export async function apagarRascunho(id: string) {
  await loja('readwrite', (s) => s.delete(id)).catch(() => undefined)
  memoria?.delete(id)
}

export function payloadDe(r: Rascunho): PayloadChecklist {
  return {
    id: r.id,
    veiculo_id: r.veiculo_id,
    iniciado_em: r.iniciado_em,
    km_saida: Number(r.km_saida),
    km_confirmado: r.km_confirmado,
    combustivel: r.combustivel,
    rota: r.rota,
    temp_saida: r.temp_saida.trim() === '' ? null : Number(r.temp_saida.replace(',', '.')),
    observacoes: r.observacoes,
    respostas: Object.entries(r.respostas).map(([item_id, v]) => ({ item_id, resposta: v.resposta, descricao: v.resposta === 'nok' ? v.descricao : undefined })),
    fotos: Object.entries(r.fotos).flatMap(([item_id, fs]) => fs.filter((f) => f.caminho).map((f) => ({ item_id, caminho: f.caminho! }))),
    motorista_id: r.motorista_id,
    data: r.data,
  }
}

/** Sobe as fotos que faltam e envia o checklist. Sem internet: guarda na fila e lança SemRede. */
export async function enviarRascunho(r: Rascunho, progresso?: (feitas: number, total: number) => void): Promise<RetornoEnvio> {
  try {
    const auth = await meuAuthId()
    const todas = Object.entries(r.fotos).flatMap(([item, fs]) => fs.map((f, i) => ({ item, f, i })))
    let feitas = todas.filter((x) => x.f.caminho).length
    progresso?.(feitas, todas.length)
    for (const { item, f, i } of todas) {
      if (f.caminho) continue
      const caminho = `${auth}/${r.id}/${r.numeros[item] ?? 0}-${i + 1}-${f.id.slice(0, 6)}.jpg`
      await enviarFoto(caminho, f.blob)
      f.caminho = caminho
      await salvarRascunho(r)
      progresso?.(++feitas, todas.length)
    }
    const ret = await enviarChecklist(payloadDe(r))
    await apagarRascunho(r.id)
    return ret
  } catch (e) {
    if (e instanceof SemRede || (e as { semRede?: boolean }).semRede) {
      r.estado = 'na_fila'
      r.erro = undefined
      await salvarRascunho(r)
    } else {
      r.estado = 'editando'
      r.erro = (e as Error).message
      await salvarRascunho(r)
    }
    throw e
  }
}

/** Tenta reenviar o que está na fila. Devolve quantos foram enviados. */
export async function processarFila(): Promise<{ enviados: RetornoEnvio[]; restantes: number }> {
  const fila = (await lerRascunhos()).filter((r) => r.estado === 'na_fila')
  const enviados: RetornoEnvio[] = []
  for (const r of fila) {
    try {
      enviados.push(await enviarRascunho(r))
    } catch {
      /* continua na fila ou voltou para edição com o erro */
    }
  }
  const restantes = (await lerRascunhos()).filter((r) => r.estado === 'na_fila').length
  return { enviados, restantes }
}

/**
 * Excel 5W2H no layout do Quadro de Ações (planilha do Edson): cabeçalho, faixas PLAN/DO/CHECK/ACTION,
 * 15 colunas e status com lista de seleção.
 */
import type { ConfigPlano, EventoPendencia, Pendencia } from './tipos'
import { ABERTAS } from './tipos'

const STX = { nao_iniciada: 'Não iniciada', andamento: 'Em andamento', standby: 'Stand-by', concluida: 'Concluída', cancelada: 'Cancelada' } as const
const ORD = { andamento: 0, standby: 1, nao_iniciada: 2, concluida: 3, cancelada: 4 } as const
const STFILL: Record<string, string> = {
  'Não iniciada': 'FFD9D9D9', 'Em andamento': 'FFFFC000', 'Stand-by': 'FFBDD7EE', Atrasada: 'FFFF7C80', 'Concluída': 'FFA9D08E', Cancelada: 'FFBFBFBF',
}

const dataPlanilha = (iso: string | null) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(2, 4)}` : '')

export async function exportar5W2H(pendencias: Pendencia[], notas: EventoPendencia[], plano: ConfigPlano, hoje: string): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = plano.responsavel
  const ws = wb.addWorksheet('Plano de Ação - 5W2H', {
    views: [{ state: 'frozen', ySplit: 7 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
  })
  ws.columns = [55.8, 13, 41, 13.3, 13, 15.3, 24, 13, 15.3, 13, 17.1, 31.2, 31, 31, 13].map((w) => ({ width: w }))
  const DARK = 'FF333333', GOLD = 'FFFFCC00', SUB = 'FFFFFF99', GREY = 'FFC0C0C0'
  const thin = { style: 'thin' as const, color: { argb: 'FF808080' } }
  const B = { top: thin, left: thin, bottom: thin, right: thin }
  const head = (addr: string, val: string, o: { size?: number; fill?: string; color?: string; h?: 'center' | 'left' } = {}) => {
    const { size = 11, fill = DARK, color = GOLD, h = 'center' } = o
    const c = ws.getCell(addr)
    c.value = val
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
    c.font = { bold: true, size, color: { argb: color }, name: 'Arial' }
    c.alignment = { horizontal: h, vertical: 'middle', wrapText: true }
    c.border = B
  }
  ws.mergeCells('A1:H2')
  head('A1', 'PLANO DE AÇÃO – 5W2H', { size: 20 })
  ws.mergeCells('I1:O2')
  head('I1', '')
  head('A3', 'Objetivo ou título do plano de ação:', { size: 12, h: 'left' })
  ws.mergeCells('B3:H3')
  head('B3', plano.objetivo, { size: 10, fill: GREY, color: 'FF000000', h: 'left' })
  head('A4', 'Responsável pelo plano:', { size: 12, h: 'left' })
  ws.mergeCells('B4:D4')
  head('B4', plano.responsavel.toUpperCase(), { size: 10, fill: 'FFFFFFFF', color: 'FF000000', h: 'left' })
  head('E4', 'Atualizado em:', { size: 10, h: 'left' })
  head('F4', dataPlanilha(hoje), { size: 10, fill: 'FFFFFFFF', color: 'FF000000' })
  ws.mergeCells('A5:I5')
  head('A5', 'PLAN (planejar)')
  ws.mergeCells('J5:K5')
  head('J5', 'DO (fazer)')
  ws.mergeCells('L5:M5')
  head('L5', 'CHECK (verificar)')
  head('N5', 'ACTION (agir)')
  head('O5', '')
  const h6 = ['O que fazer?', 'Setor?', 'Por que?', 'Quem?', '', 'Onde?', 'Como?', 'Quanto?', 'Quando?', 'Quando?', 'STATUS', 'Resultados Alcançados', 'Problemas Ocorridos', 'Propostas de Novas Ações', 'Quando?']
  const h7 = ['AÇÃO', 'Setor Responsável', 'Motivo', 'Responsável', 'Envolvidos', 'Local', 'Método, ferramentas, consultoria, etc.', 'Valor', 'Data inicio prevista', 'Data finalizada', 'Selecionar', 'Ao final de cada ação', 'Durante a execução da ação', 'Se precisar: ações para um outro plano', 'Prazo']
  h6.forEach((v, i) => head(ws.getCell(6, i + 1).address, v))
  ws.mergeCells('D6:E6')
  h7.forEach((v, i) => head(ws.getCell(7, i + 1).address, v, { size: 10, fill: SUB, color: 'FF000000' }))
  ws.getRow(3).height = 24
  ws.getRow(4).height = 30
  ws.getRow(5).height = 27.75
  ws.getRow(7).height = 48.75

  const notasDe = (id: string, t: string) =>
    notas
      .filter((n) => n.pendencia_id === id && n.nota_tipo === t)
      .slice()
      .reverse()
      .map((n) => `${dataPlanilha(n.data).slice(0, 5)} – ${n.texto}`)
      .join('\n')
  const lista = pendencias.slice().sort((a, b) => ORD[a.status] - ORD[b.status] || (a.prazo ?? '9').localeCompare(b.prazo ?? '9'))
  lista.forEach((p, i) => {
    const r = 8 + i
    let st: string = STX[p.status]
    const atrasada = ABERTAS.includes(p.status) && p.status !== 'standby' && !!p.prazo && p.prazo < hoje
    if (atrasada) st = 'Atrasada'
    const vals = [p.oque, 'Frota', p.porque, p.responsavel, p.envolvidos || '-', p.onde || '-', p.como || '-', p.quanto || '-', dataPlanilha(p.inicio), p.status === 'concluida' ? dataPlanilha(p.fim) : '', st, notasDe(p.id, 'resultado'), notasDe(p.id, 'problema'), notasDe(p.id, 'proximo'), dataPlanilha(p.prazo)]
    vals.forEach((v, j) => {
      const c = ws.getCell(r, j + 1)
      c.value = v ?? ''
      c.font = { size: 10, name: 'Arial', bold: j === 0 }
      c.alignment = { vertical: 'top', horizontal: [8, 9, 10, 14].includes(j) ? 'center' : 'left', wrapText: true }
      c.border = B
    })
    const k = ws.getCell(r, 11)
    k.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STFILL[st] ?? 'FFFFFFFF' } }
    k.dataValidation = { type: 'list', allowBlank: true, formulae: ['"Não iniciada,Em andamento,Stand-by,Atrasada,Concluída,Cancelada"'] }
    if (atrasada) ws.getCell(r, 15).font = { size: 10, name: 'Arial', bold: true, color: { argb: 'FFC00000' } }
  })
  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

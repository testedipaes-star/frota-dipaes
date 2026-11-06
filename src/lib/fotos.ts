/** Reduz a foto do celular para no máximo 1280 px e JPEG 65% (cerca de 150 KB) e devolve como Blob. */
export async function comprimirFoto(arquivo: File, maximo = 1280, qualidade = 0.65): Promise<Blob> {
  const url = URL.createObjectURL(arquivo)
  try {
    const img = await new Promise<HTMLImageElement>((ok, erro) => {
      const i = new Image()
      i.onload = () => ok(i)
      i.onerror = () => erro(new Error('Não foi possível abrir a foto.'))
      i.src = url
    })
    const escala = Math.min(1, maximo / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.round(img.width * escala)
    c.height = Math.round(img.height * escala)
    const ctx = c.getContext('2d')!
    ctx.drawImage(img, 0, 0, c.width, c.height)
    // carimbo de data e hora no canto da foto
    const carimbo = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(new Date())
    const fs = Math.max(14, Math.round(c.width / 40))
    ctx.font = `600 ${fs}px sans-serif`
    const w = ctx.measureText(carimbo).width + fs
    ctx.fillStyle = 'rgba(0,0,0,.55)'
    ctx.fillRect(c.width - w - 8, c.height - fs * 1.8 - 8, w, fs * 1.8)
    ctx.fillStyle = '#fff'
    ctx.fillText(carimbo, c.width - w - 8 + fs / 2, c.height - 8 - fs * 0.55)
    return await new Promise<Blob>((ok, erro) => c.toBlob((b) => (b ? ok(b) : erro(new Error('Não foi possível preparar a foto.'))), 'image/jpeg', qualidade))
  } finally {
    URL.revokeObjectURL(url)
  }
}

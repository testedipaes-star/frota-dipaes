# Checklist de Frota Dipães

O motorista faz o checklist diário do veículo no celular, antes da primeira saída. NOK em item crítico (▲) bloqueia o veículo até a Frota liberar; todo NOK vira pendência, e as pendências ficam num quadro de post-its que exporta o 5W2H no layout do plano de ação.

Escopo completo: documento "Checklist de Frota Dipães — Escopo do Sistema" (06/11/2026).

## Stack

Vite + React + TypeScript + Tailwind v4 + lucide-react (PWA instalável), Supabase (Postgres, Auth, Storage, Edge Function) e Cloudflare (Workers com arquivos estáticos). Visual: Padrão Visual Dipães (tokens em `src/index.css`, Dosis + Inter). Mesma base do Check Loja.

## Banco (Supabase `Frota-Dipaes`, região sa-east-1)

- `supabase/migrations/` — schema, 111 itens da planilha (41 baú, 44 frigorífico, 26 leve), regras de acesso (RLS) e funções.
- `supabase/tests/envio.sql` — 14 testes de aceite do banco. Termina com um erro proposital que desfaz os dados; a mensagem esperada é `RESULTADO 14 de 14 ok`.
- `supabase/functions/admin-usuarios` — gera login e senha provisória (só administrador).
- `scripts/gerar_itens.py` — gera a carga de itens a partir da aba Itens da planilha.

### Regras (todas no banco, função `enviar_checklist`)

- Todos OK = Liberado. NOK só em item comum = Liberado com ressalva. NOK em item crítico = Não liberado, aguardando a Frota.
- Recusa checklist com item sem resposta, NOK sem descrição ou foto, item de foto obrigatória sem foto.
- Km de saída não pode ser menor que o último do veículo; salto acima de 1.500 km pede confirmação.
- Todo NOK gera pendência; se já há pendência aberta da mesma placa e item, soma ocorrência.
- Prazo automático: crítico no mesmo dia, comum em 7 dias (ajustável em `config.regras`).
- OK em item com pendência aberta anota "marcado OK" para a Frota conferir.
- O checklist guarda o texto e a criticidade do item no dia; mudar o item não altera o histórico.
- Reenvio do mesmo checklist (mesmo código) não duplica.

Fotos: pasta privada `checklist-fotos/<usuário>/<checklist>/<nº do item>-<n>.jpg`, reduzidas no celular para 1.280 px (cerca de 150 KB) com carimbo de data e hora.

## App

```bash
npm install
npm run dev     # http://localhost:5173 — ?demo=motorista ou ?demo=frota mostra dados de exemplo (só em dev)
npm run build   # gera dist/ (PWA)
npm run build:previa  # prévia em um único HTML, com dados de exemplo
```

- Login por CPF: o app converte o CPF em `<cpf>@frota.local` no Supabase Auth. O administrador inicial entra com o login `admin`.
- Motorista: tela "Novo checklist" → veículo → saída, itens, fotos → resultado. Rascunho e fila de envio ficam no celular (IndexedDB): sem internet, o checklist é enviado sozinho depois.
- Frota e administrador: Hoje (liberação), Pendências (quadro e tabela 5W2H, Exportar Excel), Histórico, Veículos, Itens; Usuários só para o administrador.
- Contingência: "Lançar folha de papel" na tela Hoje.

### Publicação (Cloudflare)

Workers & Pages → Create → importar o repositório `frota-dipaes`. Build command `npm run build`, deploy command `npx wrangler deploy`.
As variáveis públicas do Supabase vêm do `.env.production`; não é preciso cadastrá-las no Cloudflare.

## Fases

1 Base ✅ · 2 App do motorista ✅ · 3 Painel e liberação ✅ · 4 Pendências e 5W2H ✅ · 5 Piloto com os caminhões baú.

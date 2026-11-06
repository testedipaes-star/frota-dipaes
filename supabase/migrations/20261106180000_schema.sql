-- Checklist de Frota Dipães — schema
-- Escopo: documento "Checklist de Frota Dipães — Escopo do Sistema" (06/11/2026).

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- Tipos ---------------------------------------------------------------
create type public.perfil as enum ('motorista', 'frota', 'admin');
create type public.situacao_usuario as enum ('ativo', 'afastado', 'desligado');
create type public.tipo_veiculo as enum ('bau', 'frigorifico', 'leve');
create type public.resposta as enum ('ok', 'nok');
create type public.resultado as enum ('liberado', 'ressalva', 'nao_liberado');
create type public.liberacao as enum ('nao_precisa', 'aguardando', 'liberado', 'mantido_bloqueado');
create type public.status_pendencia as enum ('nao_iniciada', 'andamento', 'standby', 'concluida', 'cancelada');

-- Data de hoje em Brasília
create or replace function private.hoje() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

-- Cadastros -----------------------------------------------------------
create table public.usuarios (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  nome text not null check (length(trim(nome)) >= 3),
  cpf text unique check (cpf is null or cpf ~ '^[0-9]{11}$'),
  login text unique check (login is null or login ~ '^[a-z0-9._-]{3,}$'),
  perfil public.perfil not null default 'motorista',
  situacao public.situacao_usuario not null default 'ativo',
  telefone text,
  precisa_trocar_senha boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.usuarios.cpf is 'CPF só com dígitos. É o login (cpf@frota.local).';
comment on column public.usuarios.login is 'Login em texto, só para quem ainda não tem CPF cadastrado (ex.: administrador inicial).';

create table public.veiculos (
  id uuid primary key default gen_random_uuid(),
  placa text not null unique check (placa ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
  modelo text,
  tipo public.tipo_veiculo not null,
  ativo boolean not null default true,
  km_atual integer check (km_atual >= 0),
  observacao text,
  created_at timestamptz not null default now()
);
comment on column public.veiculos.placa is 'Placa sem traço, maiúscula (padrão antigo ABC1234 ou Mercosul ABC1D23).';

create table public.itens (
  id uuid primary key default gen_random_uuid(),
  tipo public.tipo_veiculo not null,
  numero smallint not null check (numero > 0),
  grupo text not null,
  texto text not null,
  critico boolean not null default false,
  foto_obrigatoria boolean not null default false,
  ativo boolean not null default true,
  unique (tipo, numero)
);
comment on column public.itens.foto_obrigatoria is 'Item de verificação externa: exige foto mesmo quando OK.';

create table public.config (
  chave text primary key,
  valor jsonb not null
);
insert into public.config (chave, valor) values
  ('plano', '{"objetivo": "Pendências da frota — checklist diário de veículos", "responsavel": "Frota", "setor": "Frota"}'),
  ('regras', '{"prazo_critico_dias": 0, "prazo_comum_dias": 7, "salto_km": 1500, "tempo_minimo_seg": 120}');

-- Checklists ----------------------------------------------------------
create table public.checklists (
  id uuid primary key,                      -- gerado no celular: reenvio do mesmo checklist não duplica
  veiculo_id uuid not null references public.veiculos(id),
  motorista_id uuid not null references public.usuarios(id),
  tipo public.tipo_veiculo not null,        -- cópia do dia
  placa text not null,                      -- cópia do dia
  data date not null default private.hoje(),
  origem text not null default 'app' check (origem in ('app', 'papel')),
  lancado_por uuid references public.usuarios(id),
  iniciado_em timestamptz,
  enviado_em timestamptz not null default now(),
  duracao_seg integer,
  km_saida integer not null check (km_saida >= 0),
  combustivel text not null check (combustivel in ('Reserva', '1/4', '1/2', '3/4', 'Cheio')),
  rota text,
  temp_saida numeric(4,1),
  observacoes text,
  km_retorno integer,
  temp_retorno numeric(4,1),
  retorno_em timestamptz,
  resultado public.resultado not null,
  qtd_nok smallint not null default 0,
  qtd_nok_critico smallint not null default 0,
  liberacao public.liberacao not null,
  liberado_por uuid references public.usuarios(id),
  liberado_em timestamptz,
  obs_liberacao text,
  check (km_retorno is null or km_retorno >= km_saida)
);
create index on public.checklists (data desc);
create index on public.checklists (veiculo_id, data desc);
create index on public.checklists (motorista_id, data desc);
create index on public.checklists (liberacao) where liberacao = 'aguardando';

create table public.respostas (
  checklist_id uuid not null references public.checklists(id) on delete cascade,
  item_id uuid not null references public.itens(id),
  numero smallint not null,
  grupo text not null,
  texto text not null,
  critico boolean not null,
  foto_obrigatoria boolean not null,
  resposta public.resposta not null,
  descricao text,
  primary key (checklist_id, item_id),
  check (resposta = 'ok' or length(trim(coalesce(descricao, ''))) >= 3)
);
create index on public.respostas (item_id);

create table public.fotos (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.checklists(id) on delete cascade,
  item_id uuid references public.itens(id),
  caminho text not null unique,
  criado_em timestamptz not null default now()
);
create index on public.fotos (checklist_id);

-- Pendências (5W2H) ---------------------------------------------------
create table public.pendencias (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references public.veiculos(id),
  item_id uuid references public.itens(id),       -- nulo = pendência lançada à mão
  numero_item smallint,
  texto_item text,
  critico boolean not null default false,
  problema text,                                   -- descrição do motorista na 1ª ocorrência
  oque text not null,
  porque text,
  responsavel text,
  envolvidos text,
  onde text,
  como text,
  quanto text,
  inicio date not null default private.hoje(),
  prazo date,
  fim date,
  status public.status_pendencia not null default 'nao_iniciada',
  ocorrencias integer not null default 1,
  ultima_ocorrencia date,
  checklist_origem uuid references public.checklists(id),
  ordem double precision not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
-- Uma pendência aberta por placa e item: repetição soma ocorrência
create unique index pendencia_aberta_unica on public.pendencias (veiculo_id, item_id)
  where item_id is not null and status in ('nao_iniciada', 'andamento', 'standby');
create index on public.pendencias (status);

create table public.pendencia_eventos (
  id uuid primary key default gen_random_uuid(),
  pendencia_id uuid not null references public.pendencias(id) on delete cascade,
  tipo text not null check (tipo in ('criada', 'ocorrencia', 'ok_marcado', 'nota', 'status', 'prazo', 'campo')),
  nota_tipo text check (nota_tipo in ('resultado', 'problema', 'proximo')),
  data date not null default private.hoje(),
  texto text,
  campo text,
  de text,
  para text,
  checklist_id uuid references public.checklists(id) on delete set null,
  autor_id uuid references public.usuarios(id),
  quando timestamptz not null default now(),
  check (tipo <> 'nota' or (nota_tipo is not null and length(trim(coalesce(texto, ''))) > 0))
);
create index on public.pendencia_eventos (pendencia_id, quando);

-- Fotos: pasta privada. Caminho = <auth uid>/<checklist id>/<nº do item>-<n>.jpg
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('checklist-fotos', 'checklist-fotos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

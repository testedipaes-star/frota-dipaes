-- Checklist de Frota Dipães — quem é quem e regras de acesso (RLS)

create or replace function private.usuario_atual_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select u.id from public.usuarios u
  where u.auth_user_id = (select auth.uid()) and u.situacao = 'ativo'
$$;

create or replace function private.perfil_atual() returns public.perfil
language sql stable security definer set search_path = '' as $$
  select u.perfil from public.usuarios u
  where u.auth_user_id = (select auth.uid()) and u.situacao = 'ativo'
$$;

create or replace function private.e_frota() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.perfil_atual() in ('frota', 'admin'), false)
$$;

create or replace function private.cpf_valido(p text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare s int; d1 int; d2 int; i int;
begin
  if p is null or p !~ '^[0-9]{11}$' or p ~ '^([0-9])\1{10}$' then return false; end if;
  s := 0; for i in 1..9 loop s := s + substr(p, i, 1)::int * (11 - i); end loop;
  d1 := 11 - s % 11; if d1 >= 10 then d1 := 0; end if;
  s := 0; for i in 1..10 loop s := s + substr(p, i, 1)::int * (12 - i); end loop;
  d2 := 11 - s % 11; if d2 >= 10 then d2 := 0; end if;
  return d1 = substr(p, 10, 1)::int and d2 = substr(p, 11, 1)::int;
end $$;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

alter table public.usuarios enable row level security;
alter table public.veiculos enable row level security;
alter table public.itens enable row level security;
alter table public.config enable row level security;
alter table public.checklists enable row level security;
alter table public.respostas enable row level security;
alter table public.fotos enable row level security;
alter table public.pendencias enable row level security;
alter table public.pendencia_eventos enable row level security;

-- Usuários: cada um vê a si; Frota e admin veem todos. Escrita só pela função salvar_usuario.
create policy leitura on public.usuarios for select to authenticated
  using (auth_user_id = (select auth.uid()) or private.e_frota());

-- Referência: leitura para quem está logado; escrita pela Frota
create policy leitura on public.veiculos for select to authenticated using (private.usuario_atual_id() is not null);
create policy escrita on public.veiculos for all to authenticated using (private.e_frota()) with check (private.e_frota());
create policy leitura on public.itens for select to authenticated using (private.usuario_atual_id() is not null);
create policy escrita on public.itens for all to authenticated using (private.e_frota()) with check (private.e_frota());
create policy leitura on public.config for select to authenticated using (private.usuario_atual_id() is not null);
create policy escrita on public.config for update to authenticated using (private.e_frota()) with check (private.e_frota());

-- Checklists: motorista vê os seus; Frota vê todos. Gravação só pelas funções do banco.
create policy leitura on public.checklists for select to authenticated
  using (motorista_id = private.usuario_atual_id() or private.e_frota());
create policy leitura on public.respostas for select to authenticated
  using (exists (select 1 from public.checklists c where c.id = checklist_id));
create policy leitura on public.fotos for select to authenticated
  using (exists (select 1 from public.checklists c where c.id = checklist_id));

-- Pendências: todos leem (o motorista vê as abertas do veículo antes do checklist); Frota escreve
create policy leitura on public.pendencias for select to authenticated using (private.usuario_atual_id() is not null);
create policy criacao on public.pendencias for insert to authenticated with check (private.e_frota() and item_id is null);
create policy atualizacao on public.pendencias for update to authenticated using (private.e_frota()) with check (private.e_frota());
create policy leitura on public.pendencia_eventos for select to authenticated using (private.e_frota());
create policy nota on public.pendencia_eventos for insert to authenticated
  with check (private.e_frota() and tipo = 'nota' and autor_id = private.usuario_atual_id());
create policy apagar_nota on public.pendencia_eventos for delete to authenticated
  using (private.e_frota() and tipo = 'nota' and autor_id = private.usuario_atual_id());

-- Fotos no Storage: cada um envia só para a própria pasta; lê a própria pasta; Frota lê tudo
create policy frota_envia_foto on storage.objects for insert to authenticated
  with check (bucket_id = 'checklist-fotos' and (storage.foldername(name))[1] = (select auth.uid())::text
              and private.usuario_atual_id() is not null);
create policy frota_le_foto on storage.objects for select to authenticated
  using (bucket_id = 'checklist-fotos' and ((storage.foldername(name))[1] = (select auth.uid())::text or private.e_frota()));

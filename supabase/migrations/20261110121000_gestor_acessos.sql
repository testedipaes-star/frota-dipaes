-- Gestor (acompanhamento, somente leitura) e cadastro de motoristas pela Frota

-- Quem pode ver o painel: Frota, administrador e gestor
create or replace function private.pode_ver_painel() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.perfil_atual() in ('frota', 'admin', 'gestor'), false)
$$;
revoke all on function private.pode_ver_painel() from public, anon;
grant execute on function private.pode_ver_painel() to authenticated;

-- Leitura: gestor passa a ver o mesmo que a Frota; escrita continua só com Frota/admin
drop policy leitura on public.usuarios;
create policy leitura on public.usuarios for select to authenticated
  using (auth_user_id = (select auth.uid()) or private.pode_ver_painel());

drop policy leitura on public.checklists;
create policy leitura on public.checklists for select to authenticated
  using (motorista_id = private.usuario_atual_id() or private.pode_ver_painel());

drop policy leitura on public.pendencia_eventos;
create policy leitura on public.pendencia_eventos for select to authenticated using (private.pode_ver_painel());

drop policy frota_le_foto on storage.objects;
create policy frota_le_foto on storage.objects for select to authenticated
  using (bucket_id = 'checklist-fotos' and ((storage.foldername(name))[1] = (select auth.uid())::text or private.pode_ver_painel()));

create or replace function public.painel_dia(p_data date default null)
returns table (
  veiculo_id uuid, placa text, modelo text, tipo public.tipo_veiculo, km_atual int,
  checklist_id uuid, motorista text, enviado_em timestamptz, retorno_em timestamptz, resultado public.resultado,
  liberacao public.liberacao, qtd_nok smallint, qtd_nok_critico smallint, duracao_seg int, origem text,
  checklists_no_dia int, pendencias_abertas int, pendencias_atrasadas int
) language sql stable security definer set search_path = '' as $$
  select v.id, v.placa, v.modelo, v.tipo, v.km_atual,
         c.id, u.nome, c.enviado_em, c.retorno_em, c.resultado, c.liberacao, c.qtd_nok, c.qtd_nok_critico, c.duracao_seg, c.origem,
         (select count(*)::int from public.checklists x where x.veiculo_id = v.id and x.data = coalesce(p_data, private.hoje())),
         (select count(*)::int from public.pendencias p where p.veiculo_id = v.id and p.status in ('nao_iniciada', 'andamento', 'standby')),
         (select count(*)::int from public.pendencias p where p.veiculo_id = v.id and p.status in ('nao_iniciada', 'andamento')
                                                      and p.prazo < private.hoje())
    from public.veiculos v
    left join lateral (
      select * from public.checklists x where x.veiculo_id = v.id and x.data = coalesce(p_data, private.hoje())
       order by x.enviado_em desc limit 1) c on true
    left join public.usuarios u on u.id = c.motorista_id
   where private.pode_ver_painel() and (v.ativo or c.id is not null)
   order by (c.liberacao in ('aguardando', 'mantido_bloqueado')) desc nulls last, (c.id is null) desc, v.placa
$$;

-- Cadastro de usuários: administrador cadastra qualquer perfil; Frota cadastra e edita só motoristas
create or replace function public.salvar_usuario(p_id uuid, p_dados jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_eu public.perfil := private.perfil_atual();
  v_cpf text := nullif(regexp_replace(coalesce(p_dados->>'cpf', ''), '[^0-9]', '', 'g'), '');
  v_perfil public.perfil := coalesce(nullif(p_dados->>'perfil', ''), 'motorista')::public.perfil;
  v_atual public.perfil;
begin
  if v_eu is null or v_eu not in ('admin', 'frota') then raise exception 'Só a Frota e o administrador cadastram usuários.'; end if;
  if trim(coalesce(p_dados->>'nome', '')) = '' or length(trim(p_dados->>'nome')) < 3 then raise exception 'Informe o nome completo.'; end if;
  if v_cpf is not null and not private.cpf_valido(v_cpf) then raise exception 'CPF inválido. Confira os 11 números.'; end if;
  if p_id is not null then
    select perfil into v_atual from public.usuarios where id = p_id;
    if not found then raise exception 'Usuário não encontrado.'; end if;
  end if;
  if v_eu = 'frota' and (v_perfil <> 'motorista' or coalesce(v_atual, 'motorista') <> 'motorista') then
    raise exception 'A Frota cadastra só motoristas. Gestores e Frota são cadastrados pelo administrador.';
  end if;
  if p_id = private.usuario_atual_id() and (v_perfil <> v_eu or coalesce(p_dados->>'situacao', 'ativo') <> 'ativo') then
    raise exception 'Você não pode mudar o seu próprio perfil nem desativar o seu acesso.';
  end if;
  begin
    if p_id is null then
      insert into public.usuarios (nome, cpf, perfil, situacao, telefone)
      values (trim(p_dados->>'nome'), v_cpf, v_perfil, coalesce(nullif(p_dados->>'situacao', ''), 'ativo')::public.situacao_usuario,
              nullif(trim(p_dados->>'telefone'), ''))
      returning id into v_id;
    else
      update public.usuarios set nome = trim(p_dados->>'nome'), cpf = coalesce(v_cpf, cpf), perfil = v_perfil,
             situacao = coalesce(nullif(p_dados->>'situacao', ''), 'ativo')::public.situacao_usuario,
             telefone = nullif(trim(p_dados->>'telefone'), ''), updated_at = now()
       where id = p_id returning id into v_id;
    end if;
  exception when unique_violation then
    raise exception 'Já existe um usuário com esse CPF.';
  end;
  return v_id;
end $$;

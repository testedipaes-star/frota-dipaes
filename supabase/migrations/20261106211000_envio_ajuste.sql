-- Ajuste: variável de laço renomeada (conflitava com o apelido "r" nas consultas)
create or replace function public.enviar_checklist(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_eu public.usuarios%rowtype;
  v_motorista public.usuarios%rowtype;
  v_vei public.veiculos%rowtype;
  v_id uuid := (p->>'id')::uuid;
  v_papel boolean := false;
  v_ex public.checklists%rowtype;
  v_km int := (p->>'km_saida')::int;
  v_regras jsonb;
  v_data date := private.hoje();
  v_faltam text;
  v_nok int; v_nok_crit int;
  v_resultado public.resultado;
  v_lib public.liberacao;
  v_inicio timestamptz := nullif(p->>'iniciado_em', '')::timestamptz;
  v_dur int;
  v_it record;
  v_pend public.pendencias%rowtype;
  v_novas int := 0; v_somadas int := 0;
begin
  select * into v_eu from public.usuarios where auth_user_id = (select auth.uid()) and situacao = 'ativo';
  if not found then raise exception 'Seu acesso não está ativo. Fale com a Frota.'; end if;
  if v_id is null then raise exception 'Checklist sem código.'; end if;

  -- Reenvio do mesmo checklist: devolve o que já foi gravado
  select * into v_ex from public.checklists where id = v_id;
  if found then
    return jsonb_build_object('id', v_ex.id, 'resultado', v_ex.resultado, 'liberacao', v_ex.liberacao,
                              'reenvio', true, 'pendencias_novas', 0, 'pendencias_somadas', 0);
  end if;

  -- Lançamento de folha de papel (contingência): só a Frota, em nome do motorista
  if p ? 'motorista_id' and nullif(p->>'motorista_id', '') is not null then
    if v_eu.perfil not in ('frota', 'admin') then raise exception 'Só a Frota lança checklist de papel.'; end if;
    select * into v_motorista from public.usuarios where id = (p->>'motorista_id')::uuid;
    if not found then raise exception 'Motorista não encontrado.'; end if;
    v_papel := true;
    v_data := coalesce(nullif(p->>'data', '')::date, v_data);
    if v_data > private.hoje() or v_data < private.hoje() - 31 then raise exception 'Data da folha inválida (até 31 dias atrás).'; end if;
  else
    v_motorista := v_eu;
  end if;

  select * into v_vei from public.veiculos where id = (p->>'veiculo_id')::uuid for update;
  if not found or not v_vei.ativo then raise exception 'Veículo não encontrado ou inativo.'; end if;

  select valor into v_regras from public.config where chave = 'regras';
  perform set_config('frota.envio', '1', true);  -- alterações feitas pelo envio não entram no histórico como edição

  -- Cabeçalho
  if v_km is null then raise exception 'Informe o km na saída.'; end if;
  if v_vei.km_atual is not null and v_km < v_vei.km_atual and v_data = private.hoje() then
    raise exception 'O km de saída (%) é menor que o último km registrado deste veículo (%). Confira o painel.', v_km, v_vei.km_atual;
  end if;
  if v_vei.km_atual is not null and v_data = private.hoje() and v_km - v_vei.km_atual > coalesce((v_regras->>'salto_km')::int, 1500)
     and not coalesce((p->>'km_confirmado')::boolean, false) then
    raise exception 'KM_CONFIRMAR: o km de saída está % km acima do último registrado. Confirme se está certo.', v_km - v_vei.km_atual;
  end if;
  if coalesce(p->>'combustivel', '') not in ('Reserva', '1/4', '1/2', '3/4', 'Cheio') then
    raise exception 'Informe o combustível na saída.';
  end if;
  if v_vei.tipo = 'frigorifico' and nullif(p->>'temp_saida', '') is null then
    raise exception 'Informe a temperatura do baú na saída.';
  end if;

  -- Respostas recebidas
  create temporary table if not exists _resp (item_id uuid primary key, resposta public.resposta, descricao text) on commit drop;
  truncate _resp;
  insert into _resp
  select (x->>'item_id')::uuid, (x->>'resposta')::public.resposta, nullif(trim(x->>'descricao'), '')
    from jsonb_array_elements(coalesce(p->'respostas', '[]')) x
  on conflict (item_id) do nothing;

  create temporary table if not exists _fotos (item_id uuid, caminho text primary key) on commit drop;
  truncate _fotos;
  insert into _fotos
  select (x->>'item_id')::uuid, x->>'caminho' from jsonb_array_elements(coalesce(p->'fotos', '[]')) x
  on conflict (caminho) do nothing;

  -- Item de outro tipo de veículo ou inexistente
  if exists (select 1 from _resp r left join public.itens i on i.id = r.item_id and i.tipo = v_vei.tipo and i.ativo where i.id is null) then
    raise exception 'O checklist tem itens que não são deste tipo de veículo. Abra o checklist de novo.';
  end if;

  -- Todos os itens ativos respondidos
  select string_agg(i.numero::text, ', ' order by i.numero) into v_faltam
    from public.itens i left join _resp r on r.item_id = i.id
   where i.tipo = v_vei.tipo and i.ativo and r.item_id is null;
  if v_faltam is not null then raise exception 'Faltam responder os itens: %.', v_faltam; end if;

  -- NOK precisa de descrição
  select string_agg(i.numero::text, ', ' order by i.numero) into v_faltam
    from _resp r join public.itens i on i.id = r.item_id
   where r.resposta = 'nok' and length(coalesce(r.descricao, '')) < 3;
  if v_faltam is not null then raise exception 'Descreva o problema dos itens NOK: %.', v_faltam; end if;

  if not v_papel then
    -- Fotos: na pasta de quem envia, deste checklist, e realmente enviadas
    if exists (select 1 from _fotos f where f.caminho not like (select auth.uid())::text || '/' || v_id::text || '/%') then
      raise exception 'Foto em pasta inválida.';
    end if;
    if exists (select 1 from _fotos f left join storage.objects o on o.bucket_id = 'checklist-fotos' and o.name = f.caminho where o.id is null) then
      raise exception 'Alguma foto não terminou de enviar. Tente de novo.';
    end if;
    -- NOK e itens externos precisam de foto
    select string_agg(i.numero::text, ', ' order by i.numero) into v_faltam
      from _resp r join public.itens i on i.id = r.item_id
     where (r.resposta = 'nok' or i.foto_obrigatoria)
       and not exists (select 1 from _fotos f where f.item_id = r.item_id);
    if v_faltam is not null then raise exception 'Faltam fotos dos itens: %.', v_faltam; end if;
  end if;

  -- Resultado
  select count(*) filter (where r.resposta = 'nok'), count(*) filter (where r.resposta = 'nok' and i.critico)
    into v_nok, v_nok_crit
    from _resp r join public.itens i on i.id = r.item_id;
  v_resultado := case when v_nok_crit > 0 then 'nao_liberado' when v_nok > 0 then 'ressalva' else 'liberado' end;
  v_lib := case when v_nok_crit > 0 then 'aguardando' else 'nao_precisa' end;
  if v_inicio is not null and v_inicio < now() and v_inicio > now() - interval '12 hours' then
    v_dur := extract(epoch from now() - v_inicio)::int;
  end if;

  insert into public.checklists (id, veiculo_id, motorista_id, tipo, placa, data, origem, lancado_por, iniciado_em, duracao_seg,
                                 km_saida, combustivel, rota, temp_saida, observacoes, resultado, qtd_nok, qtd_nok_critico, liberacao)
  values (v_id, v_vei.id, v_motorista.id, v_vei.tipo, v_vei.placa, v_data,
          case when v_papel then 'papel' else 'app' end, case when v_papel then v_eu.id end,
          v_inicio, v_dur, v_km, p->>'combustivel', nullif(trim(p->>'rota'), ''), nullif(p->>'temp_saida', '')::numeric,
          nullif(trim(p->>'observacoes'), ''), v_resultado, v_nok, v_nok_crit, v_lib);

  insert into public.respostas (checklist_id, item_id, numero, grupo, texto, critico, foto_obrigatoria, resposta, descricao)
  select v_id, i.id, i.numero, i.grupo, i.texto, i.critico, i.foto_obrigatoria, r.resposta, r.descricao
    from _resp r join public.itens i on i.id = r.item_id;

  insert into public.fotos (checklist_id, item_id, caminho) select v_id, f.item_id, f.caminho from _fotos f;

  update public.veiculos set km_atual = greatest(coalesce(km_atual, 0), v_km) where id = v_vei.id;

  -- Pendências: NOK cria ou soma ocorrência
  for v_it in
    select i.id as item_id, i.numero, i.texto, i.critico, x.descricao
      from _resp x join public.itens i on i.id = x.item_id
     where x.resposta = 'nok' order by i.numero
  loop
    select * into v_pend from public.pendencias
     where veiculo_id = v_vei.id and item_id = v_it.item_id and status in ('nao_iniciada', 'andamento', 'standby')
     for update;
    if found then
      update public.pendencias set
        ocorrencias = ocorrencias + 1,
        ultima_ocorrencia = v_data,
        envolvidos = case when coalesce(envolvidos, '') ilike '%' || v_motorista.nome || '%' then envolvidos
                          else concat_ws(', ', nullif(envolvidos, ''), v_motorista.nome) end,
        porque = regexp_replace(coalesce(porque, ''), ' Ocorrências: [0-9]+\.$', '') || ' Ocorrências: ' || (ocorrencias + 1) || '.',
        atualizado_em = now()
       where id = v_pend.id;
      insert into public.pendencia_eventos (pendencia_id, tipo, texto, checklist_id, autor_id, data)
      values (v_pend.id, 'ocorrencia', v_it.descricao, v_id, v_motorista.id, v_data);
      v_somadas := v_somadas + 1;
    else
      insert into public.pendencias (veiculo_id, item_id, numero_item, texto_item, critico, problema, oque, porque,
                                     envolvidos, onde, inicio, prazo, ultima_ocorrencia, checklist_origem, ordem)
      values (v_vei.id, v_it.item_id, v_it.numero, v_it.texto, v_it.critico, v_it.descricao,
              v_vei.placa || ' · ' || v_it.texto || ': ' || v_it.descricao,
              'NOK no checklist de ' || to_char(v_data, 'DD/MM/YYYY') || ' (item ' || v_it.numero || ')'
                || case when v_it.critico then ', item crítico: veículo bloqueado até liberação.' else '.' end
                || ' Ocorrências: 1.',
              v_motorista.nome,
              v_vei.placa || coalesce(' · ' || nullif(v_vei.modelo, ''), ''),
              v_data,
              v_data + case when v_it.critico then coalesce((v_regras->>'prazo_critico_dias')::int, 0)
                            else coalesce((v_regras->>'prazo_comum_dias')::int, 7) end,
              v_data, v_id, extract(epoch from now()))
      returning * into v_pend;
      insert into public.pendencia_eventos (pendencia_id, tipo, texto, checklist_id, autor_id, data)
      values (v_pend.id, 'criada', v_it.descricao, v_id, v_motorista.id, v_data);
      v_novas := v_novas + 1;
    end if;
  end loop;

  -- OK em item com pendência aberta: anota para a Frota conferir (não conclui sozinha)
  insert into public.pendencia_eventos (pendencia_id, tipo, texto, checklist_id, autor_id, data)
  select pd.id, 'ok_marcado', 'Marcado OK no checklist de ' || to_char(v_data, 'DD/MM') || ' por ' || v_motorista.nome || '. Conferir e concluir.',
         v_id, v_motorista.id, v_data
    from _resp x join public.pendencias pd
      on pd.item_id = x.item_id and pd.veiculo_id = v_vei.id and pd.status in ('nao_iniciada', 'andamento', 'standby')
   where x.resposta = 'ok';

  return jsonb_build_object('id', v_id, 'resultado', v_resultado, 'liberacao', v_lib, 'reenvio', false,
                            'pendencias_novas', v_novas, 'pendencias_somadas', v_somadas);
end $$;

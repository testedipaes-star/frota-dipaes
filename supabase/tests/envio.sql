-- Testes de aceite do banco (envio, pendências, liberação, acessos).
-- Roda tudo e termina com um erro proposital que desfaz os dados de teste.
-- Resultado esperado na mensagem de erro: "RESULTADO 14 de 14 ok".
do $$
declare
  m_auth uuid := gen_random_uuid(); m2_auth uuid := gen_random_uuid(); f_auth uuid := gen_random_uuid();
  m uuid; m2 uuid; f uuid; v uuid;
  itens jsonb; resp jsonb; fotos jsonb := '[]';
  c1 uuid := gen_random_uuid(); c2 uuid := gen_random_uuid(); c3 uuid := gen_random_uuid();
  c4 uuid := gen_random_uuid(); c5 uuid := gen_random_uuid(); c6 uuid := gen_random_uuid();
  r jsonb; n int; ok int := 0; total int := 0; log text := ''; it record; p record;
  i18 uuid; i6 uuid;
begin
  -- Fixtures (como postgres)
  insert into auth.users (id, aud, role, email) values
    (m_auth, 'authenticated', 'authenticated', 't-m@teste.local'),
    (m2_auth, 'authenticated', 'authenticated', 't-m2@teste.local'),
    (f_auth, 'authenticated', 'authenticated', 't-f@teste.local');
  insert into public.usuarios (auth_user_id, nome, perfil, precisa_trocar_senha) values (m_auth, 'Motorista Teste', 'motorista', false) returning id into m;
  insert into public.usuarios (auth_user_id, nome, perfil, precisa_trocar_senha) values (m2_auth, 'Outro Motorista', 'motorista', false) returning id into m2;
  insert into public.usuarios (auth_user_id, nome, perfil, precisa_trocar_senha) values (f_auth, 'Frota Teste', 'frota', false) returning id into f;
  insert into public.veiculos (placa, modelo, tipo, km_atual) values ('TST1A23', 'Accelo 815', 'bau', 1000) returning id into v;
  select id into i18 from public.itens where tipo = 'bau' and numero = 18;
  select id into i6 from public.itens where tipo = 'bau' and numero = 6;

  -- Fotos "enviadas" para os itens externos e para os NOK, em cada checklist
  for it in select c, i.id, i.numero from unnest(array[c1, c2, c3, c4, c5, c6]) c, public.itens i
            where i.tipo = 'bau' and (i.foto_obrigatoria or i.numero in (6, 18)) loop
    insert into storage.objects (bucket_id, name) values ('checklist-fotos', m_auth || '/' || it.c || '/' || it.numero || '-1.jpg');
  end loop;

  -- Age como o motorista
  perform set_config('request.jwt.claims', json_build_object('sub', m_auth, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- 1. Tudo OK com fotos = Liberado
  select jsonb_agg(jsonb_build_object('item_id', id, 'resposta', 'ok')) into resp from public.itens where tipo = 'bau' and ativo;
  select jsonb_agg(jsonb_build_object('item_id', id, 'caminho', m_auth || '/' || c1 || '/' || numero || '-1.jpg')) into fotos
    from public.itens where tipo = 'bau' and foto_obrigatoria;
  r := public.enviar_checklist(jsonb_build_object('id', c1, 'veiculo_id', v, 'km_saida', 1010, 'combustivel', 'Cheio',
        'iniciado_em', now() - interval '6 minutes', 'respostas', resp, 'fotos', fotos));
  total := total + 1; if r->>'resultado' = 'liberado' then ok := ok + 1; else log := log || ' [1 ' || r || ']'; end if;

  -- 2. Reenvio do mesmo checklist não duplica
  r := public.enviar_checklist(jsonb_build_object('id', c1, 'veiculo_id', v, 'km_saida', 1010, 'combustivel', 'Cheio', 'respostas', resp, 'fotos', fotos));
  select count(*) into n from public.checklists where id = c1;
  total := total + 1; if (r->>'reenvio')::boolean and n = 1 then ok := ok + 1; else log := log || ' [2]'; end if;

  -- 3. Falta foto de item externo = recusa
  begin
    perform public.enviar_checklist(jsonb_build_object('id', c2, 'veiculo_id', v, 'km_saida', 1020, 'combustivel', 'Cheio', 'respostas', resp, 'fotos', '[]'::jsonb));
    total := total + 1; log := log || ' [3 aceitou sem foto]';
  exception when others then
    total := total + 1; if sqlerrm like 'Faltam fotos%' then ok := ok + 1; else log := log || ' [3 ' || sqlerrm || ']'; end if;
  end;

  -- 4. Item em branco = recusa
  begin
    perform public.enviar_checklist(jsonb_build_object('id', c2, 'veiculo_id', v, 'km_saida', 1020, 'combustivel', 'Cheio',
      'respostas', (select jsonb_agg(e) from jsonb_array_elements(resp) e where e->>'item_id' <> i6::text)));
    total := total + 1; log := log || ' [4 aceitou incompleto]';
  exception when others then
    total := total + 1; if sqlerrm like 'Faltam responder os itens: 6.%' then ok := ok + 1; else log := log || ' [4 ' || sqlerrm || ']'; end if;
  end;

  -- 5. Km menor que o último = recusa
  begin
    perform public.enviar_checklist(jsonb_build_object('id', c2, 'veiculo_id', v, 'km_saida', 900, 'combustivel', 'Cheio', 'respostas', resp, 'fotos', fotos));
    total := total + 1; log := log || ' [5 aceitou km menor]';
  exception when others then
    total := total + 1; if sqlerrm like 'O km de saída%' then ok := ok + 1; else log := log || ' [5 ' || sqlerrm || ']'; end if;
  end;

  -- 6. NOK comum (item 6) = Liberado com ressalva + pendência com prazo de 7 dias
  select jsonb_agg(case when (e->>'item_id')::uuid = i6 then e || '{"resposta":"nok","descricao":"Estepe murcho"}' else e end) into resp
    from jsonb_array_elements(resp) e;
  select jsonb_agg(jsonb_build_object('item_id', id, 'caminho', m_auth || '/' || c2 || '/' || numero || '-1.jpg')) into fotos
    from public.itens where tipo = 'bau' and (foto_obrigatoria or numero = 6);
  r := public.enviar_checklist(jsonb_build_object('id', c2, 'veiculo_id', v, 'km_saida', 1020, 'combustivel', '1/2', 'respostas', resp, 'fotos', fotos));
  select * into p from public.pendencias where veiculo_id = v and item_id = i6;
  total := total + 1;
  if r->>'resultado' = 'ressalva' and r->>'liberacao' = 'nao_precisa' and p.prazo = private.hoje() + 7 and p.ocorrencias = 1 then ok := ok + 1;
  else log := log || ' [6 ' || r || ' prazo ' || coalesce(p.prazo::text, '-') || ']'; end if;

  -- 7. NOK crítico (item 18) = Não liberado, aguardando, pendência com prazo hoje; item 6 de novo soma ocorrência
  select jsonb_agg(case when (e->>'item_id')::uuid = i18 then e || '{"resposta":"nok","descricao":"Seta traseira esquerda não acende"}' else e end) into resp
    from jsonb_array_elements(resp) e;
  select jsonb_agg(jsonb_build_object('item_id', id, 'caminho', m_auth || '/' || c3 || '/' || numero || '-1.jpg')) into fotos
    from public.itens where tipo = 'bau' and (foto_obrigatoria or numero in (6, 18));
  r := public.enviar_checklist(jsonb_build_object('id', c3, 'veiculo_id', v, 'km_saida', 1030, 'combustivel', '1/2', 'respostas', resp, 'fotos', fotos));
  select * into p from public.pendencias where veiculo_id = v and item_id = i18;
  total := total + 1;
  if r->>'resultado' = 'nao_liberado' and r->>'liberacao' = 'aguardando' and p.prazo = private.hoje() and p.critico then ok := ok + 1;
  else log := log || ' [7 ' || r || ']'; end if;

  -- 8. Mesmo NOK de novo = uma pendência só, com 2 ocorrências
  select count(*) into n from public.pendencias where veiculo_id = v and item_id = i6;
  total := total + 1;
  if n = 1 and (select ocorrencias from public.pendencias where veiculo_id = v and item_id = i6) = 2 and (r->>'pendencias_somadas')::int = 1 then ok := ok + 1;
  else log := log || ' [8 n=' || n || ']'; end if;

  -- 9. Salto de km acima de 1.500 pede confirmação
  begin
    perform public.enviar_checklist(jsonb_build_object('id', c4, 'veiculo_id', v, 'km_saida', 9999, 'combustivel', '1/2', 'respostas', resp,
      'fotos', (select jsonb_agg(jsonb_build_object('item_id', id, 'caminho', m_auth || '/' || c4 || '/' || numero || '-1.jpg')) from public.itens where tipo = 'bau' and (foto_obrigatoria or numero in (6, 18)))));
    total := total + 1; log := log || ' [9 aceitou salto]';
  exception when others then
    total := total + 1; if sqlerrm like 'KM_CONFIRMAR%' then ok := ok + 1; else log := log || ' [9 ' || sqlerrm || ']'; end if;
  end;

  -- 10. Motorista não pode liberar
  begin
    perform public.liberar_checklist(c3, true, 'tentativa');
    total := total + 1; log := log || ' [10 motorista liberou]';
  exception when others then
    total := total + 1; ok := ok + 1;
  end;

  -- 11. Retorno com km menor que a saída = recusa; correto grava
  begin
    perform public.registrar_retorno(c3, 1000);
    total := total + 1; log := log || ' [11 aceitou retorno menor]';
  exception when others then
    perform public.registrar_retorno(c3, 1180);
    total := total + 1;
    if (select km_retorno from public.checklists where id = c3) = 1180 and (select km_atual from public.veiculos where id = v) = 1180 then ok := ok + 1;
    else log := log || ' [11]'; end if;
  end;

  -- 12. Outro motorista não vê os checklists deste
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', m2_auth, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.checklists where veiculo_id = v;
  total := total + 1; if n = 0 then ok := ok + 1; else log := log || ' [12 viu ' || n || ']'; end if;

  -- Age como a Frota
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', f_auth, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- 13. Frota libera com observação; fica gravado quem e quando
  perform public.liberar_checklist(c3, true, 'Lâmpada trocada no pátio');
  total := total + 1;
  if (select liberacao = 'liberado' and liberado_por = f and liberado_em is not null from public.checklists where id = c3) then ok := ok + 1;
  else log := log || ' [13]'; end if;

  -- 14. Concluir pendência grava data de fim e histórico de status
  update public.pendencias set status = 'concluida', quanto = 'R$ 12,00' where veiculo_id = v and item_id = i18;
  select * into p from public.pendencias where veiculo_id = v and item_id = i18;
  select count(*) into n from public.pendencia_eventos where pendencia_id = p.id and tipo = 'status';
  total := total + 1;
  if p.fim = private.hoje() and n = 1 then ok := ok + 1; else log := log || ' [14 fim=' || coalesce(p.fim::text, '-') || ' ev=' || n || ']'; end if;

  raise exception 'RESULTADO % de % ok%', ok, total, log;
end $$;

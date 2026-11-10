-- Testes do perfil Gestor (só leitura) e do cadastro de motoristas pela Frota.
-- Termina com erro proposital que desfaz tudo. Esperado: "RESULTADO 9 de 9 ok".
do $$
declare g_auth uuid := gen_random_uuid(); f_auth uuid := gen_random_uuid(); g uuid; f uuid; n int; ok int := 0; total int := 0; log text := ''; v_id uuid;
begin
  insert into auth.users (id, aud, role, email) values (g_auth,'authenticated','authenticated','t-g@teste.local'),(f_auth,'authenticated','authenticated','t-f2@teste.local');
  insert into public.usuarios (auth_user_id, nome, perfil, precisa_trocar_senha) values (g_auth,'Gestor Teste','gestor',false) returning id into g;
  insert into public.usuarios (auth_user_id, nome, perfil, precisa_trocar_senha) values (f_auth,'Frota Teste','frota',false) returning id into f;
  insert into public.pendencias (veiculo_id, oque) select id, 'teste' from public.veiculos limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', g_auth, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.painel_dia(null);
  total := total + 1; if n = (select count(*) from public.veiculos where ativo) then ok := ok + 1; else log := log || ' [1 painel ' || n || ']'; end if;
  select count(*) into n from public.usuarios;
  total := total + 1; if n >= 4 then ok := ok + 1; else log := log || ' [2 usuarios ' || n || ']'; end if;
  update public.pendencias set status = 'andamento' where oque = 'teste';
  get diagnostics n = row_count;
  total := total + 1; if n = 0 then ok := ok + 1; else log := log || ' [3 gestor alterou pendência]'; end if;
  begin perform public.salvar_usuario(null, '{"nome":"Fulano de Tal","cpf":"11144477735","perfil":"motorista"}'); total := total + 1; log := log || ' [4 gestor cadastrou]';
  exception when others then total := total + 1; ok := ok + 1; end;
  begin insert into public.veiculos (placa, tipo) values ('ZZZ9Z99','bau'); total := total + 1; log := log || ' [5 gestor criou veículo]';
  exception when others then total := total + 1; ok := ok + 1; end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', f_auth, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  v_id := public.salvar_usuario(null, '{"nome":"Motorista Novo","cpf":"111.444.777-35","perfil":"motorista"}');
  total := total + 1; if v_id is not null then ok := ok + 1; else log := log || ' [6]'; end if;
  begin perform public.salvar_usuario(null, '{"nome":"Gestor Novo","cpf":"39053344705","perfil":"gestor"}'); total := total + 1; log := log || ' [7 frota criou gestor]';
  exception when others then total := total + 1; if sqlerrm like 'A Frota cadastra só motoristas%' then ok := ok + 1; else log := log || ' [7 ' || sqlerrm || ']'; end if; end;
  begin perform public.salvar_usuario(g, '{"nome":"Gestor Teste","perfil":"motorista"}'); total := total + 1; log := log || ' [8 frota rebaixou gestor]';
  exception when others then total := total + 1; ok := ok + 1; end;
  begin perform public.salvar_usuario(null, '{"nome":"Repetido","cpf":"11144477735","perfil":"motorista"}'); total := total + 1; log := log || ' [9 duplicou cpf]';
  exception when others then total := total + 1; if sqlerrm like 'Já existe%' then ok := ok + 1; else log := log || ' [9 ' || sqlerrm || ']'; end if; end;
  raise exception 'RESULTADO % de % ok%', ok, total, log;
end $$;

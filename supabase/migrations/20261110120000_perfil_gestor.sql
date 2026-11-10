-- Perfil Gestor: acompanha checklists e pendências, sem alterar nada
alter type public.perfil add value if not exists 'gestor';

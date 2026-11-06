"""Gera supabase/migrations/..._itens.sql a partir da aba Itens da planilha Checklist_Diario_Veiculos_Dipaes.xlsx."""
import sys, openpyxl
FOTO = {'Baú': {13, 31, 39, 40, 41}, 'Frigorífico': {13, 37, 42, 43, 44}, 'Leve': {10, 25, 26}}
TIPO = {'Baú': 'bau', 'Frigorífico': 'frigorifico', 'Leve': 'leve'}
wb = openpyxl.load_workbook(sys.argv[1])
ws = wb['Itens']
q = lambda s: "'" + str(s).replace("'", "''") + "'"
linhas = []
for r in ws.iter_rows(min_row=4, values_only=True):
    chave, tipo, n, grupo, texto, crit = r[:6]
    if not chave or tipo not in TIPO: continue
    linhas.append(f"({q(TIPO[tipo])}, {int(n)}, {q(grupo)}, {q(texto)}, {'true' if crit == 'Sim' else 'false'}, {'true' if int(n) in FOTO[tipo] else 'false'})")
print("-- Carga inicial: itens da aba Itens da planilha (Rev. 02, out/2026). Gerado por scripts/gerar_itens.py.")
print("insert into public.itens (tipo, numero, grupo, texto, critico, foto_obrigatoria) values")
print(",\n".join(linhas) + ";")
print(f"-- {len(linhas)} itens", file=sys.stderr)

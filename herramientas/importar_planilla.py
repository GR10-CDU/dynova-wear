"""Convierte la planilla vieja (una hoja por proveedor) en supabase/seed.sql.

Uso: python importar_planilla.py planilla.xlsx ../supabase/seed.sql [../demo-datos.json]
Lee: PRENDA, COSTO, $$$FINAL y STOCK (texto tipo "1 TS- 2 TM- 1 T3").
Las ventas por mes de la planilla NO se importan (no tienen precio ni día).
"""
import json
import re
import sys
import openpyxl

ORDEN = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"] + [str(i) for i in range(1, 21)] + ["Único"]
CATS = [("top", "Top"), ("croptop", "Top"), ("calza", "Calza"), ("biker", "Calza"), ("capri", "Calza"),
        ("short", "Short"), ("shot", "Short"), ("shor ", "Short"), ("pollera", "Short"),
        ("remera", "Remera"), ("rem ", "Remera"), ("chomba", "Remera"),
        ("musc", "Musculosa"), ("sudadera", "Musculosa"), ("sud.", "Musculosa"),
        ("buzo", "Buzo"), ("campera", "Campera"), ("cam", "Campera"),
        ("pantal", "Pantalón"), ("jogging", "Pantalón"), ("medias", "Accesorios")]


def categoria(nombre):
    n = nombre.lower().strip()
    for clave, cat in CATS:
        if n.startswith(clave):
            return cat
    return "Otros"


def talle_norm(t):
    t = t.upper().replace(" ", "")
    t = {"2XL": "XXL", "3XL": "XXXL", "S/T": "Único"}.get(t, t)
    if t.startswith("T") and len(t) > 1 and t != "TXL":
        t = t[1:]
    t = {"2XL": "XXL", "3XL": "XXXL"}.get(t, t)
    if t == "TXL":
        t = "XL"
    return t


def parse_stock(txt, nombre):
    """'1 TS- 2 TM- TL' -> {('S',''):1, ('M',''):2, ('L',''):1}"""
    out = {}
    if txt is None:
        return out
    if isinstance(txt, (int, float)):
        if txt > 0:
            out[("Único", "")] = int(txt)
        return out
    es_medias = nombre.lower().startswith("medias")
    for parte in str(txt).split("-"):
        parte = parte.strip()
        if not parte:
            continue
        m = re.match(r"^(\d+)?\s*(T\s*)?(S/T|XXXL|XXL|2XL|3XL|XL|XS|S|M|L|N|B|\d+)\b", parte, re.I)
        if not m:
            print("  ?? no entendí stock:", nombre, "->", parte, file=sys.stderr)
            continue
        cant = int(m.group(1) or 1)
        t = m.group(3).upper()
        if es_medias and t in ("N", "B"):
            clave = ("Único", "Negro" if t == "N" else "Blanco")
        else:
            clave = (talle_norm(t), "")
        out[clave] = out.get(clave, 0) + cant
    return out


def q(s):
    return "null" if s is None else "'" + str(s).replace("'", "''") + "'"


def main(xlsx, salida):
    wb = openpyxl.load_workbook(xlsx, data_only=True)
    sql = ["-- Generado por herramientas/importar_planilla.py", "begin;"]
    total_p = total_u = 0
    datos = {"proveedores": [], "productos": []}
    for ws in wb:
        prov = ws.title.strip()
        sql.append(f"insert into proveedores (nombre) values ({q(prov)}) on conflict (nombre) do nothing;")
        datos["proveedores"].append(prov)
        filas = list(ws.iter_rows(values_only=True))
        enc = next(i for i, r in enumerate(filas) if r and r[0] == "PRENDA")
        cab = [str(c).strip() if c else "" for c in filas[enc]]
        ic, ip, isk = cab.index("COSTO"), cab.index("$$$FINAL"), cab.index("STOCK")
        genero = None
        for r in filas[enc + 1:]:
            if not r or not r[0]:
                continue
            nombre = " ".join(str(r[0]).split())
            low = nombre.lower()
            if low in ("hombres", "hombre"):
                genero = "Hombre"; continue
            if low in ("mujer", "mujeres"):
                genero = "Mujer"; continue
            costo, precio = r[ic], r[ip]
            if not isinstance(costo, (int, float)):
                continue
            nombre = nombre[0].upper() + nombre[1:]
            g = genero
            if prov == "ALFEST Store" and genero is None:
                g = "Hombre"
            stock = parse_stock(r[isk], nombre)
            total_p += 1
            total_u += sum(stock.values())
            datos["productos"].append({"nombre": nombre, "categoria": categoria(nombre), "genero": g, "proveedor": prov,
                "costo": round(float(costo), 2), "precio": round(float(precio or 0), 2),
                "variantes": [{"talle": t, "color": c, "stock": n, "orden": ORDEN.index(t) if t in ORDEN else 99} for (t, c), n in stock.items()]})
            sql.append(
                "with p as (insert into productos (nombre, categoria, genero, proveedor_id, costo, precio) values "
                f"({q(nombre)}, {q(categoria(nombre))}, {q(g)}, (select id from proveedores where nombre={q(prov)}), "
                f"{round(float(costo), 2)}, {round(float(precio or 0), 2)}) returning id)"
            )
            if stock:
                vals = ", ".join(
                    f"((select id from p), {q(t)}, {q(c)}, {n}, {ORDEN.index(t) if t in ORDEN else 99})"
                    for (t, c), n in sorted(stock.items(), key=lambda kv: ORDEN.index(kv[0][0]) if kv[0][0] in ORDEN else 99)
                )
                sql.append(f"insert into variantes (producto_id, talle, color, stock, orden) values {vals};")
            else:
                sql.append("select id from p;")
    sql.append("commit;")
    open(salida, "w").write("\n".join(sql) + "\n")
    if len(sys.argv) > 3:
        json.dump(datos, open(sys.argv[3], "w"), ensure_ascii=False)
    print(f"{total_p} prendas, {total_u} unidades en stock -> {salida}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])

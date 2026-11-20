"""Saca las ventas por mes de la planilla vieja (columnas de meses con talles tipo '1 TS- 1 TM').

Uso: python ventas_planilla.py planilla.xlsx [salida.json]
No tienen día ni precio: se toma el precio final y el costo actual de la prenda, y el día 15 del mes
(o hoy, si es el mes en curso). Lo que dice "regalo" o "para mí" se cuenta aparte, no como venta.
"""
import datetime as dt
import json
import re
import sys
import openpyxl
from importar_planilla import parse_stock

# Celdas con texto libre: qué parte fue venta de verdad
EXCEPCIONES = {
    "1 T2(regalo Ro) -1T3": "1 T3",
    "1 TS me quedé para mí 1 TM": "1 TM",
    "en octubre le regale una rem TL a Jona   1 TL": "1 TL",
}

MESES = {"enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6, "julio": 7, "agosto": 8,
         "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12}


def main(xlsx, salida=None):
    wb = openpyxl.load_workbook(xlsx, data_only=True)
    ventas, raros, hoy = [], [], dt.date.today()
    for ws in wb:
        prov = ws.title.strip()
        filas = list(ws.iter_rows(values_only=True))
        enc = next(i for i, r in enumerate(filas) if r and r[0] == "PRENDA")
        cab = list(filas[enc])
        titulos = [str(c or "") for c in filas[enc - 1]] if enc > 0 else []
        col26 = next((i for i, t in enumerate(titulos) if "2026" in t), None)
        ic, ip = cab.index("COSTO"), cab.index("$$$FINAL")
        isk = [i for i, c in enumerate(cab) if str(c or "").strip() == "STOCK"][0]
        cols = []
        for i, c in enumerate(cab):
            if i <= isk or c is None:
                continue
            if isinstance(c, dt.datetime):
                cols.append((i, c.year, c.month))
            else:
                m = MESES.get(str(c).strip().lower())
                if m:
                    anio = 2026 if (col26 is not None and i >= col26) else 2025
                    cols.append((i, anio, m))
        for r in filas[enc + 1:]:
            if not r or not r[0] or not isinstance(r[ic], (int, float)):
                continue
            nombre = " ".join(str(r[0]).split())
            nombre = nombre[0].upper() + nombre[1:]
            for i, anio, mes in cols:
                v = r[i] if i < len(r) else None
                if v is None or not str(v).strip() or set(str(v).strip()) <= {"-", " "}:
                    continue
                txt = str(v)
                d = dt.date(anio, mes, 15)
                if d > hoy:
                    d = hoy
                m = re.search(r"x\s*\$\s*([\d.]+)", txt)
                if m:  # "Se lo vendi a Pau x $9200"
                    ventas.append(dict(prov=prov, nombre=nombre, fecha=str(d), talle="Único", color="", cantidad=1,
                                       precio=float(m.group(1).replace(".", "")), costo=float(r[ic]), nota=txt.strip()))
                    continue
                if re.search(r"regal|para m", txt, re.I):
                    raros.append(f"{prov} · {nombre} · {mes}/{anio}: {txt.strip()}")
                    if txt.strip() not in EXCEPCIONES:
                        raise SystemExit(f"Celda con texto libre sin regla: {txt!r}")
                    txt = EXCEPCIONES[txt.strip()]
                for (talle, color), n in parse_stock(txt, nombre).items():
                    ventas.append(dict(prov=prov, nombre=nombre, fecha=str(d), talle=talle, color=color, cantidad=n,
                                       precio=float(r[ip] or 0), costo=float(r[ic]), nota="Importada de la planilla (mes aprox.)"))
    if salida:
        json.dump(ventas, open(salida, "w"), ensure_ascii=False)
    porMes = {}
    for v in ventas:
        k = v["fecha"][:7]
        t = porMes.setdefault(k, [0, 0, 0])
        t[0] += v["cantidad"]; t[1] += v["cantidad"] * v["precio"]; t[2] += v["cantidad"] * v["costo"]
    for k in sorted(porMes):
        u, tot, co = porMes[k]
        print(f"{k}: {u:3d} prendas  ${tot:>11,.0f}  ganancia ${tot - co:>10,.0f}")
    print("TOTAL", sum(v["cantidad"] for v in ventas), "prendas", f"${sum(v['cantidad'] * v['precio'] for v in ventas):,.0f}")
    print("\nCasos raros (regalos / para mí):", *raros, sep="\n  ")


if __name__ == "__main__":
    main(*sys.argv[1:])

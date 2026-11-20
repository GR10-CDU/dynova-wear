// Capa de datos: todo lo que la app lee/guarda pasa por acá.
// Dos versiones con las mismas funciones: Google Sheets (real) y Demo (en el navegador).

export async function crearApi() {
  const cfg = window.DYNOVA_CONFIG || {};
  const demo = new URLSearchParams(location.search).has("demo") || !cfg.SHEETS_URL;
  if (demo) {
    const m = await import("./demo.js");
    return m.crearApiDemo();
  }
  return crearApiSheets(cfg.SHEETS_URL);
}

function crearApiSheets(url) {
  async function llamar(accion, ...args) {
    let r;
    try {
      // text/plain para que Google no pida permisos extra al navegador
      r = await fetch(url, { method: "POST", body: JSON.stringify({ accion, args }), redirect: "follow" });
    } catch (e) {
      throw new Error("Sin conexión a internet");
    }
    let j;
    try { j = await r.json(); } catch (e) { throw new Error("La planilla no respondió bien (¿está publicada para 'Cualquier persona'?)"); }
    if (!j.ok) throw new Error(j.error || "Error en la planilla");
    return j.data;
  }
  const iso = d => d ? d.toISOString() : null;
  const d8 = d => d ? dia(d) : null;

  return {
    demo: false,
    catalogo: () => llamar("catalogo"),
    guardarProductoCompleto: (datos, minimos, nuevas, minimoDefecto) => llamar("guardarProductoCompleto", datos, minimos, nuevas, minimoDefecto),
    guardarProducto: p => llamar("guardarProducto", p),
    borrarProducto: id => llamar("borrarProducto", id),
    actualizarPrecios: lista => llamar("actualizarPrecios", lista),
    borrarVariante: id => llamar("borrarVariante", id),
    moverStock: (id, cant, tipo = "ajuste", nota = null, costo = null) => llamar("moverStock", id, cant, tipo, nota, costo),
    moverStockVarios: (lista, tipo, nota, costo) => llamar("moverStockVarios", lista, tipo, nota, costo),
    vender: v => llamar("vender", v),
    anularVenta: id => llamar("anularVenta", id),
    ventas: (d, h) => llamar("ventas", iso(d), iso(h)),
    ventasCliente: () => llamar("ventasCliente"),
    gastos: (d, h) => llamar("gastos", d8(d), d8(h)),
    guardarGasto: g => llamar("guardarGasto", g),
    borrarGasto: id => llamar("borrarGasto", id),
    compras: (d, h) => llamar("compras", iso(d), iso(h)),
    movimientos: (lim = 200) => llamar("movimientos", lim),
    guardarProveedor: p => llamar("guardarProveedor", p),
    borrarProveedor: id => llamar("borrarProveedor", id),
    clientes: () => llamar("clientes"),
    guardarCliente: c => llamar("guardarCliente", c),
    borrarCliente: id => llamar("borrarCliente", id),
    ajustes: () => llamar("ajustes"),
    guardarAjuste: (k, v) => llamar("guardarAjuste", k, v),
  };
}

export function dia(d) {
  const z = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

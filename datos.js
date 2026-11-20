// Capa de datos: todo lo que la app lee/guarda pasa por acá.
// Dos versiones con las mismas funciones: Supabase (real) y Demo (en el navegador).

const PROD_SEL = "*, variantes(*)";

export async function crearApi() {
  const cfg = window.DYNOVA_CONFIG || {};
  const demo = new URLSearchParams(location.search).has("demo") || !cfg.SUPABASE_URL;
  if (demo) {
    const m = await import("./demo.js");
    return m.crearApiDemo();
  }
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  const sb = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY, { auth: { persistSession: false } });
  const ok = ({ data, error }) => { if (error) throw new Error(traducir(error.message)); return data; };

  return {
    demo: false,
    async catalogo() {
      const [prov, prod] = await Promise.all([
        sb.from("proveedores").select("*").order("nombre").then(ok),
        sb.from("productos").select(PROD_SEL).order("nombre").then(ok),
      ]);
      return { proveedores: prov, productos: prod };
    },
    async guardarProducto(p) {
      const { id, variantes, ...campos } = p;
      if (id) return ok(await sb.from("productos").update(campos).eq("id", id).select(PROD_SEL).single());
      return ok(await sb.from("productos").insert(campos).select(PROD_SEL).single());
    },
    async borrarProducto(id) { ok(await sb.from("productos").delete().eq("id", id)); },
    async actualizarPrecios(lista) { // [{id, precio}]
      for (let i = 0; i < lista.length; i += 20) {
        await Promise.all(lista.slice(i, i + 20).map(x => sb.from("productos").update({ precio: x.precio }).eq("id", x.id).then(ok)));
      }
    },
    async crearVariante(v) { return ok(await sb.from("variantes").insert(v).select().single()); },
    async editarVariante(id, campos) { ok(await sb.from("variantes").update(campos).eq("id", id)); },
    async borrarVariante(id) { ok(await sb.from("variantes").delete().eq("id", id)); },
    async moverStock(variante_id, cantidad, tipo = "ajuste", nota = null, costo = null) {
      return ok(await sb.rpc("mover_stock", { p_variante_id: variante_id, p_cantidad: cantidad, p_tipo: tipo, p_nota: nota, p_costo: costo }));
    },
    async vender(v) {
      return ok(await sb.rpc("registrar_venta", {
        p_items: v.items, p_metodo: v.metodo, p_descuento: v.descuento, p_recargo: v.recargo,
        p_cliente_id: v.cliente_id, p_cliente_nombre: v.cliente_nombre, p_canal: v.canal, p_nota: v.nota,
        p_fecha: v.fecha || null,
      }));
    },
    async anularVenta(id) { ok(await sb.rpc("anular_venta", { p_venta_id: id })); },
    async ventas(desde, hasta) {
      let q = sb.from("ventas").select("*, venta_items(*)").order("fecha", { ascending: false }).limit(5000);
      if (desde) q = q.gte("fecha", desde.toISOString());
      if (hasta) q = q.lt("fecha", hasta.toISOString());
      return ok(await q);
    },
    async ventasCliente() {
      return ok(await sb.from("ventas").select("cliente_id,total,fecha").not("cliente_id", "is", null).eq("anulada", false));
    },
    async gastos(desde, hasta) {
      let q = sb.from("gastos").select("*").order("fecha", { ascending: false }).order("id", { ascending: false });
      if (desde) q = q.gte("fecha", dia(desde));
      if (hasta) q = q.lt("fecha", dia(hasta));
      return ok(await q);
    },
    async guardarGasto(g) {
      const { id, ...c } = g;
      if (id) return ok(await sb.from("gastos").update(c).eq("id", id).select().single());
      return ok(await sb.from("gastos").insert(c).select().single());
    },
    async borrarGasto(id) { ok(await sb.from("gastos").delete().eq("id", id)); },
    async compras(desde, hasta) {
      let q = sb.from("movimientos").select("cantidad,costo_unit,fecha").in("tipo", ["compra", "alta"]);
      if (desde) q = q.gte("fecha", desde.toISOString());
      if (hasta) q = q.lt("fecha", hasta.toISOString());
      return ok(await q);
    },
    async movimientos(limite = 200) {
      return ok(await sb.from("movimientos")
        .select("*, variantes(talle,color,productos(nombre))")
        .order("fecha", { ascending: false }).limit(limite));
    },
    async guardarProveedor(p) {
      const { id, ...c } = p;
      if (id) return ok(await sb.from("proveedores").update(c).eq("id", id).select().single());
      return ok(await sb.from("proveedores").insert(c).select().single());
    },
    async borrarProveedor(id) { ok(await sb.from("proveedores").delete().eq("id", id)); },
    async clientes() { return ok(await sb.from("clientes").select("*").order("nombre")); },
    async guardarCliente(c) {
      const { id, ...x } = c;
      if (id) return ok(await sb.from("clientes").update(x).eq("id", id).select().single());
      return ok(await sb.from("clientes").insert(x).select().single());
    },
    async borrarCliente(id) { ok(await sb.from("clientes").delete().eq("id", id)); },
    async ajustes() {
      const filas = ok(await sb.from("ajustes").select("*"));
      return Object.fromEntries(filas.map(f => [f.clave, f.valor]));
    },
    async guardarAjuste(clave, valor) { ok(await sb.from("ajustes").upsert({ clave, valor })); },
  };
}

export function dia(d) {
  const z = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

function traducir(m) {
  if (/duplicate key.*variantes/i.test(m)) return "Ese talle/color ya existe en esta prenda";
  if (/duplicate key.*proveedores/i.test(m)) return "Ya hay un proveedor con ese nombre";
  if (/Failed to fetch|NetworkError/i.test(m)) return "Sin conexión a internet";
  return m;
}

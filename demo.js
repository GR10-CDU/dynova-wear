// Modo demo: mismas funciones que Supabase pero guardando en este navegador (localStorage).
import { dia } from "./datos.js";

const KEY = "dynova_demo_v1";

export async function crearApiDemo() {
  let db = JSON.parse(localStorage.getItem(KEY) || "null");
  if (!db) {
    db = { seq: 1, proveedores: [], productos: [], variantes: [], ventas: [], venta_items: [], movimientos: [], gastos: [], clientes: [], ajustes: {} };
    try {
      const base = await (await fetch("./demo-datos.json")).json();
      for (const pr of base.proveedores) db.proveedores.push({ id: db.seq++, nombre: pr });
      for (const p of base.productos) {
        const prov = db.proveedores.find(x => x.nombre === p.proveedor);
        const id = db.seq++;
        db.productos.push({ id, nombre: p.nombre, categoria: p.categoria, genero: p.genero, proveedor_id: prov?.id ?? null,
          codigo: null, costo: p.costo, precio: p.precio, foto_url: null, notas: null, activo: true, creado: new Date().toISOString() });
        for (const v of p.variantes) db.variantes.push({ id: db.seq++, producto_id: id, talle: v.talle, color: v.color, stock: v.stock, stock_minimo: 0, orden: v.orden });
      }
    } catch (e) { console.warn("sin datos demo", e); }
    guardar();
  }
  function guardar() { localStorage.setItem(KEY, JSON.stringify(db)); }
  const clon = x => JSON.parse(JSON.stringify(x));
  const nuevo = (tabla, obj) => { const o = { id: db.seq++, ...obj }; db[tabla].push(o); guardar(); return clon(o); };
  const editar = (tabla, id, c) => { const o = db[tabla].find(x => x.id === id); Object.assign(o, c); guardar(); return clon(o); };
  const quitar = (tabla, id) => { db[tabla] = db[tabla].filter(x => x.id !== id); guardar(); };
  const conVar = p => ({ ...clon(p), variantes: clon(db.variantes.filter(v => v.producto_id === p.id)) });
  const entre = (f, d, h) => (!d || new Date(f) >= d) && (!h || new Date(f) < h);
  const mov = (variante_id, tipo, cantidad, extra = {}) => db.movimientos.push({ id: db.seq++, fecha: new Date().toISOString(), variante_id, tipo, cantidad, ...extra });

  return {
    demo: true,
    async catalogo() {
      return { proveedores: clon(db.proveedores).sort((a, b) => a.nombre.localeCompare(b.nombre)),
        productos: db.productos.map(conVar).sort((a, b) => a.nombre.localeCompare(b.nombre)) };
    },
    async guardarProducto(p) {
      const { id, variantes, ...c } = p;
      const o = id ? editar("productos", id, c) : nuevo("productos", { activo: true, creado: new Date().toISOString(), ...c });
      return conVar(db.productos.find(x => x.id === o.id));
    },
    async borrarProducto(id) { quitar("productos", id); db.variantes = db.variantes.filter(v => v.producto_id !== id); guardar(); },
    async guardarProductoCompleto(datos, minimos, nuevas, minimoDefecto) {
      const p = await this.guardarProducto(datos);
      for (const m of minimos || []) editar("variantes", m.id, { stock_minimo: m.stock_minimo });
      for (const n of nuevas || []) {
        const v = await this.crearVariante({ producto_id: p.id, talle: n.talle, color: n.color || "", stock: 0, stock_minimo: minimoDefecto || 0, orden: n.orden || 0 });
        if (n.stock > 0) await this.moverStock(v.id, n.stock, "alta", "Stock inicial", p.costo);
      }
      return conVar(db.productos.find(x => x.id === p.id));
    },
    async moverStockVarios(lista, tipo, nota, costo) {
      const r = [];
      for (const x of lista) r.push({ id: x.id, stock: await this.moverStock(x.id, x.cantidad, tipo, nota, costo) });
      return r;
    },
    async actualizarPrecios(lista) { for (const x of lista) editar("productos", x.id, { precio: x.precio }); },
    async crearVariante(v) {
      if (db.variantes.some(x => x.producto_id === v.producto_id && x.talle === v.talle && (x.color || "") === (v.color || "")))
        throw new Error("Ese talle/color ya existe en esta prenda");
      return nuevo("variantes", { stock: 0, stock_minimo: 0, orden: 0, color: "", ...v });
    },
    async editarVariante(id, c) { editar("variantes", id, c); },
    async borrarVariante(id) { quitar("variantes", id); },
    async moverStock(variante_id, cantidad, tipo = "ajuste", nota = null, costo = null) {
      const v = db.variantes.find(x => x.id === variante_id);
      if (!v) throw new Error("Talle inexistente");
      if (v.stock + cantidad < 0) throw new Error("El stock no puede quedar negativo");
      v.stock += cantidad; mov(variante_id, tipo, cantidad, { nota, costo_unit: costo }); guardar();
      return v.stock;
    },
    async vender(v) {
      if (!v.items.length) throw new Error("La venta no tiene productos");
      for (const it of v.items) {
        const va = db.variantes.find(x => x.id === it.variante_id);
        const p = db.productos.find(x => x.id === va?.producto_id);
        if (!va) throw new Error("Producto inexistente");
        if (va.stock < it.cantidad) throw new Error(`No hay stock suficiente de ${p.nombre} (talle ${va.talle}): quedan ${va.stock}`);
      }
      const venta = { id: db.seq++, fecha: v.fecha || new Date().toISOString(), cliente_id: v.cliente_id, cliente_nombre: v.cliente_nombre || null,
        metodo_pago: v.metodo, canal: v.canal, descuento: +v.descuento || 0, recargo: +v.recargo || 0, nota: v.nota || null, anulada: false };
      let sub = 0, costo = 0;
      for (const it of v.items) {
        const va = db.variantes.find(x => x.id === it.variante_id);
        const p = db.productos.find(x => x.id === va.producto_id);
        const precio = it.precio_unit ?? p.precio;
        va.stock -= it.cantidad;
        db.venta_items.push({ id: db.seq++, venta_id: venta.id, variante_id: va.id, producto_id: p.id, producto_nombre: p.nombre,
          talle: va.talle, color: va.color, cantidad: it.cantidad, precio_unit: precio, costo_unit: p.costo });
        mov(va.id, "venta", -it.cantidad, { venta_id: venta.id, costo_unit: p.costo });
        sub += precio * it.cantidad; costo += p.costo * it.cantidad;
      }
      Object.assign(venta, { subtotal: sub, costo_total: costo, total: Math.max(sub - venta.descuento + venta.recargo, 0) });
      db.ventas.push(venta); guardar();
      return venta.id;
    },
    async anularVenta(id) {
      const v = db.ventas.find(x => x.id === id);
      if (!v || v.anulada) throw new Error("La venta no existe o ya estaba anulada");
      for (const it of db.venta_items.filter(i => i.venta_id === id)) {
        const va = db.variantes.find(x => x.id === it.variante_id);
        if (va) { va.stock += it.cantidad; mov(va.id, "anulacion", it.cantidad, { venta_id: id, nota: "Venta anulada" }); }
      }
      v.anulada = true; guardar();
    },
    async ventas(d, h) {
      return db.ventas.filter(v => entre(v.fecha, d, h)).sort((a, b) => b.fecha.localeCompare(a.fecha))
        .map(v => ({ ...clon(v), venta_items: clon(db.venta_items.filter(i => i.venta_id === v.id)) }));
    },
    async ventasCliente() { return clon(db.ventas.filter(v => v.cliente_id && !v.anulada)); },
    async gastos(d, h) {
      const ds = d && dia(d), hs = h && dia(h);
      return clon(db.gastos.filter(g => (!ds || g.fecha >= ds) && (!hs || g.fecha < hs)).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id));
    },
    async guardarGasto(g) { const { id, ...c } = g; return id ? editar("gastos", id, c) : nuevo("gastos", c); },
    async borrarGasto(id) { quitar("gastos", id); },
    async compras(d, h) { return clon(db.movimientos.filter(m => ["compra", "alta"].includes(m.tipo) && entre(m.fecha, d, h))); },
    async movimientos(lim = 200) {
      return db.movimientos.slice(-lim).reverse().map(m => {
        const va = db.variantes.find(x => x.id === m.variante_id);
        const p = va && db.productos.find(x => x.id === va.producto_id);
        return { ...clon(m), variantes: va ? { talle: va.talle, color: va.color, productos: { nombre: p?.nombre } } : null };
      });
    },
    async guardarProveedor(p) {
      const { id, ...c } = p;
      if (db.proveedores.some(x => x.nombre.toLowerCase() === c.nombre.toLowerCase() && x.id !== id)) throw new Error("Ya hay un proveedor con ese nombre");
      return id ? editar("proveedores", id, c) : nuevo("proveedores", c);
    },
    async borrarProveedor(id) { quitar("proveedores", id); db.productos.forEach(p => { if (p.proveedor_id === id) p.proveedor_id = null; }); guardar(); },
    async clientes() { return clon(db.clientes).sort((a, b) => a.nombre.localeCompare(b.nombre)); },
    async guardarCliente(c) { const { id, ...x } = c; return id ? editar("clientes", id, x) : nuevo("clientes", x); },
    async borrarCliente(id) { quitar("clientes", id); },
    async ajustes() { return clon(db.ajustes); },
    async guardarAjuste(k, v) { db.ajustes[k] = v; guardar(); },
  };
}

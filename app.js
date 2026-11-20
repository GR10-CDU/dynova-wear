import { crearApi, dia } from "./datos.js";

// ================= Estado =================
const S = {
  api: null,
  proveedores: [],
  productos: [],
  ajustes: {},
  carrito: [],
  filtros: { vender: { q: "", cat: "Todas" }, stock: { q: "", cat: "Todas", prov: "", estado: "", orden: "nombre" }, ventas: "hoy", inicio: "mes", mesGastos: 0 },
};
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const vista = $("#vista");

const METODOS = ["Efectivo", "Transferencia", "Débito", "Crédito", "Mercado Pago"];
const CANALES = ["Local", "Instagram", "WhatsApp", "Envío"];
const CATS_GASTO = ["Alquiler", "Luz", "Internet", "Agua", "Gas", "Expensas", "Sueldos", "Publicidad", "Packaging", "Envíos", "Monotributo", "Impuestos", "Comisiones", "Contador", "Mantenimiento", "Otros"];
const CATS_PROD = ["Top", "Calza", "Short", "Remera", "Musculosa", "Buzo", "Campera", "Pantalón", "Accesorios", "Otros"];
const GENEROS = ["Mujer", "Hombre", "Unisex", "Niños"];
const TALLES_RAPIDOS = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "1", "2", "3", "4", "5", "6", "Único"];
const ORDEN_T = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", ...Array.from({ length: 20 }, (_, i) => String(i + 1)), "Único"];

// ================= Utilidades =================
const fmt = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const $$m = n => fmt.format(Math.round(+n || 0));
const num = n => new Intl.NumberFormat("es-AR").format(Math.round(+n || 0));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sum = (a, f) => a.reduce((t, x) => t + (+f(x) || 0), 0);
const iniciales = s => (s || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
const normal = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const ordenTalle = t => { const i = ORDEN_T.indexOf(t); return i < 0 ? 99 : i; };
const stockTotal = p => sum(p.variantes || [], v => v.stock);
const margen = (costo, precio) => costo > 0 ? Math.round((precio / costo - 1) * 100) : 0;
const conf = () => ({ nombre: "DYNOVA wear", whatsapp: "", instagram: "", margen: 100, minimo: 0, redondeo: 100, gracias: "¡Gracias por tu compra! 💚", ...(S.ajustes.negocio || {}) });
const redondear = (n, r = conf().redondeo) => r > 0 ? Math.round(n / r) * r : Math.round(n);
const provNombre = id => S.proveedores.find(p => p.id === id)?.nombre || "";
const hora = f => new Date(f).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
const fechaLarga = f => new Date(f).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const ordenarVar = vs => [...(vs || [])].sort((a, b) => ordenTalle(a.talle) - ordenTalle(b.talle) || (a.color || "").localeCompare(b.color || ""));
const etiquetaVar = v => v.talle + (v.color ? ` · ${v.color}` : "");
function waLink(tel, texto) {
  let d = String(tel || "").replace(/\D/g, "");
  if (d.startsWith("0")) d = d.slice(1);
  if (d && !d.startsWith("54")) d = "549" + d.replace(/^15/, "");
  return `https://wa.me/${d}?text=${encodeURIComponent(texto)}`;
}

function rango(p, base = new Date()) {
  const h = new Date(base); h.setHours(0, 0, 0, 0);
  const d = new Date(h);
  const sig = x => { const y = new Date(x); y.setDate(y.getDate() + 1); return y; };
  switch (p) {
    case "hoy": return [d, sig(h)];
    case "ayer": { const a = new Date(d); a.setDate(a.getDate() - 1); return [a, d]; }
    case "semana": { const a = new Date(d); a.setDate(a.getDate() - 6); return [a, sig(h)]; }
    case "mes": return [new Date(h.getFullYear(), h.getMonth(), 1), new Date(h.getFullYear(), h.getMonth() + 1, 1)];
    case "mespasado": return [new Date(h.getFullYear(), h.getMonth() - 1, 1), new Date(h.getFullYear(), h.getMonth(), 1)];
    case "anio": return [new Date(h.getFullYear(), 0, 1), new Date(h.getFullYear() + 1, 0, 1)];
    default: return [null, null];
  }
}
const mesOffset = off => { const n = new Date(); return [new Date(n.getFullYear(), n.getMonth() + off, 1), new Date(n.getFullYear(), n.getMonth() + off + 1, 1)]; };

function toast(msg, err = false) {
  const t = document.createElement("div");
  t.className = "toast" + (err ? " err" : "");
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), err ? 4500 : 2500);
}
async function intentar(fn, btn) {
  if (btn) btn.disabled = true;
  try { return await fn(); }
  catch (e) { console.error(e); toast(e.message || "Algo salió mal", true); }
  finally { if (btn) btn.disabled = false; }
}

// ---- Hoja inferior ----
let hojaActual = null;
function abrirHoja(html, alMontar) {
  cerrarHoja();
  const f = document.createElement("div"); f.className = "fondo";
  const h = document.createElement("div"); h.className = "hoja glass";
  h.innerHTML = `<div class="asa"></div>${html}`;
  f.onclick = cerrarHoja;
  document.body.append(f, h);
  hojaActual = { f, h };
  alMontar?.(h);
  return h;
}
function cerrarHoja() { if (hojaActual) { hojaActual.f.remove(); hojaActual.h.remove(); hojaActual = null; } }
document.addEventListener("keydown", e => { if (e.key === "Escape") cerrarHoja(); });
function confirmar(msg, si = "Sí", peligro = true) {
  return new Promise(res => {
    abrirHoja(`<h3>${esc(msg)}</h3><div class="acciones" style="justify-content:flex-end">
      <button class="btn" data-r="0">Cancelar</button><button class="btn ${peligro ? "peligro" : "pri"}" data-r="1">${esc(si)}</button></div>`,
    h => $$("[data-r]", h).forEach(b => b.onclick = () => { cerrarHoja(); res(b.dataset.r === "1"); }));
  });
}
const pills = (lista, activo, attr = "data-p", extra = "") =>
  lista.map(x => { const [v, l] = Array.isArray(x) ? x : [x, x]; return `<button class="pill ${v === activo ? "on" : ""}" ${attr}="${esc(v)}" ${extra}>${l}</button>`; }).join("");
function activarPills(cont, attr, alElegir) {
  $$(`[${attr}]`, cont).forEach(b => b.onclick = () => {
    $$(`[${attr}]`, cont).forEach(x => x.classList.toggle("on", x === b));
    alElegir(b.getAttribute(attr), b);
  });
}
const ICO_BUSCAR = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>`;

function descargarCSV(nombre, filas) {
  const csv = filas.map(r => r.map(c => {
    const s = String(c ?? "");
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(";")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = nombre; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ================= Datos =================
async function cargarCatalogo() {
  const c = await S.api.catalogo();
  S.proveedores = c.proveedores;
  S.productos = c.productos;
}
function reemplazarProducto(p) {
  const i = S.productos.findIndex(x => x.id === p.id);
  if (i >= 0) S.productos[i] = p; else S.productos.push(p);
  S.productos.sort((a, b) => a.nombre.localeCompare(b.nombre));
}
const categorias = () => [...new Set([...CATS_PROD, ...S.productos.map(p => p.categoria).filter(Boolean)])];
const catsUsadas = () => [...new Set(S.productos.map(p => p.categoria || "Otros"))].sort((a, b) => CATS_PROD.indexOf(a) - CATS_PROD.indexOf(b));

// ================= Router =================
const VISTAS = { inicio: vInicio, vender: vVender, stock: vStock, ventas: vVentas, gastos: vGastos, mas: vMas };
async function router() {
  const [v, sub] = (location.hash.slice(1) || "inicio").split("/");
  $$("#tabs a").forEach(a => a.classList.toggle("on", a.dataset.v === v));
  cerrarHoja();
  window.scrollTo(0, 0);
  try { await (VISTAS[v] || vInicio)(sub); }
  catch (e) { console.error(e); vista.innerHTML = `<div class="vacio glass"><div class="emo">⚠️</div>${esc(e.message)}</div>`; }
}
window.addEventListener("hashchange", router);

// ================= INICIO =================
async function vInicio() {
  const per = S.filtros.inicio;
  vista.innerHTML = `<h1>Hola 👋</h1>
    <div class="pills">${pills([["hoy", "Hoy"], ["semana", "7 días"], ["mes", "Este mes"], ["mespasado", "Mes pasado"], ["anio", "Este año"]], per)}</div>
    <div id="dash"><div class="cargando">Cargando…</div></div>`;
  activarPills(vista, "data-p", p => { S.filtros.inicio = p; vInicio(); });
  const [d, h] = rango(per);
  const [ventas, gastos, compras] = await Promise.all([S.api.ventas(d, h), S.api.gastos(d, h), S.api.compras(d, h)]);
  const act = ventas.filter(v => !v.anulada);
  const total = sum(act, v => v.total), costo = sum(act, v => v.costo_total);
  const bruta = total - costo, gt = sum(gastos, g => g.monto), neta = bruta - gt;
  const items = act.flatMap(v => v.venta_items || []);
  const unidades = sum(items, i => i.cantidad);
  const activos = S.productos.filter(p => p.activo !== false);
  const vars = activos.flatMap(p => (p.variantes || []).map(v => ({ ...v, p })));
  const uStock = sum(vars, v => v.stock), vCosto = sum(vars, v => v.stock * v.p.costo), vVenta = sum(vars, v => v.stock * v.p.precio);
  const bajos = vars.filter(v => v.stock > 0 && v.stock <= (v.stock_minimo ?? 0));
  const agotados = activos.filter(p => stockTotal(p) === 0);
  const comprasT = sum(compras, m => m.cantidad * (m.costo_unit || 0));

  // agrupado para el gráfico
  let grupos = [];
  if (per === "hoy") {
    for (let i = 9; i <= 21; i++) grupos.push({ k: i, l: i, v: 0 });
    act.forEach(v => { const hh = new Date(v.fecha).getHours(); const g = grupos.find(x => x.k === Math.min(21, Math.max(9, hh))); g.v += +v.total; });
  } else if (per === "anio") {
    grupos = MESES.map((m, i) => ({ k: i, l: m[0].toUpperCase(), v: 0 }));
    act.forEach(v => grupos[new Date(v.fecha).getMonth()].v += +v.total);
  } else {
    for (let x = new Date(d); x < h && x <= new Date(); x.setDate(x.getDate() + 1)) grupos.push({ k: dia(x), l: x.getDate(), v: 0 });
    act.forEach(v => { const g = grupos.find(x => x.k === dia(new Date(v.fecha))); if (g) g.v += +v.total; });
  }
  const maxG = Math.max(1, ...grupos.map(g => g.v));

  const top = {};
  items.forEach(i => { const t = top[i.producto_nombre] ||= { n: i.producto_nombre, u: 0, $: 0 }; t.u += i.cantidad; t.$ += i.cantidad * i.precio_unit; });
  const topL = Object.values(top).sort((a, b) => b.u - a.u || b.$ - a.$).slice(0, 6);
  const met = {};
  act.forEach(v => met[v.metodo_pago] = (met[v.metodo_pago] || 0) + +v.total);
  const metL = Object.entries(met).sort((a, b) => b[1] - a[1]);
  const maxT = Math.max(1, ...topL.map(t => t.u)), maxM = Math.max(1, ...metL.map(m => m[1]));

  $("#dash").innerHTML = `
    <div class="grid g4">
      <div class="kpi glass destacado"><div class="l">Ventas</div><div class="v">${$$m(total)}</div><div class="d">${act.length} ventas · ${unidades} prendas</div></div>
      <div class="kpi glass"><div class="l">Ganancia bruta</div><div class="v pos">${$$m(bruta)}</div><div class="d">ventas − costo de lo vendido${total ? ` · ${Math.round(bruta / total * 100)}%` : ""}</div></div>
      <div class="kpi glass"><div class="l">Gastos</div><div class="v">${$$m(gt)}</div><div class="d">${gastos.length} gastos cargados</div></div>
      <div class="kpi glass"><div class="l">Ganancia neta</div><div class="v ${neta >= 0 ? "pos" : "neg"}">${$$m(neta)}</div><div class="d">bruta − gastos</div></div>
    </div>
    <div class="grid g2 sec">
      <div class="card glass"><h2>Ventas ${per === "hoy" ? "por hora" : per === "anio" ? "por mes" : "por día"}</h2>
        ${act.length ? `<div class="barras">${grupos.map(g => `<div class="b" title="${esc(g.l)}: ${$$m(g.v)}"><span style="height:${g.v / maxG * 100}%"></span><small>${g.l}</small></div>`).join("")}</div>`
          : `<div class="vacio"><div class="emo">🛍️</div>Todavía no hay ventas en este período</div>`}
        ${act.length ? `<div class="mini" style="margin-top:8px">Ticket promedio ${$$m(total / act.length)}</div>` : ""}
      </div>
      <div class="card glass"><h2>Lo más vendido</h2>
        ${topL.length ? topL.map(t => `<div class="hbar"><span class="nm">${esc(t.n)}</span><span class="tr"><span style="width:${t.u / maxT * 100}%"></span></span><span class="vl">${t.u} u.</span></div>`).join("") : `<div class="vacio">—</div>`}
        ${metL.length ? `<div class="sep"></div><h2>Cómo te pagaron</h2>${metL.map(([m, v]) => `<div class="hbar"><span class="nm">${esc(m)}</span><span class="tr"><span style="width:${v / maxM * 100}%"></span></span><span class="vl">${$$m(v)}</span></div>`).join("")}` : ""}
      </div>
    </div>
    <div class="grid g4 sec">
      <div class="kpi glass"><div class="l">Prendas en stock</div><div class="v">${num(uStock)}</div><div class="d">${activos.length} modelos</div></div>
      <div class="kpi glass"><div class="l">Stock al costo</div><div class="v">${$$m(vCosto)}</div><div class="d">lo que pagaste</div></div>
      <div class="kpi glass"><div class="l">Stock a la venta</div><div class="v">${$$m(vVenta)}</div><div class="d">si vendés todo · gan. ${$$m(vVenta - vCosto)}</div></div>
      <div class="kpi glass"><div class="l">Compras de mercadería</div><div class="v">${$$m(comprasT)}</div><div class="d">ingresadas en el período</div></div>
    </div>
    <div class="card glass sec">
      <h2>⚠️ Para reponer</h2>
      ${bajos.length || agotados.length ? `
        ${bajos.length ? `<div class="mini" style="margin-bottom:6px">Queda poco (${bajos.length})</div><div class="talles" style="margin-bottom:12px">${bajos.slice(0, 40).map(v => `<span class="t bajo">${esc(v.p.nombre)} <i>${esc(etiquetaVar(v))} · ${v.stock}</i></span>`).join("")}</div>` : ""}
        ${agotados.length ? `<div class="mini" style="margin-bottom:6px">Agotados (${agotados.length})</div><div class="talles">${agotados.slice(0, 60).map(p => `<span class="t cero">${esc(p.nombre)}</span>`).join("")}</div>` : ""}
        <div style="margin-top:12px"><a class="btn chico" href="#stock">Ver stock</a></div>`
        : `<div class="sub">Todo con stock 👌</div>`}
    </div>`;
}

// ================= VENDER =================
function vVender() {
  const f = S.filtros.vender;
  vista.innerHTML = `<h1>Nueva venta</h1>
    <div class="buscar">${ICO_BUSCAR}<input class="in" id="q" placeholder="Buscar prenda, código o proveedor…" value="${esc(f.q)}" autocomplete="off"></div>
    <div class="pills" id="cats">${pills(["Todas", ...catsUsadas()], f.cat)}</div>
    <div class="prods" id="prods"></div>`;
  const pintar = () => {
    const q = normal(f.q);
    let lista = S.productos.filter(p => p.activo !== false
      && (f.cat === "Todas" || (p.categoria || "Otros") === f.cat)
      && (!q || normal(`${p.nombre} ${p.codigo || ""} ${provNombre(p.proveedor_id)}`).includes(q)));
    lista.sort((a, b) => (stockTotal(b) > 0) - (stockTotal(a) > 0) || a.nombre.localeCompare(b.nombre));
    $("#prods").innerHTML = lista.length ? lista.map(p => {
      const st = stockTotal(p);
      return `<button class="prod glass ${st ? "" : "sin"}" data-id="${p.id}">
        <span class="nom">${esc(p.nombre)}</span>
        <span class="st">${st ? `${st} en stock · ${ordenarVar(p.variantes).filter(v => v.stock > 0).map(v => esc(v.talle)).join(" ")}` : "Sin stock"}</span>
        <span class="pre">${$$m(p.precio)}</span></button>`;
    }).join("") : `<div class="vacio" style="grid-column:1/-1"><div class="emo">🔍</div>No encontré nada</div>`;
    $$(".prod", vista).forEach(b => b.onclick = () => elegirTalle(+b.dataset.id));
  };
  $("#q").oninput = e => { f.q = e.target.value; pintar(); };
  activarPills($("#cats"), "data-p", c => { f.cat = c; pintar(); });
  pintar();
  pintarCarrito();
}

function elegirTalle(id) {
  const p = S.productos.find(x => x.id === id);
  const vs = ordenarVar(p.variantes);
  const enCarrito = vid => sum(S.carrito.filter(c => c.variante_id === vid), c => c.cantidad);
  let sel = vs.find(v => v.stock - enCarrito(v.id) > 0)?.id, cant = 1;
  abrirHoja(`<h3>${esc(p.nombre)}</h3>
    <div class="sub" style="margin:-8px 0 14px">${esc([p.categoria, provNombre(p.proveedor_id)].filter(Boolean).join(" · "))}</div>
    ${vs.length ? `<div class="campo"><label>Talle</label><div class="pills wrap" id="tv">
      ${vs.map(v => { const libre = v.stock - enCarrito(v.id); return `<button class="pill ${v.id === sel ? "on" : ""}" data-v="${v.id}" ${libre > 0 ? "" : "disabled"}>${esc(etiquetaVar(v))}<span class="n">${libre}</span></button>`; }).join("")}
    </div></div>` : `<div class="sub">Esta prenda no tiene talles cargados. Cargalos desde Stock.</div>`}
    <div class="fila2">
      <div class="campo"><label>Cantidad</label><div class="stepper"><button class="redondo" id="menos">−</button><b id="cant">1</b><button class="redondo" id="mas">+</button></div></div>
      <div class="campo"><label>Precio c/u</label><input class="in" id="precio" type="number" inputmode="numeric" value="${+p.precio}"></div>
    </div>
    <button class="btn pri full" id="agregar" ${sel ? "" : "disabled"}>Agregar a la venta</button>`, h => {
    const maxSel = () => { const v = vs.find(x => x.id === sel); return v ? v.stock - enCarrito(v.id) : 0; };
    activarPills($("#tv", h) || h, "data-v", v => { sel = +v; cant = Math.min(cant, maxSel()) || 1; $("#cant", h).textContent = cant; $("#agregar", h).disabled = false; });
    $("#menos", h).onclick = () => { cant = Math.max(1, cant - 1); $("#cant", h).textContent = cant; };
    $("#mas", h).onclick = () => { if (cant < maxSel()) cant++; else toast("No hay más stock de ese talle"); $("#cant", h).textContent = cant; };
    $("#agregar", h).onclick = () => {
      const v = vs.find(x => x.id === sel);
      const precio = +$("#precio", h).value || 0;
      const ya = S.carrito.find(c => c.variante_id === v.id && c.precio_unit === precio);
      if (ya) ya.cantidad += cant;
      else S.carrito.push({ variante_id: v.id, producto_id: p.id, nombre: p.nombre, talle: v.talle, color: v.color, cantidad: cant, precio_unit: precio, stock: v.stock });
      cerrarHoja(); pintarCarrito(); toast(`Agregado: ${p.nombre} ${etiquetaVar(v)}`);
    };
  });
}

function pintarCarrito() {
  $(".carrito-bar")?.remove();
  if (!S.carrito.length || !location.hash.startsWith("#vender")) return;
  const u = sum(S.carrito, c => c.cantidad), t = sum(S.carrito, c => c.cantidad * c.precio_unit);
  const bar = document.createElement("div");
  bar.className = "carrito-bar glass";
  bar.innerHTML = `<div class="info">🛍️ ${u} prenda${u > 1 ? "s" : ""}<b>${$$m(t)}</b></div><button class="btn pri">Cobrar ›</button>`;
  bar.onclick = abrirCobro;
  document.body.appendChild(bar);
}
window.addEventListener("hashchange", () => { if (!location.hash.startsWith("#vender")) $(".carrito-bar")?.remove(); });

async function abrirCobro() {
  let clientes = [];
  intentar(async () => { clientes = await S.api.clientes(); const dl = $("#dlCli"); if (dl) dl.innerHTML = clientes.map(c => `<option value="${esc(c.nombre)}">`).join(""); });
  const st = { metodo: "Efectivo", canal: "Local", descTipo: "$" };
  abrirHoja(`<h3>Cobrar</h3>
    <div id="items"></div>
    <div class="sep"></div>
    <div class="campo"><label>Cómo paga</label><div class="pills wrap" id="met">${pills(METODOS, st.metodo, "data-m")}</div></div>
    <div class="fila2">
      <div class="campo"><label>Descuento <span class="pills" style="display:inline-flex;padding:0;vertical-align:middle" id="dt">${pills(["$", "%"], "$", "data-d", 'style="padding:2px 10px;font-size:12px"')}</span></label><input class="in" id="desc" type="number" inputmode="decimal" placeholder="0"></div>
      <div class="campo"><label>Recargo ($)</label><input class="in" id="rec" type="number" inputmode="decimal" placeholder="0"></div>
    </div>
    <div class="campo"><label>Dónde se vendió</label><div class="pills wrap" id="can">${pills(CANALES, st.canal, "data-c")}</div></div>
    <div class="fila2">
      <div class="campo"><label>Cliente (opcional)</label><input class="in" id="cli" list="dlCli" placeholder="Nombre" autocomplete="off"><datalist id="dlCli"></datalist></div>
      <div class="campo"><label>WhatsApp (opcional)</label><input class="in" id="tel" type="tel" inputmode="tel" placeholder="11 2345 6789"></div>
    </div>
    <div class="campo"><label>Nota</label><input class="in" id="nota" placeholder="Ej: seña, cambio, regalo…"></div>
    <div class="sep"></div>
    <div class="total-g"><span>Subtotal</span><span id="sub"></span></div>
    <div class="total-g" id="filaDesc"></div>
    <div class="total-g big"><span>Total</span><span id="tot"></span></div>
    <button class="btn pri full" id="confirmar" style="margin-top:10px">✓ Confirmar venta</button>`, h => {
    const calc = () => {
      const sub = sum(S.carrito, c => c.cantidad * c.precio_unit);
      const dv = +$("#desc", h).value || 0;
      const desc = st.descTipo === "%" ? Math.round(sub * dv / 100) : dv;
      const rec = +$("#rec", h).value || 0;
      $("#sub", h).textContent = $$m(sub);
      $("#filaDesc", h).innerHTML = desc || rec ? `<span>${desc ? "Descuento" : ""}${desc && rec ? " / " : ""}${rec ? "Recargo" : ""}</span><span>${desc ? "−" + $$m(desc) : ""} ${rec ? "+" + $$m(rec) : ""}</span>` : "";
      $("#tot", h).textContent = $$m(Math.max(sub - desc + rec, 0));
      return { sub, desc, rec, total: Math.max(sub - desc + rec, 0) };
    };
    const pintarItems = () => {
      $("#items", h).innerHTML = S.carrito.map((c, i) => `<div class="var-fila">
        <div><b>${esc(c.nombre)}</b><div class="mini">${esc(etiquetaVar(c))} · ${$$m(c.precio_unit)} c/u</div></div>
        <div class="stepper"><button class="redondo" data-a="-" data-i="${i}">${c.cantidad === 1 ? "🗑" : "−"}</button><b>${c.cantidad}</b><button class="redondo" data-a="+" data-i="${i}">+</button></div></div>`).join("");
      $$("[data-a]", h).forEach(b => b.onclick = () => {
        const c = S.carrito[+b.dataset.i];
        if (b.dataset.a === "+") { if (c.cantidad < c.stock) c.cantidad++; else toast("No hay más stock de ese talle"); }
        else if (--c.cantidad <= 0) S.carrito.splice(+b.dataset.i, 1);
        pintarCarrito();
        if (!S.carrito.length) return cerrarHoja();
        pintarItems(); calc();
      });
    };
    pintarItems(); calc();
    activarPills($("#met", h), "data-m", m => st.metodo = m);
    activarPills($("#can", h), "data-c", c => st.canal = c);
    activarPills($("#dt", h), "data-d", d => { st.descTipo = d; calc(); });
    $("#desc", h).oninput = calc; $("#rec", h).oninput = calc;
    $("#cli", h).oninput = e => { const c = clientes.find(x => x.nombre === e.target.value); if (c?.telefono) $("#tel", h).value = c.telefono; };
    $("#confirmar", h).onclick = e => intentar(async () => {
      const t = calc();
      const nombre = $("#cli", h).value.trim(), tel = $("#tel", h).value.trim();
      let cliente = clientes.find(x => x.nombre.toLowerCase() === nombre.toLowerCase());
      if (nombre && !cliente) cliente = await S.api.guardarCliente({ nombre, telefono: tel || null });
      else if (cliente && tel && cliente.telefono !== tel) await S.api.guardarCliente({ id: cliente.id, telefono: tel });
      const items = S.carrito.map(c => ({ variante_id: c.variante_id, cantidad: c.cantidad, precio_unit: c.precio_unit }));
      const resumen = S.carrito.map(c => ({ ...c }));
      const id = await S.api.vender({ items, metodo: st.metodo, canal: st.canal, descuento: t.desc, recargo: t.rec,
        cliente_id: cliente?.id || null, cliente_nombre: nombre || null, nota: $("#nota", h).value });
      // descontar en pantalla sin esperar
      for (const c of S.carrito) { const p = S.productos.find(x => x.id === c.producto_id); const v = p?.variantes.find(x => x.id === c.variante_id); if (v) v.stock -= c.cantidad; }
      S.carrito = [];
      pintarCarrito();
      cargarCatalogo().catch(() => {});
      ventaHecha(id, resumen, t, st.metodo, nombre, tel);
      if (location.hash.startsWith("#vender")) vVender();
    }, e.currentTarget);
  });
}

function ventaHecha(id, items, t, metodo, nombre, tel) {
  const c = conf();
  const texto = `*${c.nombre}*\n${c.gracias}\n\n${items.map(i => `${i.cantidad}x ${i.nombre} (${etiquetaVar(i)}) ${$$m(i.cantidad * i.precio_unit)}`).join("\n")}`
    + (t.desc ? `\nDescuento −${$$m(t.desc)}` : "") + (t.rec ? `\nRecargo +${$$m(t.rec)}` : "")
    + `\n\n*Total: ${$$m(t.total)}*\nPago: ${metodo}` + (c.instagram ? `\n\nSeguinos en Instagram: ${c.instagram}` : "");
  abrirHoja(`<div style="text-align:center;padding:10px 0">
      <div style="font-size:54px">✅</div><h3>¡Venta registrada!</h3>
      <div class="total-g big" style="justify-content:center;gap:10px"><span>${$$m(t.total)}</span></div>
      <div class="sub">Venta #${id} · el stock ya se descontó</div></div>
    <div class="acciones" style="flex-direction:column;align-items:stretch;margin-top:14px">
      ${tel ? `<a class="btn wa-btn" target="_blank" rel="noopener" href="${waLink(tel, texto)}">💬 Mandar comprobante a ${esc(nombre || "cliente")}</a>` : `<a class="btn wa-btn" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(texto)}">💬 Compartir comprobante por WhatsApp</a>`}
      <button class="btn pri" id="otra">Nueva venta</button>
    </div>`, h => { $("#otra", h).onclick = cerrarHoja; });
}

// ================= STOCK =================
function vStock() {
  const f = S.filtros.stock;
  vista.innerHTML = `<h1>Stock</h1>
    <div class="buscar">${ICO_BUSCAR}<input class="in" id="q" placeholder="Buscar prenda…" value="${esc(f.q)}" autocomplete="off"></div>
    <div class="pills" id="cats">${pills(["Todas", ...catsUsadas()], f.cat)}</div>
    <div class="pills" id="est">${pills([["", "Todo"], ["bajo", "⚠️ Queda poco"], ["cero", "Agotados"], ["con", "Con stock"]], f.estado, "data-e")}
      <select class="pill" id="prov" style="padding-right:10px"><option value="">Todos los proveedores</option>${S.proveedores.map(p => `<option value="${p.id}" ${+f.prov === p.id ? "selected" : ""}>${esc(p.nombre)}</option>`).join("")}</select>
      <select class="pill" id="ord"><option value="nombre">A-Z</option><option value="stock">Más stock</option><option value="poco">Menos stock</option><option value="precio">Precio</option><option value="margen">Margen</option></select>
    </div>
    <div id="resumen" class="sub" style="margin:0 6px 10px"></div>
    <div class="acciones" style="margin-bottom:12px">
      <button class="btn chico" id="precios">％ Actualizar precios</button>
      <button class="btn chico" id="exp">⬇︎ Exportar</button>
    </div>
    <div class="glass lista" id="lista"></div>
    <button class="fab" id="nuevo">＋ Prenda</button>`;
  $("#ord").value = f.orden;
  const filtrados = () => {
    const q = normal(f.q);
    let l = S.productos.filter(p =>
      (f.cat === "Todas" || (p.categoria || "Otros") === f.cat)
      && (!f.prov || p.proveedor_id === +f.prov)
      && (!q || normal(`${p.nombre} ${p.codigo || ""} ${provNombre(p.proveedor_id)}`).includes(q))
      && (f.estado !== "cero" || stockTotal(p) === 0)
      && (f.estado !== "con" || stockTotal(p) > 0)
      && (f.estado !== "bajo" || (p.variantes || []).some(v => v.stock > 0 && v.stock <= (v.stock_minimo ?? 0))));
    const o = { nombre: (a, b) => a.nombre.localeCompare(b.nombre), stock: (a, b) => stockTotal(b) - stockTotal(a), poco: (a, b) => stockTotal(a) - stockTotal(b),
      precio: (a, b) => b.precio - a.precio, margen: (a, b) => margen(b.costo, b.precio) - margen(a.costo, a.precio) }[f.orden];
    return l.sort(o);
  };
  const pintar = () => {
    const l = filtrados();
    const u = sum(l, stockTotal);
    $("#resumen").textContent = `${l.length} prendas · ${num(u)} unidades · al costo ${$$m(sum(l, p => stockTotal(p) * p.costo))} · a la venta ${$$m(sum(l, p => stockTotal(p) * p.precio))}`;
    $("#lista").innerHTML = l.length ? l.map(p => {
      const vs = ordenarVar(p.variantes);
      return `<div class="fila" data-id="${p.id}">
        <div class="info"><div class="tit">${esc(p.nombre)}</div>
          <div class="mini" style="margin:2px 0 6px">${esc([p.categoria, p.genero, provNombre(p.proveedor_id)].filter(Boolean).join(" · "))}</div>
          <div class="talles">${vs.length ? vs.map(v => `<span class="t ${v.stock <= 0 ? "cero" : v.stock <= (v.stock_minimo ?? 0) ? "bajo" : ""}">${esc(etiquetaVar(v))} <i>${v.stock}</i></span>`).join("") : `<span class="t cero">sin talles</span>`}</div></div>
        <div class="der"><div class="monto">${$$m(p.precio)}</div><div class="mini">costo ${$$m(p.costo)}</div><div class="mini pos">+${margen(p.costo, p.precio)}%</div></div></div>`;
    }).join("") : `<div class="vacio"><div class="emo">👕</div>No hay prendas con ese filtro</div>`;
    $$(".fila", $("#lista")).forEach(r => r.onclick = () => editarProducto(+r.dataset.id));
  };
  $("#q").oninput = e => { f.q = e.target.value; pintar(); };
  activarPills($("#cats"), "data-p", c => { f.cat = c; pintar(); });
  activarPills($("#est"), "data-e", c => { f.estado = c; pintar(); });
  $("#prov").onchange = e => { f.prov = e.target.value; pintar(); };
  $("#ord").onchange = e => { f.orden = e.target.value; pintar(); };
  $("#nuevo").onclick = () => editarProducto(null);
  $("#precios").onclick = () => actualizarPrecios(filtrados());
  $("#exp").onclick = () => descargarCSV(`stock-dynova-${dia(new Date())}.csv`, [
    ["Prenda", "Categoría", "Género", "Proveedor", "Código", "Talle", "Color", "Stock", "Costo", "Precio", "Margen %"],
    ...S.productos.flatMap(p => (p.variantes?.length ? ordenarVar(p.variantes) : [{ talle: "", color: "", stock: 0 }]).map(v =>
      [p.nombre, p.categoria, p.genero, provNombre(p.proveedor_id), p.codigo, v.talle, v.color, v.stock, p.costo, p.precio, margen(p.costo, p.precio)]))]);
  pintar();
}

function editarProducto(id) {
  const p = id ? S.productos.find(x => x.id === id) : { nombre: "", categoria: "", genero: "", proveedor_id: null, codigo: "", costo: "", precio: "", notas: "", variantes: [] };
  const c = conf();
  const nuevas = []; // talles nuevos {talle,color,stock}
  let modoIngreso = false;
  abrirHoja(`<h3>${id ? "Editar prenda" : "Nueva prenda"}</h3>
    <div class="campo"><label>Nombre</label><input class="in" id="nom" value="${esc(p.nombre)}" placeholder="Ej: Top Bretel Negro"></div>
    <div class="fila2">
      <div class="campo"><label>Categoría</label><input class="in" id="cat" list="dlCat" value="${esc(p.categoria || "")}" placeholder="Top, Calza…"><datalist id="dlCat">${categorias().map(x => `<option value="${esc(x)}">`).join("")}</datalist></div>
      <div class="campo"><label>Proveedor</label><select class="in" id="prov"><option value="">—</option>${S.proveedores.map(x => `<option value="${x.id}" ${x.id === p.proveedor_id ? "selected" : ""}>${esc(x.nombre)}</option>`).join("")}<option value="nuevo">＋ Nuevo proveedor…</option></select></div>
    </div>
    <div class="campo"><label>Para</label><div class="pills wrap" id="gen">${pills(GENEROS, p.genero || "", "data-g")}</div></div>
    <div class="fila3">
      <div class="campo"><label>Costo</label><input class="in" id="costo" type="number" inputmode="decimal" value="${p.costo}"></div>
      <div class="campo"><label>Ganancia %</label><input class="in" id="marg" type="number" inputmode="decimal" value="${id ? margen(p.costo, p.precio) : c.margen}"></div>
      <div class="campo"><label>Precio venta</label><input class="in" id="precio" type="number" inputmode="decimal" value="${p.precio}"></div>
    </div>
    <div class="mini" id="ganTxt" style="margin:-4px 4px 12px"></div>
    <div class="campo"><label>Código (opcional)</label><input class="in" id="cod" value="${esc(p.codigo || "")}" placeholder="SKU o código de barras"></div>
    <div class="sep"></div>
    <div style="display:flex;justify-content:space-between;align-items:center"><h2 style="margin:0">Talles y stock</h2>
      ${id && p.variantes.length ? `<button class="btn chico" id="ingreso">📦 Ingresar mercadería</button>` : ""}</div>
    <div id="vars"></div>
    <div class="campo" style="margin-top:12px"><label>Agregar talle <span class="mini">(si va por color, escribilo primero)</span></label>
      <input class="in" id="colorNuevo" placeholder="Color (opcional): Negro, Berry…" style="margin-bottom:8px"><div class="pills wrap" id="rap">${TALLES_RAPIDOS.map(t => `<button class="pill" data-t="${t}">${t}</button>`).join("")}<button class="pill" data-t="otro">Otro…</button></div></div>
    <div class="campo"><label>Notas</label><textarea class="in" id="notas" rows="2">${esc(p.notas || "")}</textarea></div>
    <div class="acciones" style="justify-content:space-between;margin-top:8px">
      ${id ? `<button class="btn peligro" id="borrar">Eliminar</button>` : "<span></span>"}
      <div class="acciones"><button class="btn" id="cancelar">Cancelar</button><button class="btn pri" id="guardar">Guardar</button></div>
    </div>`, h => {
    let genero = p.genero || "";
    activarPills($("#gen", h), "data-g", g => genero = g);
    const iCosto = $("#costo", h), iMarg = $("#marg", h), iPrecio = $("#precio", h);
    const gan = () => { const co = +iCosto.value, pr = +iPrecio.value; $("#ganTxt", h).textContent = co && pr ? `Ganás ${$$m(pr - co)} por prenda` : ""; };
    const desdeMargen = () => { if (+iCosto.value) iPrecio.value = redondear(+iCosto.value * (1 + (+iMarg.value || 0) / 100)); gan(); };
    iCosto.oninput = () => { if (+iMarg.value || !+iPrecio.value) desdeMargen(); else gan(); };
    iMarg.oninput = desdeMargen;
    iPrecio.oninput = () => { iMarg.value = margen(+iCosto.value, +iPrecio.value); gan(); };
    gan();
    $("#prov", h).onchange = async e => {
      if (e.target.value !== "nuevo") return;
      const n = prompt("Nombre del proveedor");
      if (!n?.trim()) { e.target.value = ""; return; }
      await intentar(async () => {
        const np = await S.api.guardarProveedor({ nombre: n.trim() });
        S.proveedores.push(np); S.proveedores.sort((a, b) => a.nombre.localeCompare(b.nombre));
        const o = document.createElement("option"); o.value = np.id; o.textContent = np.nombre; o.selected = true;
        e.target.insertBefore(o, e.target.lastElementChild);
      });
    };

    const pintarVars = () => {
      const vs = ordenarVar(p.variantes);
      $("#vars", h).innerHTML = (vs.length || nuevas.length) ? [
        ...vs.map(v => `<div class="var-fila" data-vid="${v.id}">
          <div><b>${esc(etiquetaVar(v))}</b> <span class="mini">· avisar con ≤ <input type="number" class="in" data-min="${v.id}" value="${v.stock_minimo ?? 0}" style="width:58px;padding:4px 8px;font-size:13px;display:inline-block"></span></div>
          ${modoIngreso ? `<div class="stepper"><span class="mini">${v.stock} +</span><input class="in" type="number" inputmode="numeric" data-ing="${v.id}" placeholder="0" style="width:80px"></div>`
            : `<div class="stepper"><button class="redondo" data-aj="-1" data-id="${v.id}">−</button><b>${v.stock}</b><button class="redondo" data-aj="1" data-id="${v.id}">+</button><button class="redondo" data-del="${v.id}" title="Quitar talle" style="font-size:14px">✕</button></div>`}
        </div>`),
        ...nuevas.map((n, i) => `<div class="var-fila"><div><b>${esc(etiquetaVar(n))}</b> <span class="mini">nuevo</span></div>
          <div class="stepper"><span class="mini">stock</span><input class="in" type="number" inputmode="numeric" data-nst="${i}" value="${n.stock || ""}" placeholder="0" style="width:80px"><button class="redondo" data-ndel="${i}" style="font-size:14px">✕</button></div></div>`),
      ].join("") + (modoIngreso ? `<div class="fila2" style="margin-top:12px">
          <div class="campo"><label>Costo unitario de esta compra</label><input class="in" id="ingCosto" type="number" value="${+iCosto.value || p.costo}"></div>
          <div class="campo"><label>Nota (factura, proveedor…)</label><input class="in" id="ingNota"></div></div>
          <label class="switch"><input type="checkbox" id="ingAct"> Actualizar el costo de la prenda con este valor</label>
          <button class="btn pri full" id="ingOk" style="margin-top:8px">Sumar al stock</button>` : "")
        : `<div class="sub" style="padding:10px 0">Todavía no tiene talles. Tocá los de abajo para agregarlos.</div>`;

      $$("[data-aj]", h).forEach(b => b.onclick = () => intentar(async () => {
        const v = p.variantes.find(x => x.id === +b.dataset.id);
        const delta = +b.dataset.aj;
        v.stock = await S.api.moverStock(v.id, delta, "ajuste", delta > 0 ? "Ajuste manual +" : "Ajuste manual −");
        pintarVars();
      }, b));
      $$("[data-del]", h).forEach(b => b.onclick = async () => {
        const v = p.variantes.find(x => x.id === +b.dataset.del);
        if (!await confirmar(`¿Quitar el talle ${etiquetaVar(v)}${v.stock ? ` (tiene ${v.stock} en stock)` : ""}?`, "Quitar")) return editarProducto(id);
        await intentar(async () => { await S.api.borrarVariante(v.id); p.variantes = p.variantes.filter(x => x.id !== v.id); });
        editarProducto(id);
      });
      $$("[data-nst]", h).forEach(i => i.oninput = () => nuevas[+i.dataset.nst].stock = +i.value || 0);
      $$("[data-ndel]", h).forEach(b => b.onclick = () => { nuevas.splice(+b.dataset.ndel, 1); pintarVars(); });
      const ok = $("#ingOk", h);
      if (ok) ok.onclick = () => intentar(async () => {
        const costo = +$("#ingCosto", h).value || 0, nota = $("#ingNota", h).value || "Ingreso de mercadería";
        let n = 0;
        for (const i of $$("[data-ing]", h)) {
          const q = parseInt(i.value);
          if (q > 0) { const v = p.variantes.find(x => x.id === +i.dataset.ing); v.stock = await S.api.moverStock(v.id, q, "compra", nota, costo); n += q; }
        }
        if (!n) return toast("Poné cuántas entraron de cada talle", true);
        if ($("#ingAct", h).checked && costo) {
          reemplazarProducto(await S.api.guardarProducto({ id: p.id, costo }));
          iCosto.value = costo; iMarg.value = margen(costo, +iPrecio.value);
        }
        toast(`Se sumaron ${n} prendas al stock`);
        modoIngreso = false; pintarVars();
      }, ok);
    };
    pintarVars();
    $("#ingreso", h) && ($("#ingreso", h).onclick = e => { modoIngreso = !modoIngreso; e.target.textContent = modoIngreso ? "Cancelar ingreso" : "📦 Ingresar mercadería"; pintarVars(); });
    $$("[data-t]", h).forEach(b => b.onclick = () => {
      let talle = b.dataset.t;
      const color = $("#colorNuevo", h).value.trim();
      if (talle === "otro") { talle = prompt("Talle (ej: 38, 7/8, S/M)")?.trim(); if (!talle) return; }
      const existe = p.variantes.some(v => v.talle === talle && (v.color || "") === color) || nuevas.some(v => v.talle === talle && v.color === color);
      if (existe) return toast("Ese talle ya está", true);
      nuevas.push({ talle, color, stock: 0 });
      pintarVars();
      $(`[data-nst="${nuevas.length - 1}"]`, h)?.focus();
    });
    $("#cancelar", h).onclick = cerrarHoja;
    $("#borrar", h) && ($("#borrar", h).onclick = async () => {
      if (!await confirmar(`¿Eliminar "${p.nombre}"? Las ventas viejas quedan registradas.`, "Eliminar")) return editarProducto(id);
      await intentar(async () => { await S.api.borrarProducto(id); S.productos = S.productos.filter(x => x.id !== id); toast("Prenda eliminada"); vStock(); });
    });
    $("#guardar", h).onclick = e => intentar(async () => {
      const nombre = $("#nom", h).value.trim();
      if (!nombre) return toast("Falta el nombre", true);
      const prov = $("#prov", h).value;
      const datos = { nombre, categoria: $("#cat", h).value.trim() || null, genero: genero || null, proveedor_id: prov && prov !== "nuevo" ? +prov : null,
        codigo: $("#cod", h).value.trim() || null, costo: +iCosto.value || 0, precio: +iPrecio.value || 0, notas: $("#notas", h).value.trim() || null };
      if (id) datos.id = id;
      let guardado = await S.api.guardarProducto(datos);
      for (const i of $$("[data-min]", h)) {
        const v = p.variantes.find(x => x.id === +i.dataset.min);
        if (v && +i.value !== (v.stock_minimo ?? 0)) await S.api.editarVariante(v.id, { stock_minimo: +i.value || 0 });
      }
      for (const n of nuevas) {
        const v = await S.api.crearVariante({ producto_id: guardado.id, talle: n.talle, color: n.color, stock: 0, stock_minimo: c.minimo, orden: ordenTalle(n.talle) });
        if (n.stock > 0) await S.api.moverStock(v.id, n.stock, "alta", "Stock inicial", +iCosto.value || null);
      }
      await cargarCatalogo();
      toast(id ? "Cambios guardados" : "Prenda creada");
      cerrarHoja();
      if (location.hash.startsWith("#stock") || !location.hash) vStock(); else router();
    }, e.currentTarget);
  });
}

function actualizarPrecios(lista) {
  let red = conf().redondeo;
  abrirHoja(`<h3>Actualizar precios</h3>
    <div class="sub" style="margin-bottom:12px">Se aplica a las <b>${lista.length}</b> prendas que estás viendo (usá los filtros de Stock para elegir).</div>
    <div class="campo"><label>Subir (o bajar con −) un porcentaje</label><input class="in" id="pct" type="number" inputmode="decimal" placeholder="Ej: 10"></div>
    <div class="campo"><label>Redondear a</label><div class="pills wrap" id="red">${pills([[0, "Sin redondeo"], [10, "$10"], [100, "$100"], [500, "$500"], [1000, "$1.000"]].map(([v, l]) => [String(v), l]), String(red), "data-r")}</div></div>
    <div id="prev" class="mini" style="margin-bottom:12px"></div>
    <button class="btn pri full" id="ok">Aplicar</button>`, h => {
    const prev = () => {
      const pct = +$("#pct", h).value || 0;
      const ej = lista.slice(0, 3).map(p => `${esc(p.nombre)}: ${$$m(p.precio)} → <b>${$$m(redondear(p.precio * (1 + pct / 100), red))}</b>`).join("<br>");
      $("#prev", h).innerHTML = pct ? ej : "";
    };
    $("#pct", h).oninput = prev;
    activarPills($("#red", h), "data-r", r => { red = +r; prev(); });
    $("#ok", h).onclick = e => intentar(async () => {
      const pct = +$("#pct", h).value;
      if (!pct) return toast("Poné un porcentaje", true);
      if (!await confirmar(`¿Cambiar el precio de ${lista.length} prendas un ${pct}%?`, "Aplicar", false)) return;
      await S.api.actualizarPrecios(lista.map(p => ({ id: p.id, precio: redondear(p.precio * (1 + pct / 100), red) })));
      await cargarCatalogo();
      toast("Precios actualizados");
      vStock();
    }, e.currentTarget);
  });
}

// ================= VENTAS =================
async function vVentas() {
  const per = S.filtros.ventas;
  vista.innerHTML = `<h1>Ventas</h1>
    <div class="pills">${pills([["hoy", "Hoy"], ["ayer", "Ayer"], ["semana", "7 días"], ["mes", "Este mes"], ["mespasado", "Mes pasado"], ["anio", "Este año"]], per)}</div>
    <div id="cont"><div class="cargando">Cargando…</div></div>`;
  activarPills(vista, "data-p", p => { S.filtros.ventas = p; vVentas(); });
  const [d, h] = rango(per);
  const ventas = await S.api.ventas(d, h);
  const act = ventas.filter(v => !v.anulada);
  const total = sum(act, v => v.total), gan = total - sum(act, v => v.costo_total);
  const porDia = {};
  ventas.forEach(v => (porDia[dia(new Date(v.fecha))] ||= []).push(v));
  $("#cont").innerHTML = `<div class="grid g3">
      <div class="kpi glass destacado"><div class="l">Vendido</div><div class="v">${$$m(total)}</div><div class="d">${act.length} ventas</div></div>
      <div class="kpi glass"><div class="l">Ganancia bruta</div><div class="v pos">${$$m(gan)}</div><div class="d">sin contar gastos</div></div>
      <div class="kpi glass"><div class="l">Prendas</div><div class="v">${sum(act.flatMap(v => v.venta_items), i => i.cantidad)}</div><div class="d">${act.length ? "ticket prom. " + $$m(total / act.length) : "—"}</div></div>
    </div>
    <div class="acciones" style="margin:12px 0 0"><button class="btn chico" id="exp">⬇︎ Exportar</button></div>
    ${ventas.length ? Object.entries(porDia).map(([k, vs]) => `
      <div class="dia-cab"><span style="text-transform:capitalize">${fechaLarga(vs[0].fecha)}</span><span>${$$m(sum(vs.filter(v => !v.anulada), v => v.total))}</span></div>
      <div class="glass lista">${vs.map(v => `<div class="fila ${v.anulada ? "anulada" : ""}" data-id="${v.id}">
        <div class="avatar">${v.cliente_nombre ? esc(iniciales(v.cliente_nombre)) : "🛍"}</div>
        <div class="info"><div class="tit">${esc(v.venta_items.map(i => `${i.cantidad > 1 ? i.cantidad + "× " : ""}${i.producto_nombre} ${i.talle}`).join(", "))}</div>
          <div class="mini">${hora(v.fecha)} · ${esc(v.metodo_pago)}${v.canal && v.canal !== "Local" ? " · " + esc(v.canal) : ""}${v.cliente_nombre ? " · " + esc(v.cliente_nombre) : ""}${v.anulada ? " · ANULADA" : ""}</div></div>
        <div class="der"><div class="monto">${$$m(v.total)}</div><div class="mini pos">+${$$m(v.total - v.costo_total)}</div></div></div>`).join("")}</div>`).join("")
    : `<div class="vacio glass sec"><div class="emo">🧾</div>No hay ventas en este período<br><br><a class="btn pri" href="#vender">Hacer una venta</a></div>`}`;
  $$(".fila", vista).forEach(r => r.onclick = () => detalleVenta(ventas.find(v => v.id === +r.dataset.id)));
  $("#exp").onclick = () => descargarCSV(`ventas-dynova-${per}-${dia(new Date())}.csv`, [
    ["Venta", "Fecha", "Hora", "Cliente", "Pago", "Canal", "Prenda", "Talle", "Color", "Cantidad", "Precio", "Costo", "Descuento venta", "Recargo venta", "Total venta", "Anulada"],
    ...ventas.flatMap(v => v.venta_items.map(i => [v.id, dia(new Date(v.fecha)), hora(v.fecha), v.cliente_nombre, v.metodo_pago, v.canal, i.producto_nombre, i.talle, i.color, i.cantidad, i.precio_unit, i.costo_unit, v.descuento, v.recargo, v.total, v.anulada ? "Sí" : ""]))]);
}

function detalleVenta(v) {
  abrirHoja(`<h3>Venta #${v.id} ${v.anulada ? '<span class="t cero">ANULADA</span>' : ""}</h3>
    <div class="sub" style="margin:-8px 0 12px;text-transform:capitalize">${fechaLarga(v.fecha)} · ${hora(v.fecha)}</div>
    ${v.venta_items.map(i => `<div class="var-fila"><div><b>${esc(i.producto_nombre)}</b><div class="mini">${esc(etiquetaVar(i))} · ${i.cantidad} × ${$$m(i.precio_unit)}</div></div><b>${$$m(i.cantidad * i.precio_unit)}</b></div>`).join("")}
    <div class="sep"></div>
    <div class="total-g"><span>Subtotal</span><span>${$$m(v.subtotal)}</span></div>
    ${+v.descuento ? `<div class="total-g"><span>Descuento</span><span>−${$$m(v.descuento)}</span></div>` : ""}
    ${+v.recargo ? `<div class="total-g"><span>Recargo</span><span>+${$$m(v.recargo)}</span></div>` : ""}
    <div class="total-g big"><span>Total</span><span>${$$m(v.total)}</span></div>
    <div class="total-g"><span class="sub">Costo de la mercadería</span><span class="sub">${$$m(v.costo_total)}</span></div>
    <div class="total-g"><span class="sub">Ganancia</span><span class="pos">${$$m(v.total - v.costo_total)}</span></div>
    <div class="sep"></div>
    <div class="talles"><span class="t">${esc(v.metodo_pago)}</span><span class="t">${esc(v.canal)}</span>${v.cliente_nombre ? `<span class="t">${esc(v.cliente_nombre)}</span>` : ""}</div>
    ${v.nota ? `<p class="sub">📝 ${esc(v.nota)}</p>` : ""}
    ${v.anulada ? "" : `<button class="btn peligro full" id="anular" style="margin-top:16px">Anular venta (devuelve el stock)</button>`}`, h => {
    $("#anular", h) && ($("#anular", h).onclick = async () => {
      if (!await confirmar(`¿Anular la venta #${v.id}? Las prendas vuelven al stock.`, "Anular")) return;
      await intentar(async () => { await S.api.anularVenta(v.id); await cargarCatalogo(); toast("Venta anulada, stock devuelto"); vVentas(); });
    });
  });
}

// ================= GASTOS =================
async function vGastos() {
  const off = S.filtros.mesGastos;
  const [d, h] = mesOffset(off);
  vista.innerHTML = `<h1>Gastos</h1>
    <div class="mes-nav glass"><button class="redondo" id="ant">‹</button><b>${MESES[d.getMonth()]} ${d.getFullYear()}</b><button class="redondo" id="sig">›</button></div>
    <div id="cont"><div class="cargando">Cargando…</div></div>
    <button class="fab" id="nuevo">＋ Gasto</button>`;
  $("#ant").onclick = () => { S.filtros.mesGastos--; vGastos(); };
  $("#sig").onclick = () => { S.filtros.mesGastos++; vGastos(); };
  $("#nuevo").onclick = () => editarGasto(null, d);
  const [gastos, ventas] = await Promise.all([S.api.gastos(d, h), S.api.ventas(d, h)]);
  const act = ventas.filter(v => !v.anulada);
  const total = sum(gastos, g => g.monto), bruta = sum(act, v => v.total - v.costo_total);
  const porCat = {};
  gastos.forEach(g => porCat[g.categoria] = (porCat[g.categoria] || 0) + +g.monto);
  const cats = Object.entries(porCat).sort((a, b) => b[1] - a[1]), max = Math.max(1, ...cats.map(c => c[1]));
  $("#cont").innerHTML = `<div class="grid g3">
      <div class="kpi glass"><div class="l">Gastos del mes</div><div class="v">${$$m(total)}</div><div class="d">${gastos.length} cargados · fijos ${$$m(sum(gastos.filter(g => g.fijo), g => g.monto))}</div></div>
      <div class="kpi glass"><div class="l">Ganancia bruta</div><div class="v pos">${$$m(bruta)}</div><div class="d">de las ventas del mes</div></div>
      <div class="kpi glass destacado"><div class="l">Te queda</div><div class="v ${bruta - total >= 0 ? "pos" : "neg"}">${$$m(bruta - total)}</div><div class="d">ganancia − gastos</div></div>
    </div>
    <div class="acciones sec"><button class="btn chico" id="copiar">↻ Copiar gastos fijos del mes anterior</button></div>
    ${cats.length ? `<div class="card glass sec"><h2>En qué se fue</h2>${cats.map(([c, v]) => `<div class="hbar"><span class="nm">${esc(c)}</span><span class="tr"><span style="width:${v / max * 100}%"></span></span><span class="vl">${$$m(v)}</span></div>`).join("")}</div>` : ""}
    ${gastos.length ? `<div class="glass lista sec">${gastos.map(g => `<div class="fila" data-id="${g.id}">
        <div class="avatar" style="background:linear-gradient(135deg,#5b6f8a,#3a4a63)">${esc(iniciales(g.categoria))}</div>
        <div class="info"><div class="tit">${esc(g.categoria)}${g.descripcion ? " · " + esc(g.descripcion) : ""}</div>
          <div class="mini">${new Date(g.fecha + "T12:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" })}${g.metodo_pago ? " · " + esc(g.metodo_pago) : ""}${g.fijo ? " · 🔁 fijo" : ""}</div></div>
        <div class="der monto">${$$m(g.monto)}</div></div>`).join("")}</div>`
    : `<div class="vacio glass sec"><div class="emo">🧾</div>No hay gastos este mes.<br>Cargá alquiler, luz, internet, publicidad…</div>`}
    <p class="mini sec">💡 La mercadería que comprás no va acá: se carga en Stock → "Ingresar mercadería", y su costo se descuenta solo cuando la vendés.</p>`;
  $$(".fila", vista).forEach(r => r.onclick = () => editarGasto(gastos.find(g => g.id === +r.dataset.id), d));
  $("#copiar").onclick = e => intentar(async () => {
    const [pd, ph] = mesOffset(off - 1);
    const fijos = (await S.api.gastos(pd, ph)).filter(g => g.fijo);
    if (!fijos.length) return toast("El mes anterior no tiene gastos marcados como fijos", true);
    let n = 0;
    for (const g of fijos) {
      if (gastos.some(x => x.categoria === g.categoria && (x.descripcion || "") === (g.descripcion || ""))) continue;
      const dd = new Date(d.getFullYear(), d.getMonth(), Math.min(+g.fecha.slice(8, 10), new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
      await S.api.guardarGasto({ fecha: dia(dd), categoria: g.categoria, descripcion: g.descripcion, monto: g.monto, metodo_pago: g.metodo_pago, fijo: true });
      n++;
    }
    toast(n ? `Se copiaron ${n} gastos fijos (revisá los montos)` : "Ya estaban todos copiados");
    vGastos();
  }, e.currentTarget);
}

function editarGasto(g, mesBase) {
  const hoy = new Date();
  const fechaDef = mesBase.getMonth() === hoy.getMonth() && mesBase.getFullYear() === hoy.getFullYear() ? dia(hoy) : dia(mesBase);
  g = g || { fecha: fechaDef, categoria: "Alquiler", descripcion: "", monto: "", metodo_pago: "", fijo: false };
  const cats = [...new Set([...CATS_GASTO, g.categoria])];
  let cat = g.categoria;
  abrirHoja(`<h3>${g.id ? "Editar gasto" : "Nuevo gasto"}</h3>
    <div class="campo"><label>Tipo</label><div class="pills wrap" id="cat">${pills(cats, cat, "data-c")}<button class="pill" data-otra>＋ Otro</button></div></div>
    <div class="fila2">
      <div class="campo"><label>Monto</label><input class="in" id="monto" type="number" inputmode="decimal" value="${g.monto}" placeholder="$"></div>
      <div class="campo"><label>Fecha</label><input class="in" id="fecha" type="date" value="${g.fecha}"></div>
    </div>
    <div class="campo"><label>Detalle (opcional)</label><input class="in" id="desc" value="${esc(g.descripcion || "")}" placeholder="Ej: factura Edenor, Meta Ads…"></div>
    <div class="campo"><label>Cómo lo pagaste</label><div class="pills wrap" id="met">${pills(["", ...METODOS].map(m => [m, m || "—"]), g.metodo_pago || "", "data-m")}</div></div>
    <label class="switch"><input type="checkbox" id="fijo" ${g.fijo ? "checked" : ""}> 🔁 Es fijo, se repite todos los meses</label>
    <div class="acciones" style="justify-content:space-between;margin-top:14px">
      ${g.id ? `<button class="btn peligro" id="borrar">Eliminar</button>` : "<span></span>"}
      <button class="btn pri" id="ok">Guardar</button></div>`, h => {
    let met = g.metodo_pago || "";
    activarPills($("#cat", h), "data-c", c => cat = c);
    activarPills($("#met", h), "data-m", m => met = m);
    $("[data-otra]", h).onclick = () => {
      const n = prompt("¿Qué tipo de gasto?")?.trim();
      if (!n) return;
      cat = n;
      $("[data-otra]", h).insertAdjacentHTML("beforebegin", `<button class="pill on" data-c="${esc(n)}">${esc(n)}</button>`);
      $$("[data-c]", h).forEach(b => b.classList.toggle("on", b.dataset.c === n));
      activarPills($("#cat", h), "data-c", c => cat = c);
    };
    setTimeout(() => $("#monto", h).focus(), 250);
    $("#ok", h).onclick = e => intentar(async () => {
      const monto = +$("#monto", h).value;
      if (!(monto > 0)) return toast("Poné el monto", true);
      await S.api.guardarGasto({ ...(g.id ? { id: g.id } : {}), fecha: $("#fecha", h).value || dia(new Date()), categoria: cat,
        descripcion: $("#desc", h).value.trim() || null, monto, metodo_pago: met || null, fijo: $("#fijo", h).checked });
      toast("Gasto guardado"); cerrarHoja(); vGastos();
    }, e.currentTarget);
    $("#borrar", h) && ($("#borrar", h).onclick = async () => {
      if (!await confirmar("¿Eliminar este gasto?", "Eliminar")) return;
      await intentar(async () => { await S.api.borrarGasto(g.id); toast("Gasto eliminado"); vGastos(); });
    });
  });
}

// ================= MÁS =================
async function vMas(sub) {
  if (sub === "proveedores") return vProveedores();
  if (sub === "clientes") return vClientes();
  if (sub === "movimientos") return vMovimientos();
  if (sub === "ajustes") return vAjustes();
  if (sub === "exportar") return vExportar();
  vista.innerHTML = `<h1>Más</h1>
    <div class="menu-mas">
      <a class="glass" href="#mas/proveedores"><span class="emo">🏭</span><b>Proveedores</b><span class="mini">${S.proveedores.length} cargados</span></a>
      <a class="glass" href="#mas/clientes"><span class="emo">👥</span><b>Clientes</b><span class="mini">Quién te compra y cuánto</span></a>
      <a class="glass" href="#mas/movimientos"><span class="emo">🔄</span><b>Movimientos</b><span class="mini">Todo lo que entró y salió del stock</span></a>
      <a class="glass" href="#mas/exportar"><span class="emo">⬇️</span><b>Exportar</b><span class="mini">Bajar todo a Excel</span></a>
      <a class="glass" href="#mas/ajustes"><span class="emo">⚙️</span><b>Ajustes</b><span class="mini">Datos del negocio, ganancia por defecto</span></a>
    </div>
    ${S.api.demo ? `<div class="card glass sec"><h2>Modo demo</h2><p class="sub">Estás viendo datos de prueba guardados solo en este navegador. Cuando se conecte la base de datos, esto desaparece.</p>
      <button class="btn chico peligro" id="reset">Borrar datos de prueba</button></div>` : ""}`;
  $("#reset") && ($("#reset").onclick = async () => { if (await confirmar("¿Borrar todos los datos de prueba?", "Borrar")) { localStorage.removeItem("dynova_demo_v1"); location.reload(); } });
}
const volver = `<a href="#mas" class="btn chico" style="margin-bottom:10px">‹ Volver</a>`;

async function vProveedores() {
  const pintar = () => {
    vista.innerHTML = `${volver}<h1>Proveedores</h1>
      <div class="glass lista">${S.proveedores.length ? S.proveedores.map(p => {
        const prods = S.productos.filter(x => x.proveedor_id === p.id);
        return `<div class="fila" data-id="${p.id}"><div class="avatar">${esc(iniciales(p.nombre))}</div>
          <div class="info"><div class="tit">${esc(p.nombre)}</div><div class="mini">${prods.length} prendas · ${num(sum(prods, stockTotal))} en stock · ${$$m(sum(prods, x => stockTotal(x) * x.costo))} al costo</div></div>
          ${p.telefono ? `<a class="btn chico wa-btn" href="${waLink(p.telefono, "Hola! ")}" target="_blank" rel="noopener" onclick="event.stopPropagation()">💬</a>` : ""}</div>`;
      }).join("") : `<div class="vacio">Sin proveedores</div>`}</div>
      <button class="fab" id="nuevo">＋ Proveedor</button>`;
    $$(".fila", vista).forEach(r => r.onclick = () => editar(S.proveedores.find(p => p.id === +r.dataset.id)));
    $("#nuevo").onclick = () => editar({ nombre: "", telefono: "", notas: "" });
  };
  const editar = p => abrirHoja(`<h3>${p.id ? "Editar proveedor" : "Nuevo proveedor"}</h3>
    <div class="campo"><label>Nombre</label><input class="in" id="n" value="${esc(p.nombre)}"></div>
    <div class="campo"><label>WhatsApp / teléfono</label><input class="in" id="t" type="tel" value="${esc(p.telefono || "")}"></div>
    <div class="campo"><label>Notas (alias, condiciones, mínimo de compra…)</label><textarea class="in" id="no" rows="3">${esc(p.notas || "")}</textarea></div>
    <div class="acciones" style="justify-content:space-between">${p.id ? `<button class="btn peligro" id="b">Eliminar</button>` : "<span></span>"}<button class="btn pri" id="ok">Guardar</button></div>`, h => {
    $("#ok", h).onclick = e => intentar(async () => {
      const nombre = $("#n", h).value.trim(); if (!nombre) return toast("Falta el nombre", true);
      await S.api.guardarProveedor({ ...(p.id ? { id: p.id } : {}), nombre, telefono: $("#t", h).value.trim() || null, notas: $("#no", h).value.trim() || null });
      await cargarCatalogo(); cerrarHoja(); toast("Proveedor guardado"); pintar();
    }, e.currentTarget);
    $("#b", h) && ($("#b", h).onclick = async () => {
      if (!await confirmar(`¿Eliminar ${p.nombre}? Sus prendas quedan sin proveedor.`, "Eliminar")) return;
      await intentar(async () => { await S.api.borrarProveedor(p.id); await cargarCatalogo(); toast("Eliminado"); pintar(); });
    });
  });
  pintar();
}

async function vClientes() {
  vista.innerHTML = `${volver}<h1>Clientes</h1><div class="cargando">Cargando…</div>`;
  const [cl, vs] = await Promise.all([S.api.clientes(), S.api.ventasCliente()]);
  const est = {};
  vs.forEach(v => { const e = est[v.cliente_id] ||= { n: 0, t: 0, u: null }; e.n++; e.t += +v.total; if (!e.u || v.fecha > e.u) e.u = v.fecha; });
  cl.sort((a, b) => (est[b.id]?.t || 0) - (est[a.id]?.t || 0));
  vista.innerHTML = `${volver}<h1>Clientes</h1>
    <div class="buscar">${ICO_BUSCAR}<input class="in" id="q" placeholder="Buscar cliente…"></div>
    <div class="glass lista" id="l"></div><button class="fab" id="nuevo">＋ Cliente</button>`;
  const pintar = q => {
    const l = cl.filter(c => !q || normal(c.nombre + " " + (c.telefono || "") + " " + (c.instagram || "")).includes(normal(q)));
    $("#l").innerHTML = l.length ? l.map(c => { const e = est[c.id]; return `<div class="fila" data-id="${c.id}"><div class="avatar">${esc(iniciales(c.nombre))}</div>
      <div class="info"><div class="tit">${esc(c.nombre)}</div><div class="mini">${e ? `${e.n} compra${e.n > 1 ? "s" : ""} · última ${new Date(e.u).toLocaleDateString("es-AR")}` : "sin compras"}${c.instagram ? " · " + esc(c.instagram) : ""}</div></div>
      <div class="der"><div class="monto">${$$m(e?.t || 0)}</div></div>
      ${c.telefono ? `<a class="btn chico wa-btn" href="${waLink(c.telefono, `Hola ${c.nombre.split(" ")[0]}! `)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">💬</a>` : ""}</div>`; }).join("")
      : `<div class="vacio"><div class="emo">👥</div>Los clientes se agregan solos cuando ponés el nombre al cobrar.</div>`;
    $$(".fila", $("#l")).forEach(r => r.onclick = () => editar(cl.find(c => c.id === +r.dataset.id)));
  };
  const editar = c => abrirHoja(`<h3>${c.id ? "Editar cliente" : "Nuevo cliente"}</h3>
    <div class="campo"><label>Nombre</label><input class="in" id="n" value="${esc(c.nombre)}"></div>
    <div class="fila2"><div class="campo"><label>WhatsApp</label><input class="in" id="t" type="tel" value="${esc(c.telefono || "")}"></div>
    <div class="campo"><label>Instagram</label><input class="in" id="i" value="${esc(c.instagram || "")}" placeholder="@usuario"></div></div>
    <div class="campo"><label>Notas (talle, gustos…)</label><textarea class="in" id="no" rows="2">${esc(c.notas || "")}</textarea></div>
    <div class="acciones" style="justify-content:space-between">${c.id ? `<button class="btn peligro" id="b">Eliminar</button>` : "<span></span>"}<button class="btn pri" id="ok">Guardar</button></div>`, h => {
    $("#ok", h).onclick = e => intentar(async () => {
      const nombre = $("#n", h).value.trim(); if (!nombre) return toast("Falta el nombre", true);
      await S.api.guardarCliente({ ...(c.id ? { id: c.id } : {}), nombre, telefono: $("#t", h).value.trim() || null, instagram: $("#i", h).value.trim() || null, notas: $("#no", h).value.trim() || null });
      toast("Cliente guardado"); vClientes();
    }, e.currentTarget);
    $("#b", h) && ($("#b", h).onclick = async () => {
      if (!await confirmar(`¿Eliminar a ${c.nombre}? Sus compras quedan registradas.`, "Eliminar")) return;
      await intentar(async () => { await S.api.borrarCliente(c.id); toast("Eliminado"); vClientes(); });
    });
  });
  $("#q").oninput = e => pintar(e.target.value);
  $("#nuevo").onclick = () => editar({ nombre: "" });
  pintar("");
}

async function vMovimientos() {
  vista.innerHTML = `${volver}<h1>Movimientos de stock</h1><div class="cargando">Cargando…</div>`;
  const ms = await S.api.movimientos(300);
  const tipos = { venta: ["Venta", "neg"], compra: ["Compra", "pos"], alta: ["Stock inicial", "pos"], ajuste: ["Ajuste", ""], anulacion: ["Venta anulada", "pos"] };
  vista.innerHTML = `${volver}<h1>Movimientos de stock</h1><p class="sub">Los últimos 300: cada prenda que entró o salió.</p>
    <div class="glass lista">${ms.length ? ms.map(m => { const [t, cl] = tipos[m.tipo] || [m.tipo, ""]; return `<div class="fila" style="cursor:default">
      <div class="info"><div class="tit">${esc(m.variantes?.productos?.nombre || "(prenda borrada)")} <span class="mini">${esc(m.variantes ? etiquetaVar(m.variantes) : "")}</span></div>
      <div class="mini">${new Date(m.fecha).toLocaleString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · ${t}${m.nota ? " · " + esc(m.nota) : ""}</div></div>
      <div class="der monto ${cl}">${m.cantidad > 0 ? "+" : ""}${m.cantidad}</div></div>`; }).join("") : `<div class="vacio">Sin movimientos todavía</div>`}</div>`;
}

function vExportar() {
  vista.innerHTML = `${volver}<h1>Exportar</h1><p class="sub">Se bajan como archivo .csv, que abre Excel o Google Sheets.</p>
    <div class="menu-mas">
      <a class="glass" href="javascript:void 0" data-x="stock"><span class="emo">👕</span><b>Stock completo</b><span class="mini">Prendas, talles, costos y precios</span></a>
      <a class="glass" href="javascript:void 0" data-x="ventas"><span class="emo">🧾</span><b>Todas las ventas</b><span class="mini">Detalle prenda por prenda</span></a>
      <a class="glass" href="javascript:void 0" data-x="gastos"><span class="emo">💸</span><b>Todos los gastos</b></a>
    </div>`;
  $$("[data-x]", vista).forEach(a => a.onclick = () => intentar(async () => {
    const x = a.dataset.x, hoy = dia(new Date());
    if (x === "stock") { location.hash = "#stock"; setTimeout(() => $("#exp")?.click(), 300); return; }
    if (x === "ventas") {
      const vs = await S.api.ventas(null, null);
      descargarCSV(`ventas-dynova-todas-${hoy}.csv`, [["Venta", "Fecha", "Hora", "Cliente", "Pago", "Canal", "Prenda", "Talle", "Color", "Cantidad", "Precio", "Costo", "Total venta", "Anulada"],
        ...vs.flatMap(v => v.venta_items.map(i => [v.id, dia(new Date(v.fecha)), hora(v.fecha), v.cliente_nombre, v.metodo_pago, v.canal, i.producto_nombre, i.talle, i.color, i.cantidad, i.precio_unit, i.costo_unit, v.total, v.anulada ? "Sí" : ""]))]);
    }
    if (x === "gastos") {
      const gs = await S.api.gastos(null, null);
      descargarCSV(`gastos-dynova-${hoy}.csv`, [["Fecha", "Tipo", "Detalle", "Monto", "Pago", "Fijo"], ...gs.map(g => [g.fecha, g.categoria, g.descripcion, g.monto, g.metodo_pago, g.fijo ? "Sí" : ""])]);
    }
  }));
}

function vAjustes() {
  const c = conf();
  vista.innerHTML = `${volver}<h1>Ajustes</h1>
    <div class="card glass">
      <div class="campo"><label>Nombre del negocio (sale en el comprobante)</label><input class="in" id="nombre" value="${esc(c.nombre)}"></div>
      <div class="fila2">
        <div class="campo"><label>WhatsApp del negocio</label><input class="in" id="whatsapp" value="${esc(c.whatsapp)}"></div>
        <div class="campo"><label>Instagram</label><input class="in" id="instagram" value="${esc(c.instagram)}" placeholder="@dynova.wear"></div>
      </div>
      <div class="campo"><label>Mensaje del comprobante</label><input class="in" id="gracias" value="${esc(c.gracias)}"></div>
      <div class="fila3">
        <div class="campo"><label>Ganancia % por defecto</label><input class="in" id="margen" type="number" value="${c.margen}"></div>
        <div class="campo"><label>Avisar stock con ≤</label><input class="in" id="minimo" type="number" value="${c.minimo}"></div>
        <div class="campo"><label>Redondear precios a $</label><input class="in" id="redondeo" type="number" value="${c.redondeo}"></div>
      </div>
      <button class="btn pri" id="ok">Guardar</button>
    </div>`;
  $("#ok").onclick = e => intentar(async () => {
    const v = { nombre: $("#nombre").value.trim() || "DYNOVA wear", whatsapp: $("#whatsapp").value.trim(), instagram: $("#instagram").value.trim(), gracias: $("#gracias").value.trim(),
      margen: +$("#margen").value || 0, minimo: +$("#minimo").value || 0, redondeo: +$("#redondeo").value || 0 };
    await S.api.guardarAjuste("negocio", v); S.ajustes.negocio = v; toast("Ajustes guardados");
  }, e.currentTarget);
}

// ================= Arranque =================
(async () => {
  try {
    S.api = await crearApi();
    $("#chipDemo").hidden = !S.api.demo;
    const [, aj] = await Promise.all([cargarCatalogo(), S.api.ajustes()]);
    S.ajustes = aj || {};
    router();
  } catch (e) {
    console.error(e);
    vista.innerHTML = `<div class="vacio glass"><div class="emo">⚠️</div>No pude conectar con la base de datos.<br><span class="mini">${esc(e.message)}</span><br><br><button class="btn" onclick="location.reload()">Reintentar</button></div>`;
  }
})();

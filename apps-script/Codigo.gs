/**
 * DYNOVA wear — servidor de la app (Google Apps Script pegado a la planilla).
 * La página manda pedidos acá; esto lee/escribe las hojas.
 * Las ventas y movimientos de stock usan un candado para que nunca se pisen.
 */

var TZ = 'America/Argentina/Buenos_Aires';

var TABLAS = {
  Productos:   ['id', 'nombre', 'categoria', 'genero', 'proveedor_id', 'codigo', 'costo', 'precio', 'notas', 'activo', 'creado'],
  Variantes:   ['id', 'producto_id', 'talle', 'color', 'stock', 'stock_minimo', 'orden'],
  Proveedores: ['id', 'nombre', 'telefono', 'notas'],
  Clientes:    ['id', 'nombre', 'telefono', 'instagram', 'notas', 'creado'],
  Ventas:      ['id', 'fecha', 'cliente_id', 'cliente_nombre', 'metodo_pago', 'canal', 'subtotal', 'descuento', 'recargo', 'total', 'costo_total', 'nota', 'anulada'],
  VentaItems:  ['id', 'venta_id', 'variante_id', 'producto_id', 'producto_nombre', 'talle', 'color', 'cantidad', 'precio_unit', 'costo_unit'],
  Movimientos: ['id', 'fecha', 'variante_id', 'tipo', 'cantidad', 'costo_unit', 'venta_id', 'nota'],
  Gastos:      ['id', 'fecha', 'categoria', 'descripcion', 'monto', 'metodo_pago', 'fijo', 'creado'],
  Ajustes:     ['clave', 'valor']
};
var NUMERICOS = ['id', 'proveedor_id', 'costo', 'precio', 'producto_id', 'stock', 'stock_minimo', 'orden', 'cliente_id', 'subtotal',
  'descuento', 'recargo', 'total', 'costo_total', 'venta_id', 'variante_id', 'cantidad', 'precio_unit', 'costo_unit', 'monto'];

// ---------------- Entrada ----------------
function doGet(e) {
  return salida({ ok: true, app: 'DYNOVA wear', hojas: Object.keys(TABLAS) });
}

function doPost(e) {
  var r;
  try {
    var pedido = JSON.parse(e.postData.contents);
    var fn = ACCIONES[pedido.accion];
    if (!fn) throw new Error('Acción desconocida: ' + pedido.accion);
    var lock = LockService.getScriptLock();
    lock.waitLock(25000);
    try {
      r = { ok: true, data: fn.apply(null, pedido.args || []) };
    } finally {
      SpreadsheetApp.flush();
      lock.releaseLock();
    }
  } catch (err) {
    r = { ok: false, error: String(err && err.message || err) };
  }
  return salida(r);
}

function salida(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------- Hojas ----------------
var _cache = {};
function hoja(nombre) {
  if (_cache[nombre]) return _cache[nombre];
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(nombre);
  if (!sh) {
    sh = ss.insertSheet(nombre);
    sh.getRange(1, 1, 1, TABLAS[nombre].length).setValues([TABLAS[nombre]]).setFontWeight('bold').setBackground('#3a7a67').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  _cache[nombre] = sh;
  return sh;
}

function aObjeto(nombre, fila) {
  var cols = TABLAS[nombre], o = {};
  for (var i = 0; i < cols.length; i++) {
    var c = cols[i], v = fila[i];
    if (v instanceof Date) {
      v = (nombre === 'Gastos' && c === 'fecha') ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : v.toISOString();
    } else if (v === '' || v === null || v === undefined) {
      v = (c === 'color') ? '' : null;
    } else if (NUMERICOS.indexOf(c) >= 0) {
      v = Number(v);
    } else if (c === 'activo' || c === 'anulada' || c === 'fijo') {
      v = (v === true || String(v).toUpperCase() === 'TRUE');
    } else if (nombre === 'Ajustes' && c === 'valor') {
      try { v = JSON.parse(v); } catch (x) {}
    } else {
      v = String(v);
    }
    o[c] = v;
  }
  return o;
}

function aFila(nombre, o) {
  return TABLAS[nombre].map(function (c) {
    var v = o[c];
    if (v === null || v === undefined) return '';
    if (nombre === 'Ajustes' && c === 'valor') return JSON.stringify(v);
    if (nombre === 'Gastos' && c === 'fecha') return "'" + v; // que quede como texto
    return v;
  });
}

function todos(nombre) {
  var sh = hoja(nombre), n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, TABLAS[nombre].length).getValues()
    .filter(function (f) { return f[0] !== '' && f[0] !== null; })
    .map(function (f) { return aObjeto(nombre, f); });
}

function filaDe(nombre, id) {
  var sh = hoja(nombre), n = sh.getLastRow();
  if (n < 2) return -1;
  var ids = sh.getRange(2, 1, n - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return -1;
}

function proximoId(nombre, cantidad) {
  cantidad = cantidad || 1;
  var props = PropertiesService.getScriptProperties();
  var k = 'seq_' + nombre;
  var actual = Number(props.getProperty(k) || 0);
  if (!actual) {
    var sh = hoja(nombre), n = sh.getLastRow();
    if (n >= 2) sh.getRange(2, 1, n - 1, 1).getValues().forEach(function (f) { if (Number(f[0]) > actual) actual = Number(f[0]); });
  }
  props.setProperty(k, String(actual + cantidad));
  return actual + 1;
}

function insertar(nombre, o) {
  o.id = proximoId(nombre);
  hoja(nombre).appendRow(aFila(nombre, o));
  return o;
}

function insertarVarios(nombre, lista) {
  if (!lista.length) return [];
  var primero = proximoId(nombre, lista.length);
  var filas = lista.map(function (o, i) { o.id = primero + i; return aFila(nombre, o); });
  var sh = hoja(nombre);
  sh.getRange(sh.getLastRow() + 1, 1, filas.length, TABLAS[nombre].length).setValues(filas);
  return lista;
}

function obtener(nombre, id) {
  var r = filaDe(nombre, id);
  if (r < 0) return null;
  return aObjeto(nombre, hoja(nombre).getRange(r, 1, 1, TABLAS[nombre].length).getValues()[0]);
}

function actualizar(nombre, id, cambios) {
  var r = filaDe(nombre, id);
  if (r < 0) throw new Error('No encontré el registro ' + id + ' en ' + nombre);
  var actual = aObjeto(nombre, hoja(nombre).getRange(r, 1, 1, TABLAS[nombre].length).getValues()[0]);
  for (var k in cambios) if (k !== 'id' && TABLAS[nombre].indexOf(k) >= 0) actual[k] = cambios[k];
  hoja(nombre).getRange(r, 1, 1, TABLAS[nombre].length).setValues([aFila(nombre, actual)]);
  return actual;
}

function borrar(nombre, id) {
  var r = filaDe(nombre, id);
  if (r > 0) hoja(nombre).deleteRow(r);
}

function soloCampos(nombre, o) {
  var x = {};
  TABLAS[nombre].forEach(function (c) { if (o[c] !== undefined) x[c] = o[c]; });
  return x;
}

function ahora() { return new Date().toISOString(); }

function enRango(f, desde, hasta) {
  var t = new Date(f).getTime();
  return (!desde || t >= new Date(desde).getTime()) && (!hasta || t < new Date(hasta).getTime());
}

// Stock: cambia una variante y anota el movimiento
function _mover(varianteId, cantidad, tipo, nota, costo, ventaId) {
  var v = obtener('Variantes', varianteId);
  if (!v) throw new Error('Talle inexistente');
  var nuevo = Number(v.stock) + Number(cantidad);
  if (nuevo < 0) throw new Error('El stock no puede quedar negativo');
  actualizar('Variantes', varianteId, { stock: nuevo });
  insertar('Movimientos', { fecha: ahora(), variante_id: varianteId, tipo: tipo, cantidad: cantidad,
    costo_unit: costo == null ? null : costo, venta_id: ventaId || null, nota: nota || null });
  return nuevo;
}

function productoConVariantes(p, vars) {
  p.variantes = vars.filter(function (v) { return v.producto_id === p.id; });
  return p;
}

// ---------------- Acciones que pide la página ----------------
var ACCIONES = {
  catalogo: function () {
    var vars = todos('Variantes');
    var prods = todos('Productos').map(function (p) { return productoConVariantes(p, vars); });
    prods.sort(function (a, b) { return a.nombre.localeCompare(b.nombre); });
    var prov = todos('Proveedores').sort(function (a, b) { return a.nombre.localeCompare(b.nombre); });
    return { proveedores: prov, productos: prods };
  },

  // Guarda la prenda + mínimos de cada talle + talles nuevos (con stock inicial) en un solo viaje
  guardarProductoCompleto: function (datos, minimos, nuevas, minimoDefecto) {
    var campos = soloCampos('Productos', datos);
    var p;
    if (datos.id) p = actualizar('Productos', datos.id, campos);
    else { campos.activo = true; campos.creado = ahora(); p = insertar('Productos', campos); }
    (minimos || []).forEach(function (m) { actualizar('Variantes', m.id, { stock_minimo: m.stock_minimo }); });
    var existentes = todos('Variantes').filter(function (v) { return v.producto_id === p.id; });
    (nuevas || []).forEach(function (n) {
      var ya = existentes.some(function (v) { return v.talle === n.talle && (v.color || '') === (n.color || ''); });
      if (ya) throw new Error('El talle ' + n.talle + ' ya existe en esta prenda');
      var v = insertar('Variantes', { producto_id: p.id, talle: n.talle, color: n.color || '', stock: 0, stock_minimo: minimoDefecto || 0, orden: n.orden || 0 });
      if (n.stock > 0) _mover(v.id, n.stock, 'alta', 'Stock inicial', p.costo);
    });
    return productoConVariantes(obtener('Productos', p.id), todos('Variantes'));
  },
  guardarProducto: function (datos) {
    var campos = soloCampos('Productos', datos);
    var p = datos.id ? actualizar('Productos', datos.id, campos) : insertar('Productos', campos);
    return productoConVariantes(p, todos('Variantes'));
  },
  borrarProducto: function (id) {
    todos('Variantes').filter(function (v) { return v.producto_id === id; })
      .map(function (v) { return v.id; }).forEach(function (vid) { borrar('Variantes', vid); });
    borrar('Productos', id);
  },
  actualizarPrecios: function (lista) {
    var sh = hoja('Productos'), n = sh.getLastRow();
    if (n < 2) return;
    var col = TABLAS.Productos.indexOf('precio') + 1;
    var ids = sh.getRange(2, 1, n - 1, 1).getValues();
    var precios = sh.getRange(2, col, n - 1, 1).getValues();
    var mapa = {};
    lista.forEach(function (x) { mapa[x.id] = x.precio; });
    for (var i = 0; i < ids.length; i++) if (mapa[ids[i][0]] !== undefined) precios[i][0] = mapa[ids[i][0]];
    sh.getRange(2, col, n - 1, 1).setValues(precios);
  },
  borrarVariante: function (id) { borrar('Variantes', id); },
  moverStock: function (id, cant, tipo, nota, costo) { return _mover(id, cant, tipo || 'ajuste', nota, costo); },
  moverStockVarios: function (lista, tipo, nota, costo) {
    return lista.map(function (x) { return { id: x.id, stock: _mover(x.id, x.cantidad, tipo, nota, costo) }; });
  },

  vender: function (v) {
    if (!v.items || !v.items.length) throw new Error('La venta no tiene productos');
    var vars = todos('Variantes'), prods = todos('Productos');
    var lineas = v.items.map(function (it) {
      var va = vars.filter(function (x) { return x.id === Number(it.variante_id); })[0];
      if (!va) throw new Error('Producto inexistente');
      var p = prods.filter(function (x) { return x.id === va.producto_id; })[0];
      var pedidas = v.items.filter(function (y) { return Number(y.variante_id) === va.id; })
        .reduce(function (t, y) { return t + Number(y.cantidad); }, 0);
      if (va.stock < pedidas) throw new Error('No hay stock suficiente de ' + p.nombre + ' (talle ' + va.talle + '): quedan ' + va.stock);
      return { va: va, p: p, cant: Number(it.cantidad), precio: it.precio_unit == null ? p.precio : Number(it.precio_unit) };
    });
    var sub = 0, costo = 0;
    lineas.forEach(function (l) { sub += l.precio * l.cant; costo += l.p.costo * l.cant; });
    var desc = Number(v.descuento) || 0, rec = Number(v.recargo) || 0;
    var venta = insertar('Ventas', { fecha: v.fecha || ahora(), cliente_id: v.cliente_id || null, cliente_nombre: v.cliente_nombre || null,
      metodo_pago: v.metodo || 'Efectivo', canal: v.canal || 'Local', subtotal: sub, descuento: desc, recargo: rec,
      total: Math.max(sub - desc + rec, 0), costo_total: costo, nota: v.nota || null, anulada: false });
    insertarVarios('VentaItems', lineas.map(function (l) {
      return { venta_id: venta.id, variante_id: l.va.id, producto_id: l.p.id, producto_nombre: l.p.nombre, talle: l.va.talle,
        color: l.va.color || '', cantidad: l.cant, precio_unit: l.precio, costo_unit: l.p.costo };
    }));
    lineas.forEach(function (l) { _mover(l.va.id, -l.cant, 'venta', null, l.p.costo, venta.id); });
    return venta.id;
  },
  anularVenta: function (id) {
    var v = obtener('Ventas', id);
    if (!v || v.anulada) throw new Error('La venta no existe o ya estaba anulada');
    todos('VentaItems').filter(function (i) { return i.venta_id === id; }).forEach(function (i) {
      if (i.variante_id && obtener('Variantes', i.variante_id)) _mover(i.variante_id, i.cantidad, 'anulacion', 'Venta anulada', null, id);
    });
    actualizar('Ventas', id, { anulada: true });
  },
  ventas: function (desde, hasta) {
    var items = todos('VentaItems');
    return todos('Ventas').filter(function (v) { return enRango(v.fecha, desde, hasta); })
      .sort(function (a, b) { return a.fecha < b.fecha ? 1 : -1; })
      .map(function (v) { v.venta_items = items.filter(function (i) { return i.venta_id === v.id; }); return v; });
  },
  ventasCliente: function () {
    return todos('Ventas').filter(function (v) { return v.cliente_id && !v.anulada; })
      .map(function (v) { return { cliente_id: v.cliente_id, total: v.total, fecha: v.fecha }; });
  },

  gastos: function (desde, hasta) {
    return todos('Gastos').filter(function (g) { return (!desde || g.fecha >= desde) && (!hasta || g.fecha < hasta); })
      .sort(function (a, b) { return a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : b.id - a.id; });
  },
  guardarGasto: function (g) {
    var c = soloCampos('Gastos', g);
    if (g.id) return actualizar('Gastos', g.id, c);
    c.creado = ahora();
    return insertar('Gastos', c);
  },
  borrarGasto: function (id) { borrar('Gastos', id); },
  compras: function (desde, hasta) {
    return todos('Movimientos').filter(function (m) { return (m.tipo === 'compra' || m.tipo === 'alta') && enRango(m.fecha, desde, hasta); });
  },
  movimientos: function (lim) {
    var vars = todos('Variantes'), prods = todos('Productos');
    var ms = todos('Movimientos');
    return ms.slice(-(lim || 200)).reverse().map(function (m) {
      var va = vars.filter(function (x) { return x.id === m.variante_id; })[0];
      var p = va && prods.filter(function (x) { return x.id === va.producto_id; })[0];
      m.variantes = va ? { talle: va.talle, color: va.color, productos: { nombre: p ? p.nombre : null } } : null;
      return m;
    });
  },

  guardarProveedor: function (p) {
    var c = soloCampos('Proveedores', p);
    var rep = todos('Proveedores').some(function (x) { return x.nombre.toLowerCase() === String(c.nombre || '').toLowerCase() && x.id !== p.id; });
    if (c.nombre !== undefined && rep) throw new Error('Ya hay un proveedor con ese nombre');
    return p.id ? actualizar('Proveedores', p.id, c) : insertar('Proveedores', c);
  },
  borrarProveedor: function (id) {
    todos('Productos').filter(function (p) { return p.proveedor_id === id; })
      .forEach(function (p) { actualizar('Productos', p.id, { proveedor_id: null }); });
    borrar('Proveedores', id);
  },
  clientes: function () { return todos('Clientes').sort(function (a, b) { return a.nombre.localeCompare(b.nombre); }); },
  guardarCliente: function (c) {
    var x = soloCampos('Clientes', c);
    if (c.id) return actualizar('Clientes', c.id, x);
    x.creado = ahora();
    return insertar('Clientes', x);
  },
  borrarCliente: function (id) { borrar('Clientes', id); },
  ajustes: function () {
    var o = {};
    todos('Ajustes').forEach(function (a) { o[a.clave] = a.valor; });
    return o;
  },
  guardarAjuste: function (clave, valor) {
    var sh = hoja('Ajustes'), r = filaDe('Ajustes', clave);
    var fila = aFila('Ajustes', { clave: clave, valor: valor });
    if (r > 0) sh.getRange(r, 1, 1, 2).setValues([fila]); else sh.appendRow(fila);
  },

  // Carga inicial desde la planilla vieja (solo si no hay prendas cargadas)
  importarInicial: function (datos) {
    if (todos('Productos').length) throw new Error('Ya hay prendas cargadas: no importo para no duplicar');
    var provs = insertarVarios('Proveedores', datos.proveedores.map(function (n) { return { nombre: n }; }));
    var idProv = {};
    provs.forEach(function (p) { idProv[p.nombre] = p.id; });
    var creado = ahora();
    var prods = insertarVarios('Productos', datos.productos.map(function (p) {
      return { nombre: p.nombre, categoria: p.categoria, genero: p.genero, proveedor_id: idProv[p.proveedor] || null,
        codigo: null, costo: p.costo, precio: p.precio, notas: null, activo: true, creado: creado };
    }));
    var vars = [];
    datos.productos.forEach(function (p, i) {
      p.variantes.forEach(function (v) {
        vars.push({ producto_id: prods[i].id, talle: v.talle, color: v.color || '', stock: v.stock, stock_minimo: 0, orden: v.orden });
      });
    });
    insertarVarios('Variantes', vars);
    var movs = vars.filter(function (v) { return v.stock > 0; }).map(function (v) {
      return { fecha: creado, variante_id: v.id, tipo: 'alta', cantidad: v.stock, costo_unit: null, venta_id: null, nota: 'Importado de la planilla' };
    });
    insertarVarios('Movimientos', movs);
    return { proveedores: provs.length, productos: prods.length, talles: vars.length };
  }
};

// ---------------- Para correr a mano desde el editor ----------------
// 1) Elegí "prepararPlanilla" arriba y tocá Ejecutar: crea las hojas y pide los permisos.
function prepararPlanilla() {
  Object.keys(TABLAS).forEach(hoja);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var h1 = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (h1 && h1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(h1);
  ss.setSpreadsheetTimeZone(TZ);
  Logger.log('Listo: hojas creadas.');
}

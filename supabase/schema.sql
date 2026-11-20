-- DYNOVA wear — estructura de la base de datos (Supabase / Postgres)
-- Se corre una sola vez al crear el proyecto.

create table if not exists proveedores (
  id bigint generated always as identity primary key,
  nombre text not null unique,
  telefono text,
  notas text,
  creado timestamptz not null default now()
);

create table if not exists clientes (
  id bigint generated always as identity primary key,
  nombre text not null,
  telefono text,
  instagram text,
  notas text,
  creado timestamptz not null default now()
);

create table if not exists productos (
  id bigint generated always as identity primary key,
  nombre text not null,
  categoria text,
  genero text,                       -- Mujer / Hombre / Unisex / Niños
  proveedor_id bigint references proveedores(id) on delete set null,
  codigo text,                       -- SKU / código de barras opcional
  costo numeric(12,2) not null default 0,
  precio numeric(12,2) not null default 0,
  foto_url text,
  notas text,
  activo boolean not null default true,
  creado timestamptz not null default now()
);

create table if not exists variantes (
  id bigint generated always as identity primary key,
  producto_id bigint not null references productos(id) on delete cascade,
  talle text not null default 'Único',
  color text not null default '',
  stock integer not null default 0,
  stock_minimo integer not null default 0,
  orden integer not null default 0,
  unique (producto_id, talle, color)
);

create table if not exists ventas (
  id bigint generated always as identity primary key,
  fecha timestamptz not null default now(),
  cliente_id bigint references clientes(id) on delete set null,
  cliente_nombre text,
  metodo_pago text not null default 'Efectivo',
  canal text not null default 'Local',     -- Local / Instagram / WhatsApp / Envío
  subtotal numeric(12,2) not null default 0,
  descuento numeric(12,2) not null default 0,
  recargo numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  costo_total numeric(12,2) not null default 0,
  nota text,
  anulada boolean not null default false
);

create table if not exists venta_items (
  id bigint generated always as identity primary key,
  venta_id bigint not null references ventas(id) on delete cascade,
  variante_id bigint references variantes(id) on delete set null,
  producto_id bigint references productos(id) on delete set null,
  producto_nombre text not null,
  talle text,
  color text,
  cantidad integer not null check (cantidad > 0),
  precio_unit numeric(12,2) not null,
  costo_unit numeric(12,2) not null default 0
);

-- Cada vez que el stock cambia queda anotado acá (ventas, compras, ajustes, devoluciones)
create table if not exists movimientos (
  id bigint generated always as identity primary key,
  fecha timestamptz not null default now(),
  variante_id bigint references variantes(id) on delete cascade,
  tipo text not null,          -- venta / compra / ajuste / anulacion / alta
  cantidad integer not null,   -- + entra, - sale
  costo_unit numeric(12,2),
  venta_id bigint references ventas(id) on delete set null,
  nota text
);

create table if not exists gastos (
  id bigint generated always as identity primary key,
  fecha date not null default current_date,
  categoria text not null default 'Otros',
  descripcion text,
  monto numeric(12,2) not null check (monto >= 0),
  metodo_pago text,
  fijo boolean not null default false,   -- se repite todos los meses (alquiler, luz...)
  creado timestamptz not null default now()
);

create table if not exists ajustes (
  clave text primary key,
  valor jsonb
);

create index if not exists ventas_fecha_idx on ventas (fecha desc);
create index if not exists gastos_fecha_idx on gastos (fecha desc);
create index if not exists items_venta_idx on venta_items (venta_id);
create index if not exists items_variante_idx on venta_items (variante_id);
create index if not exists items_producto_idx on venta_items (producto_id);
create index if not exists variantes_producto_idx on variantes (producto_id);
create index if not exists productos_proveedor_idx on productos (proveedor_id);
create index if not exists mov_variante_idx on movimientos (variante_id);
create index if not exists mov_venta_idx on movimientos (venta_id);
create index if not exists ventas_cliente_idx on ventas (cliente_id);

-- ============ VENDER: descuenta el stock en el mismo paso ============
-- p_items = [{"variante_id": 1, "cantidad": 2, "precio_unit": 18900}, ...]
create or replace function registrar_venta(
  p_items jsonb,
  p_metodo text default 'Efectivo',
  p_descuento numeric default 0,
  p_recargo numeric default 0,
  p_cliente_id bigint default null,
  p_cliente_nombre text default null,
  p_canal text default 'Local',
  p_nota text default null,
  p_fecha timestamptz default null
) returns bigint
language plpgsql
set search_path = public
as $$
declare
  v_id bigint;
  it jsonb;
  v record;
  v_sub numeric := 0;
  v_costo numeric := 0;
  v_cant int;
  v_precio numeric;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene productos';
  end if;

  insert into ventas (fecha, cliente_id, cliente_nombre, metodo_pago, canal, descuento, recargo, nota)
  values (coalesce(p_fecha, now()), p_cliente_id, nullif(trim(p_cliente_nombre), ''), p_metodo, p_canal,
          coalesce(p_descuento,0), coalesce(p_recargo,0), nullif(trim(p_nota), ''))
  returning id into v_id;

  for it in select * from jsonb_array_elements(p_items) loop
    v_cant := (it->>'cantidad')::int;
    if v_cant is null or v_cant <= 0 then raise exception 'Cantidad inválida'; end if;

    select va.id, va.stock, va.talle, va.color, p.id as pid, p.nombre, p.costo, p.precio
      into v
      from variantes va join productos p on p.id = va.producto_id
     where va.id = (it->>'variante_id')::bigint
     for update of va;
    if not found then raise exception 'Producto inexistente'; end if;
    if v.stock < v_cant then
      raise exception 'No hay stock suficiente de % (talle %): quedan %', v.nombre, v.talle, v.stock;
    end if;

    v_precio := coalesce((it->>'precio_unit')::numeric, v.precio);

    update variantes set stock = stock - v_cant where id = v.id;
    insert into venta_items (venta_id, variante_id, producto_id, producto_nombre, talle, color, cantidad, precio_unit, costo_unit)
    values (v_id, v.id, v.pid, v.nombre, v.talle, v.color, v_cant, v_precio, v.costo);
    insert into movimientos (variante_id, tipo, cantidad, costo_unit, venta_id)
    values (v.id, 'venta', -v_cant, v.costo, v_id);

    v_sub := v_sub + v_precio * v_cant;
    v_costo := v_costo + v.costo * v_cant;
  end loop;

  update ventas
     set subtotal = v_sub,
         costo_total = v_costo,
         total = greatest(v_sub - coalesce(p_descuento,0) + coalesce(p_recargo,0), 0)
   where id = v_id;
  return v_id;
end $$;

-- Anular una venta: el stock vuelve
create or replace function anular_venta(p_venta_id bigint)
returns void
language plpgsql
set search_path = public
as $$
declare it record;
begin
  if not exists (select 1 from ventas where id = p_venta_id and not anulada) then
    raise exception 'La venta no existe o ya estaba anulada';
  end if;
  for it in select * from venta_items where venta_id = p_venta_id loop
    if it.variante_id is not null then
      update variantes set stock = stock + it.cantidad where id = it.variante_id;
      insert into movimientos (variante_id, tipo, cantidad, venta_id, nota)
      values (it.variante_id, 'anulacion', it.cantidad, p_venta_id, 'Venta anulada');
    end if;
  end loop;
  update ventas set anulada = true where id = p_venta_id;
end $$;

-- Entrada de mercadería / ajustes de stock (+ suma, - resta)
create or replace function mover_stock(
  p_variante_id bigint, p_cantidad int, p_tipo text default 'ajuste',
  p_nota text default null, p_costo numeric default null
) returns integer
language plpgsql
set search_path = public
as $$
declare v_stock int;
begin
  update variantes set stock = stock + p_cantidad where id = p_variante_id returning stock into v_stock;
  if not found then raise exception 'Talle inexistente'; end if;
  if v_stock < 0 then raise exception 'El stock no puede quedar negativo'; end if;
  insert into movimientos (variante_id, tipo, cantidad, costo_unit, nota)
  values (p_variante_id, p_tipo, p_cantidad, p_costo, nullif(trim(p_nota), ''));
  return v_stock;
end $$;

-- ============ Acceso ============
-- La app no tiene usuario ni contraseña (la usa una sola persona):
-- la llave pública de la app puede leer y escribir todo.
do $$
declare t text;
begin
  foreach t in array array['proveedores','clientes','productos','variantes','ventas','venta_items','movimientos','gastos','ajustes'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists app_todo on %I', t);
    execute format('create policy app_todo on %I for all to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;

grant execute on function registrar_venta(jsonb, text, numeric, numeric, bigint, text, text, text, timestamptz) to anon, authenticated;
grant execute on function anular_venta(bigint) to anon, authenticated;
grant execute on function mover_stock(bigint, int, text, text, numeric) to anon, authenticated;

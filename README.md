# DYNOVA wear · Gestión

App de stock, ventas y gastos para DYNOVA wear. HTML + JS, datos en Supabase.

- `index.html`, `app.js`, `estilos.css`: la app
- `datos.js`: conexión a Supabase (`config.js` tiene la URL y la llave pública)
- `supabase/schema.sql`: tablas y funciones (vender descuenta stock en el mismo paso)
- `herramientas/importar_planilla.py`: pasa la planilla vieja a la base

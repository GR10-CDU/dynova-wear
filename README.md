# DYNOVA wear · Gestión

App de stock, ventas y gastos para DYNOVA wear. HTML + JS; los datos viven en una planilla de Google.

- `index.html`, `app.js`, `estilos.css`: la app
- `datos.js`: habla con la planilla (`config.js` tiene la URL /exec del Apps Script)
- `apps-script/Codigo.gs`: el programa pegado a la planilla (vender descuenta stock con candado)
- `herramientas/importar_planilla.py`: pasa la planilla vieja a JSON para la carga inicial

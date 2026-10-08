repo: chvpa/Pick-Commerce
branch: main
path: apps/admin

## Last sync
date: 2026-10-07T00:59:23Z

### Updated in this project
- Modelo en Editar producto: vincula productos de distintos colores (el código hoy sólo tiene variantes con atributos)
- Promociones con 8 tipos: descuento, NxM, 2da unidad, cantidad, monto escalonado, regalo, bundle y envío gratis
- Detalle de pedido simplificado, guías AEX y Conexiones (MCP) del Asistente

## Sync history
- 2026-10-06T23:15:00Z — Secciones, Asistente con modos Agente y Studio
- 2026-10-04T22:33:29Z — Login comprador, roles, rediseño v3, pantallas nuevas, uso de IA

## Screen map
| Pantalla | Archivos del repo |
| --- | --- |
| Admin actual — shell | apps/admin/src/router.tsx, apps/admin/src/features/navegacion/AppSidebar.tsx, apps/admin/src/components/ui/sidebar.tsx, apps/admin/src/styles.css |
| Admin actual — Resumen | apps/admin/src/features/dashboard/Dashboard.tsx, apps/admin/src/features/dashboard/ResumenConIA.tsx, apps/admin/src/components/pagina.tsx |
| Admin actual — Pedidos | apps/admin/src/features/pedidos/ListaPedidos.tsx |
| Admin actual — Productos | apps/admin/src/features/productos/ListaProductos.tsx |
| v3 — Inicio | apps/admin/src/features/dashboard/Dashboard.tsx |
| v3 — Pedidos / Detalle | apps/admin/src/features/pedidos/ListaPedidos.tsx, apps/admin/src/features/pedidos/DetallePedido.tsx |
| v3 — Promociones | apps/admin/src/features/promociones/ListaPromociones.tsx, apps/admin/src/features/promociones/esquema.ts |
| v3 — Productos / Editar | apps/admin/src/features/productos/ListaProductos.tsx, apps/admin/src/features/productos/esquema.ts |
| v3 — Reseñas | apps/admin/src/features/productos/Resenas.tsx |
| v3 — Clientes | apps/admin/src/features/clientes/ListaClientes.tsx |
| v3 — Fidelidad | apps/admin/src/features/clientes/Fidelidad.tsx |
| v3 — Secciones | apps/admin/src/features/contenido/Secciones.tsx, apps/admin/src/features/contenido/etiquetas.ts, scripts/treeshop-home.ts |
| v3 — Analytics | apps/admin/src/features/analytics/Analytics.tsx |
| v3 — Configuración | apps/admin/src/features/configuracion/Configuracion.tsx |
| Login comprador | packages/commerce-ui/src/account/AccountLogin.tsx, apps/treeshop/src/styles/global.css, apps/treeshop/src/pages/api/cuenta/codigo.ts |
| v3 — Asistente IA (Agente + Studio) | (todavía no existe en el código) |

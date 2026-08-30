export {
  clienteDeBrowser,
  clienteDeServidor,
  clienteDeUsuario,
  type ConexionPublica,
  type ConexionServidor,
  type PickSupabaseClient,
} from './client.ts';
export { repositorioTiendas } from './tiendas.ts';
export {
  cerrarSesion,
  iniciarSesion,
  membresiasDe,
  pedirReset,
  actualizarPassword,
  observarSesion,
  type SesionActiva,
  type UsuarioAutenticado,
} from './auth.ts';
export { repositorioCatalogo, mapearResultadoCatalogo } from './catalogo.ts';
export { repositorioAdminCatalogo } from './admin-catalogo.ts';
export * from './checkout.ts';
export * from './admin-pedidos.ts';
export { repositorioDashboard } from './admin-dashboard.ts';
export { repositorioAdminClientes } from './admin-clientes.ts';
export { repositorioEquipo } from './equipo.ts';
export { repositorioConfiguracion } from './configuracion.ts';
export { repositorioPagos } from './pagos.ts';
export { repositorioPromociones } from './promociones.ts';
export { repositorioContenido } from './contenido.ts';
export { repositorioNotificaciones } from './notificaciones.ts';
export { destinoSupabase, repositorioAnalytics } from './analytics.ts';
export { subirImagenDeProducto } from './media.ts';

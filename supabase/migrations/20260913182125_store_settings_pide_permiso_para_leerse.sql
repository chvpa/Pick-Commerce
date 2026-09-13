/*
 * `store_settings` deja de ser legible por cualquier miembro de la organización.
 *
 * La política de lectura acotaba por `app.current_tenants()` y no pedía ningún
 * permiso, al contrario de la de escritura que está dos líneas más abajo en la
 * misma migración (20260826004950:254-261). O sea que un `viewer` —un rol con
 * la lista de permisos vacía— podía leer por SQL lo que la interfaz ya le niega:
 * las zonas de envío y sus importes, la configuración de pagos con las
 * instrucciones de transferencia, y la del catálogo.
 *
 * No rompe nada, y se comprobó antes de escribirlo: el único lector es la
 * pantalla de Configuración del Admin, cuya ruta ya está detrás de
 * `<Gate permiso="settings.write">`; el storefront lee estos mismos ajustes con
 * la secret key, que saltea RLS por completo (ADR-052).
 *
 * Se arregla ahora, antes de la Fase 1, porque `store_settings` es donde van los
 * interruptores de v2 —incluido el de las cuentas de comprador— y porque la Fase
 * 1 convierte `authenticated` en un rol público: hoy significa «alguien del
 * equipo de un comercio» y a partir de ahí significa «cualquiera que se
 * registró».
 *
 * Reversión: `using (tenant_id in (select app.current_tenants()))`.
 */

drop policy if exists store_settings_lectura on store_settings;

create policy store_settings_lectura on store_settings
  for select to authenticated
  using (app.has_permission(tenant_id, 'settings.write'));

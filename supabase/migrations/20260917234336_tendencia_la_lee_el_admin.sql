/*
 * `product_trending` la tiene que poder leer el Admin.
 *
 * `catalog_search` es **security invoker**, así que corre con los permisos de
 * quien la llama. El storefront la llama con la secret key —que saltea RLS— pero
 * **el Admin la llama con la publishable key**: `FormularioColeccion` y
 * `SelectorDeDestino` la usan para traer las facetas. Al agregarle el join a
 * `product_trending`, que nació sin política ni grant, esas dos pantallas se
 * quedaban con «permission denied for table product_trending».
 *
 * Es la trampa que CLAUDE.md ya tiene anotada: una función `security invoker`
 * sólo sirve si **todas** las tablas que toca tienen permiso para quien la llama.
 * La encontró la suite de aislamiento, no el typecheck ni el e2e —los dos corren
 * con la secret key—, que es justo el motivo por el que ese test existe.
 *
 * Se resuelve como `store_events`: política de lectura acotada al tenant, grant
 * de select, y nada para `anon`. Un puntaje de tendencia no es un secreto para el
 * dueño de la tienda: es lo que su propia gente miró.
 *
 * `product_affinity` **no** se toca: `catalog_search` no la lee, y su único
 * consumidor sigue siendo el Worker con la secret key.
 */

do $$ begin
  create policy product_trending_lectura on product_trending
    for select to authenticated
    using (tenant_id in (select app.current_tenants()));
exception when duplicate_object then null;
end $$;

grant select on product_trending to authenticated;
revoke all on product_trending from anon;

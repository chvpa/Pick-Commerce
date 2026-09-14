/*
 * El vínculo entre quien acaba de entrar y lo que compró como invitada.
 *
 * `customers` se identifica por `(store_id, email)` desde la Fase 5 y
 * `create_order` hace upsert por ahí, así que la persona que compró sin cuenta
 * **ya tiene ficha**. Entrar no crea un cliente nuevo: engancha la cuenta a la
 * que estaba, y con eso sus pedidos viejos aparecen sin migrar una fila.
 *
 * **El email tiene que estar verificado antes de llamar a esto**, y no es un
 * detalle: sin esa condición, registrarse con el correo de otra persona le
 * entrega sus pedidos. Lo está, porque el código *es* la verificación — se lo
 * manda Supabase a esa casilla y sin abrirla no hay sesión.
 *
 * `create_order` no se toca en toda la fase.
 */

create or replace function public.link_customer_account(
  p_store_id uuid,
  p_user_id  uuid,
  p_email    text
) returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_tenant    uuid;
  v_email     text := lower(trim(coalesce(p_email, '')));
  v_customer  uuid;
  v_vinculado uuid;
begin
  if v_email = '' or p_user_id is null then
    return null;
  end if;

  select tenant_id into v_tenant from stores where id = p_store_id;
  if v_tenant is null then
    return null;
  end if;

  /*
   * La ficha puede no existir: quien entra sin haber comprado nunca no tiene
   * una, y el vínculo necesita apuntar a algo. Se crea vacía —`name` y `phone`
   * son `not null` pero no tienen `check`— y la llena `create_order` en la
   * primera compra, que sobreescribe los dos en su `on conflict`. O sea que el
   * hueco se cierra solo y sin tocar esa función.
   */
  insert into customers (tenant_id, store_id, email, name, phone)
  values (v_tenant, p_store_id, v_email, '', '')
  on conflict (store_id, email) do nothing;

  select id into v_customer
  from customers
  where store_id = p_store_id and email = v_email;

  insert into customer_accounts (user_id, tenant_id, store_id, customer_id)
  values (p_user_id, v_tenant, p_store_id, v_customer)
  on conflict do nothing;

  /*
   * Se relee en vez de devolver `v_customer`, y esa es la diferencia entre
   * correcto y peligroso. `customer_accounts` tiene `unique (store_id,
   * customer_id)`: si esa ficha ya estaba tomada por otra cuenta —un usuario de
   * Auth borrado y vuelto a crear con el mismo correo es el caso real—, el
   * insert no hizo nada. Devolver `v_customer` igual le entregaría a esta
   * persona los pedidos de aquella. Sin vínculo se devuelve null y la cuenta se
   * ve vacía, que es la forma correcta de fallar.
   */
  select customer_id into v_vinculado
  from customer_accounts
  where store_id = p_store_id and user_id = p_user_id;

  return v_vinculado;
end;
$$;

comment on function public.link_customer_account is
  'Engancha un usuario de auth.users a su ficha de cliente en una tienda, creándola si no estaba. El email tiene que venir verificado.';

/*
 * Sólo la secret key. Es lo que impide que alguien autenticado se cuelgue del
 * `customers` de otro pasando su email: el Worker la llama **después** de
 * verificar el código, con el email que devolvió Supabase y no con el que vino
 * en el cuerpo de la petición.
 */
revoke all on function public.link_customer_account(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.link_customer_account(uuid, uuid, text) to service_role;

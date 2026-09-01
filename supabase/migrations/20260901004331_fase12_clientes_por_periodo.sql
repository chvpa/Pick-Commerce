-- Clientes con filtro de período.
--
-- La pantalla traía **todos** los clientes de la tienda y los paginaba, sin forma
-- de acotar por tiempo. Con un año de operación eso es una lista que no se puede
-- leer y una pregunta que no se puede hacer: «quién me compró este mes».
--
-- El período mira la última compra, no la fecha de alta: un cliente se crea con
-- su primer pedido y lo que interesa es cuándo fue el último.
--
-- La definición es la **vigente** —la que dejó el tope de paginación— con los
-- dos parámetros nuevos y el filtro. Se dropea antes de crearla porque agregar
-- parámetros no reemplaza una función: crea otra al lado, y PostgREST tendría dos
-- candidatas para la misma llamada.

drop function if exists public.admin_customers(uuid, text, uuid, integer, integer);

create or replace function public.admin_customers(
  p_store_id    uuid,
  p_query       text    default '',
  p_customer_id uuid    default null,
  p_page        integer default 1,
  p_per_page    integer default 20,
  -- Al final y con default: una llamada que no los pase se comporta igual que
  -- antes, que es lo que hace que agregar el filtro no toque a nadie más.
  p_from        timestamptz default null,
  p_to          timestamptz default null
) returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
with base as (
  select
    c.*,
    lower(c.name || ' ' || c.email || ' ' || c.phone) as hay,
    (select count(*)::int from orders o
      where o.customer_id = c.id and o.status <> 'cancelled') as pedidos,
    (select coalesce(sum(o.total_amount), 0)::bigint from orders o
      where o.customer_id = c.id and o.status <> 'cancelled') as gastado,
    (select max(o.created_at) from orders o
      where o.customer_id = c.id and o.status <> 'cancelled') as ultimo
  from customers c
  where c.store_id = p_store_id
    and (p_customer_id is null or c.id = p_customer_id)
),

filtrados as (
  select b.* from base b
  /*
   * El período mira la **última compra**, que es lo que hace útil el filtro: la
   * pregunta que se le hace a esta pantalla es «quién me compró últimamente».
   *
   * Un cliente sin pedidos tiene `ultimo` nulo y queda afuera de cualquier
   * período, que es correcto: no compró en ninguno.
   */
  where (p_from is null or b.ultimo >= p_from)
    and (p_to is null or b.ultimo < p_to)
    and (p_query = '' or not exists (
    select 1
    from unnest(string_to_array(lower(trim(p_query)), ' ')) t(tok)
    where t.tok <> '' and position(t.tok in b.hay) = 0
  ))
),

total as (select count(*)::int as n from filtrados),

pagina as (
  select greatest(1, ceil(t.n::numeric / greatest(1, least(p_per_page, 200)))::int) as page_count, t.n
  from total t
),

acotada as (
  select least(greatest(1, trunc(coalesce(p_page, 1))::int), pg.page_count) as page,
         pg.page_count, pg.n
  from pagina pg
),

items as (
  select jsonb_agg(x.doc order by x.rn) as docs
  from (
    select
      -- Los que compraron hace poco primero; los que nunca compraron, al final.
      row_number() over (order by f.ultimo desc nulls last, f.created_at desc, f.id) as rn,
      jsonb_strip_nulls(jsonb_build_object(
        'id', f.id,
        'name', f.name,
        'email', f.email,
        'phone', f.phone,
        'taxId', f.tax_id,
        'taxName', f.tax_name,
        'createdAt', f.created_at,
        'orderCount', f.pedidos,
        'totalSpent', jsonb_build_object(
          'amount', f.gastado,
          'currency', coalesce((select currency from stores where id = p_store_id), 'PYG')
        ),
        'lastOrderAt', f.ultimo
      )) as doc
    from filtrados f
  ) x
  where x.rn > (select (page - 1) * least(p_per_page, 200) from acotada)
    and x.rn <= (select page * least(p_per_page, 200) from acotada)
)

select jsonb_build_object(
  'items', coalesce((select docs from items), '[]'::jsonb),
  'total', (select n from acotada),
  'page', (select page from acotada),
  'perPage', least(p_per_page, 200),
  'pageCount', (select page_count from acotada)
);
$$;

-- Los permisos no sobreviven al `drop`: la función es otra y nace sin ninguno.
-- Sin esto, la pantalla de clientes queda en 403 para todo el mundo, y la suite
-- de aislamiento lo detecta sola porque comprueba los grants.
revoke all on function public.admin_customers(uuid, text, uuid, integer, integer, timestamptz, timestamptz)
  from public, anon;
grant execute on function public.admin_customers(uuid, text, uuid, integer, integer, timestamptz, timestamptz)
  to authenticated;

import type {
  AlcanceDePromocion,
  PaginaPromociones,
  Promotion,
  PromotionTarget,
  RepositorioPromociones,
} from '@pick/commerce-core';
import type { PickSupabaseClient } from './client.ts';

/**
 * Promociones vistas desde el Admin.
 *
 * Sin RPC: son lecturas y escrituras de una tabla, y RLS ya decide quién puede
 * —`promotion.write` para escribir, membresía para leer—. Una función de base
 * acá sólo agregaría una capa que repetir.
 *
 * El `store_id` viaja en cada consulta igual: RLS acota por tenant, no por
 * tienda, y una organización puede tener varias.
 */

interface FilaPromocion {
  id: string;
  title: string;
  status: 'draft' | 'active' | 'archived';
  priority: number;
  stackable: boolean;
  code: string | null;
  starts_at: string | null;
  ends_at: string | null;
  usage_limit: number | null;
  usage_count: number;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  target: unknown;
  min_subtotal: number | null;
  min_quantity: number | null;
}

/** `null` en la base es «ausente» en el contrato, no `null`. */
function aPromocion(f: FilaPromocion): Promotion {
  return {
    id: f.id,
    title: f.title,
    status: f.status,
    priority: f.priority,
    stackable: f.stackable,
    ...(f.code ? { code: f.code } : {}),
    ...(f.starts_at ? { startsAt: f.starts_at } : {}),
    ...(f.ends_at ? { endsAt: f.ends_at } : {}),
    ...(f.usage_limit !== null ? { usageLimit: f.usage_limit } : {}),
    usageCount: f.usage_count,
    discountType: f.discount_type,
    discountValue: Number(f.discount_value),
    target: f.target as PromotionTarget,
    ...(f.min_subtotal !== null ? { minSubtotal: Number(f.min_subtotal) } : {}),
    ...(f.min_quantity !== null ? { minQuantity: f.min_quantity } : {}),
  };
}

const COLUMNAS =
  'id, title, status, priority, stackable, code, starts_at, ends_at, usage_limit, ' +
  'usage_count, discount_type, discount_value, target, min_subtotal, min_quantity';

export function repositorioPromociones(db: PickSupabaseClient): RepositorioPromociones {
  return {
    async listar(storeId, consulta): Promise<PaginaPromociones> {
      const perPage = consulta.perPage ?? 20;
      const page = Math.max(1, consulta.page ?? 1);
      const desde = (page - 1) * perPage;

      const { data, error, count } = await db
        .from('promotions')
        .select(COLUMNAS, { count: 'exact' })
        .eq('store_id', storeId)
        // Las activas primero y las archivadas al final: es el orden en que el
        // comercio las mira. Dentro de cada grupo, por prioridad.
        .order('status')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false })
        .range(desde, desde + perPage - 1);

      if (error) throw new Error(`No se pudieron consultar las promociones: ${error.message}`);

      const total = count ?? 0;
      return {
        items: ((data ?? []) as unknown as FilaPromocion[]).map(aPromocion),
        total,
        page,
        pageCount: Math.max(1, Math.ceil(total / perPage)),
      };
    },

    async porId(storeId, id): Promise<Promotion | null> {
      const { data, error } = await db
        .from('promotions')
        .select(COLUMNAS)
        .eq('store_id', storeId)
        .eq('id', id)
        .maybeSingle();

      if (error) throw new Error(`No se pudo consultar la promoción: ${error.message}`);
      return data ? aPromocion(data as unknown as FilaPromocion) : null;
    },

    async guardar(storeId, datos, id): Promise<string> {
      const { data: tienda, error: errorTienda } = await db
        .from('stores')
        .select('tenant_id')
        .eq('id', storeId)
        .single();

      if (errorTienda) throw new Error(`No se pudo resolver la tienda: ${errorTienda.message}`);

      // Los ausentes se mandan como `null` explícito y no se omiten: al editar,
      // omitirlos dejaría el valor viejo, y vaciar una fecha de fin es algo que
      // el formulario tiene que poder hacer.
      const fila = {
        tenant_id: tienda.tenant_id,
        store_id: storeId,
        title: datos.title,
        status: datos.status,
        priority: datos.priority,
        stackable: datos.stackable,
        code: datos.code ?? null,
        starts_at: datos.startsAt ?? null,
        ends_at: datos.endsAt ?? null,
        usage_limit: datos.usageLimit ?? null,
        discount_type: datos.discountType,
        discount_value: datos.discountValue,
        // Copia mutable: el tipo generado de la base no acepta arrays readonly,
        // igual que en las líneas del pedido.
        target:
          datos.target.kind === 'all'
            ? { kind: 'all' }
            : { kind: datos.target.kind, ids: [...datos.target.ids] },
        min_subtotal: datos.minSubtotal ?? null,
        min_quantity: datos.minQuantity ?? null,
        updated_at: new Date().toISOString(),
      };

      const consulta = id
        ? db.from('promotions').update(fila).eq('id', id).eq('store_id', storeId).select('id')
        : db.from('promotions').insert(fila).select('id');

      const { data, error } = await consulta.single();

      if (error) {
        // El índice único del código, traducido a algo que el comercio entienda.
        if (error.code === '23505' && error.message.includes('promotions_code_idx')) {
          throw new Error(`Ya existe otra promoción con el código «${datos.code}».`);
        }
        throw new Error(`No se pudo guardar la promoción: ${error.message}`);
      }
      return data.id;
    },

    async cambiarEstado(storeId, id, status): Promise<void> {
      const { error } = await db
        .from('promotions')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('store_id', storeId);

      if (error) throw new Error(`No se pudo cambiar el estado: ${error.message}`);
    },

    async borrar(storeId, id): Promise<void> {
      const { error } = await db.from('promotions').delete().eq('id', id).eq('store_id', storeId);
      if (error) throw new Error(`No se pudo borrar la promoción: ${error.message}`);
    },

    async alcance(storeId, target): Promise<AlcanceDePromocion> {
      let consulta = db
        .from('products')
        .select('title, product_variants(price, currency, position)', { count: 'exact' })
        .eq('store_id', storeId)
        .eq('status', 'active');

      if (target.kind === 'product') {
        consulta = consulta.in('id', [...target.ids]);
      } else if (target.kind === 'category') {
        consulta = consulta.in('category_id', [...target.ids]);
      } else if (target.kind === 'collection') {
        // Por la tabla puente, que es donde vive la pertenencia.
        const { data: enColeccion } = await db
          .from('collection_products')
          .select('product_id')
          .in('collection_id', [...target.ids]);
        consulta = consulta.in(
          'id',
          (enColeccion ?? []).map((c) => c.product_id),
        );
      }

      // Sólo hace falta un ejemplo; el count viene igual sobre el total.
      const { data, error, count } = await consulta.limit(1);
      if (error) throw new Error(`No se pudo calcular el alcance: ${error.message}`);

      const primero = (data ?? [])[0];
      const variante = primero?.product_variants?.sort((a, b) => a.position - b.position)[0];

      return {
        count: count ?? 0,
        ...(primero && variante
          ? {
              ejemplo: {
                title: primero.title,
                price: { amount: Number(variante.price), currency: variante.currency },
              },
            }
          : {}),
      };
    },
  };
}

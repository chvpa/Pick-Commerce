import type {
  ProblemaDeCarrito,
  ProblemaDeCupon,
  RepositorioCheckout,
  ResultadoDePedido,
  VarianteParaCarrito,
} from '@pick/commerce-core';
import type { Money, Order } from '@pick/commerce-types';
import type { PickSupabaseClient } from './client.ts';

/**
 * Carrito y creación de pedidos contra Supabase.
 *
 * La asimetría entre los dos métodos es deliberada: leer para mostrar el
 * carrito es una consulta corriente; crear el pedido es una transacción con
 * bloqueos, revalidación y descuento de stock, y eso vive en `create_order`
 * (ADR-065). Del lado de acá no hay ninguna regla de negocio.
 */

/*
 * `products!inner` no es un adorno: `product_variants` **no tiene `store_id`**,
 * sólo `tenant_id` y `product_id`, así que joinear por el producto es la única
 * forma de acotar por tienda. El atajo obvio —`select ... in (ids)` con la
 * secret key, que saltea RLS— devolvería variantes de cualquier comercio, con su
 * precio y su costo.
 *
 * `status = 'active'` se reimpone acá por la misma razón: este camino no pasa
 * por `catalog_search`, que es donde vivía ese filtro. Sin él, un producto
 * archivado seguiría siendo comprable desde un carrito viejo.
 */
interface FilaVariante {
  id: string;
  sku: string;
  title: string | null;
  price: number;
  currency: string;
  products: { title: string; store_id: string; status: string };
  inventory_levels: { available: number }[];
}

/** Lo que devuelve `cart_promotions`: importes pelados y la moneda una vez. */
interface RespuestaPromociones {
  currency: string;
  lines?: { variantId: string; listUnitPrice: number; unitPrice: number; subtotal: number }[];
  subtotal: number;
  discount: number;
  total: number;
  applied?: {
    promotionId: string;
    title: string;
    code?: string;
    discountType: 'percentage' | 'fixed';
    discountValue: number;
    amount: number;
  }[];
  couponIssue?: ProblemaDeCupon;
}

export function repositorioCheckout(db: PickSupabaseClient): RepositorioCheckout {
  return {
    async variantesParaCarrito(storeId, variantIds) {
      if (variantIds.length === 0) return [];

      const { data, error } = await db
        .from('product_variants')
        .select(
          'id, sku, title, price, currency, products!inner (title, store_id, status), inventory_levels (available)',
        )
        .in('id', [...new Set(variantIds)])
        .eq('products.store_id', storeId)
        .eq('products.status', 'active');

      if (error) throw new Error(`No se pudo consultar el carrito: ${error.message}`);

      return ((data ?? []) as unknown as FilaVariante[]).map((v): VarianteParaCarrito => ({
        variantId: v.id,
        title: v.products.title,
        ...(v.title ? { variantTitle: v.title } : {}),
        sku: v.sku,
        price: { amount: Number(v.price), currency: v.currency },
        // Espejo del ERP: suma de sucursales, informativa. La autoridad la
        // tiene `create_order`, que revalida dentro de su transacción.
        available: v.inventory_levels.reduce((total, il) => total + il.available, 0),
      }));
    },

    async promocionesDelCarrito(storeId, lineas, codigo) {
      const { data, error } = await db.rpc('cart_promotions', {
        p_store_id: storeId,
        p_lines: lineas.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
        ...(codigo ? { p_code: codigo } : {}),
      });

      if (error) throw new Error(`No se pudieron resolver las promociones: ${error.message}`);

      // La función devuelve importes pelados y la moneda una sola vez: repetirla
      // en cada uno sería ruido, y `create_order` ya exige que todo el carrito
      // comparta una.
      const r = data as unknown as RespuestaPromociones;
      const dinero = (amount: number): Money => ({ amount, currency: r.currency });

      return {
        lines: (r.lines ?? []).map((l) => ({
          variantId: l.variantId,
          listUnitPrice: dinero(l.listUnitPrice),
          unitPrice: dinero(l.unitPrice),
          subtotal: dinero(l.subtotal),
        })),
        subtotal: dinero(r.subtotal),
        discount: dinero(r.discount),
        total: dinero(r.total),
        applied: (r.applied ?? []).map((a) => ({ ...a, amount: dinero(a.amount) })),
        ...(r.couponIssue ? { couponIssue: r.couponIssue } : {}),
      };
    },

    async crearPedido(storeId, idempotencyKey, datos): Promise<ResultadoDePedido> {
      const { data, error } = await db.rpc('create_order', {
        p_store_id: storeId,
        p_idempotency_key: idempotencyKey,
        p_input: {
          customer: { ...datos.customer },
          address: { ...datos.address },
          paymentMethod: datos.paymentMethod,
          ...(datos.notes ? { notes: datos.notes } : {}),
          // Sólo lo que la función necesita, y como objetos planos: el tipo
          // generado de la base no acepta arrays readonly. De paso, nada más del
          // carrito del cliente llega a la base —un precio en el payload no
          // tendría dónde entrar—.
          lines: datos.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
          // El código del cupón, nunca su monto: `create_order` lo resuelve
          // contra la base dentro de su propia transacción.
          ...(datos.couponCode ? { couponCode: datos.couponCode } : {}),
        },
      });

      if (error) throw new Error(`No se pudo crear el pedido: ${error.message}`);

      const r = data as { order?: Order; error?: string; issues?: unknown[] } | null;
      if (r?.order) return { order: r.order };
      if (r?.issues) return { issues: r.issues as ProblemaDeCarrito[] };

      throw new Error('create_order devolvió una respuesta inesperada');
    },
  };
}

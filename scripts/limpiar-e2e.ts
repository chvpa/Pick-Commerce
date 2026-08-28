import { existsSync } from 'node:fs';
import { clienteDeServidor } from '@pick/adapter-supabase';

/**
 * Borra lo que una corrida de e2e dejó en el proyecto de desarrollo.
 *
 * El seed restituye el catálogo pero no toca los pedidos, así que sin esto el
 * Admin se llena de compras de prueba entre corridas. En CI no hace falta —la
 * base es efímera (ADR-058)— pero corre igual: allá no hay `.env` y sin
 * credenciales esto se saltea solo.
 *
 * El marcador es el dominio `@e2e.test` de los correos que usan las pruebas.
 * Borrar por fecha o por tienda alcanzaría también a pedidos reales de la demo.
 *
 * `order_counters` no se toca a propósito: los números consumidos quedan
 * consumidos. Reciclarlos daría dos pedidos distintos con el mismo número, que
 * es exactamente lo que la numeración existe para evitar.
 *
 * Es un script y no una función del teardown de Playwright por una razón
 * concreta: el cliente de Supabase deja sockets con keep-alive abiertos, y al
 * salir Playwright inmediatamente después, Node en Windows se caía con una
 * aserción de libuv. La corrida terminaba en verde y el comando devolvía un
 * código de error igual, de forma intermitente. En un proceso aparte los
 * handles se mueren con él.
 */

if (existsSync('.env')) process.loadEnvFile('.env');

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (url && secretKey) {
  try {
    const db = clienteDeServidor({ url, secretKey });

    // Las líneas y los eventos se van en cascada con el pedido; los clientes no,
    // porque no cuelgan de él.
    const pedidos = await db
      .from('orders')
      .delete()
      .like('customer->>email', '%@e2e.test')
      .select('id');
    await db.from('customers').delete().like('email', '%@e2e.test');

    console.log(`  pedidos de prueba borrados: ${pedidos.data?.length ?? 0}`);
  } catch (error) {
    // Una limpieza fallida no puede tumbar una corrida que ya pasó: lo peor que
    // deja es basura en un entorno de desarrollo.
    console.warn(`  no se pudieron borrar los pedidos de prueba: ${(error as Error).message}`);
  }
}

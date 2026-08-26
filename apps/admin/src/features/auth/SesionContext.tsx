import { createContext, use, useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  cerrarSesion,
  iniciarSesion,
  membresiasDe,
  observarSesion,
  type SesionActiva,
  type UsuarioAutenticado,
} from '@pick/adapter-supabase';
import { db } from '@/lib/supabase';

interface Sesion {
  estado: 'cargando' | 'anonimo' | 'autenticado';
  sesion: SesionActiva | null;
  entrar: (email: string, password: string) => Promise<void>;
  salir: () => Promise<void>;
}

const SesionContext = createContext<Sesion | null>(null);

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<SesionActiva | null>(null);
  const [estado, setEstado] = useState<Sesion['estado']>('cargando');

  const cargar = useCallback(async (usuario: UsuarioAutenticado | null) => {
    if (!usuario) {
      setSesion(null);
      setEstado('anonimo');
      return;
    }
    const membresias = await membresiasDe(db);
    setSesion({ ...usuario, membresias });
    setEstado('autenticado');
  }, []);

  useEffect(() => {
    /*
     * El observador es la única fuente: emite también al suscribirse, así que
     * no hace falta una carga inicial aparte —que duplicaría la consulta y
     * dispararía renders en cascada.
     */
    return observarSesion(db, (usuario) => {
      void cargar(usuario);
    });
  }, [cargar]);

  const entrar = useCallback(async (email: string, password: string) => {
    // No se refresca a mano: el `SIGNED_IN` del listener lo hace.
    await iniciarSesion(db, email, password);
  }, []);

  const salir = useCallback(async () => {
    await cerrarSesion(db);
  }, []);

  return <SesionContext value={{ estado, sesion, entrar, salir }}>{children}</SesionContext>;
}

export function useSesion(): Sesion {
  const ctx = use(SesionContext);
  if (!ctx) throw new Error('useSesion necesita estar dentro de ProveedorSesion');
  return ctx;
}

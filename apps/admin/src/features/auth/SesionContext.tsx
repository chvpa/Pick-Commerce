import { createContext, use, useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  actualizarPassword,
  cerrarSesion,
  iniciarSesion,
  membresiasDe,
  observarSesion,
  pedirReset,
  type SesionActiva,
  type UsuarioAutenticado,
} from '@pick/adapter-supabase';
import { db } from '@/lib/supabase';

interface Sesion {
  /**
   * `restablecer` es una sesión abierta por el enlace de un correo de
   * recuperación. Es válida como cualquier otra, así que sin distinguirla el
   * Admin mostraría el panel y la persona se quedaría sin poder cambiar la
   * contraseña que vino a cambiar.
   */
  estado: 'cargando' | 'anonimo' | 'autenticado' | 'restablecer';
  sesion: SesionActiva | null;
  entrar: (email: string, password: string) => Promise<void>;
  salir: () => Promise<void>;
  /** Manda el correo de recuperación. Resuelve exista o no la cuenta. */
  recuperar: (email: string) => Promise<void>;
  /** Cambia la contraseña de quien entró por el enlace, y sigue al panel. */
  cambiarPassword: (nueva: string) => Promise<void>;
}

const SesionContext = createContext<Sesion | null>(null);

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<SesionActiva | null>(null);
  const [estado, setEstado] = useState<Sesion['estado']>('cargando');

  const cargar = useCallback(async (usuario: UsuarioAutenticado | null, contexto?: 'recovery') => {
    if (!usuario) {
      setSesion(null);
      setEstado('anonimo');
      return;
    }
    const membresias = await membresiasDe(db);
    setSesion({ ...usuario, membresias });
    setEstado(contexto === 'recovery' ? 'restablecer' : 'autenticado');
  }, []);

  useEffect(() => {
    /*
     * El observador es la única fuente: emite también al suscribirse, así que
     * no hace falta una carga inicial aparte —que duplicaría la consulta y
     * dispararía renders en cascada.
     */
    return observarSesion(db, (usuario, contexto) => {
      void cargar(usuario, contexto);
    });
  }, [cargar]);

  const entrar = useCallback(async (email: string, password: string) => {
    // No se refresca a mano: el `SIGNED_IN` del listener lo hace.
    await iniciarSesion(db, email, password);
  }, []);

  const salir = useCallback(async () => {
    await cerrarSesion(db);
  }, []);

  const recuperar = useCallback(async (email: string) => {
    // El enlace vuelve al mismo Admin; Supabase abre la sesión y el observador
    // la reporta como 'recovery'.
    await pedirReset(db, email, globalThis.location.origin);
  }, []);

  const cambiarPassword = useCallback(async (nueva: string) => {
    await actualizarPassword(db, nueva);
    // La sesión ya es válida: lo único que faltaba era dejar de estar en modo
    // recuperación.
    setEstado('autenticado');
  }, []);

  return (
    <SesionContext value={{ estado, sesion, entrar, salir, recuperar, cambiarPassword }}>
      {children}
    </SesionContext>
  );
}

export function useSesion(): Sesion {
  const ctx = use(SesionContext);
  if (!ctx) throw new Error('useSesion necesita estar dentro de ProveedorSesion');
  return ctx;
}

-- `anon` conservaba EXECUTE sobre la función del trigger del último owner.
--
-- Mismo default privilege de Supabase que destapó ADR-064: la migración que la
-- creó no la revocó porque una función de trigger no parece una superficie —y de
-- hecho **no lo es**: comprobado contra el proyecto real, invocarla directo da
-- `trigger functions can only be called as triggers`, así que no era explotable.
--
-- Se revoca igual por dos razones. Una, el invariante que se verifica antes de
-- cerrar cada fase es "ninguna función de `public` es ejecutable por `anon`", y
-- una excepción sin anotar convierte esa verificación en ruido. Dos, es
-- `security definer`: la próxima que alguien copie de ella como modelo puede no
-- devolver `trigger`.

revoke all on function public.impedir_quitar_ultimo_owner() from public, anon;

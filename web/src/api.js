// Cliente HTTP compartido. Usalo en vez de fetch suelto, así el token
// y el manejo de errores quedan en un solo lugar.

const TOKEN_KEY = "sig2_token";

export const guardarToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const leerToken = () => localStorage.getItem(TOKEN_KEY);
export const borrarToken = () => localStorage.removeItem(TOKEN_KEY);

export async function api(ruta, opciones = {}) {
  const token = leerToken();

  const res = await fetch(`/api${ruta}`, {
    ...opciones,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opciones.headers,
    },
  });

  if (!res.ok) {
    const { error } = await res.json().catch(() => ({}));
    throw new Error(error || `Error ${res.status}`);
  }

  return res.json();
}

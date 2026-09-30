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

// Subir un archivo (multipart). No se fija Content-Type: el navegador arma el boundary.
export async function apiArchivo(ruta, formData) {
  const token = leerToken();
  const res = await fetch(`/api${ruta}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({}));
    throw new Error(error || `Error ${res.status}`);
  }
  return res.json();
}

// Descargar un archivo protegido: un <a href> no manda el token, por eso se baja con fetch.
export async function descargarArchivo(ruta, nombrePorDefecto = "archivo") {
  const token = leerToken();
  const res = await fetch(`/api${ruta}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({}));
    throw new Error(error || `Error ${res.status}`);
  }
  const nombre = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? nombrePorDefecto;
  const url = URL.createObjectURL(await res.blob());
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

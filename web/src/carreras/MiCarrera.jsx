import { useEffect, useState } from "react";
import { api } from "../api.js";
import "./mi-carrera.css";

export default function MiCarrera() {
  const [carrera, setCarrera] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let activo = true;
    setCargando(true); setError(""); setCarrera(null);
    api("/carreras/mi-carrera")
      .then(datos => { if (activo) setCarrera(datos); })
      .catch(e => { if (activo) setError(e.message); })
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, [intento]);

  return <section className="mi-carrera">
    <h2>Mi carrera</h2>
    {cargando ? <p role="status">Cargando información de tu carrera…</p>
      : error ? <div><p role="alert">{error}</p><button onClick={() => setIntento(i => i + 1)}>Volver a consultar</button></div>
      : carrera && <>
        <h3>{carrera.nombre}</h3>
        <dl>
          <dt>Código</dt><dd>{carrera.codigo}</dd>
          <dt>Estado</dt><dd>{carrera.vigente ? "Vigente" : "No vigente"}</dd>
        </dl>
        {!carrera.vigente && <p>Tu carrera figura como no vigente. Podés consultar su información; para conocer cómo afecta a tu cursado, consultá a administración.</p>}
        <h3>Descripción</h3>
        <p className="mi-carrera-descripcion">{carrera.descripcion?.trim() || "Todavía no se cargó una descripción para esta carrera."}</p>
        <button onClick={() => setIntento(i => i + 1)}>Actualizar información</button>
      </>}
  </section>;
}

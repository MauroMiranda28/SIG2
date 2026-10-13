import { useEffect, useState } from "react";
import { api } from "../api.js";
import { formatFecha } from "../formatFecha.js";

// Historia: como alumno quiero consultar la bibliografía, para conocer el
// material recomendado. Muestra la del programa vigente de cada materia de mi plan.

// Compara sin distinguir mayúsculas ni tildes ("algebra" encuentra "Álgebra").
const normalizar = (texto) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function Bibliografia() {
  const [materias, setMaterias] = useState(null);
  const [error, setError] = useState(null);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    api("/materias/bibliografia")
      .then(setMaterias)
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return <p className="form-error">No se pudo cargar la bibliografía: {error}</p>;
  }
  if (!materias) {
    return <p className="loading">Cargando bibliografía...</p>;
  }

  // Si la búsqueda coincide con la materia se muestra toda su bibliografía;
  // si no, solo las obras que coinciden (por título o autor).
  const q = normalizar(busqueda.trim());
  const visibles = materias
    .map((m) => {
      if (!q || normalizar(`${m.nombre} ${m.codigo}`).includes(q)) return m;
      return { ...m, bibliografia: m.bibliografia.filter((obra) => normalizar(obra).includes(q)) };
    })
    .filter((m) => !q || m.bibliografia.length > 0);

  return (
    <div className="page">
      <h2>Bibliografía</h2>
      <p className="text-muted" style={{ marginTop: 0 }}>Material recomendado en el programa de cada materia de tu plan.</p>

      <input
        type="search"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por materia, título o autor..."
        aria-label="Buscar en la bibliografía"
        style={{ width: "100%", marginBottom: "1rem" }}
      />

      {materias.length === 0 && <p className="empty-state">Tu plan todavía no tiene materias cargadas.</p>}
      {materias.length > 0 && visibles.length === 0 && <p className="empty-state">No hay bibliografía que coincida con "{busqueda.trim()}".</p>}

      {visibles.map((m) => (
        <section key={m.id} className="section-block" style={{ paddingBottom: "0.75rem" }}>
          <h3 style={{ marginBottom: "0.25rem" }}>
            {m.nombre} <span className="text-muted" style={{ fontWeight: "normal" }}>({m.codigo})</span>
          </h3>
          <p className="text-muted" style={{ margin: "0 0 0.5rem 0", fontSize: "0.85rem" }}>
            {m.anio}° año{m.cuatrimestre ? ` · ${m.cuatrimestre}° cuatrimestre` : ""}
            {m.actualizadoEn && ` · actualizada el ${formatFecha(m.actualizadoEn)}`}
          </p>
          {m.bibliografia.length === 0 ? (
            <p className="text-muted" style={{ margin: 0 }}>Todavía no hay bibliografía publicada para esta materia.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
              {m.bibliografia.map((obra, i) => <li key={i}>{obra}</li>)}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

import { useEffect, useState } from "react";
import { api } from "../api.js";
import { formatFecha } from "../formatFecha.js";

// Historia: como alumno quiero acceder al historial de notas de mis
// evaluaciones, para hacer seguimiento de mi rendimiento a lo largo del tiempo.

const ETIQUETA_TIPO = {
  PARCIAL: "Parcial",
  RECUPERATORIO: "Recuperatorio",
  FINAL: "Examen final",
  CONDICION_FINAL: "Condición final",
  TRABAJO_PRACTICO: "Trabajo práctico",
};

export default function HistorialNotas() {
  const [evaluaciones, setEvaluaciones] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api("/evaluaciones")
      .then(setEvaluaciones)
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return <p className="form-error">No se pudo cargar tu historial: {error}</p>;
  }

  if (!evaluaciones) {
    return <p className="loading">Cargando historial...</p>;
  }

  return (
    <div className="page">
      <h2>Historial de notas</h2>

      {evaluaciones.length === 0 ? (
        <p className="empty-state">Todavía no tenés evaluaciones registradas.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Materia</th>
              <th>Evaluación</th>
              <th>Nota</th>
            </tr>
          </thead>
          <tbody>
            {evaluaciones.map((ev) => (
              <tr key={ev.id}>
                <td>{formatFecha(ev.fecha)}</td>
                <td>
                  {ev.materia.nombre} <span className="text-muted">({ev.materia.codigo})</span>
                </td>
                <td>
                  {ETIQUETA_TIPO[ev.tipo] ?? ev.tipo}
                  {ev.condicion && ` · ${{ REGULAR: "Regular", PROMOCIONADO: "Promocionado", LIBRE: "Libre" }[ev.condicion]}`}
                </td>
                <td>
                  {ev.nota}
                  {ev.cambios?.length > 0 && (
                    <div className="text-muted" style={{ fontSize: "0.8rem" }}>
                      Corregida (antes {ev.cambios[0].notaAnterior}): {ev.cambios[0].motivo}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

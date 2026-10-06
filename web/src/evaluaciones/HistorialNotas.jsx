import { useEffect, useState } from "react";
import { api } from "../api.js";
import { formatFecha } from "../formatFecha.js";

// Historia: como alumno quiero acceder al historial de notas de mis
// evaluaciones, para hacer seguimiento de mi rendimiento a lo largo del tiempo.

const ETIQUETA_TIPO = {
  PARCIAL: "Parcial",
  RECUPERATORIO: "Recuperatorio",
  FINAL: "Final",
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
    return <p style={{ color: "#b00020" }}>No se pudo cargar tu historial: {error}</p>;
  }

  if (!evaluaciones) {
    return <p>Cargando historial...</p>;
  }

  return (
    <div style={{ fontFamily: "system-ui", maxWidth: "40rem" }}>
      <h2>Historial de notas</h2>

      {evaluaciones.length === 0 ? (
        <p>Todavía no tenés evaluaciones registradas.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              <th style={{ padding: "0.4rem 0" }}>Fecha</th>
              <th>Materia</th>
              <th>Evaluación</th>
              <th>Nota</th>
            </tr>
          </thead>
          <tbody>
            {evaluaciones.map((ev) => (
              <tr key={ev.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "0.4rem 0" }}>{formatFecha(ev.fecha)}</td>
                <td>
                  {ev.materia.nombre} <span style={{ color: "#777" }}>({ev.materia.codigo})</span>
                </td>
                <td>{ETIQUETA_TIPO[ev.tipo] ?? ev.tipo}</td>
                <td>
                  {ev.nota}
                  {ev.cambios?.length > 0 && (
                    <div style={{ fontSize: "0.8rem", color: "#777" }}>
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

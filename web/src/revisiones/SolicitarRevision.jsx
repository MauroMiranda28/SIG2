import { useEffect, useState } from "react";
import { api } from "../api.js";
import { formatFecha } from "../formatFecha.js";

// Historia: como alumno quiero solicitar una revisión de nota desde el
// sistema, para reclamar formalmente si considero que hay un error de calificación.
// Es una sección al pie de «Mis notas» (ver notas/MisNotas.jsx), no una pantalla aparte.

const ETIQUETA_TIPO = {
  PARCIAL: "Parcial",
  RECUPERATORIO: "Recuperatorio",
  FINAL: "Examen final",
  CONDICION_FINAL: "Condición final",
  TRABAJO_PRACTICO: "Trabajo práctico",
};

const ETIQUETA_ESTADO = {
  PENDIENTE: "Pendiente",
  RESUELTA: "Resuelta",
  RECHAZADA: "Rechazada",
};

export default function SolicitarRevision() {
  const [evaluaciones, setEvaluaciones] = useState(null);
  const [solicitudes, setSolicitudes] = useState(null);
  const [error, setError] = useState(null);

  const [evaluacionId, setEvaluacionId] = useState("");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState(null);
  const [mensaje, setMensaje] = useState(null);

  function cargarTodo() {
    Promise.all([api("/evaluaciones"), api("/revisiones/mis-solicitudes")])
      .then(([evals, mis]) => {
        setEvaluaciones(evals);
        setSolicitudes(mis);
        if (evals.length > 0 && !evaluacionId) setEvaluacionId(String(evals[0].id));
      })
      .catch((e) => setError(e.message));
  }

  useEffect(cargarTodo, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setEnviando(true);
    setErrorEnvio(null);
    setMensaje(null);
    try {
      await api("/revisiones", {
        method: "POST",
        body: JSON.stringify({ evaluacionId: Number(evaluacionId), motivo }),
      });
      setMensaje("Tu solicitud fue enviada.");
      setMotivo("");
      cargarTodo();
    } catch (e) {
      setErrorEnvio(e.message);
    } finally {
      setEnviando(false);
    }
  }

  if (error) {
    return <p style={{ color: "#b00020" }}>No se pudo cargar la información: {error}</p>;
  }

  if (evaluaciones === null || solicitudes === null) {
    return <p>Cargando...</p>;
  }

  return (
    <section style={{ marginTop: "2rem", paddingTop: "1.25rem", borderTop: "1px solid #ddd" }}>
      <h3 style={{ marginTop: 0 }}>Solicitar revisión de nota</h3>

      {evaluaciones.length === 0 ? (
        <p>Todavía no tenés evaluaciones sobre las que solicitar una revisión.</p>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "2rem" }}>
          <label>
            Evaluación
            <select
              value={evaluacionId}
              onChange={(e) => setEvaluacionId(e.target.value)}
              style={{ display: "block", width: "100%", padding: "0.4rem" }}
            >
              {evaluaciones.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.materia.nombre} ({ev.materia.codigo}) — {ETIQUETA_TIPO[ev.tipo] ?? ev.tipo} — nota {ev.nota} —{" "}
                  {formatFecha(ev.fecha)}
                </option>
              ))}
            </select>
          </label>

          <label>
            Motivo del reclamo
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              required
              rows={4}
              placeholder="Explicá por qué considerás que hay un error de calificación (mínimo 10 caracteres)."
              style={{ display: "block", width: "100%", padding: "0.4rem" }}
            />
          </label>

          {errorEnvio && <p style={{ color: "#b00020", margin: 0 }}>{errorEnvio}</p>}
          {mensaje && <p style={{ color: "#2e7d32", margin: 0 }}>{mensaje}</p>}

          <button type="submit" disabled={enviando} style={{ cursor: "pointer", alignSelf: "flex-start" }}>
            {enviando ? "Enviando..." : "Enviar solicitud"}
          </button>
        </form>
      )}

      <h4>Mis solicitudes</h4>
      {solicitudes.length === 0 ? (
        <p>No enviaste ninguna solicitud todavía.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {solicitudes.map((s) => (
            <li key={s.id} style={{ padding: "0.75rem 0", borderBottom: "1px solid #f0f0f0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong>
                  {s.evaluacion.materia.nombre} ({s.evaluacion.materia.codigo}) —{" "}
                  {ETIQUETA_TIPO[s.evaluacion.tipo] ?? s.evaluacion.tipo}, nota {s.evaluacion.nota}
                </strong>
                <span
                  style={{
                    fontSize: "0.85rem",
                    padding: "0.15rem 0.5rem",
                    borderRadius: "999px",
                    background: colorEstado(s.estado),
                    color: "#fff",
                  }}
                >
                  {ETIQUETA_ESTADO[s.estado] ?? s.estado}
                </span>
              </div>
              <p style={{ margin: "0.25rem 0 0 0", color: "#555" }}>{s.motivo}</p>
              <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.8rem", color: "#777" }}>
                Enviada el {new Date(s.creadoEn).toLocaleDateString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function colorEstado(estado) {
  if (estado === "RESUELTA") return "#2e7d32";
  if (estado === "RECHAZADA") return "#b00020";
  return "#f9a825";
}

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
    return <p className="form-error">No se pudo cargar la información: {error}</p>;
  }

  if (evaluaciones === null || solicitudes === null) {
    return <p className="loading">Cargando...</p>;
  }

  return (
    <section style={{ marginTop: "2rem", paddingTop: "1.25rem", borderTop: "1px solid var(--color-border)" }}>
      <h3 style={{ marginTop: 0 }}>Solicitar revisión de nota</h3>

      {evaluaciones.length === 0 ? (
        <p className="empty-state">Todavía no tenés evaluaciones sobre las que solicitar una revisión.</p>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "2rem" }}>
          <label className="field">
            Evaluación
            <select value={evaluacionId} onChange={(e) => setEvaluacionId(e.target.value)}>
              {evaluaciones.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.materia.nombre} ({ev.materia.codigo}) — {ETIQUETA_TIPO[ev.tipo] ?? ev.tipo} — nota {ev.nota} —{" "}
                  {formatFecha(ev.fecha)}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            Motivo del reclamo
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              required
              rows={4}
              placeholder="Explicá por qué considerás que hay un error de calificación (mínimo 10 caracteres)."
            />
          </label>

          {errorEnvio && <p className="form-error">{errorEnvio}</p>}
          {mensaje && <p style={{ color: "var(--color-success)", margin: 0 }}>{mensaje}</p>}

          <button type="submit" className="btn" disabled={enviando} style={{ alignSelf: "flex-start" }}>
            {enviando ? "Enviando..." : "Enviar solicitud"}
          </button>
        </form>
      )}

      <h4>Mis solicitudes</h4>
      {solicitudes.length === 0 ? (
        <p className="empty-state">No enviaste ninguna solicitud todavía.</p>
      ) : (
        <ul className="list-clean">
          {solicitudes.map((s) => (
            <li key={s.id} className="list-row">
              <div className="row-between">
                <strong>
                  {s.evaluacion.materia.nombre} ({s.evaluacion.materia.codigo}) —{" "}
                  {ETIQUETA_TIPO[s.evaluacion.tipo] ?? s.evaluacion.tipo}, nota {s.evaluacion.nota}
                </strong>
                <span className="badge" style={{ background: colorEstado(s.estado) }}>
                  {ETIQUETA_ESTADO[s.estado] ?? s.estado}
                </span>
              </div>
              <p className="text-muted" style={{ margin: 0 }}>{s.motivo}</p>
              <p className="text-muted" style={{ margin: 0, fontSize: "0.8rem" }}>
                Enviada el {new Date(s.creadoEn).toLocaleDateString()}
              </p>
              {s.respuesta && (
                <p className="panel-soft" style={{ margin: 0, whiteSpace: "pre-line" }}>
                  <strong>Respuesta del docente:</strong> {s.respuesta}
                  {s.resueltaEn && <span className="text-muted" style={{ fontSize: "0.8rem" }}> · {new Date(s.resueltaEn).toLocaleDateString()}</span>}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function colorEstado(estado) {
  if (estado === "RESUELTA") return "var(--color-success)";
  if (estado === "RECHAZADA") return "var(--color-danger)";
  return "#c77700";
}

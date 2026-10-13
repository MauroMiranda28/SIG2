import { useEffect, useState } from "react";
import { api } from "../api.js";
import { formatFecha } from "../formatFecha.js";
import "./docentes.css";

const ETIQUETA_TIPO = {
  PARCIAL: "Parcial", RECUPERATORIO: "Recuperatorio", FINAL: "Examen final",
  CONDICION_FINAL: "Condición final", TRABAJO_PRACTICO: "Trabajo práctico",
};
const ETIQUETA_ESTADO = { PENDIENTE: "Pendiente", RESUELTA: "Resuelta", RECHAZADA: "Rechazada" };
const COLOR_ESTADO = { PENDIENTE: "#c77700", RESUELTA: "var(--color-success)", RECHAZADA: "var(--color-danger)" };

// Historia: como docente quiero ver y resolver las solicitudes de revisión de nota de mis alumnos,
// para responder los reclamos formalmente. La API solo deja ver y resolver las de las materias
// que el docente tiene asignadas, y el alumno recibe una notificación con la respuesta.
export default function Revisiones() {
  const [materias, setMaterias] = useState(null);
  const [errorCarga, setErrorCarga] = useState("");
  const [materiaId, setMateriaId] = useState("");
  const [solicitudes, setSolicitudes] = useState(null);
  const [respuestas, setRespuestas] = useState({}); // id de solicitud -> texto
  const [trabajando, setTrabajando] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  function cargarMaterias() {
    setErrorCarga("");
    api("/docentes/mis-materias")
      .then((lista) => {
        setMaterias(lista);
        if (lista.length) setMateriaId(String(lista[0].id));
      })
      .catch((e) => setErrorCarga(e.message));
  }

  function cargarSolicitudes() {
    if (!materiaId) return;
    setSolicitudes(null);
    api(`/revisiones/materias/${materiaId}`).then((d) => setSolicitudes(d.solicitudes)).catch((e) => setError(e.message));
  }

  useEffect(cargarMaterias, []);
  useEffect(cargarSolicitudes, [materiaId]);

  async function resolver(solicitud, estado) {
    setTrabajando(solicitud.id);
    setError("");
    setAviso("");
    try {
      await api(`/revisiones/${solicitud.id}/resolver`, {
        method: "PATCH",
        body: JSON.stringify({ estado, respuesta: respuestas[solicitud.id] ?? "" }),
      });
      setAviso(`Solicitud de ${solicitud.alumno.nombre} ${solicitud.alumno.apellido} ${estado === "RECHAZADA" ? "rechazada" : "resuelta"}. El alumno recibió la respuesta.`);
      setRespuestas(({ [solicitud.id]: _, ...resto }) => resto);
      cargarSolicitudes();
    } catch (e) {
      setError(e.message);
    } finally {
      setTrabajando(null);
    }
  }

  const pendientes = solicitudes?.filter((s) => s.estado === "PENDIENTE").length ?? 0;

  return (
    <section className="docente">
      <h2>Revisiones de nota</h2>
      <p>Solicitudes de revisión de tus alumnos. Respondé cada una; si corresponde cambiar la nota, corregila desde «Notas» (al corregirla, las solicitudes pendientes de esa nota se resuelven solas).</p>

      {errorCarga ? (
        <div role="alert"><p>{errorCarga}</p><button onClick={cargarMaterias}>Reintentar</button></div>
      ) : materias === null ? (
        <p role="status">Cargando materias…</p>
      ) : !materias.length ? (
        <p>Todavía no tenés materias asignadas. Pedile a administración que te asigne las que dictás.</p>
      ) : (
        <>
          <label>
            Materia
            <select value={materiaId} onChange={(e) => { setMateriaId(e.target.value); setAviso(""); setError(""); }} style={{ display: "block", padding: "0.4rem" }}>
              {materias.map((m) => <option key={m.id} value={m.id}>{m.nombre} ({m.codigo})</option>)}
            </select>
          </label>

          {error && <p role="alert" className="docente-error">{error}</p>}
          {aviso && <p role="status" className="docente-exito">{aviso}</p>}

          {solicitudes === null ? (
            <p role="status">Cargando solicitudes…</p>
          ) : !solicitudes.length ? (
            <p>Esta materia todavía no tiene solicitudes de revisión.</p>
          ) : (
            <>
              <p><strong>{pendientes}</strong> {pendientes === 1 ? "pendiente" : "pendientes"} de {solicitudes.length}.</p>
              <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.75rem" }}>
                {solicitudes.map((s) => (
                  <li key={s.id} className="panel-soft" style={{ padding: "0.75rem 1rem" }}>
                    <div className="row-between">
                      <strong>{s.alumno.apellido}, {s.alumno.nombre}</strong>
                      <span className="badge" style={{ background: COLOR_ESTADO[s.estado] }}>
                        {ETIQUETA_ESTADO[s.estado] ?? s.estado}
                      </span>
                    </div>
                    <p style={{ margin: "0.25rem 0" }}>
                      {ETIQUETA_TIPO[s.evaluacion.tipo] ?? s.evaluacion.tipo} del {formatFecha(s.evaluacion.fecha)} · nota {s.evaluacion.nota}
                    </p>
                    <p className="text-muted" style={{ margin: "0.25rem 0", whiteSpace: "pre-line" }}>«{s.motivo}»</p>
                    <small className="text-muted">Enviada el {new Date(s.creadoEn).toLocaleDateString("es-AR")}</small>

                    {s.estado === "PENDIENTE" ? (
                      <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.6rem" }}>
                        <textarea
                          value={respuestas[s.id] ?? ""}
                          onChange={(e) => setRespuestas({ ...respuestas, [s.id]: e.target.value })}
                          rows={3}
                          maxLength={1000}
                          placeholder="Respuesta para el alumno (mínimo 5 caracteres)"
                          style={{ width: "100%", padding: "0.4rem", boxSizing: "border-box" }}
                        />
                        <span style={{ display: "flex", gap: "0.5rem" }}>
                          <button onClick={() => resolver(s, "RESUELTA")} disabled={trabajando === s.id} style={{ cursor: "pointer" }}>Resolver</button>
                          <button onClick={() => resolver(s, "RECHAZADA")} disabled={trabajando === s.id} style={{ cursor: "pointer" }}>Rechazar</button>
                        </span>
                      </div>
                    ) : (
                      <p style={{ margin: "0.5rem 0 0", whiteSpace: "pre-line" }}>
                        <strong>Respuesta:</strong> {s.respuesta}
                        {s.resueltaEn ? <small className="text-muted"> · {new Date(s.resueltaEn).toLocaleDateString("es-AR")}</small> : null}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}

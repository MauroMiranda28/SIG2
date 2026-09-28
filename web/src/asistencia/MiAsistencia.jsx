import { useEffect, useState } from "react";
import { api } from "../api.js";
import { formatFecha } from "../formatFecha.js";

// Historia: como estudiante, quiero asentar mi estado de asistencia clase
// por clase para llevar un control estricto de mi presentismo diario.

const ETIQUETA_ESTADO = { PRESENTE: "Presente", AUSENTE: "Ausente", TARDE: "Tarde" };
const HOY = new Date().toISOString().slice(0, 10);

export default function MiAsistencia() {
  const [materiasEnCurso, setMateriasEnCurso] = useState(null);
  const [asistencias, setAsistencias] = useState(null);
  const [presentismo, setPresentismo] = useState(null);
  const [error, setError] = useState(null);

  const [materiaId, setMateriaId] = useState("");
  const [fecha, setFecha] = useState(HOY);
  const [estado, setEstado] = useState("PRESENTE");
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState(null);
  const [mensaje, setMensaje] = useState(null);

  function cargarTodo() {
    Promise.all([api("/materias"), api("/asistencias")])
      .then(([materias, data]) => {
        const enCurso = materias.filter((m) => m.estado === "EN_CURSO");
        setMateriasEnCurso(enCurso);
        if (enCurso.length > 0 && !materiaId) setMateriaId(String(enCurso[0].id));
        setAsistencias(data.asistencias);
        setPresentismo(data.presentismo);
      })
      .catch((e) => setError(e.message));
  }

  useEffect(cargarTodo, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setGuardando(true);
    setErrorGuardado(null);
    setMensaje(null);
    try {
      await api("/asistencias", {
        method: "POST",
        body: JSON.stringify({ materiaId: Number(materiaId), fecha, estado }),
      });
      setMensaje("Asistencia guardada.");
      cargarTodo();
    } catch (e) {
      setErrorGuardado(e.message);
    } finally {
      setGuardando(false);
    }
  }

  if (error) {
    return <p style={{ color: "#b00020" }}>No se pudo cargar tu asistencia: {error}</p>;
  }

  if (materiasEnCurso === null || asistencias === null) {
    return <p>Cargando...</p>;
  }

  return (
    <div style={{ fontFamily: "system-ui", maxWidth: "40rem" }}>
      <h2>Mi asistencia</h2>

      <p>
        Presentismo general: <strong>{presentismo !== null ? `${presentismo}%` : "sin registros todavía"}</strong>
      </p>

      {materiasEnCurso.length === 0 ? (
        <p>No tenés materias en curso para asentar asistencia.</p>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end", marginBottom: "1.5rem" }}>
          <label>
            Materia
            <select value={materiaId} onChange={(e) => setMateriaId(e.target.value)} style={{ display: "block", padding: "0.4rem" }}>
              {materiasEnCurso.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre} ({m.codigo})
                </option>
              ))}
            </select>
          </label>

          <label>
            Fecha
            <input
              type="date"
              value={fecha}
              max={HOY}
              onChange={(e) => setFecha(e.target.value)}
              required
              style={{ display: "block", padding: "0.4rem" }}
            />
          </label>

          <label>
            Estado
            <select value={estado} onChange={(e) => setEstado(e.target.value)} style={{ display: "block", padding: "0.4rem" }}>
              <option value="PRESENTE">Presente</option>
              <option value="AUSENTE">Ausente</option>
              <option value="TARDE">Tarde</option>
            </select>
          </label>

          <button type="submit" disabled={guardando} style={{ cursor: "pointer", padding: "0.45rem 0.75rem" }}>
            {guardando ? "Guardando..." : "Guardar"}
          </button>
        </form>
      )}

      {errorGuardado && <p style={{ color: "#b00020" }}>{errorGuardado}</p>}
      {mensaje && <p style={{ color: "#2e7d32" }}>{mensaje}</p>}

      <h3>Historial</h3>
      {asistencias.length === 0 ? (
        <p>Todavía no asentaste ninguna clase.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
              <th style={{ padding: "0.4rem 0" }}>Fecha</th>
              <th>Materia</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {asistencias.map((a) => (
              <tr key={a.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "0.4rem 0" }}>{formatFecha(a.fecha)}</td>
                <td>
                  {a.materia.nombre} <span style={{ color: "#777" }}>({a.materia.codigo})</span>
                </td>
                <td>{ETIQUETA_ESTADO[a.estado] ?? a.estado}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

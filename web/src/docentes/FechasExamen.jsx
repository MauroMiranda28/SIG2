import { useEffect, useState } from "react";
import { api } from "../api.js";
import { formatFecha } from "../formatFecha.js";
import "./docentes.css";

const TIPOS = [["PARCIAL", "Parcial"], ["RECUPERATORIO", "Recuperatorio"], ["FINAL", "Examen final"]];
const NOMBRE_TIPO = Object.fromEntries(TIPOS);

const soloFecha = (fecha) => new Date(fecha).toISOString().slice(0, 10);

// Historia: como alumno quiero recibir una notificación con la fecha de mis exámenes parciales y
// finales, para organizar mi estudio con anticipación. Acá el docente las programa; la API le avisa
// a los alumnos de la materia al cargarla, reprogramarla o cancelarla.
export default function FechasExamen() {
  const [materias, setMaterias] = useState(null);
  const [aulas, setAulas] = useState([]);
  const [errorCarga, setErrorCarga] = useState("");
  const [materiaId, setMateriaId] = useState("");
  const [examenes, setExamenes] = useState(null);

  const [tipo, setTipo] = useState("PARCIAL");
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [aulaId, setAulaId] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  const [editando, setEditando] = useState(null); // { id, fecha, hora, aulaId }

  function cargarMaterias() {
    setErrorCarga("");
    api("/docentes/mis-materias")
      .then((lista) => {
        setMaterias(lista);
        if (lista.length) setMateriaId(String(lista[0].id));
      })
      .catch((e) => setErrorCarga(e.message));
    api("/docentes/aulas").then(setAulas).catch(() => setAulas([]));
  }

  function cargarExamenes() {
    if (!materiaId) return;
    setExamenes(null);
    api(`/examenes/materias/${materiaId}`).then((d) => setExamenes(d.examenes)).catch((e) => setError(e.message));
  }

  useEffect(cargarMaterias, []);
  useEffect(cargarExamenes, [materiaId]);

  async function accion(promesa, mensajeOk) {
    setError("");
    setAviso("");
    try {
      await promesa;
      setAviso(mensajeOk);
      cargarExamenes();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    }
  }

  async function programar(e) {
    e.preventDefault();
    setEnviando(true);
    const ok = await accion(
      api(`/examenes/materias/${materiaId}`, { method: "POST", body: JSON.stringify({ tipo, fecha, hora: hora || null, aulaId: aulaId || null }) }),
      "Examen programado. Los alumnos de la materia ya recibieron la notificación."
    );
    if (ok) { setFecha(""); setHora(""); setAulaId(""); }
    setEnviando(false);
  }

  async function guardarCambio(e) {
    e.preventDefault();
    const ok = await accion(
      api(`/examenes/${editando.id}`, { method: "PATCH", body: JSON.stringify({ fecha: editando.fecha, hora: editando.hora || null, aulaId: editando.aulaId || null }) }),
      "Examen reprogramado. Los alumnos recibieron la nueva fecha."
    );
    if (ok) setEditando(null);
  }

  function cancelar(examen) {
    if (!window.confirm(`¿Cancelar el ${NOMBRE_TIPO[examen.tipo].toLowerCase()} del ${formatFecha(examen.fecha)}? Se les avisa a los alumnos.`)) return;
    accion(api(`/examenes/${examen.id}`, { method: "DELETE" }), "Examen cancelado. Los alumnos recibieron el aviso.");
  }

  return (
    <section className="docente">
      <h2>Fechas de examen</h2>
      <p>Programá parciales, recuperatorios y finales. Los alumnos de la materia reciben una notificación con la fecha.</p>

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
            <select value={materiaId} onChange={(e) => { setMateriaId(e.target.value); setAviso(""); setError(""); setEditando(null); }} style={{ display: "block", padding: "0.4rem" }}>
              {materias.map((m) => <option key={m.id} value={m.id}>{m.nombre} ({m.codigo})</option>)}
            </select>
          </label>

          <form onSubmit={programar} style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end", margin: "1rem 0" }}>
            <label>Tipo
              <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={{ display: "block", padding: "0.4rem" }}>
                {TIPOS.map(([valor, nombre]) => <option key={valor} value={valor}>{nombre}</option>)}
              </select>
            </label>
            <label>Fecha
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required style={{ display: "block", padding: "0.4rem" }} />
            </label>
            <label>Hora (opcional)
              <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} style={{ display: "block", padding: "0.4rem" }} />
            </label>
            <label>Aula (opcional)
              <select value={aulaId} onChange={(e) => setAulaId(e.target.value)} style={{ display: "block", padding: "0.4rem" }}>
                <option value="">Sin aula</option>
                {aulas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </label>
            <button type="submit" disabled={enviando} style={{ cursor: "pointer" }}>{enviando ? "Guardando..." : "Programar y avisar"}</button>
          </form>

          {error && <p role="alert" style={{ color: "#b00020" }}>{error}</p>}
          {aviso && <p role="status" style={{ color: "#2e7d32" }}>{aviso}</p>}

          <h3>Fechas programadas</h3>
          {examenes === null ? (
            <p role="status">Cargando…</p>
          ) : !examenes.length ? (
            <p>Todavía no programaste exámenes para esta materia.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.6rem" }}>
              {examenes.map((ex) => (
                <li key={ex.id} style={{ padding: "0.6rem 0.8rem", background: "#fafafa", borderRadius: "6px" }}>
                  {editando?.id === ex.id ? (
                    <form onSubmit={guardarCambio} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "flex-end" }}>
                      <strong>{NOMBRE_TIPO[ex.tipo]}</strong>
                      <input type="date" value={editando.fecha} onChange={(e) => setEditando({ ...editando, fecha: e.target.value })} required />
                      <input type="time" value={editando.hora} onChange={(e) => setEditando({ ...editando, hora: e.target.value })} />
                      <select value={editando.aulaId} onChange={(e) => setEditando({ ...editando, aulaId: e.target.value })}>
                        <option value="">Sin aula</option>
                        {aulas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                      </select>
                      <button type="submit" style={{ cursor: "pointer" }}>Guardar y avisar</button>
                      <button type="button" onClick={() => setEditando(null)} style={{ cursor: "pointer" }}>Volver</button>
                    </form>
                  ) : (
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                      <span>
                        <strong>{NOMBRE_TIPO[ex.tipo]}</strong> · {formatFecha(ex.fecha)}
                        {ex.hora ? ` · ${ex.hora}` : ""}{ex.aula ? ` · ${ex.aula.nombre}` : ""}
                      </span>
                      <span style={{ display: "flex", gap: "0.5rem" }}>
                        <button onClick={() => setEditando({ id: ex.id, fecha: soloFecha(ex.fecha), hora: ex.hora ?? "", aulaId: ex.aula ? String(ex.aula.id) : "" })} style={{ cursor: "pointer" }}>Reprogramar</button>
                        <button onClick={() => cancelar(ex)} style={{ cursor: "pointer" }}>Cancelar examen</button>
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

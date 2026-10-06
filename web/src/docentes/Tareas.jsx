import { useEffect, useState } from "react";
import { api } from "../api.js";
import { formatFecha } from "../formatFecha.js";
import "./docentes.css";

const soloFecha = (fecha) => new Date(fecha).toISOString().slice(0, 10);

// Historia: como alumno quiero recibir una notificación cuando se acerque la fecha de entrega de
// una tarea, para no olvidarme de presentarla a tiempo. Acá el docente carga las tareas; a los
// alumnos de la materia les llega el recordatorio unos días antes de la entrega.
export default function Tareas() {
  const [materias, setMaterias] = useState(null);
  const [errorCarga, setErrorCarga] = useState("");
  const [materiaId, setMateriaId] = useState("");
  const [tareas, setTareas] = useState(null);

  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [fechaEntrega, setFechaEntrega] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [editando, setEditando] = useState(null); // { id, titulo, descripcion, fechaEntrega }

  function cargarMaterias() {
    setErrorCarga("");
    api("/docentes/mis-materias")
      .then((lista) => {
        setMaterias(lista);
        if (lista.length) setMateriaId(String(lista[0].id));
      })
      .catch((e) => setErrorCarga(e.message));
  }

  function cargarTareas() {
    if (!materiaId) return;
    setTareas(null);
    api(`/tareas/materias/${materiaId}`).then((d) => setTareas(d.tareas)).catch((e) => setError(e.message));
  }

  useEffect(cargarMaterias, []);
  useEffect(cargarTareas, [materiaId]);

  async function accion(promesa, mensajeOk) {
    setError("");
    setAviso("");
    try {
      await promesa;
      setAviso(mensajeOk);
      cargarTareas();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    }
  }

  async function crear(e) {
    e.preventDefault();
    setEnviando(true);
    const ok = await accion(
      api(`/tareas/materias/${materiaId}`, { method: "POST", body: JSON.stringify({ titulo, descripcion: descripcion || null, fechaEntrega }) }),
      "Tarea cargada. Los alumnos reciben un recordatorio unos días antes de la entrega."
    );
    if (ok) { setTitulo(""); setDescripcion(""); setFechaEntrega(""); }
    setEnviando(false);
  }

  async function guardarCambio(e) {
    e.preventDefault();
    const ok = await accion(
      api(`/tareas/${editando.id}`, { method: "PATCH", body: JSON.stringify({ titulo: editando.titulo, descripcion: editando.descripcion || null, fechaEntrega: editando.fechaEntrega }) }),
      "Tarea actualizada."
    );
    if (ok) setEditando(null);
  }

  function eliminar(tarea) {
    if (!window.confirm(`¿Eliminar la tarea «${tarea.titulo}»?`)) return;
    accion(api(`/tareas/${tarea.id}`, { method: "DELETE" }), "Tarea eliminada.");
  }

  return (
    <section className="docente">
      <h2>Tareas</h2>
      <p>Cargá las tareas de tu materia con su fecha de entrega. Los alumnos reciben un recordatorio cuando se acerca.</p>

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

          <form onSubmit={crear} style={{ display: "grid", gap: "0.6rem", maxWidth: "32rem", margin: "1rem 0" }}>
            <label>Título
              <input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={120} required style={{ display: "block", width: "100%", padding: "0.4rem", boxSizing: "border-box" }} />
            </label>
            <label>Descripción (opcional)
              <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={1000} rows={3} style={{ display: "block", width: "100%", padding: "0.4rem", boxSizing: "border-box" }} />
            </label>
            <label>Fecha de entrega
              <input type="date" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} required style={{ display: "block", padding: "0.4rem" }} />
            </label>
            <button type="submit" disabled={enviando} style={{ cursor: "pointer", justifySelf: "start" }}>{enviando ? "Guardando..." : "Cargar tarea"}</button>
          </form>

          {error && <p role="alert" style={{ color: "#b00020" }}>{error}</p>}
          {aviso && <p role="status" style={{ color: "#2e7d32" }}>{aviso}</p>}

          <h3>Tareas cargadas</h3>
          {tareas === null ? (
            <p role="status">Cargando…</p>
          ) : !tareas.length ? (
            <p>Todavía no cargaste tareas para esta materia.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.6rem" }}>
              {tareas.map((t) => (
                <li key={t.id} style={{ padding: "0.6rem 0.8rem", background: "#fafafa", borderRadius: "6px" }}>
                  {editando?.id === t.id ? (
                    <form onSubmit={guardarCambio} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "flex-end" }}>
                      <input value={editando.titulo} onChange={(e) => setEditando({ ...editando, titulo: e.target.value })} maxLength={120} required />
                      <input type="date" value={editando.fechaEntrega} onChange={(e) => setEditando({ ...editando, fechaEntrega: e.target.value })} required />
                      <button type="submit" style={{ cursor: "pointer" }}>Guardar</button>
                      <button type="button" onClick={() => setEditando(null)} style={{ cursor: "pointer" }}>Volver</button>
                    </form>
                  ) : (
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                      <span>
                        <strong>{t.titulo}</strong> · entrega {formatFecha(t.fechaEntrega)}
                        {t.descripcion ? <small style={{ display: "block", color: "#475569" }}>{t.descripcion}</small> : null}
                      </span>
                      <span style={{ display: "flex", gap: "0.5rem" }}>
                        <button onClick={() => setEditando({ id: t.id, titulo: t.titulo, descripcion: t.descripcion ?? "", fechaEntrega: soloFecha(t.fechaEntrega) })} style={{ cursor: "pointer" }}>Editar</button>
                        <button onClick={() => eliminar(t)} style={{ cursor: "pointer" }}>Eliminar</button>
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

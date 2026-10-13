import { useEffect, useState } from "react";
import { api, apiArchivo, descargarArchivo } from "../api.js";
import { formatFecha } from "../formatFecha.js";
import "./docentes.css";

const soloFecha = (fecha) => new Date(fecha).toISOString().slice(0, 10);
const ACEPTA = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.png,.jpg,.jpeg";
const pesoLegible = (bytes) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

function subirAdjuntos(tareaId, archivos) {
  const datos = new FormData();
  for (const archivo of archivos) datos.append("archivos", archivo);
  return apiArchivo(`/archivos-tarea/tareas/${tareaId}`, datos);
}

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
  const [horaEntrega, setHoraEntrega] = useState("");
  const [adjuntos, setAdjuntos] = useState([]);
  const [claveAdjuntos, setClaveAdjuntos] = useState(0); // para vaciar el <input type="file">
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [editando, setEditando] = useState(null); // { id, titulo, descripcion, fechaEntrega, horaEntrega }

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
    // Primero la tarea y después sus adjuntos (si los hay).
    const ok = await accion(
      (async () => {
        const tarea = await api(`/tareas/materias/${materiaId}`, { method: "POST", body: JSON.stringify({ titulo, descripcion: descripcion || null, fechaEntrega, horaEntrega: horaEntrega || null }) });
        if (adjuntos.length) {
          try { await subirAdjuntos(tarea.id, adjuntos); } catch (err) { throw new Error(`La tarea se cargó, pero no los adjuntos: ${err.message}`); }
        }
      })(),
      "Tarea cargada. Los alumnos reciben un recordatorio unos días antes de la entrega."
    );
    if (ok) { setTitulo(""); setDescripcion(""); setFechaEntrega(""); setHoraEntrega(""); setAdjuntos([]); setClaveAdjuntos((k) => k + 1); }
    else cargarTareas();
    setEnviando(false);
  }

  async function guardarCambio(e) {
    e.preventDefault();
    const ok = await accion(
      api(`/tareas/${editando.id}`, { method: "PATCH", body: JSON.stringify({ titulo: editando.titulo, descripcion: editando.descripcion || null, fechaEntrega: editando.fechaEntrega, horaEntrega: editando.horaEntrega || null }) }),
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
            <label>Hora de entrega (opcional)
              <input type="time" value={horaEntrega} onChange={(e) => setHoraEntrega(e.target.value)} style={{ display: "block", padding: "0.4rem" }} />
            </label>
            <label>Archivos adjuntos (opcional, hasta 5 de 10 MB c/u)
              <input key={claveAdjuntos} type="file" multiple accept={ACEPTA} onChange={(e) => setAdjuntos([...e.target.files])} style={{ display: "block", padding: "0.4rem 0" }} />
            </label>
            <button type="submit" disabled={enviando} style={{ cursor: "pointer", justifySelf: "start" }}>{enviando ? "Guardando..." : "Cargar tarea"}</button>
          </form>

          {error && <p role="alert" className="docente-error">{error}</p>}
          {aviso && <p role="status" className="docente-exito">{aviso}</p>}

          <h3>Tareas cargadas</h3>
          {tareas === null ? (
            <p role="status">Cargando…</p>
          ) : !tareas.length ? (
            <p>Todavía no cargaste tareas para esta materia.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.6rem" }}>
              {tareas.map((t) => (
                <li key={t.id} className="panel-soft" style={{ padding: "0.6rem 0.8rem" }}>
                  {editando?.id === t.id ? (
                    <form onSubmit={guardarCambio} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "flex-end" }}>
                      <input value={editando.titulo} onChange={(e) => setEditando({ ...editando, titulo: e.target.value })} maxLength={120} required />
                      <input type="date" value={editando.fechaEntrega} onChange={(e) => setEditando({ ...editando, fechaEntrega: e.target.value })} required />
                      <input type="time" value={editando.horaEntrega} onChange={(e) => setEditando({ ...editando, horaEntrega: e.target.value })} aria-label="Hora de entrega" />
                      <button type="submit" style={{ cursor: "pointer" }}>Guardar</button>
                      <button type="button" onClick={() => setEditando(null)} style={{ cursor: "pointer" }}>Volver</button>
                    </form>
                  ) : (
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                      <span>
                        <strong>{t.titulo}</strong> · entrega {formatFecha(t.fechaEntrega)}{t.horaEntrega ? ` a las ${t.horaEntrega}` : ""}
                        {t.descripcion ? <small className="text-muted" style={{ display: "block" }}>{t.descripcion}</small> : null}
                        <Adjuntos tarea={t} onCambio={(mensaje) => accion(Promise.resolve(), mensaje)} onError={setError} />
                      </span>
                      <span style={{ display: "flex", gap: "0.5rem" }}>
                        <button onClick={() => setEditando({ id: t.id, titulo: t.titulo, descripcion: t.descripcion ?? "", fechaEntrega: soloFecha(t.fechaEntrega), horaEntrega: t.horaEntrega ?? "" })} style={{ cursor: "pointer" }}>Editar</button>
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

// Adjuntos de una tarea: descargar, quitar y agregar más.
function Adjuntos({ tarea, onCambio, onError }) {
  const [ocupado, setOcupado] = useState(false);
  const [clave, setClave] = useState(0);
  const archivos = tarea.archivos ?? [];

  async function ejecutar(promesa, mensaje) {
    onError("");
    setOcupado(true);
    try { await promesa; onCambio(mensaje); } catch (e) { onError(e.message); } finally { setOcupado(false); setClave((k) => k + 1); }
  }

  return (
    <span style={{ display: "block", marginTop: "0.35rem" }}>
      {archivos.length > 0 && (
        <ul style={{ margin: "0 0 0.35rem", paddingLeft: "1.1rem", fontSize: "0.9rem" }}>
          {archivos.map((a) => (
            <li key={a.id}>
              <button type="button" className="btn-ghost" style={{ padding: 0, cursor: "pointer" }} disabled={ocupado}
                onClick={() => descargarArchivo(`/archivos-tarea/${a.id}`, a.nombre).catch((e) => onError(e.message))}>
                {a.nombre}
              </button>{" "}
              <small className="text-muted">({pesoLegible(a.tamanio)})</small>{" "}
              <button type="button" disabled={ocupado} aria-label={`Quitar ${a.nombre}`} style={{ cursor: "pointer", fontSize: "0.8rem" }}
                onClick={() => window.confirm(`¿Quitar «${a.nombre}»?`) && ejecutar(api(`/archivos-tarea/${a.id}`, { method: "DELETE" }), "Se quitó el adjunto.")}>
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
      <label style={{ fontSize: "0.85rem" }}>
        {archivos.length ? "Adjuntar más: " : "Adjuntar archivos: "}
        <input key={clave} type="file" multiple accept={ACEPTA} disabled={ocupado}
          onChange={(e) => e.target.files.length && ejecutar(subirAdjuntos(tarea.id, [...e.target.files]), "Se adjuntaron los archivos.")} />
      </label>
    </span>
  );
}

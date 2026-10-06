import { useEffect, useState } from "react";
import { api } from "../api.js";
import { formatFecha } from "../formatFecha.js";
import "./docentes.css";

// El docente carga las notas de sus evaluaciones y las corrige dejando registro.
// Lo que se guarda acá le aparece al alumno en «Historial de notas» en el momento.

const TIPOS = [
  ["PARCIAL", "Parcial"], ["RECUPERATORIO", "Recuperatorio"],
  ["FINAL", "Final"], ["TRABAJO_PRACTICO", "Trabajo práctico"],
];
const NOMBRE_TIPO = Object.fromEntries(TIPOS);
const hoy = () => new Date().toLocaleDateString("en-CA"); // AAAA-MM-DD en hora local

export default function NotasDocente() {
  const [materias, setMaterias] = useState(null);
  const [materiaId, setMateriaId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api("/docentes/mis-materias")
      .then((lista) => {
        setMaterias(lista);
        if (lista.length === 1) setMateriaId(String(lista[0].id));
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p role="alert">{error}</p>;
  if (materias === null) return <p role="status">Cargando materias…</p>;

  return (
    <section className="docente">
      <h2>Notas</h2>
      {!materias.length ? (
        <p>Todavía no tenés materias asignadas. Pedile a administración que te asigne las que dictás.</p>
      ) : (
        <>
          <label className="docente-campo">Materia
            <select value={materiaId} onChange={(e) => setMateriaId(e.target.value)}>
              <option value="">Elegí una materia</option>
              {materias.map((m) => <option key={m.id} value={m.id}>{m.nombre} ({m.codigo})</option>)}
            </select>
          </label>
          {materiaId && <NotasMateria key={materiaId} materiaId={materiaId} />}
        </>
      )}
    </section>
  );
}

function NotasMateria({ materiaId }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");

  function cargar() {
    setError("");
    return api(`/notas/materias/${materiaId}`).then(setDatos).catch((e) => setError(e.message));
  }

  useEffect(() => { cargar(); }, [materiaId]);

  if (error) return <div role="alert"><p>{error}</p><button onClick={cargar}>Reintentar</button></div>;
  if (!datos) return <p role="status">Cargando alumnos…</p>;
  if (!datos.alumnos.length) {
    return <p>Esta materia todavía no tiene alumnos: aparecen cuando eligen una comisión o tienen la cursada registrada.</p>;
  }

  return (
    <>
      <FormCarga alumnos={datos.alumnos} materiaId={materiaId} onCargado={cargar} />
      <div className="docente-materia">
        <h3>Notas publicadas</h3>
        {datos.alumnos.map((a) => (
          <div className="docente-comision" key={a.id}>
            <h5>{a.apellido}, {a.nombre} <span className="docente-meta">{a.email}</span></h5>
            {!a.evaluaciones.length ? <p>Sin notas cargadas.</p> : (
              <ul>{a.evaluaciones.map((ev) => <FilaEvaluacion key={ev.id} evaluacion={ev} onCorregida={cargar} />)}</ul>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function FormCarga({ alumnos, materiaId, onCargado }) {
  const [tipo, setTipo] = useState("PARCIAL");
  const [fecha, setFecha] = useState(hoy());
  const [notas, setNotas] = useState({}); // alumnoId -> texto
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  async function guardar(e) {
    e.preventDefault();
    // Solo se mandan los alumnos con nota escrita: el resto queda para otra carga.
    const cargadas = alumnos
      .filter((a) => (notas[a.id] ?? "").trim())
      .map((a) => ({ alumnoId: a.id, nota: notas[a.id].trim() }));
    if (!cargadas.length) return setAviso({ tipo: "error", texto: "Escribí la nota de al menos un alumno." });

    setAviso(null);
    setOcupado(true);
    try {
      await api(`/notas/materias/${materiaId}`, { method: "POST", body: JSON.stringify({ tipo, fecha, notas: cargadas }) });
      setNotas({});
      setAviso({ tipo: "exito", texto: `Se publicaron ${cargadas.length} nota(s). Los alumnos ya pueden verlas.` });
      await onCargado();
    } catch (err) {
      setAviso({ tipo: "error", texto: err.message });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <form className="docente-materia" onSubmit={guardar} aria-label="Cargar notas de una evaluación">
      <h3>Cargar notas</h3>
      <div className="docente-horario">
        <label>Evaluación
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS.map(([valor, texto]) => <option key={valor} value={valor}>{texto}</option>)}
          </select>
        </label>
        <label>Fecha<input type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
      </div>
      <table className="docente-tabla">
        <thead><tr><th>Alumno</th><th>Nota (0 a 10)</th></tr></thead>
        <tbody>
          {alumnos.map((a) => (
            <tr key={a.id}>
              <td><label htmlFor={`nota-${a.id}`}>{a.apellido}, {a.nombre}</label></td>
              <td>
                <input id={`nota-${a.id}`} type="number" min="0" max="10" step="0.01" inputMode="decimal"
                  value={notas[a.id] ?? ""} onChange={(e) => setNotas({ ...notas, [a.id]: e.target.value })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="docente-meta">
        Dejá vacía la nota de quien no rindió.
        {tipo === "FINAL" && " Con 4 o más, la materia le queda aprobada al alumno con esa nota."}
      </p>
      <div><button className="docente-primario" type="submit" disabled={ocupado}>{ocupado ? "Publicando…" : "Publicar notas"}</button></div>
      {aviso && <p role={aviso.tipo === "error" ? "alert" : "status"} className={`docente-${aviso.tipo}`}>{aviso.texto}</p>}
    </form>
  );
}

function FilaEvaluacion({ evaluacion, onCorregida }) {
  const [editando, setEditando] = useState(false);
  const [nota, setNota] = useState(String(evaluacion.nota));
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function corregir(e) {
    e.preventDefault();
    setError("");
    setOcupado(true);
    try {
      await api(`/notas/evaluaciones/${evaluacion.id}`, { method: "PATCH", body: JSON.stringify({ nota, motivo }) });
      setEditando(false);
      setMotivo("");
      await onCorregida();
    } catch (err) {
      setError(err.message);
    } finally {
      setOcupado(false);
    }
  }

  const titulo = `${NOMBRE_TIPO[evaluacion.tipo] ?? evaluacion.tipo} del ${formatFecha(evaluacion.fecha)}`;

  return (
    <li className="docente-evaluacion">
      <div className="docente-fila-nota">
        <span>{titulo}: <strong>{evaluacion.nota}</strong>{evaluacion.cambios.length > 0 && " (corregida)"}</span>
        {!editando && <button type="button" onClick={() => setEditando(true)} aria-label={`Corregir ${titulo}`}>Corregir</button>}
      </div>

      {editando && (
        <form className="docente-horario" onSubmit={corregir} aria-label={`Corregir ${titulo}`}>
          <label>Nota nueva<input type="number" min="0" max="10" step="0.01" required value={nota} onChange={(e) => setNota(e.target.value)} /></label>
          <label className="docente-motivo">Motivo de la corrección
            <input type="text" required minLength={5} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </label>
          <button className="docente-primario" type="submit" disabled={ocupado}>Guardar</button>
          <button type="button" disabled={ocupado} onClick={() => { setEditando(false); setError(""); setNota(String(evaluacion.nota)); }}>Cancelar</button>
          {error && <p role="alert" className="docente-error">{error}</p>}
        </form>
      )}

      {evaluacion.cambios.length > 0 && (
        <details>
          <summary>Historial de cambios ({evaluacion.cambios.length})</summary>
          <ul className="docente-cambios">
            {evaluacion.cambios.map((c) => (
              <li key={c.id}>
                {new Date(c.creadoEn).toLocaleString("es-AR")} · {c.notaAnterior} → {c.notaNueva} · {c.autor.nombre} {c.autor.apellido}: «{c.motivo}»
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

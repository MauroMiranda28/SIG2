import { useEffect, useState } from "react";
import { api } from "../api.js";
import { formatFecha } from "../formatFecha.js";
import "./docentes.css";

// El docente carga las notas de sus evaluaciones y las corrige dejando registro.
// Lo que se guarda acá le aparece al alumno en «Historial de notas» en el momento.
// «Condición final» cierra la cursada (regular o promocionado) y «Examen final» es
// cada intento de un alumno regular; las dos usan la condición configurada en «Mis materias».

const TIPOS = [
  ["PARCIAL", "Parcial"], ["RECUPERATORIO", "Recuperatorio"], ["TRABAJO_PRACTICO", "Trabajo práctico"],
  ["CONDICION_FINAL", "Condición final"], ["FINAL", "Examen final"],
];
const NOMBRE_TIPO = Object.fromEntries(TIPOS);
const NOMBRE_CONDICION = { REGULAR: "Regular", PROMOCIONADO: "Promocionado", LIBRE: "Libre" };
const MAX_INTENTOS_FINAL = 3;
const hoy = () => new Date().toLocaleDateString("en-CA"); // AAAA-MM-DD en hora local

const esRegularVigente = (a) => a.estado === "REGULAR" && a.venceRegularidad && new Date(a.venceRegularidad) >= new Date(`${hoy()}T00:00:00Z`);
// Libre: no sigue cursando (no se le cargan más notas hasta que vuelva a inscribirse).
const esLibre = (a) => a.estado === "LIBRE" || (a.estado === "REGULAR" && !esRegularVigente(a));

// Cómo está el alumno en la materia, para el docente.
function estadoAlumno(a) {
  if (a.estado === "APROBADA") return `Aprobada con ${a.nota}`;
  if (a.estado === "REGULAR") {
    return esRegularVigente(a)
      ? `Regular · ${a.intentosFinal} de ${MAX_INTENTOS_FINAL} intentos de final usados · vence el ${formatFecha(a.venceRegularidad)}`
      : `Libre: se le venció la regularidad el ${formatFecha(a.venceRegularidad)}`;
  }
  if (a.estado === "LIBRE") {
    return a.intentosFinal >= MAX_INTENTOS_FINAL ? `Libre: desaprobó los ${MAX_INTENTOS_FINAL} intentos de final` : "Libre: no regularizó la cursada";
  }
  return "Cursando";
}

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
      <FormCarga alumnos={datos.alumnos} materia={datos.materia} onCargado={cargar} />
      <div className="docente-materia">
        <h3>Notas publicadas</h3>
        {datos.alumnos.map((a) => (
          <div className="docente-comision" key={a.id}>
            <h5>{a.apellido}, {a.nombre} <span className="docente-meta">{a.email}</span></h5>
            <p className="docente-meta">{estadoAlumno(a)}</p>
            {!a.evaluaciones.length ? <p>Sin notas cargadas.</p> : (
              <ul>{a.evaluaciones.map((ev) => <FilaEvaluacion key={ev.id} evaluacion={ev} onCorregida={cargar} />)}</ul>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function FormCarga({ alumnos, materia, onCargado }) {
  const [tipo, setTipo] = useState("PARCIAL");
  const [fecha, setFecha] = useState(hoy());
  const [notas, setNotas] = useState({}); // alumnoId -> texto
  const [condiciones, setCondiciones] = useState({}); // alumnoId -> REGULAR | PROMOCIONADO
  const [aviso, setAviso] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const cierraCursada = tipo === "CONDICION_FINAL" || tipo === "FINAL";
  const sinCondicion = cierraCursada && !materia.condicionConfigurada;

  // Condición final: a quien sigue cursando. Examen final: solo a los regulares vigentes.
  // A los libres no se les carga nada: tienen que volver a inscribirse.
  const lista = tipo === "CONDICION_FINAL"
    ? alumnos.filter((a) => !["APROBADA", "REGULAR", "LIBRE"].includes(a.estado))
    : tipo === "FINAL" ? alumnos.filter(esRegularVigente) : alumnos.filter((a) => !esLibre(a));
  const condicionDe = (id) => condiciones[id] ?? "REGULAR";

  function cambiarTipo(nuevo) {
    setTipo(nuevo);
    setNotas({});
    setCondiciones({});
    setAviso(null);
  }

  async function guardar(e) {
    e.preventDefault();
    // Solo se mandan los alumnos con nota escrita: el resto queda para otra carga.
    const cargadas = lista
      .filter((a) => (notas[a.id] ?? "").trim())
      .map((a) => ({ alumnoId: a.id, nota: notas[a.id].trim(), ...(tipo === "CONDICION_FINAL" ? { condicion: condicionDe(a.id) } : {}) }));
    if (!cargadas.length) return setAviso({ tipo: "error", texto: "Escribí la nota de al menos un alumno." });

    setAviso(null);
    setOcupado(true);
    try {
      await api(`/notas/materias/${materia.id}`, { method: "POST", body: JSON.stringify({ tipo, fecha, notas: cargadas }) });
      setNotas({});
      setCondiciones({});
      setAviso({ tipo: "exito", texto: `Se publicaron ${cargadas.length} nota(s). Los alumnos ya pueden verlas.` });
      await onCargado();
    } catch (err) {
      setAviso({ tipo: "error", texto: err.message });
    } finally {
      setOcupado(false);
    }
  }

  let ayuda = "Dejá vacía la nota de quien no rindió.";
  if (tipo === "CONDICION_FINAL" && !sinCondicion) {
    ayuda = `Regular: se regulariza con ${materia.notaRegularizacion} o más y tiene ${MAX_INTENTOS_FINAL} intentos de final en 2 años.`
      + (materia.esPromocional ? ` Promocionado: con ${materia.notaPromocion} o más aprueba la materia con esa nota.` : " Esta materia no es promocional.")
      + " Libre: no regularizó; deja de cursar y se le quita la comisión.";
  }
  if (tipo === "FINAL" && !sinCondicion) {
    ayuda = `Con ${materia.notaAprobacionFinal} o más aprueba la materia. Desaprobado el intento ${MAX_INTENTOS_FINAL}, queda libre y se le quita la comisión. Dejá vacía la nota de quien no se presentó.`;
  }

  return (
    <form className="docente-materia" onSubmit={guardar} aria-label="Cargar notas de una evaluación">
      <h3>Cargar notas</h3>
      <div className="docente-horario">
        <label>Evaluación
          <select value={tipo} onChange={(e) => cambiarTipo(e.target.value)}>
            {TIPOS.map(([valor, texto]) => <option key={valor} value={valor}>{texto}</option>)}
          </select>
        </label>
        <label>Fecha<input type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
      </div>

      {sinCondicion ? (
        <p className="docente-aviso">
          Para cargar {NOMBRE_TIPO[tipo].toLowerCase()} primero configurá la condición de la materia
          (con cuánto se regulariza, se promociona y se aprueba el final) en «Mis materias».
        </p>
      ) : !lista.length ? (
        <p className="docente-aviso">
          {tipo === "FINAL" ? "No hay alumnos regulares en esta materia."
            : tipo === "CONDICION_FINAL" ? "Todos los alumnos ya tienen su condición final cargada." : "No hay alumnos cursando esta materia."}
        </p>
      ) : (
        <>
          <table className="docente-tabla">
            <thead>
              <tr>
                <th>Alumno</th>
                {tipo === "CONDICION_FINAL" && <th>Condición</th>}
                {tipo === "FINAL" && <th>Intento</th>}
                <th>
                  {tipo === "CONDICION_FINAL" ? "Nota de cursada" : tipo === "FINAL" ? "Nota del final" : "Nota (0 a 10)"}
                </th>
              </tr>
            </thead>
            <tbody>
              {lista.map((a) => (
                <tr key={a.id}>
                  <td><label htmlFor={`nota-${a.id}`}>{a.apellido}, {a.nombre}</label></td>
                  {tipo === "CONDICION_FINAL" && (
                    <td>
                      <select value={condicionDe(a.id)} aria-label={`Condición de ${a.apellido}, ${a.nombre}`}
                        onChange={(e) => setCondiciones({ ...condiciones, [a.id]: e.target.value })}>
                        <option value="REGULAR">Regular</option>
                        {materia.esPromocional && <option value="PROMOCIONADO">Promocionado</option>}
                        <option value="LIBRE">Libre</option>
                      </select>
                    </td>
                  )}
                  {tipo === "FINAL" && (
                    <td>{a.intentosFinal + 1} de {MAX_INTENTOS_FINAL} <span className="docente-meta">(vence {formatFecha(a.venceRegularidad)})</span></td>
                  )}
                  <td>
                    <input id={`nota-${a.id}`} type="number" min="0" max="10" step="0.01" inputMode="decimal"
                      value={notas[a.id] ?? ""} onChange={(e) => setNotas({ ...notas, [a.id]: e.target.value })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="docente-meta">{ayuda}</p>
          <div><button className="docente-primario" type="submit" disabled={ocupado}>{ocupado ? "Publicando…" : "Publicar notas"}</button></div>
        </>
      )}
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

  const condicion = evaluacion.condicion ? ` (${NOMBRE_CONDICION[evaluacion.condicion]})` : "";
  const titulo = `${NOMBRE_TIPO[evaluacion.tipo] ?? evaluacion.tipo}${condicion} del ${formatFecha(evaluacion.fecha)}`;

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

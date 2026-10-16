import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import "./programas.css";

// Administración revisa las propuestas de cambio al programa que hacen los docentes:
// las aprueba (se publica como nueva versión vigente) o las rechaza con una respuesta.

const fechaHora = (f) => new Date(f).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
const ESTADO = { PENDIENTE: "Pendiente", APROBADA: "Aprobada", RECHAZADA: "Rechazada" };

function Propuesta({ propuesta, onResuelta }) {
  const [respuesta, setRespuesta] = useState("");
  const [reemplazarPdf, setReemplazarPdf] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const envio = useRef(false);
  const pendiente = propuesta.estado === "PENDIENTE";
  const actual = propuesta.programaActual;

  async function resolver(estado) {
    if (envio.current) return;
    if (estado === "RECHAZADA" && respuesta.trim().length < 5) { setError("Escribí por qué se rechaza la propuesta (mínimo 5 caracteres)."); return; }
    envio.current = true; setEnviando(true); setError("");
    try {
      const resuelta = await api(`/propuestas-programa/${propuesta.id}/resolver`, {
        method: "PATCH", body: JSON.stringify({ estado, respuesta, reemplazarPdf }),
      });
      onResuelta(resuelta);
    } catch (e) { setError(e.message); }
    finally { envio.current = false; setEnviando(false); }
  }

  return (
    <li className="programas-propuesta">
      <h3>{propuesta.materia.nombre} <span className="programas-meta">({propuesta.materia.codigo})</span></h3>
      <p className="programas-meta">
        {ESTADO[propuesta.estado]} · de {propuesta.docente.nombre} {propuesta.docente.apellido} ({propuesta.docente.email}) · {fechaHora(propuesta.creadoEn)}
        {" "}· parte de {propuesta.versionBase ? `la versión ${propuesta.versionBase}` : "ninguna versión (programa inicial)"}
      </p>
      <p className="programas-texto"><strong>Motivo:</strong> {propuesta.motivo}</p>
      {propuesta.desactualizada && (
        <p role="alert" className="programas-error">
          El programa cambió desde que se hizo la propuesta (ahora es {actual ? `la versión ${actual.version}` : "inexistente"}), así que no se puede aprobar. Rechazala, o aplicá los cambios a mano desde «Actualizar programa».
        </p>
      )}

      <div className="programas-comparacion">
        <section>
          <h4>Programa vigente</h4>
          {actual ? <>
            <p className="programas-texto">{actual.contenidos}</p>
            {actual.bibliografia && <><h5>Bibliografía</h5><p className="programas-texto">{actual.bibliografia}</p></>}
          </> : <p>La materia no tiene programa en texto.</p>}
        </section>
        <section>
          <h4>Propuesta</h4>
          <p className="programas-texto">{propuesta.contenidos}</p>
          {propuesta.bibliografia && <><h5>Bibliografía</h5><p className="programas-texto">{propuesta.bibliografia}</p></>}
        </section>
      </div>

      {pendiente ? (
        <fieldset disabled={enviando}>
          <legend>Resolver</legend>
          <label>Respuesta al docente (obligatoria si se rechaza)
            <textarea rows={3} maxLength={1000} value={respuesta} onChange={(e) => setRespuesta(e.target.value)} />
          </label>
          {propuesta.materia.tienePdf && (
            <label className="programas-check">
              <input type="checkbox" checked={reemplazarPdf} onChange={(e) => setReemplazarPdf(e.target.checked)} />
              <span>Confirmo que, al aprobar, el programa descargable pasa a ser el texto nuevo y se deja de usar el PDF cargado.</span>
            </label>
          )}
          <div className="programas-acciones">
            <button type="button" onClick={() => resolver("APROBADA")} disabled={propuesta.desactualizada || (propuesta.materia.tienePdf && !reemplazarPdf)}>
              {enviando ? "Guardando…" : "Aprobar y publicar"}
            </button>
            <button type="button" onClick={() => resolver("RECHAZADA")}>Rechazar</button>
          </div>
          {error && <p role="alert" className="programas-error">{error}</p>}
        </fieldset>
      ) : (
        <p className="programas-texto">
          {propuesta.resueltaEn && <>Resuelta el {fechaHora(propuesta.resueltaEn)}. </>}
          {propuesta.respuesta && <><strong>Respuesta:</strong> {propuesta.respuesta}</>}
        </p>
      )}
    </li>
  );
}

export default function PropuestasDocentes() {
  const [propuestas, setPropuestas] = useState(null);
  const [estado, setEstado] = useState("PENDIENTE");
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  function cargar() {
    setError(""); setPropuestas(null);
    api(`/propuestas-programa?estado=${estado}`).then(setPropuestas).catch((e) => setError(e.message));
  }
  useEffect(cargar, [estado]);

  function resuelta(r) {
    setAviso(r.estado === "APROBADA"
      ? `Propuesta aprobada: el programa de ${r.materia.nombre} se publicó. Se avisó al docente.`
      : `Propuesta rechazada. Se avisó al docente.`);
    cargar();
  }

  return (
    <section className="programas">
      <h2>Propuestas de docentes</h2>
      <p>Cambios al programa propuestos por los docentes. Al aprobar uno se publica como la nueva versión vigente; al rechazarlo, el docente recibe tu respuesta.</p>
      <label>Mostrar
        <select value={estado} onChange={(e) => { setAviso(""); setEstado(e.target.value); }}>
          <option value="PENDIENTE">Solo pendientes</option>
          <option value="TODAS">Todas</option>
        </select>
      </label>
      {aviso && <p role="status" className="programas-exito">{aviso}</p>}
      {error ? <div role="alert"><p className="programas-error">{error}</p><button type="button" onClick={cargar}>Reintentar</button></div>
        : propuestas === null ? <p role="status">Cargando propuestas…</p>
        : propuestas.length === 0 ? <p>{estado === "PENDIENTE" ? "No hay propuestas pendientes." : "Todavía no hay propuestas."}</p>
        : <ul className="programas-propuestas">
          {propuestas.map((p) => <Propuesta key={p.id} propuesta={p} onResuelta={resuelta} />)}
        </ul>}
    </section>
  );
}

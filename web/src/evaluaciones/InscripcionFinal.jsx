import { useEffect, useState } from "react";
import { api } from "../api.js";
import { formatFecha } from "../formatFecha.js";
import { ETIQUETA_ESTADO, COLOR_ESTADO } from "../materias/estadoMateria.js";
import { textoInscriptos } from "./inscriptos.js";

// Historia: como alumno quiero poder inscribirme a un final seleccionando una materia
// específica, sin importar si es libre o regular. La API ya calcula con qué modalidad le
// corresponde según su cursada; acá solo se muestra y se confirma.
export default function InscripcionFinal() {
  const [examenes, setExamenes] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [enviandoId, setEnviandoId] = useState(null);

  function cargar() {
    api("/finales").then(setExamenes).catch((e) => setError(e.message));
  }

  useEffect(cargar, []);

  async function inscribirse(examen) {
    setError(""); setAviso(""); setEnviandoId(examen.id);
    try {
      await api(`/finales/${examen.id}`, { method: "POST" });
      setAviso(`Te inscribiste al final de ${examen.materia.nombre}.`);
      cargar();
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviandoId(null);
    }
  }

  async function cancelar(examen) {
    if (!window.confirm(`¿Cancelar tu inscripción al final de ${examen.materia.nombre} del ${formatFecha(examen.fecha)}?`)) return;
    setError(""); setAviso(""); setEnviandoId(examen.id);
    try {
      await api(`/finales/${examen.id}`, { method: "DELETE" });
      setAviso(`Cancelaste tu inscripción al final de ${examen.materia.nombre}.`);
      cargar();
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviandoId(null);
    }
  }

  if (error && !examenes) {
    return <p className="form-error">No se pudieron cargar los finales: {error}</p>;
  }

  if (!examenes) {
    return <p className="loading">Cargando finales...</p>;
  }

  return (
    <div className="page">
      <h2>Inscripción a finales</h2>
      <p className="text-muted">Finales programados de las materias en las que estás regular o libre.</p>

      {error && <p className="form-error">{error}</p>}
      {aviso && <p role="status" className="text-muted">{aviso}</p>}

      {examenes.length === 0 ? (
        <p className="empty-state">No hay finales programados para tus materias en este momento.</p>
      ) : (
        <ul className="list-clean">
          {examenes.map((ex) => (
            <li key={ex.id} className="list-row">
              <div className="row-between">
                <span>
                  <strong>{ex.materia.nombre}</strong> <span className="text-muted">({ex.materia.codigo})</span>
                  <br />
                  {formatFecha(ex.fecha)}
                  {ex.hora ? ` · ${ex.hora}` : ""}
                  {ex.aula ? ` · ${ex.aula.nombre}` : ""}
                  <br />
                  <small className="text-muted">{textoInscriptos(ex.inscriptos)}</small>
                </span>
                <span className="badge" style={{ background: COLOR_ESTADO[ex.modalidadDisponible] }}>
                  {ETIQUETA_ESTADO[ex.modalidadDisponible]}
                </span>
              </div>
              {ex.inscripcion ? (
                <div className="row-between">
                  <span className="text-muted">Inscripto como {ETIQUETA_ESTADO[ex.inscripcion.modalidad]?.toLowerCase()}.</span>
                  <button className="btn-danger" disabled={enviandoId === ex.id} onClick={() => cancelar(ex)}>
                    {enviandoId === ex.id ? "Cancelando..." : "Cancelar inscripción"}
                  </button>
                </div>
              ) : (
                <button className="btn" disabled={enviandoId === ex.id} onClick={() => inscribirse(ex)}>
                  {enviandoId === ex.id ? "Inscribiendo..." : `Inscribirme como ${ETIQUETA_ESTADO[ex.modalidadDisponible]?.toLowerCase()}`}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


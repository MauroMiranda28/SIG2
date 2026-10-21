import { useEffect, useState } from "react";
import { api } from "../api.js";
import "./asignarDocentesHorario.css";

const NOMBRE_DIA = {
  LUNES: "Lunes",
  MARTES: "Martes",
  MIERCOLES: "Miércoles",
  JUEVES: "Jueves",
  VIERNES: "Viernes",
  SABADO: "Sábado",
};

const nombreDocente = (docente) => `${docente.apellido}, ${docente.nombre}`;

export default function AsignarDocentesHorario() {
  const [materias, setMaterias] = useState(null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(null);
  const [mensaje, setMensaje] = useState("");

  async function cargar() {
    setError("");
    try {
      setMaterias(await api("/horarios/asignaciones"));
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    cargar();
  }, []);

  async function asignar(bloqueId, docenteId) {
    setGuardando(bloqueId);
    setError("");
    setMensaje("");
    try {
      await api(`/horarios/asignaciones/bloques/${bloqueId}/docente`, {
        method: "PUT",
        body: JSON.stringify({ docenteId: docenteId === "" ? null : Number(docenteId) }),
      });
      setMensaje("Se guardó la asignación del bloque.");
      await cargar();
    } catch (e) {
      setError(e.message);
      await cargar();
    } finally {
      setGuardando(null);
    }
  }

  return (
    <section className="asignaciones-horario">
      <h2>Asignar docentes a clases</h2>
      <p>
        Asigná cada bloque horario a uno de los docentes de la materia. El docente verá únicamente
        las clases que tiene asignadas en su grilla semanal.
      </p>
      {error && <p className="actividad-mensaje error" role="alert">{error}</p>}
      {mensaje && <p className="actividad-mensaje exito" role="status">{mensaje}</p>}
      {materias === null ? <p role="status">Cargando materias y horarios...</p> : materias.length === 0 ? (
        <p>No hay materias cargadas.</p>
      ) : (
        materias.map((materia) => (
          <article className="asignaciones-horario-materia" key={materia.id}>
            <h3>{materia.nombre} <span>{materia.codigo}</span></h3>
            {!materia.docentes.length && <p>Esta materia no tiene docentes asignados.</p>}
            {!materia.comisiones.length ? <p>Esta materia todavía no tiene comisiones.</p> : (
              materia.comisiones.map((comision) => (
                <section className="asignaciones-horario-comision" key={comision.id}>
                  <h4>{comision.nombre}</h4>
                  {comision.bloques.length === 0 ? <p>Sin bloques horarios.</p> : (
                    <ul>
                      {comision.bloques.map((bloque) => (
                        <li key={bloque.id}>
                          <span>
                            <strong>{NOMBRE_DIA[bloque.dia]} {bloque.horaInicio}–{bloque.horaFin}</strong>
                            {bloque.aula && <small>{bloque.aula.nombre}</small>}
                          </span>
                          <label>
                            Docente a cargo
                            <select
                              value={bloque.docenteId ?? ""}
                              disabled={!materia.docentes.length || guardando === bloque.id}
                              onChange={(evento) => asignar(bloque.id, evento.target.value)}
                              aria-label={`Docente para ${materia.nombre}, ${comision.nombre}, ${NOMBRE_DIA[bloque.dia]} ${bloque.horaInicio}`}
                            >
                              <option value="">Sin asignar</option>
                              {materia.docentes.map(({ docente }) => (
                                <option key={docente.id} value={docente.id}>{nombreDocente(docente)}</option>
                              ))}
                            </select>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))
            )}
          </article>
        ))
      )}
    </section>
  );
}

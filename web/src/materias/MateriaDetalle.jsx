import { useEffect, useState } from "react";
import { api } from "../api.js";

const ETIQUETA_DIA = {
  LUNES: "Lunes",
  MARTES: "Martes",
  MIERCOLES: "Miércoles",
  JUEVES: "Jueves",
  VIERNES: "Viernes",
  SABADO: "Sábado",
};

// Solo quien ya está inscripto a la materia puede cambiar de comisión desde acá
// (para inscribirse está el botón «Inscribirme», que controla las correlatividades).
export default function MateriaDetalle({ materiaId, onCambioInscripcion, puedeCambiarComision = false }) {
  const [materia, setMateria] = useState(null);
  const [comisiones, setComisiones] = useState(null);
  const [error, setError] = useState(null);
  const [eligiendoId, setEligiendoId] = useState(null);
  const [errorEleccion, setErrorEleccion] = useState(null);

  function cargar() {
    setError(null);
    Promise.all([api(`/materias/${materiaId}`), api(`/materias/${materiaId}/comisiones`)])
      .then(([m, c]) => {
        setMateria(m);
        setComisiones(c);
      })
      .catch((e) => setError(e.message));
  }

  useEffect(cargar, [materiaId]);

  async function elegirComision(comisionId) {
    setErrorEleccion(null);
    setEligiendoId(comisionId);
    try {
      await api("/horarios/inscripcion", {
        method: "POST",
        body: JSON.stringify({ comisionId }),
      });
      cargar();
      onCambioInscripcion?.();
    } catch (e) {
      setErrorEleccion(e.message);
    } finally {
      setEligiendoId(null);
    }
  }

  if (error) {
    return <p className="form-error">No se pudo cargar la materia: {error}</p>;
  }
  if (!materia || !comisiones) {
    return <p className="loading">Cargando...</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div>
        <p style={{ margin: "0 0 0.25rem 0" }}>
          <strong>Año</strong> {materia.anio}
          {materia.cuatrimestre && <> · <strong>Cuatrimestre</strong> {materia.cuatrimestre}</>}
          {materia.cargaHoraria && <> · <strong>Carga horaria</strong> {materia.cargaHoraria}hs</>}
        </p>
        {materia.plan?.carrera && (
          <p style={{ margin: "0 0 0.25rem 0" }}>
            <strong>Carrera</strong> {materia.plan.carrera.nombre} ({materia.plan.nombre})
          </p>
        )}
        {materia.descripcion && <p style={{ margin: "0 0 0.25rem 0" }}>{materia.descripcion}</p>}
        {materia.docentes.length > 0 && (
          <p style={{ margin: 0 }}>
            <strong>Docentes</strong>{" "}
            {materia.docentes.map((d) => `${d.docente.nombre} ${d.docente.apellido}`).join(", ")}
          </p>
        )}
        {/* Condición: la define el docente en «Mis materias» */}
        {materia.notaRegularizacion != null && (
          <p style={{ margin: "0.25rem 0 0 0" }}>
            <strong>Condición</strong> Se regulariza con {materia.notaRegularizacion}
            {materia.esPromocional ? ` · se promociona con ${materia.notaPromocion}` : " · no es promocional"}
            {" "}· el final se aprueba con {materia.notaAprobacionFinal}
          </p>
        )}
      </div>

      <div>
        <h4 style={{ margin: "0 0 0.5rem 0" }}>Comisiones</h4>

        {comisiones.length === 0 && <p className="empty-state">Todavía no hay comisiones cargadas para esta materia.</p>}

        {errorEleccion && <p className="form-error">{errorEleccion}</p>}

        <ul className="list-clean" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {comisiones.map((comision) => (
            <li
              key={comision.id}
              className="row-between"
              style={{
                padding: "0.6rem 0.75rem",
                border: comision.elegidaPorMi ? "1px solid var(--color-success)" : "1px solid var(--color-border)",
                borderRadius: "var(--radius-sm)",
              }}
            >
              <div>
                <strong>{comision.nombre}</strong>
                <div className="text-muted" style={{ fontSize: "0.85rem" }}>
                  {comision.bloques.length === 0
                    ? "Sin horario cargado"
                    : comision.bloques
                        .map((b) => `${ETIQUETA_DIA[b.dia]} ${b.horaInicio}-${b.horaFin}${b.aula ? ` (${b.aula.nombre})` : ""}`)
                        .join(" · ")}
                </div>
              </div>

              {comision.elegidaPorMi ? (
                <span className="badge" style={{ background: "var(--color-success)" }}>Tu comisión</span>
              ) : puedeCambiarComision && (
                <button onClick={() => elegirComision(comision.id)} disabled={eligiendoId === comision.id}>
                  {eligiendoId === comision.id ? "Guardando..." : "Cambiar a esta"}
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
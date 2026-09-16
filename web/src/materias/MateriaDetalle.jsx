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

// Mat-03: características de la materia + Horarios U-01: elegir comisión
export default function MateriaDetalle({ materiaId, onCambioInscripcion }) {
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
    return <p style={{ color: "#b00020" }}>No se pudo cargar la materia: {error}</p>;
  }
  if (!materia || !comisiones) {
    return <p>Cargando...</p>;
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
      </div>

      <div>
        <h4 style={{ margin: "0 0 0.5rem 0" }}>Comisiones</h4>

        {comisiones.length === 0 && <p>Todavía no hay comisiones cargadas para esta materia.</p>}

        {errorEleccion && (
          <p style={{ color: "#b00020", margin: "0 0 0.5rem 0" }}>{errorEleccion}</p>
        )}

        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {comisiones.map((comision) => (
            <li
              key={comision.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.5rem",
                border: comision.elegidaPorMi ? "1px solid #2e7d32" : "1px solid #eee",
                borderRadius: "6px",
              }}
            >
              <div>
                <strong>{comision.nombre}</strong>
                <div style={{ fontSize: "0.85rem", color: "#555" }}>
                  {comision.bloques.length === 0
                    ? "Sin horario cargado"
                    : comision.bloques
                        .map((b) => `${ETIQUETA_DIA[b.dia]} ${b.horaInicio}-${b.horaFin}${b.aula ? ` (${b.aula.nombre})` : ""}`)
                        .join(" · ")}
                </div>
              </div>

              <button
                onClick={() => elegirComision(comision.id)}
                disabled={comision.elegidaPorMi || eligiendoId === comision.id}
                style={{ cursor: comision.elegidaPorMi ? "default" : "pointer" }}
              >
                {comision.elegidaPorMi ? "Elegida" : eligiendoId === comision.id ? "Guardando..." : "Elegir"}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

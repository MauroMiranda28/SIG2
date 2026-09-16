import { useEffect, useState } from "react";
import { api } from "../api.js";

// Horarios U-01: grilla semanal armada con las comisiones que el alumno
// eligió en MateriaDetalle. Las superposiciones ya se rechazan al elegir
// comisión, así que acá solo hay que ordenar y mostrar.

const DIAS = ["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO"];
const ETIQUETA_DIA = {
  LUNES: "Lunes",
  MARTES: "Martes",
  MIERCOLES: "Miércoles",
  JUEVES: "Jueves",
  VIERNES: "Viernes",
  SABADO: "Sábado",
};

export default function GrillaSemanal() {
  const [bloques, setBloques] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api("/horarios/mi-grilla")
      .then(setBloques)
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return <p style={{ color: "#b00020" }}>No se pudo cargar tu horario: {error}</p>;
  }
  if (!bloques) {
    return <p>Cargando tu horario...</p>;
  }
  if (bloques.length === 0) {
    return <p>Todavía no elegiste ninguna comisión. Entrá a una materia y elegí con qué comisión cursás.</p>;
  }

  const porDia = DIAS.map((dia) => ({
    dia,
    bloques: bloques
      .filter((b) => b.dia === dia)
      .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio)),
  })).filter((d) => d.bloques.length > 0);

  return (
    <div style={{ fontFamily: "system-ui", maxWidth: "40rem" }}>
      <h2>Mi horario semanal</h2>

      {porDia.map(({ dia, bloques }) => (
        <section key={dia} style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ borderBottom: "1px solid #ddd", paddingBottom: "0.25rem" }}>
            {ETIQUETA_DIA[dia]}
          </h3>

          <ul style={{ listStyle: "none", padding: 0 }}>
            {bloques.map((b, i) => (
              <li
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "0.5rem 0",
                  borderBottom: "1px solid #f0f0f0",
                }}
              >
                <span>
                  <strong>{b.horaInicio}-{b.horaFin}</strong> {b.materia} ({b.comision})
                </span>
                {b.aula && <span style={{ color: "#777" }}>{b.aula}</span>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

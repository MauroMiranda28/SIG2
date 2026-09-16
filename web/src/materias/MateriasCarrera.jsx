import { useEffect, useState } from "react";
import { api } from "../api.js";
import MateriaDetalle from "./MateriaDetalle.jsx";

// Mat-01 + HU-PRO + Mat-03 + Horarios U-01: el alumno ve las materias de su
// carrera con su estado de cursada, y puede abrir el programa (contenidos y
// bibliografía) o la información y comisiones de cualquiera.

const ETIQUETA_ESTADO = {
  PENDIENTE: "Pendiente",
  EN_CURSO: "En curso",
  APROBADA: "Aprobada",
};

export default function MateriasCarrera() {
  const [materias, setMaterias] = useState(null);
  const [error, setError] = useState(null);
  const [materiaAbiertaId, setMateriaAbiertaId] = useState(null);
  const [programa, setPrograma] = useState(null);
  const [errorPrograma, setErrorPrograma] = useState(null);
  const [cargandoPrograma, setCargandoPrograma] = useState(false);
  const [detalleAbiertoId, setDetalleAbiertoId] = useState(null);

  useEffect(() => {
    api("/materias")
      .then(setMaterias)
      .catch((e) => setError(e.message));
  }, []);

  async function verPrograma(materiaId) {
    // Si ya está abierta esta misma, la cierro (toggle).
    if (materiaAbiertaId === materiaId) {
      setMateriaAbiertaId(null);
      setPrograma(null);
      setErrorPrograma(null);
      return;
    }

    setMateriaAbiertaId(materiaId);
    setPrograma(null);
    setErrorPrograma(null);
    setCargandoPrograma(true);

    try {
      const data = await api(`/materias/${materiaId}/programa`);
      setPrograma(data);
    } catch (e) {
      setErrorPrograma(e.message);
    } finally {
      setCargandoPrograma(false);
    }
  }

  if (error) {
    return (
      <p style={{ color: "#b00020" }}>
        No se pudieron cargar las materias: {error}
      </p>
    );
  }

  if (!materias) {
    return <p>Cargando materias...</p>;
  }

  if (materias.length === 0) {
    return <p>No hay materias vigentes cargadas para tu carrera todavía.</p>;
  }

  const porAnio = agruparPorAnio(materias);

  return (
    <div style={{ fontFamily: "system-ui", maxWidth: "40rem" }}>
      <h2>Materias de mi carrera</h2>

      {Object.entries(porAnio).map(([anio, materiasDelAnio]) => (
        <section key={anio} style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ borderBottom: "1px solid #ddd", paddingBottom: "0.25rem" }}>
            {anio}° año
          </h3>

          <ul style={{ listStyle: "none", padding: 0 }}>
            {materiasDelAnio.map((materia) => (
              <li
                key={materia.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                  padding: "0.75rem 0",
                  borderBottom: "1px solid #f0f0f0",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <strong>{materia.nombre}</strong>{" "}
                    <span style={{ color: "#777" }}>({materia.codigo})</span>
                  </div>
                  <span
                    style={{
                      fontSize: "0.85rem",
                      padding: "0.15rem 0.5rem",
                      borderRadius: "999px",
                      background: colorEstado(materia.estado),
                      color: "#fff",
                    }}
                  >
                    {ETIQUETA_ESTADO[materia.estado] ?? materia.estado}
                  </span>
                </div>

                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    onClick={() => setDetalleAbiertoId(detalleAbiertoId === materia.id ? null : materia.id)}
                    style={{ alignSelf: "flex-start", cursor: "pointer" }}
                  >
                    {detalleAbiertoId === materia.id ? "Ocultar información" : "Ver información y horarios"}
                  </button>

                  <button
                    onClick={() => verPrograma(materia.id)}
                    style={{ alignSelf: "flex-start", cursor: "pointer" }}
                  >
                    {materiaAbiertaId === materia.id ? "Ocultar programa" : "Ver programa"}
                  </button>
                </div>

                {detalleAbiertoId === materia.id && (
                  <div style={{ background: "#fafafa", padding: "0.75rem", borderRadius: "6px" }}>
                    <MateriaDetalle materiaId={materia.id} />
                  </div>
                )}

                {materiaAbiertaId === materia.id && (
                  <div style={{ background: "#fafafa", padding: "0.75rem", borderRadius: "6px" }}>
                    {cargandoPrograma && <p>Cargando programa...</p>}

                    {errorPrograma && (
                      <p style={{ color: "#b00020", margin: 0 }}>{errorPrograma}</p>
                    )}

                    {programa && (
                      <>
                        <p style={{ margin: "0 0 0.5rem 0" }}>
                          <strong>Contenidos</strong>
                          <br />
                          {programa.programa.contenidos}
                        </p>
                        {programa.programa.bibliografia && (
                          <p style={{ margin: "0 0 0.5rem 0" }}>
                            <strong>Bibliografía</strong>
                            <br />
                            {programa.programa.bibliografia}
                          </p>
                        )}
                        <p style={{ margin: 0, fontSize: "0.8rem", color: "#777" }}>
                          Versión {programa.programa.version} · actualizado el{" "}
                          {new Date(programa.programa.actualizadoEn).toLocaleDateString()}
                        </p>
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function agruparPorAnio(materias) {
  return materias.reduce((grupos, materia) => {
    const clave = materia.anio;
    grupos[clave] = grupos[clave] ?? [];
    grupos[clave].push(materia);
    return grupos;
  }, {});
}

function colorEstado(estado) {
  if (estado === "APROBADA") return "#2e7d32";
  if (estado === "EN_CURSO") return "#f9a825";
  return "#9e9e9e";
}
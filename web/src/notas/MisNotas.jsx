import { useEffect, useState } from "react";
import { api, leerToken } from "../api.js";
import { formatFecha } from "../formatFecha.js";
import { estadoVisible, detalleEstado, ETIQUETA_ESTADO } from "../materias/estadoMateria.js";
import SolicitarRevision from "../revisiones/SolicitarRevision.jsx";

// Mat-09: el alumno ve el estado de sus materias y puede descargar un
// certificado en PDF con las que ya aprobó, para trámites externos.


export default function MisNotas() {
  const [materias, setMaterias] = useState(null);
  const [error, setError] = useState(null);
  const [descargando, setDescargando] = useState(false);
  const [errorDescarga, setErrorDescarga] = useState(null);

  useEffect(() => {
    api("/materias")
      .then(setMaterias)
      .catch((e) => setError(e.message));
  }, []);

  async function descargarCertificado() {
    setDescargando(true);
    setErrorDescarga(null);
    try {
      const res = await fetch("/api/certificados/notas", {
        headers: { Authorization: `Bearer ${leerToken()}` },
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({}));
        throw new Error(error || `Error ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = "certificado-notas.pdf";
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErrorDescarga(e.message);
    } finally {
      setDescargando(false);
    }
  }

  if (error) {
    // La revisión de nota no depende de la tabla de materias: se puede pedir igual.
    return (
      <div className="page">
        <h2>Mis notas</h2>
        <p className="form-error">No se pudieron cargar tus notas: {error}</p>
        <SolicitarRevision />
      </div>
    );
  }

  if (!materias) {
    return <p className="loading">Cargando notas...</p>;
  }

  return (
    <div className="page">
      <h2>Mis notas</h2>

      <button onClick={descargarCertificado} disabled={descargando} style={{ marginBottom: "1rem" }}>
        {descargando ? "Generando..." : "Descargar certificado de notas (PDF)"}
      </button>
      {errorDescarga && <p className="form-error">{errorDescarga}</p>}

      <table>
        <thead>
          <tr>
            <th>Código</th>
            <th>Materia</th>
            <th>Estado</th>
            <th>Nota</th>
          </tr>
        </thead>
        <tbody>
          {materias.map((materia) => (
            <tr key={materia.id}>
              <td>{materia.codigo}</td>
              <td>{materia.nombre}</td>
              <td>
                {ETIQUETA_ESTADO[estadoVisible(materia)]}
                {detalleEstado(materia) && <div className="text-muted" style={{ fontSize: "0.8rem" }}>{detalleEstado(materia)}</div>}
                {/* Cada intento de examen final queda registrado con su nota */}
                {materia.intentos?.length > 0 && (
                  <ol className="text-muted" style={{ fontSize: "0.8rem", margin: "0.25rem 0 0 0", paddingLeft: "1.2rem" }}>
                    {materia.intentos.map((intento) => (
                      <li key={intento.id}>Final del {formatFecha(intento.fecha)}: {intento.nota}</li>
                    ))}
                  </ol>
                )}
              </td>
              <td>{materia.nota ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <SolicitarRevision />
    </div>
  );
}

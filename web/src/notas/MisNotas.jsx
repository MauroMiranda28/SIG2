import { useEffect, useState } from "react";
import { api, leerToken } from "../api.js";

// Mat-09: el alumno ve el estado de sus materias y puede descargar un
// certificado en PDF con las que ya aprobó, para trámites externos.

const ETIQUETA_ESTADO = {
  PENDIENTE: "Pendiente",
  EN_CURSO: "En curso",
  APROBADA: "Aprobada",
};

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
    return (
      <p style={{ color: "#b00020" }}>No se pudieron cargar tus notas: {error}</p>
    );
  }

  if (!materias) {
    return <p>Cargando notas...</p>;
  }

  return (
    <div style={{ fontFamily: "system-ui", maxWidth: "40rem" }}>
      <h2>Mis notas</h2>

      <button onClick={descargarCertificado} disabled={descargando} style={{ cursor: "pointer", marginBottom: "1rem" }}>
        {descargando ? "Generando..." : "Descargar certificado de notas (PDF)"}
      </button>
      {errorDescarga && <p style={{ color: "#b00020" }}>{errorDescarga}</p>}

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
            <th style={{ padding: "0.4rem 0" }}>Código</th>
            <th>Materia</th>
            <th>Estado</th>
            <th>Nota</th>
          </tr>
        </thead>
        <tbody>
          {materias.map((materia) => (
            <tr key={materia.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
              <td style={{ padding: "0.4rem 0" }}>{materia.codigo}</td>
              <td>{materia.nombre}</td>
              <td>{ETIQUETA_ESTADO[materia.estado] ?? materia.estado}</td>
              <td>{materia.nota ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

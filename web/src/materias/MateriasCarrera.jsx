import { useEffect, useState } from "react";
import { api, descargarArchivo } from "../api.js";
import MateriaDetalle from "./MateriaDetalle.jsx";
import { estadoVisible, ETIQUETA_ESTADO, COLOR_ESTADO } from "./estadoMateria.js";

// Mat-01 + HU-PRO + Mat-03 + Horarios U-01: el alumno ve las materias de su
// carrera con su estado de cursada, puede descargar el programa en PDF y abrir
// la información y comisiones de cualquiera.
// Mat-08: puede buscar por nombre o código.

export default function MateriasCarrera() {
  const [materias, setMaterias] = useState(null);
  const [error, setError] = useState(null);
  const [detalleAbiertoId, setDetalleAbiertoId] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [descargandoId, setDescargandoId] = useState(null);
  const [errorDescarga, setErrorDescarga] = useState(null); // { materiaId, mensaje }

  useEffect(() => {
    buscarMaterias("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function buscarMaterias(texto) {
    const query = texto.trim() ? `?q=${encodeURIComponent(texto.trim())}` : "";
    api(`/materias${query}`)
      .then(setMaterias)
      .catch((e) => setError(e.message));
  }

  function handleBuscar(e) {
    e.preventDefault();
    buscarMaterias(busqueda);
  }

  // Descarga el programa en PDF (el subido por el docente, o uno armado con el programa en texto).
  async function descargarPrograma(materia) {
    setErrorDescarga(null);
    setDescargandoId(materia.id);
    try {
      await descargarArchivo(`/materias/${materia.id}/programa/pdf`, `programa-${materia.codigo}.pdf`);
    } catch (e) {
      setErrorDescarga({ materiaId: materia.id, mensaje: e.message });
    } finally {
      setDescargandoId(null);
    }
  }

  const formularioBusqueda = (
    <form onSubmit={handleBuscar} className="search-bar">
      <input
        type="text"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por nombre o código..."
      />
      <button type="submit">Buscar</button>
    </form>
  );

  if (error) {
    return <p className="form-error">No se pudieron cargar las materias: {error}</p>;
  }

  if (!materias) {
    return <p className="loading">Cargando materias...</p>;
  }

  const porAnio = agruparPorAnio(materias);

  return (
    <div className="page">
      <h2>Materias de mi carrera</h2>

      {formularioBusqueda}

      {materias.length === 0 && (
        <p className="empty-state">
          {busqueda.trim()
            ? `No se encontraron materias que coincidan con "${busqueda.trim()}".`
            : "No hay materias vigentes cargadas para tu carrera todavía."}
        </p>
      )}

      {Object.entries(porAnio).map(([anio, materiasDelAnio]) => (
        <section key={anio} className="section-block">
          <h3>{anio}° año</h3>

          <ul className="list-clean">
            {materiasDelAnio.map((materia) => (
              <li key={materia.id} className="list-row">
                <div className="row-between">
                  <div>
                    <strong>{materia.nombre}</strong> <span className="text-muted">({materia.codigo})</span>
                  </div>
                  <span className="badge" style={{ background: COLOR_ESTADO[estadoVisible(materia)] }}>
                    {ETIQUETA_ESTADO[estadoVisible(materia)]}
                  </span>
                </div>

                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button onClick={() => setDetalleAbiertoId(detalleAbiertoId === materia.id ? null : materia.id)}>
                    {detalleAbiertoId === materia.id ? "Ocultar información" : "Ver información y horarios"}
                  </button>

                  <button
                    onClick={() => descargarPrograma(materia)}
                    disabled={!materia.tienePrograma || descargandoId === materia.id}
                    title={materia.tienePrograma ? "Descargar el programa en PDF" : "Esta materia todavía no tiene un programa cargado"}
                  >
                    {descargandoId === materia.id ? "Descargando..." : "Descargar programa (PDF)"}
                  </button>
                </div>
                {!materia.tienePrograma && <small className="text-muted">Todavía no hay un programa cargado para descargar.</small>}
                {errorDescarga?.materiaId === materia.id && <p className="form-error">{errorDescarga.mensaje}</p>}

                {detalleAbiertoId === materia.id && (
                  <div className="panel-soft">
                    <MateriaDetalle materiaId={materia.id} />
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

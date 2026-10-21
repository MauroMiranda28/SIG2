import { useEffect, useState } from "react";
import { api, descargarArchivo } from "../api.js";
import "./docentes.css";

export default function ProgramaDocente() {
  const [materias, setMaterias] = useState(null);
  const [materiaId, setMateriaId] = useState("");
  const [programa, setPrograma] = useState(null);
  const [error, setError] = useState("");
  const [descargando, setDescargando] = useState(false);
  const [errorDescarga, setErrorDescarga] = useState("");

  useEffect(() => {
    let activo = true;
    api("/docentes/mis-materias")
      .then((datos) => {
        if (!activo) return;
        setMaterias(datos);
        if (datos.length) setMateriaId(String(datos[0].id));
      })
      .catch((e) => activo && setError(e.message));
    return () => { activo = false; };
  }, []);

  useEffect(() => {
    if (!materiaId) {
      setPrograma(null);
      return undefined;
    }
    let activo = true;
    setPrograma(null);
    setError("");
    api(`/docentes/materias/${materiaId}`)
      .then((datos) => activo && setPrograma(datos))
      .catch((e) => activo && setError(e.message));
    return () => { activo = false; };
  }, [materiaId]);

  async function descargar() {
    if (!programa || descargando) return;
    setDescargando(true);
    setErrorDescarga("");
    try {
      await descargarArchivo(`/materias/${programa.id}/programa/pdf`, `programa-${programa.codigo}.pdf`);
    } catch (e) {
      setErrorDescarga(e.message);
    } finally {
      setDescargando(false);
    }
  }

  return (
    <section className="docente">
      <h2>Programa de mis materias</h2>
      <p>Consultá los contenidos y la bibliografía de las materias que tenés asignadas.</p>

      {error && <p role="alert" className="docente-error">{error}</p>}
      {materias === null ? (
        !error && <p role="status">Cargando materias…</p>
      ) : materias.length === 0 ? (
        <p>Todavía no tenés materias asignadas. Pedile a administración que te asigne las que dictás.</p>
      ) : (
        <>
          <label className="docente-campo">
            Materia
            <select value={materiaId} onChange={(e) => setMateriaId(e.target.value)}>
              {materias.map((materia) => (
                <option key={materia.id} value={materia.id}>{materia.nombre} ({materia.codigo})</option>
              ))}
            </select>
          </label>

          {!error && !programa ? (
            <p role="status">Cargando programa…</p>
          ) : programa ? (
            <article className="docente-materia">
              <header>
                <h3>{programa.nombre}</h3>
                <p className="docente-meta">{programa.codigo} · {programa.plan.carrera.nombre} · {programa.plan.nombre}</p>
              </header>
              <section className="docente-bloque">
                <h4>Contenidos</h4>
                {programa.programa ? (
                  <>
                    <p className="docente-meta">Versión {programa.programa.version} · Actualizado el {new Date(programa.programa.actualizadoEn).toLocaleDateString("es-AR")}</p>
                    <p className="docente-texto">{programa.programa.contenidos}</p>
                  </>
                ) : (
                  <p>No hay un programa vigente en texto para esta materia.</p>
                )}
              </section>
              {programa.programa?.bibliografia && (
                <section className="docente-bloque">
                  <h4>Bibliografía</h4>
                  <p className="docente-texto">{programa.programa.bibliografia}</p>
                </section>
              )}
              <section className="docente-bloque">
                <h4>Descarga</h4>
                <p>{programa.tienePdf ? "Hay un programa en PDF disponible." : programa.programa ? "Podés descargar el programa vigente como PDF." : "No hay un programa disponible para descargar."}</p>
                {(programa.tienePdf || programa.programa) && (
                  <button type="button" className="docente-primario" onClick={descargar} disabled={descargando}>
                    {descargando ? "Descargando…" : "Descargar programa (PDF)"}
                  </button>
                )}
                {errorDescarga && <p role="alert" className="docente-error">{errorDescarga}</p>}
              </section>
            </article>
          ) : null}
        </>
      )}
    </section>
  );
}

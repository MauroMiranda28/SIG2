import { useEffect, useState } from "react";
import { api } from "../api.js";

const nombreCompleto = (d) => `${d.apellido}, ${d.nombre}`;

// El ADMIN decide qué docente dicta cada materia. Sin esta asignación un docente no puede cargar
// horarios, notas, avisos, fechas de examen ni tareas de la materia.
export default function AsignarDocentes() {
  const [materias, setMaterias] = useState(null);
  const [docentes, setDocentes] = useState(null);
  const [errorCarga, setErrorCarga] = useState("");
  const [materiaId, setMateriaId] = useState("");
  const [docenteId, setDocenteId] = useState("");
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  function cargar() {
    setErrorCarga("");
    return Promise.all([api("/asignaciones/materias"), api("/asignaciones/docentes")])
      .then(([listaMaterias, listaDocentes]) => {
        setMaterias(listaMaterias);
        setDocentes(listaDocentes);
        setMateriaId((actual) => actual || (listaMaterias[0] ? String(listaMaterias[0].id) : ""));
      })
      .catch((e) => setErrorCarga(e.message));
  }

  useEffect(() => { cargar(); }, []);

  const materia = materias?.find((m) => String(m.id) === materiaId);
  const asignados = new Set(materia?.docentes.map((d) => d.id));
  const disponibles = (docentes ?? []).filter((d) => !asignados.has(d.id));

  // Si el docente elegido ya no está disponible (se lo acaba de asignar), se elige otro.
  useEffect(() => {
    if (!disponibles.some((d) => String(d.id) === docenteId)) setDocenteId(disponibles[0] ? String(disponibles[0].id) : "");
  }, [materiaId, materias, docentes]);

  async function ejecutar(promesa, mensajeOk) {
    setTrabajando(true);
    setError("");
    setAviso("");
    try {
      await promesa;
      setAviso(mensajeOk);
      await cargar();
    } catch (e) {
      setError(e.message);
    } finally {
      setTrabajando(false);
    }
  }

  function asignar(e) {
    e.preventDefault();
    const docente = docentes.find((d) => String(d.id) === docenteId);
    ejecutar(
      api("/asignaciones", { method: "POST", body: JSON.stringify({ materiaId: Number(materiaId), docenteId: Number(docenteId) }) }),
      `${nombreCompleto(docente)} ahora dicta ${materia.nombre}.`
    );
  }

  function quitar(docente) {
    if (!window.confirm(`¿Quitar a ${nombreCompleto(docente)} de ${materia.nombre}? Va a dejar de poder modificarla.`)) return;
    ejecutar(api(`/asignaciones/materias/${materia.id}/docentes/${docente.id}`, { method: "DELETE" }), `${nombreCompleto(docente)} ya no dicta ${materia.nombre}.`);
  }

  return (
    <section style={{ fontFamily: "system-ui" }}>
      <h2>Asignar docentes</h2>
      <p>Elegí una materia y asignale los docentes que la dictan. Solo pueden modificar sus horarios, notas, avisos, exámenes y tareas los docentes asignados.</p>

      {errorCarga ? (
        <div role="alert"><p style={{ color: "#b00020" }}>{errorCarga}</p><button onClick={cargar}>Reintentar</button></div>
      ) : materias === null || docentes === null ? (
        <p role="status">Cargando…</p>
      ) : !materias.length ? (
        <p>Todavía no hay materias cargadas. Primero hay que crear un plan de estudios con sus materias.</p>
      ) : (
        <>
          <label>
            Materia
            <select value={materiaId} onChange={(e) => { setMateriaId(e.target.value); setAviso(""); setError(""); }} style={{ display: "block", width: "100%", maxWidth: "32rem", padding: "0.4rem" }}>
              {materias.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre} ({m.codigo}) · {m.plan.carrera.codigo} · {m.anio}.º año{m.docentes.length ? "" : " · sin docente"}
                </option>
              ))}
            </select>
          </label>

          <h3>Docentes de {materia.nombre}</h3>
          {materia.docentes.length === 0 ? (
            <p>Esta materia todavía no tiene docentes asignados.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.5rem", maxWidth: "32rem" }}>
              {materia.docentes.map((d) => (
                <li key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0.75rem", background: "#fafafa", borderRadius: "6px" }}>
                  <span>{nombreCompleto(d)} <small style={{ color: "#475569" }}>· {d.email}</small></span>
                  <button onClick={() => quitar(d)} disabled={trabajando} style={{ cursor: "pointer" }}>Quitar</button>
                </li>
              ))}
            </ul>
          )}

          <h3>Asignar un docente</h3>
          {docentes.length === 0 ? (
            <p>No hay docentes registrados. Los docentes se registran con su correo institucional (@ucse.edu.ar).</p>
          ) : disponibles.length === 0 ? (
            <p>Todos los docentes registrados ya dictan esta materia.</p>
          ) : (
            <form onSubmit={asignar} style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
              <label>
                Docente
                <select value={docenteId} onChange={(e) => setDocenteId(e.target.value)} style={{ display: "block", padding: "0.4rem" }}>
                  {disponibles.map((d) => (
                    <option key={d.id} value={d.id}>{nombreCompleto(d)} ({d.email})</option>
                  ))}
                </select>
              </label>
              <button type="submit" disabled={trabajando || !docenteId} style={{ cursor: "pointer" }}>{trabajando ? "Guardando..." : "Asignar"}</button>
            </form>
          )}

          {error && <p role="alert" style={{ color: "#b00020" }}>{error}</p>}
          {aviso && <p role="status" style={{ color: "#2e7d32" }}>{aviso}</p>}
        </>
      )}
    </section>
  );
}

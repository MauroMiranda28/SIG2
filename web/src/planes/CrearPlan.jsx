import { useEffect, useState } from "react";
import { api } from "../api.js";
import "./planes.css";

const nuevaMateria = () => ({ nombre: "", codigo: "", anio: "1", cuatrimestre: "0", cargaHoraria: "" });

export default function CrearPlan() {
  const [carreras, setCarreras] = useState(null);
  const [errorCarga, setErrorCarga] = useState("");
  const [error, setError] = useState("");
  const [creado, setCreado] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [anio, setAnio] = useState(String(new Date().getFullYear()));
  const [carreraId, setCarreraId] = useState("");
  const [vigente, setVigente] = useState(true);
  const [materias, setMaterias] = useState([]);

  function cargarCarreras() {
    setErrorCarga("");
    api("/planes/carreras").then(setCarreras).catch(e => setErrorCarga(e.message));
  }
  useEffect(cargarCarreras, []);

  function cambiarMateria(indice, campo, valor) {
    setMaterias(actual => actual.map((m, i) => i === indice ? { ...m, [campo]: valor } : m));
  }

  async function guardar(e) {
    e.preventDefault();
    if (guardando) return;
    setError(""); setCreado(null); setGuardando(true);
    try {
      const plan = await api("/planes", { method: "POST", body: JSON.stringify({
        nombre, anio: Number(anio), carreraId: Number(carreraId), vigente,
        materias: materias.map(m => ({ ...m, anio: Number(m.anio), cuatrimestre: Number(m.cuatrimestre), cargaHoraria: m.cargaHoraria ? Number(m.cargaHoraria) : null })),
      }) });
      setCreado(plan); setNombre(""); setMaterias([]);
    } catch (e) { setError(e.message); }
    finally { setGuardando(false); }
  }

  return <section className="planes">
    <h2>Planes de estudio</h2>
    <p>Definí el plan de una carrera y organizá sus materias por año de cursado.</p>
    {errorCarga ? <div role="alert"><p>{errorCarga}</p><button onClick={cargarCarreras}>Reintentar</button></div>
      : carreras === null ? <p role="status">Cargando carreras…</p>
      : !carreras.length ? <p>No hay carreras vigentes. Primero debe cargarse una desde el módulo de carreras.</p>
      : <form onSubmit={guardar}>
        <fieldset disabled={guardando} className="plan-formulario">
          <legend>Datos del plan</legend>
          <label>Carrera<select required value={carreraId} onChange={e => setCarreraId(e.target.value)}>
            <option value="">Seleccioná una carrera</option>
            {carreras.map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.codigo})</option>)}
          </select></label>
          <label>Nombre del plan<input required maxLength={120} value={nombre} placeholder="Ej. Plan 2026" onChange={e => setNombre(e.target.value)} /></label>
          <label>Año de la versión<input type="number" required min="1900" max="2100" value={anio} onChange={e => setAnio(e.target.value)} /></label>
          <label className="plan-check"><input type="checkbox" checked={vigente} onChange={e => setVigente(e.target.checked)} /> Plan vigente</label>
          <h3>Materias ({materias.length})</h3>
          <p>Si todavía no definiste las materias, podés guardar el plan vacío. Cada código debe ser único en el sistema.</p>
          {materias.map((m, i) => <fieldset className="plan-materia" key={i}>
            <legend>Materia {i + 1}</legend>
            <label>Nombre<input required maxLength={160} value={m.nombre} onChange={e => cambiarMateria(i, "nombre", e.target.value)} /></label>
            <label>Código<input required maxLength={40} value={m.codigo} onChange={e => cambiarMateria(i, "codigo", e.target.value)} /></label>
            <label>Año de cursado<input type="number" required min="1" max="20" value={m.anio} onChange={e => cambiarMateria(i, "anio", e.target.value)} /></label>
            <label>Duración de cursado<select required value={m.cuatrimestre} onChange={e => cambiarMateria(i, "cuatrimestre", e.target.value)}>
              <option value="0">Anual</option><option value="1">1.º cuatrimestre</option><option value="2">2.º cuatrimestre</option>
            </select></label>
            <label>Carga horaria (opcional)<input type="number" min="1" max="10000" value={m.cargaHoraria} onChange={e => cambiarMateria(i, "cargaHoraria", e.target.value)} /></label>
            <button type="button" aria-label={`Quitar materia ${i + 1}`} onClick={() => setMaterias(actual => actual.filter((_, j) => j !== i))}>Quitar materia</button>
          </fieldset>)}
          <button type="button" disabled={materias.length >= 200} onClick={() => setMaterias(actual => [...actual, nuevaMateria()])}>Agregar materia</button>
          <button className="plan-primario" type="submit">{guardando ? "Guardando…" : "Crear plan"}</button>
        </fieldset>
      </form>}
    {error && <p role="alert" className="plan-error">{error}</p>}
    {creado && <p role="status" className="plan-exito">Se creó «{creado.nombre}» para {creado.carrera.nombre}, con {creado.materias.length} materias. ID del plan: {creado.id}.</p>}
    <PlanesCargados creadoId={creado?.id} />
  </section>;
}

// Historial académico (HU: conservar planes anteriores): lista todos los planes, vigentes y no
// vigentes, y permite dar de baja/reactivar sin borrar nada (igual que en Carreras).
function PlanesCargados({ creadoId }) {
  const [planes, setPlanes] = useState(null);
  const [errorLista, setErrorLista] = useState("");
  const [error, setError] = useState("");
  const [cambiandoEstado, setCambiandoEstado] = useState(null);

  function cargar() {
    setErrorLista("");
    api("/planes").then(setPlanes).catch(e => setErrorLista(e.message));
  }
  useEffect(cargar, [creadoId]);

  async function cambiarEstado(plan) {
    if (cambiandoEstado !== null) return;
    const nuevoEstado = !plan.vigente;
    const mensaje = nuevoEstado
      ? `¿Reactivar «${plan.nombre}»?`
      : `¿Dar de baja «${plan.nombre}»? Figurará como no vigente. Se conservan sus materias y los alumnos que ya lo tienen asignado.`;
    if (!window.confirm(mensaje)) return;
    setCambiandoEstado(plan.id);
    setError("");
    try {
      const actualizado = await api(`/planes/${plan.id}/estado`, { method: "PUT", body: JSON.stringify({ vigente: nuevoEstado }) });
      setPlanes(lista => lista.map(p => p.id === actualizado.id ? actualizado : p));
    } catch (e) {
      setError(e.message || "No se pudo cambiar el estado. Intentá nuevamente.");
    } finally {
      setCambiandoEstado(null);
    }
  }

  return (
    <>
      <h3>Planes cargados</h3>
      <p>Los planes no vigentes permanecen en este listado para conservar el historial académico.</p>
      {errorLista ? (
        <div role="alert"><p>{errorLista}</p><button onClick={cargar}>Reintentar</button></div>
      ) : planes === null ? (
        <p role="status">Cargando planes…</p>
      ) : !planes.length ? (
        <p>Todavía no hay planes. Registrá el primero con el formulario de arriba.</p>
      ) : (
        <div className="plan-tabla">
          <table>
            <thead>
              <tr><th scope="col">Plan</th><th scope="col">Carrera</th><th scope="col">Año</th><th scope="col">Estado</th><th scope="col">Materias</th><th scope="col"><span className="solo-lector">Acciones</span></th></tr>
            </thead>
            <tbody>
              {planes.map(p => (
                <tr key={p.id}>
                  <td>{p.nombre}</td>
                  <td>{p.carrera.nombre} ({p.carrera.codigo})</td>
                  <td>{p.anio}</td>
                  <td>{p.vigente ? "Vigente" : "No vigente"}</td>
                  <td>{p._count?.materias ?? 0}</td>
                  <td>
                    <button type="button" onClick={() => cambiarEstado(p)} disabled={cambiandoEstado !== null}
                      aria-label={`${p.vigente ? "Dar de baja" : "Reactivar"} ${p.nombre}`}>
                      {cambiandoEstado === p.id ? "Guardando…" : p.vigente ? "Dar de baja" : "Reactivar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {error && <p role="alert" className="plan-error">{error}</p>}
    </>
  );
}

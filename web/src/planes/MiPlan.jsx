import { useEffect, useState } from "react";
import { api } from "../api.js";
import "./planes.css";

export default function MiPlan() {
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  function cargar() {
    setCargando(true); setError("");
    api("/planes/mi-plan").then(setPlan).catch(e => setError(e.message)).finally(() => setCargando(false));
  }
  useEffect(cargar, []);
  if (cargando) return <p role="status">Cargando tu plan de estudios…</p>;
  if (error) return <section><h2>Mi plan de estudios</h2><p role="alert">{error}</p><button onClick={cargar}>Volver a consultar</button></section>;
  const grupos = plan.materias.reduce((acc, m) => { (acc[m.anio] ??= []).push(m); return acc; }, {});
  return <section className="planes">
    <h2>Mi plan de estudios</h2>
    <p><strong>{plan.carrera.nombre}</strong></p>
    <p>{plan.nombre} · Versión {plan.anio} · {plan.materias.length} materias</p>
    <p>Todas las materias que componen tu plan de estudios.</p>
    {!plan.materias.length && <p>Tu plan todavía no tiene materias cargadas.</p>}
    {Object.entries(grupos).map(([anio, materias]) => <section key={anio}>
      <h3>{anio}.º año</h3>
      <div className="plan-tabla"><table>
        <caption>Materias de {anio}.º año</caption>
        <thead><tr><th scope="col">Código</th><th scope="col">Materia</th><th scope="col">Cuatrimestre</th><th scope="col">Carga horaria</th></tr></thead>
        <tbody>{materias.map(m => <tr key={m.id}><td>{m.codigo}</td><td>{m.nombre}</td><td>{m.cuatrimestre ? `${m.cuatrimestre}.º` : "Sin especificar"}</td><td>{m.cargaHoraria == null ? "Sin especificar" : `${m.cargaHoraria} h`}</td></tr>)}</tbody>
      </table></div>
    </section>)}
  </section>;
}

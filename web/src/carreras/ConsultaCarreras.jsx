import { useEffect, useState } from "react";
import { api } from "../api.js";

// Historias: como docente quiero consultar las carreras de la universidad, para conocer la
// estructura académica, y consultar la información de una carrera, para conocer su estructura.
// Es de solo lectura: de la lista se entra al detalle de cada carrera (planes y materias).

const normalizar = (texto) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

export default function ConsultaCarreras() {
  const [carreras, setCarreras] = useState(null);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [abiertaId, setAbiertaId] = useState(null);

  useEffect(() => {
    api("/carreras/consulta").then(setCarreras).catch((e) => setError(e.message));
  }, []);

  if (abiertaId) return <DetalleCarrera carreraId={abiertaId} onVolver={() => setAbiertaId(null)} />;
  if (error) return <p className="form-error">No se pudieron cargar las carreras: {error}</p>;
  if (!carreras) return <p className="loading">Cargando carreras...</p>;

  const q = normalizar(busqueda.trim());
  const visibles = carreras.filter((c) => !q || normalizar(`${c.nombre} ${c.codigo}`).includes(q));

  return (
    <div className="page">
      <h2>Carreras de la universidad</h2>
      <p className="text-muted">La estructura académica: cada carrera con sus planes de estudio y materias.</p>

      <div className="search-bar">
        <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o código..." aria-label="Buscar carreras" />
      </div>

      {!carreras.length ? <p className="empty-state">Todavía no hay carreras cargadas.</p>
        : !visibles.length ? <p className="empty-state">No hay carreras que coincidan con "{busqueda.trim()}".</p>
          : (
            <ul className="list-clean">
              {visibles.map((c) => (
                <li key={c.id} className="list-row">
                  <div className="row-between">
                    <span>
                      <strong>{c.nombre}</strong> <span className="text-muted">({c.codigo})</span>
                    </span>
                    <span style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                      {c.dictoMaterias > 0 && (
                        <span className="badge" style={{ background: "var(--color-primary)" }}>
                          Dictás {plural(c.dictoMaterias, "materia", "materias")}
                        </span>
                      )}
                      {!c.vigente && <span className="badge" style={{ background: "#9e9e9e" }}>No vigente</span>}
                    </span>
                  </div>
                  {c.descripcion && <p className="text-muted" style={{ margin: "0.25rem 0" }}>{c.descripcion}</p>}
                  <div className="row-between">
                    <small className="text-muted">
                      {plural(c.planes, "plan de estudios", "planes de estudio")}
                      {c.planes > 0 && ` (${plural(c.planesVigentes, "vigente", "vigentes")})`} · {plural(c.materias, "materia", "materias")}
                    </small>
                    <button className="btn" onClick={() => setAbiertaId(c.id)}>Ver información</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
    </div>
  );
}

function DetalleCarrera({ carreraId, onVolver }) {
  const [carrera, setCarrera] = useState(null);
  const [error, setError] = useState("");
  const [planId, setPlanId] = useState(null);

  useEffect(() => {
    api(`/carreras/consulta/${carreraId}`)
      .then((datos) => { setCarrera(datos); setPlanId(datos.planes[0]?.id ?? null); })
      .catch((e) => setError(e.message));
  }, [carreraId]);

  const volver = <button className="btn-secondary" onClick={onVolver}>← Volver a las carreras</button>;
  if (error) return <div className="page">{volver}<p className="form-error">No se pudo cargar la carrera: {error}</p></div>;
  if (!carrera) return <p className="loading">Cargando carrera...</p>;

  const plan = carrera.planes.find((p) => p.id === planId);
  const porAnio = (plan?.materias ?? []).reduce((grupos, m) => ({ ...grupos, [m.anio]: [...(grupos[m.anio] ?? []), m] }), {});

  return (
    <div className="page">
      {volver}
      <h2 style={{ marginTop: "0.75rem" }}>
        {carrera.nombre} <span className="text-muted" style={{ fontWeight: "normal" }}>({carrera.codigo})</span>
      </h2>
      {!carrera.vigente && <p className="text-muted">Esta carrera figura como no vigente.</p>}
      <p>{carrera.descripcion?.trim() || <span className="text-muted">Todavía no se cargó una descripción para esta carrera.</span>}</p>

      {!carrera.planes.length ? (
        <p className="empty-state">Esta carrera todavía no tiene planes de estudio cargados.</p>
      ) : (
        <>
          <div className="field" style={{ maxWidth: "24rem" }}>
            <label htmlFor="plan-carrera">Plan de estudios</label>
            <select id="plan-carrera" value={planId ?? ""} onChange={(e) => setPlanId(Number(e.target.value))}>
              {carrera.planes.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre} ({p.anio}){p.vigente ? "" : " · no vigente"}</option>
              ))}
            </select>
          </div>

          {plan && (
            <>
              <p className="text-muted">
                {plural(plan.totales.materias, "materia", "materias")} en {plural(plan.totales.anios, "año", "años")}
                {plan.totales.cargaHoraria > 0 && ` · ${plan.totales.cargaHoraria} h de carga horaria total`}
              </p>
              {!plan.materias.length && <p className="empty-state">Este plan todavía no tiene materias cargadas.</p>}
              {Object.entries(porAnio).map(([anio, materias]) => (
                <section key={anio} className="section-block">
                  <h3>{anio}° año</h3>
                  <ul className="list-clean">
                    {materias.map((m) => <FilaMateria key={m.id} materia={m} />)}
                  </ul>
                </section>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}

function FilaMateria({ materia }) {
  return (
    <li className="list-row">
      <div className="row-between">
        <span>
          <strong>{materia.nombre}</strong> <span className="text-muted">({materia.codigo})</span>
        </span>
        {materia.laDicto && <span className="badge" style={{ background: "var(--color-primary)" }}>La dictás</span>}
      </div>
      <small className="text-muted">
        {materia.cuatrimestre ? `${materia.cuatrimestre}° cuatrimestre` : "Anual o sin cuatrimestre"}
        {materia.cargaHoraria ? ` · ${materia.cargaHoraria} h` : ""}
        {materia.docentes.length > 0 && ` · ${materia.docentes.map((d) => `${d.nombre} ${d.apellido}`).join(", ")}`}
      </small>
      {materia.correlativas.length > 0 && (
        <small style={{ display: "block", marginTop: "0.2rem" }}>
          Correlativas:{" "}
          {materia.correlativas.map((c, i) => (
            <span key={c.materia.id}>
              {i > 0 && ", "}
              {c.materia.nombre} <span className="text-muted">({c.tipo === "FUERTE" ? "aprobada" : "regular"})</span>
            </span>
          ))}
        </small>
      )}
    </li>
  );
}

import { useEffect, useState } from "react";
import { api } from "../api.js";
import "./correlatividades.css";

// ADMIN: carga las correlatividades de cada plan. Para cada materia elige qué otra
// materia del mismo plan necesita y si es débil (regular) o fuerte (aprobada).
// La API rechaza las que arman un ciclo (A necesita B y B necesita A).

export default function CargarCorrelatividades() {
  const [planes, setPlanes] = useState(null);
  const [planId, setPlanId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api("/correlatividades/planes")
      .then((lista) => {
        setPlanes(lista);
        if (lista.length === 1) setPlanId(String(lista[0].id));
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="correl-error" role="alert">{error}</p>;
  if (!planes) return <p role="status">Cargando planes…</p>;

  return (
    <section className="correl">
      <h2>Correlatividades</h2>
      {!planes.length ? <p>Todavía no hay planes de estudio. Crealo en «Crear plan».</p> : (
        <>
          <label className="correl-campo">Plan de estudios
            <select value={planId} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">Elegí un plan</option>
              {planes.map((p) => (
                <option key={p.id} value={p.id}>{p.carrera.nombre} · {p.nombre}{p.vigente ? "" : " (no vigente)"}</option>
              ))}
            </select>
          </label>
          {planId && <MateriasDelPlan key={planId} planId={planId} />}
        </>
      )}
    </section>
  );
}

function MateriasDelPlan({ planId }) {
  const [materias, setMaterias] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState(null); // { materiaId, tipo: "exito" | "error", texto }
  const [ocupado, setOcupado] = useState(false);

  function cargar() {
    return api(`/correlatividades/plan/${planId}`).then(setMaterias).catch((e) => setError(e.message));
  }

  useEffect(() => { cargar(); }, [planId]);

  async function ejecutar(materiaId, accion, textoExito) {
    setAviso(null);
    setOcupado(true);
    try {
      await accion();
      await cargar();
      setAviso({ materiaId, tipo: "exito", texto: textoExito });
    } catch (e) {
      setAviso({ materiaId, tipo: "error", texto: e.message });
    } finally {
      setOcupado(false);
    }
  }

  if (error) return <p className="correl-error" role="alert">{error}</p>;
  if (!materias) return <p role="status">Cargando materias…</p>;
  if (materias.length < 2) return <p>El plan necesita al menos dos materias para tener correlatividades.</p>;

  return materias.map((m) => (
    <article className="correl-materia" key={m.id} aria-labelledby={`correl-${m.id}`}>
      <header>
        <strong id={`correl-${m.id}`}>{m.nombre}</strong> <span className="correl-codigo">({m.codigo}) · {m.anio}° año</span>
      </header>

      {!m.requiere.length ? <p className="correl-detalle">Sin correlativas.</p> : (
        <ul>
          {m.requiere.map((c) => (
            <li key={c.id} className="correl-fila">
              <span>{c.requiere.nombre} <span className="correl-codigo">({c.requiere.codigo})</span></span>
              <select value={c.tipo} disabled={ocupado} aria-label={`Tipo de correlatividad con ${c.requiere.nombre}`}
                onChange={(e) => ejecutar(m.id, () => api(`/correlatividades/${c.id}`, { method: "PATCH", body: JSON.stringify({ tipo: e.target.value }) }), "Se cambió el tipo.")}>
                <option value="FUERTE">Fuerte (aprobada)</option>
                <option value="DEBIL">Débil (regular)</option>
              </select>
              <button type="button" disabled={ocupado} aria-label={`Quitar ${c.requiere.nombre} de ${m.nombre}`}
                onClick={() => ejecutar(m.id, () => api(`/correlatividades/${c.id}`, { method: "DELETE" }), "Se quitó la correlativa.")}>
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}

      <FormAgregar materia={m} materias={materias} deshabilitado={ocupado}
        onAgregar={(datos) => ejecutar(m.id, () => api("/correlatividades", { method: "POST", body: JSON.stringify(datos) }), "Se agregó la correlativa.")} />

      {aviso?.materiaId === m.id && (
        <p role={aviso.tipo === "error" ? "alert" : "status"} className={`correl-aviso-${aviso.tipo}`}>{aviso.texto}</p>
      )}
    </article>
  ));
}

function FormAgregar({ materia, materias, deshabilitado, onAgregar }) {
  const yaRequeridas = new Set(materia.requiere.map((c) => c.requiere.id));
  const opciones = materias.filter((o) => o.id !== materia.id && !yaRequeridas.has(o.id));
  const [requiereId, setRequiereId] = useState("");
  const [tipo, setTipo] = useState("FUERTE");

  if (!opciones.length) return null;

  function enviar(e) {
    e.preventDefault();
    if (!requiereId) return;
    onAgregar({ materiaId: materia.id, requiereId: Number(requiereId), tipo });
    setRequiereId("");
  }

  return (
    <form className="correl-form" onSubmit={enviar} aria-label={`Agregar correlativa a ${materia.nombre}`}>
      <label>Necesita
        <select value={requiereId} onChange={(e) => setRequiereId(e.target.value)} required>
          <option value="">Elegí una materia</option>
          {opciones.map((o) => <option key={o.id} value={o.id}>{o.nombre} ({o.codigo}) · {o.anio}° año</option>)}
        </select>
      </label>
      <label>Tipo
        <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="FUERTE">Fuerte (aprobada)</option>
          <option value="DEBIL">Débil (regular)</option>
        </select>
      </label>
      <button type="submit" disabled={deshabilitado || !requiereId}>Agregar</button>
    </form>
  );
}

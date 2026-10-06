import { useEffect, useState } from "react";
import { api } from "../api.js";
import "./correlatividades.css";

// Historia: como alumno quiero consultar las correlatividades, para saber qué
// materias necesito aprobar previamente. Débil: alcanza con tenerla regular.
// Fuerte: hay que tenerla aprobada. Una materia puede tener de los dos tipos.

const TIPO = {
  FUERTE: { nombre: "Fuerte", necesita: "aprobada" },
  DEBIL: { nombre: "Débil", necesita: "regular o aprobada" },
};
const SITUACION = { APROBADA: "La tenés aprobada", REGULAR: "La tenés regular", FALTA: "Todavía no la tenés" };

export default function Correlatividades() {
  const [materias, setMaterias] = useState(null);
  const [error, setError] = useState(null);
  const [soloConCorrelativas, setSoloConCorrelativas] = useState(true);

  useEffect(() => {
    api("/correlatividades").then(setMaterias).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="correl-error">No se pudieron cargar las correlatividades: {error}</p>;
  if (!materias) return <p>Cargando correlatividades...</p>;

  const visibles = soloConCorrelativas ? materias.filter((m) => m.requisitos.length) : materias;
  const porAnio = agrupar(visibles);

  return (
    <section className="correl">
      <h2>Correlatividades</h2>
      <p className="correl-ayuda">
        Para cursar una materia tenés que cumplir sus correlativas: las <strong>fuertes</strong> hay que tenerlas
        aprobadas y las <strong>débiles</strong> alcanza con tenerlas regulares.
      </p>
      <label className="correl-filtro">
        <input type="checkbox" checked={soloConCorrelativas} onChange={(e) => setSoloConCorrelativas(e.target.checked)} />
        Mostrar solo las materias que tienen correlativas
      </label>

      {!visibles.length && <p>{soloConCorrelativas ? "Ninguna materia de tu plan tiene correlativas cargadas." : "Tu plan no tiene materias."}</p>}

      {Object.entries(porAnio).map(([anio, lista]) => (
        <div key={anio}>
          <h3 className="correl-anio">{anio}° año</h3>
          {lista.map((m) => <TarjetaMateria key={m.id} materia={m} />)}
        </div>
      ))}
    </section>
  );
}

function TarjetaMateria({ materia }) {
  const aprobada = materia.estado === "APROBADA";
  const [etiqueta, clase] = aprobada ? ["Ya la aprobaste", "aprobada"]
    : !materia.requisitos.length ? ["Sin correlativas", "neutra"]
      : materia.puedeCursar ? ["Podés cursarla", "puede"] : ["Te faltan correlativas", "falta"];

  return (
    <article className="correl-materia">
      <header>
        <strong>{materia.nombre}</strong> <span className="correl-codigo">({materia.codigo})</span>
        <span className={`correl-estado correl-${clase}`}>{etiqueta}</span>
      </header>
      {materia.requisitos.length > 0 && (
        <ul>
          {materia.requisitos.map((r) => (
            <li key={r.materia.id} className={r.cumple ? "correl-cumple" : "correl-no-cumple"}>
              <span aria-hidden="true">{r.cumple ? "✔" : "✖"}</span>{" "}
              <span className={`correl-tipo correl-tipo-${r.tipo.toLowerCase()}`}>{TIPO[r.tipo].nombre}</span>{" "}
              {r.materia.nombre} <span className="correl-codigo">({r.materia.codigo})</span>
              <div className="correl-detalle">Necesitás tenerla {TIPO[r.tipo].necesita}. {SITUACION[r.situacion]}.</div>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function agrupar(materias) {
  return materias.reduce((grupos, m) => ({ ...grupos, [m.anio]: [...(grupos[m.anio] ?? []), m] }), {});
}

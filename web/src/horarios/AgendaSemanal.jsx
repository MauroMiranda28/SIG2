import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import "../actividades/actividades.css";

const CATEGORIAS = [
  ["TRABAJO", "Trabajo"],
  ["ESTUDIO", "Estudio"],
  ["SALUD", "Salud"],
  ["HOGAR", "Hogar"],
  ["OCIO", "Ocio"],
  ["OTRA", "Otra"],
];
const nombreCategoria = (categoria) => CATEGORIAS.find(([valor]) => valor === categoria)?.[1] ?? "Otra";
const hoyLocal = () => {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
};
const fechaLocal = (fecha) => new Date(fecha).toISOString().slice(0, 10);
const fechaDeDia = (fecha, desplazamiento) => {
  const resultado = new Date(`${fecha}T00:00:00.000Z`);
  resultado.setUTCDate(resultado.getUTCDate() + desplazamiento);
  return fechaLocal(resultado);
};

function fechaCorta(fecha) {
  return new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(fecha));
}

function resumir(eventos) {
  const personales = eventos.filter((evento) => evento.tipoEvento === "ACTIVIDAD");
  const porCategoria = new Map();
  const porEtiqueta = new Map();
  for (const actividad of personales) {
    porCategoria.set(actividad.categoria, (porCategoria.get(actividad.categoria) ?? 0) + actividad.duracion);
    for (const etiqueta of actividad.etiquetas) {
      porEtiqueta.set(etiqueta, (porEtiqueta.get(etiqueta) ?? 0) + actividad.duracion);
    }
  }
  const ordenar = (mapa) => [...mapa].sort(([a], [b]) => a.localeCompare(b, "es"));
  return {
    total: personales.reduce((suma, actividad) => suma + actividad.duracion, 0),
    porCategoria: ordenar(porCategoria).map(([categoria, minutos]) => [nombreCategoria(categoria), minutos]),
    porEtiqueta: ordenar(porEtiqueta),
  };
}

// Horarios U-01 + ACT-02: la agenda semanal reemplaza la grilla de solo clases,
// porque ya reúne las comisiones elegidas junto con las actividades personales.
export default function AgendaSemanal() {
  const [fechaReferencia, setFechaReferencia] = useState(hoyLocal());
  const [agenda, setAgenda] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api(`/actividades-personales/agenda?fecha=${fechaReferencia}`)
      .then((datos) => { setAgenda(datos); setError(null); })
      .catch((e) => setError(e.message));
  }, [fechaReferencia]);

  const resumen = useMemo(() => resumir(agenda?.eventos ?? []), [agenda]);
  const lunesSemana = agenda?.desde ? fechaLocal(agenda.desde) : fechaReferencia;

  return (
    <section className="actividades">
      <h2>Mi horario</h2>
      <p>Clases y actividades personales, en una lista ordenada por día y hora.</p>

      {error && <p className="actividad-mensaje error" role="alert">No se pudo cargar tu agenda: {error}</p>}

      <section className="actividad-semana">
        <div className="actividad-navegacion-semana">
          <button type="button" onClick={() => setFechaReferencia(fechaDeDia(lunesSemana, -7))}>Semana anterior</button>
          <label>
            Semana de
            <input
              type="date"
              value={fechaReferencia}
              onChange={(evento) => setFechaReferencia(evento.target.value)}
              aria-label="Elegir una fecha de la semana"
            />
          </label>
          <button type="button" onClick={() => setFechaReferencia(fechaDeDia(lunesSemana, 7))}>Semana siguiente</button>
        </div>
        {agenda ? (
          <>
            <p className="actividad-rango-semana">{fechaCorta(agenda.desde)} – {fechaCorta(agenda.hasta)}</p>
            <p>Tiempo personal planificado: <strong>{Math.floor(resumen.total / 60)} h {resumen.total % 60} min</strong></p>
            {resumen.porCategoria.length > 0 && (
              <div className="actividad-resumen">
                <div>
                  <h4>Por categoría</h4>
                  <ul>{resumen.porCategoria.map(([categoria, minutos]) => <li key={categoria}>{categoria}: {Math.floor(minutos / 60)} h {minutos % 60} min</li>)}</ul>
                </div>
                {resumen.porEtiqueta.length > 0 && (
                  <div>
                    <h4>Por etiqueta</h4>
                    <ul>{resumen.porEtiqueta.map(([etiqueta, minutos]) => <li key={etiqueta}>{etiqueta}: {Math.floor(minutos / 60)} h {minutos % 60} min</li>)}</ul>
                    <small>Una actividad con varias etiquetas cuenta en cada una; estos subtotales pueden superponerse.</small>
                  </div>
                )}
              </div>
            )}
            {agenda.dias.map(({ dia, nombre, fecha, eventos }) => (
              <section className="actividad-dia" key={dia}>
                <h4>{nombre} <span>{fechaCorta(fecha)}</span></h4>
                {eventos.length === 0 ? <p>Sin clases ni actividades planificadas.</p> : (
                  <ul className="actividad-lista">
                    {eventos.map((evento, indice) => (
                      <li className={`actividad-tarjeta ${evento.tipoEvento === "CLASE" ? "clase" : ""}`} key={`${evento.tipoEvento}-${evento.id ?? evento.titulo}-${indice}`}>
                        <div>
                          <span className="actividad-tipo-evento">{evento.tipoEvento === "CLASE" ? "Clase" : "Actividad personal"}</span>
                          <h5>{evento.titulo}</h5>
                          <p><strong>{evento.horaInicio}–{evento.horaFin}</strong>{evento.categoria ? ` · ${nombreCategoria(evento.categoria)}` : ""}</p>
                          {evento.etiquetas?.length > 0 && <p className="actividad-etiquetas-texto">{evento.etiquetas.join(" · ")}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </>
        ) : !error && <p>Cargando tu horario...</p>}
      </section>
    </section>
  );
}

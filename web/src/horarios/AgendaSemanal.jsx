import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import ActividadesPersonales from "../actividades/ActividadesPersonales.jsx";
import "../actividades/actividades.css";

const CATEGORIAS = [
  ["TRABAJO", "Trabajo"],
  ["ESTUDIO", "Estudio"],
  ["SALUD", "Salud"],
  ["HOGAR", "Hogar"],
  ["OCIO", "Ocio"],
  ["OTRA", "Otra"],
];
const CATEGORIAS_DOCENTE = [
  ["TRABAJO", "Gestión personal"],
  ["ESTUDIO", "Planificación académica"],
  ["CORRECCION_EXAMENES", "Corrección de exámenes"],
  ["PREPARACION_CLASE", "Preparación de clase"],
  ["PREPARACION_EXAMEN", "Preparación de exámenes"],
  ["OTRA_ACADEMICA", "Otra actividad académica"],
];
const nombreCategoria = (categoria, esDocente = false) => {
  if (esDocente) {
    return CATEGORIAS_DOCENTE.find(([valor]) => valor === categoria)?.[1] ?? "Otra actividad académica";
  }
  return CATEGORIAS.find(([valor]) => valor === categoria)?.[1] ?? "Otra";
};
const nombreTipoExamen = (tipo) => ({
  PARCIAL: "Parcial",
  RECUPERATORIO: "Recuperatorio",
  FINAL: "Examen final",
}[tipo] ?? "Examen");
const HORA_INICIO_BASE = 7;
const HORA_FIN_BASE = 23;
const PIXELES_POR_HORA = 64;
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
const inicioDeSemana = (fecha) => {
  const inicio = new Date(`${fecha}T00:00:00.000Z`);
  inicio.setUTCDate(inicio.getUTCDate() - ((inicio.getUTCDay() + 6) % 7));
  return fechaLocal(inicio);
};
const moverMes = (fecha, desplazamiento) => {
  const actual = new Date(`${fecha}T00:00:00.000Z`);
  const destino = new Date(Date.UTC(actual.getUTCFullYear(), actual.getUTCMonth() + desplazamiento, 1));
  const ultimoDia = new Date(Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0)).getUTCDate();
  destino.setUTCDate(Math.min(actual.getUTCDate(), ultimoDia));
  return fechaLocal(destino);
};

function diasDelMes(fecha) {
  const [anio, mes] = fecha.slice(0, 7).split("-").map(Number);
  const primero = new Date(Date.UTC(anio, mes - 1, 1));
  const inicio = new Date(primero);
  inicio.setUTCDate(inicio.getUTCDate() - ((inicio.getUTCDay() + 6) % 7));
  const cantidad = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const celdas = Math.ceil((((primero.getUTCDay() + 6) % 7) + cantidad) / 7) * 7;
  return Array.from({ length: celdas }, (_, indice) => {
    const dia = new Date(inicio);
    dia.setUTCDate(dia.getUTCDate() + indice);
    return fechaLocal(dia);
  });
}

function fechaCorta(fecha) {
  return new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(fecha));
}

function minutosDeHora(hora) {
  if (!hora) return null;
  const [horas, minutos] = hora.split(":").map(Number);
  return horas * 60 + minutos;
}

function distribuirEventos(eventos) {
  const conHorario = eventos
    .filter((evento) => evento.horaInicio)
    .map((evento) => {
      const inicio = minutosDeHora(evento.horaInicio);
      const fin = minutosDeHora(evento.horaFin) ?? inicio + 60;
      return { evento, inicio, fin, carril: 0 };
    })
    .sort((a, b) => a.inicio - b.inicio || a.fin - b.fin);
  const finesPorCarril = [];

  for (const item of conHorario) {
    let carril = finesPorCarril.findIndex((fin) => fin <= item.inicio);
    if (carril === -1) carril = finesPorCarril.length;
    item.carril = carril;
    finesPorCarril[carril] = item.fin;
  }

  return {
    eventos: conHorario,
    cantidadCarriles: Math.max(finesPorCarril.length, 1),
  };
}

function resumir(eventos, esDocente) {
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
    porCategoria: ordenar(porCategoria).map(([categoria, minutos]) => [nombreCategoria(categoria, esDocente), minutos]),
    porEtiqueta: ordenar(porEtiqueta),
  };
}

// Horarios U-01 + ACT-02: la agenda semanal reemplaza la grilla de solo clases,
// porque ya reúne las comisiones elegidas junto con las actividades personales.
export default function AgendaSemanal({ esDocente = false }) {
  const [fechaReferencia, setFechaReferencia] = useState(hoyLocal());
  const [agendasMes, setAgendasMes] = useState(null);
  const [error, setError] = useState(null);
  const [eventoExpandido, setEventoExpandido] = useState(null);

  useEffect(() => {
    let vigente = true;
    const [anio, mes] = fechaReferencia.slice(0, 7).split("-").map(Number);
    const inicio = new Date(Date.UTC(anio, mes - 1, 1));
    const fin = new Date(Date.UTC(anio, mes, 0));
    const semanas = [];
    for (let semana = inicioDeSemana(fechaLocal(inicio)); semana <= fechaLocal(fin); semana = fechaDeDia(semana, 7)) {
      semanas.push(semana);
    }

    setAgendasMes(null);
    setError(null);
    Promise.all(semanas.map((fecha) => api(`/actividades-personales/agenda?fecha=${fecha}`)))
      .then((datos) => { if (vigente) setAgendasMes(datos); })
      .catch((e) => { if (vigente) setError(e.message); });
    return () => { vigente = false; };
  }, [fechaReferencia.slice(0, 7)]);

  const agenda = agendasMes?.find((semana) => (
    semana.dias.some((dia) => fechaLocal(dia.fecha) === fechaReferencia)
  ));
  const datosDiasMes = useMemo(() => {
    const dias = new Map();
    for (const semana of agendasMes ?? []) {
      for (const dia of semana.dias) {
        dias.set(fechaLocal(dia.fecha), dia);
      }
    }
    return dias;
  }, [agendasMes]);
  const celdasMes = diasDelMes(fechaReferencia);
  const nombreMes = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${fechaReferencia.slice(0, 7)}-01T00:00:00.000Z`));

  const resumen = useMemo(() => resumir(agenda?.eventos ?? [], esDocente), [agenda, esDocente]);
  const lunesSemana = agenda?.desde ? fechaLocal(agenda.desde) : fechaReferencia;
  const horaInicioGrilla = Math.min(
    HORA_INICIO_BASE,
    ...((agenda?.eventos ?? []).filter((evento) => evento.horaInicio).map((evento) => Math.floor(minutosDeHora(evento.horaInicio) / 60))),
  );
  const horaFinGrilla = Math.max(
    HORA_FIN_BASE,
    ...((agenda?.eventos ?? []).filter((evento) => evento.horaInicio).map((evento) => Math.ceil((minutosDeHora(evento.horaFin) ?? minutosDeHora(evento.horaInicio) + 60) / 60))),
  );
  const totalHoras = horaFinGrilla - horaInicioGrilla;
  const etiquetasHora = Array.from({ length: totalHoras + 1 }, (_, indice) => horaInicioGrilla + indice);
  const eventosSinHora = (agenda?.dias ?? []).flatMap(({ dia, nombre, eventos }) =>
    eventos.filter((evento) => !evento.horaInicio).map((evento) => ({ ...evento, dia, nombreDia: nombre })),
  );

  return (
    <section className="actividades agenda-semanal">
      <h2>Calendario académico</h2>
      <p>
        {esDocente
          ? "Consultá tus clases y organizá tus actividades personales, de preparación y corrección en un solo calendario."
          : "Consultá tus actividades, clases y exámenes en un solo calendario."}
      </p>

      {error && <p className="actividad-mensaje error" role="alert">No se pudo cargar tu agenda: {error}</p>}

      <section className="agenda-mensual" aria-label="Calendario mensual">
        <div className="agenda-mensual-cabecera">
          <button type="button" onClick={() => setFechaReferencia((fecha) => moverMes(fecha, -1))} aria-label="Mes anterior">‹</button>
          <h3>{nombreMes}</h3>
          <button type="button" onClick={() => setFechaReferencia((fecha) => moverMes(fecha, 1))} aria-label="Mes siguiente">›</button>
        </div>
        <div className="agenda-mensual-grilla" role="grid" aria-label={nombreMes}>
          {["L", "M", "X", "J", "V", "S", "D"].map((dia, indice) => (
            <span className="agenda-mensual-dia-semana" key={`${dia}-${indice}`} aria-hidden="true">{dia}</span>
          ))}
          {celdasMes.map((fecha) => {
            const dia = datosDiasMes.get(fecha);
            const esDelMes = fecha.slice(0, 7) === fechaReferencia.slice(0, 7);
            const cantidadEventos = dia?.eventos.length ?? 0;
            const marcas = dia?.calendario?.marcas ?? [];
            return (
              <button
                type="button"
                className={[
                  "agenda-mensual-numero",
                  fecha === fechaReferencia ? "seleccionado" : "",
                  esDelMes ? "" : "fuera-de-mes",
                  cantidadEventos ? "con-eventos" : "",
                  ...marcas.map((marca) => `calendario-${marca.tipo.toLowerCase()}`),
                ].filter(Boolean).join(" ")}
                key={fecha}
                onClick={() => setFechaReferencia(fecha)}
                aria-pressed={fecha === fechaReferencia}
                aria-label={`${fecha}${cantidadEventos ? `, ${cantidadEventos} eventos` : ""}${marcas.length ? `, ${marcas.map((marca) => marca.nombre).join(", ")}` : ""}`}
                title={[...marcas.map((marca) => marca.nombre), cantidadEventos ? `${cantidadEventos} eventos` : ""].filter(Boolean).join(" · ") || undefined}
              >
                <span>{Number(fecha.slice(-2))}</span>
                {cantidadEventos > 0 && <i aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        <div className="agenda-mensual-leyenda" aria-label="Referencias del calendario">
          <span><i className="evento" aria-hidden="true" /> Clases, exámenes o actividades</span>
          <span><i className="feriado" aria-hidden="true" /> Feriado</span>
          <span><i className="vacaciones" aria-hidden="true" /> Receso de invierno</span>
          <span><i className="examenes_finales" aria-hidden="true" /> Mesas de examen</span>
          <span><i className="cuatrimestre" aria-hidden="true" /> Inicio o fin de cuatrimestre</span>
        </div>
      </section>

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
            <p>
              {esDocente ? "Dedicación extra-áulica registrada: " : "Tiempo personal planificado: "}
              <strong>{Math.floor(resumen.total / 60)} h {resumen.total % 60} min</strong>
            </p>
            {resumen.porCategoria.length > 0 && (
              <div className="actividad-resumen">
                <div>
                  <h4>{esDocente ? "Por tipo de dedicación" : "Por categoría"}</h4>
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
            <div className="actividad-leyenda" aria-label="Tipos de eventos">
              {esDocente ? (
                <>
                  <span><i className="actividad-leyenda-muestra actividad" aria-hidden="true" /> Actividad de dedicación</span>
                  <span><i className="actividad-leyenda-muestra clase" aria-hidden="true" /> Clase que dicto</span>
                </>
              ) : (
                <>
                  <span><i className="actividad-leyenda-muestra actividad" aria-hidden="true" /> Actividad personal</span>
                  <span><i className="actividad-leyenda-muestra clase" aria-hidden="true" /> Clase</span>
                  <span><i className="actividad-leyenda-muestra examen" aria-hidden="true" /> Examen</span>
                </>
              )}
            </div>
            {eventosSinHora.length > 0 && (
              <section className="actividad-sin-horario" aria-label="Eventos sin hora confirmada">
                <h3>Horarios a confirmar</h3>
                <ul>
                  {eventosSinHora.map((evento) => (
                    <li key={`${evento.tipoEvento}-${evento.id ?? evento.titulo}`}>
                      <strong>{evento.nombreDia} {fechaCorta(evento.fecha)}:</strong>{" "}
                      {evento.tipoEvento === "EXAMEN" ? `${nombreTipoExamen(evento.tipoExamen)} · ` : ""}
                      {evento.titulo}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <div className="actividad-calendario-scroll" role="region" aria-label="Calendario semanal" tabIndex="0">
              <div
                className="actividad-grilla"
                style={{ "--actividad-cantidad-horas": totalHoras, "--actividad-alto-hora": `${PIXELES_POR_HORA}px` }}
              >
                <div className="actividad-grilla-esquina" aria-hidden="true" />
                {agenda.dias.map(({ dia, nombre, fecha, calendario }) => (
                  <div
                    className={[
                      "actividad-grilla-cabecera",
                      ...(calendario?.marcas ?? []).map((marca) => `calendario-${marca.tipo.toLowerCase()}`),
                    ].join(" ")}
                    key={dia}
                  >
                    <strong>{nombre}</strong>
                    <span>{fechaCorta(fecha)}</span>
                    <span className="actividad-calendario-marcas">
                      {calendario?.marcas.map((marca, indice) => (
                        <span
                          className={`actividad-calendario-marca calendario-${marca.tipo.toLowerCase()}`}
                          key={`${marca.tipo}-${marca.nombre}-${indice}`}
                          title={marca.tipo.replaceAll("_", " ")}
                        >
                          {marca.nombre}
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
                <div className="actividad-columna-horas" aria-hidden="true">
                  {etiquetasHora.map((hora) => (
                    <span key={hora} style={{ top: `${(hora - horaInicioGrilla) * PIXELES_POR_HORA}px` }}>
                      {String(hora).padStart(2, "0")}:00
                    </span>
                  ))}
                </div>
                {agenda.dias.map(({ dia, eventos }) => {
                  const distribucion = distribuirEventos(eventos);
                  return (
                    <div className="actividad-columna-dia" key={dia} aria-label={`${dia}, eventos por horario`}>
                      {distribucion.eventos.map(({ evento, inicio, fin, carril }) => {
                        const esClase = evento.tipoEvento === "CLASE";
                        const esExamen = evento.tipoEvento === "EXAMEN";
                        const titulo = esExamen
                          ? `${nombreTipoExamen(evento.tipoExamen)} · ${evento.titulo}`
                          : evento.titulo;
                        const claveEvento = `${dia}-${evento.tipoEvento}-${evento.id ?? evento.titulo}`;
                        const estaExpandido = eventoExpandido === claveEvento;
                        const detalles = esClase
                          ? [
                            evento.comision,
                            evento.aula ? `Aula: ${evento.aula}` : null,
                          ]
                          : esExamen
                            ? [evento.aula ? `Aula: ${evento.aula}` : null]
                            : [
                              nombreCategoria(evento.categoria, esDocente),
                              evento.estado ? `Estado: ${{ PENDIENTE: "Pendiente", EN_CURSO: "En curso", FINALIZADA: "Finalizada" }[evento.estado] ?? evento.estado}` : null,
                              evento.notas,
                              ...(evento.etiquetas ?? []),
                            ];
                        return (
                          <button
                            type="button"
                            className={`actividad-evento ${esClase ? "clase" : ""} ${esExamen ? "examen" : ""}`}
                            key={claveEvento}
                            aria-expanded={estaExpandido}
                            aria-label={`${titulo}${estaExpandido ? ", detalles abiertos" : ", mostrar detalles"}`}
                            onClick={() => setEventoExpandido(estaExpandido ? null : claveEvento)}
                            style={{
                              top: `${(inicio - horaInicioGrilla * 60) * PIXELES_POR_HORA / 60}px`,
                              height: `${Math.max((fin - inicio) * PIXELES_POR_HORA / 60, 44)}px`,
                              left: `calc(${carril * 100 / distribucion.cantidadCarriles}% + 2px)`,
                              width: `calc(${100 / distribucion.cantidadCarriles}% - 4px)`,
                            }}
                          >
                            <strong>{titulo}</strong>
                            {estaExpandido && (
                              <span className="actividad-evento-detalles">
                                {detalles.filter(Boolean).map((detalle, indice) => (
                                  <span key={`${detalle}-${indice}`}>{detalle}</span>
                                ))}
                                {detalles.every((detalle) => !detalle) && <span>Sin detalles adicionales</span>}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : !error && <p>Cargando el calendario del mes...</p>}
      </section>
    </section>
  );
}

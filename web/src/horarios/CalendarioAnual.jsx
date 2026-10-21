import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { clasePrincipal, marcasDelDia } from "./calendarioAnual.js";

const DIAS = ["L", "M", "X", "J", "V", "S", "D"];
const NOMBRES_MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const fechaISO = (fecha) => new Date(fecha).toISOString().slice(0, 10);

function mesCalendario(anio, mes, periodos, agendaPorFecha) {
  const primerDia = new Date(Date.UTC(anio, mes, 1));
  const desplazamiento = (primerDia.getUTCDay() + 6) % 7;
  const cantidadDias = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  return (
    <section className="calendario-anual-mes" aria-label={`${NOMBRES_MESES[mes]} ${anio}`} key={mes}>
      <h4>{NOMBRES_MESES[mes]}</h4>
      <div className="calendario-anual-grilla" role="grid">
        {DIAS.map((dia, indice) => <span className="calendario-anual-dia-semana" key={`${dia}-${indice}`} aria-hidden="true">{dia}</span>)}
        {Array.from({ length: desplazamiento }, (_, indice) => (
          <span className="calendario-anual-vacio" key={`vacio-${indice}`} aria-hidden="true" />
        ))}
        {Array.from({ length: cantidadDias }, (_, indice) => {
          const numero = indice + 1;
          const fecha = `${anio}-${String(mes + 1).padStart(2, "0")}-${String(numero).padStart(2, "0")}`;
          const marcas = marcasDelDia(fecha, periodos);
          const clase = clasePrincipal(marcas);
          const titulosAgenda = agendaPorFecha?.get(fecha);
          const titulo = [marcas.map(({ nombre }) => nombre).join(" · "), titulosAgenda?.join(" · ")].filter(Boolean).join(" · ");
          return (
            <span
              className={`calendario-anual-numero ${clase} ${titulosAgenda ? "tiene-horario" : ""}`}
              key={fecha}
              role="gridcell"
              aria-label={`${numero} de ${NOMBRES_MESES[mes]}${titulo ? `: ${titulo}` : ""}${titulosAgenda ? " (tenés algo en tu horario)" : ""}`}
              title={titulo || undefined}
            >
              {numero}
            </span>
          );
        })}
      </div>
    </section>
  );
}

export default function CalendarioAnual({ anio, vistaPrevia = false }) {
  const [periodos, setPeriodos] = useState(null);
  const [publicacion, setPublicacion] = useState(null);
  const [error, setError] = useState("");
  const [agendaPorFecha, setAgendaPorFecha] = useState(null);

  useEffect(() => {
    let vigente = true;
    setPeriodos(null);
    setPublicacion(null);
    setError("");
    Promise.all([
      api(`/calendario-academico/estado?anio=${anio}`),
      api(`/calendario-academico?anio=${anio}`),
    ])
      .then(([estado, datos]) => {
        if (!vigente) return;
        setPublicacion(estado);
        setPeriodos(vistaPrevia || estado.publicado ? datos : []);
      })
      .catch((e) => { if (vigente) setError(e.message); });
    return () => { vigente = false; };
  }, [anio, vistaPrevia]);

  // Integra «Mi horario» (clases, exámenes y actividades personales) al calendario académico.
  // No aplica a la vista previa de administración, que no tiene horario propio.
  useEffect(() => {
    if (vistaPrevia) { setAgendaPorFecha(null); return undefined; }
    let vigente = true;
    setAgendaPorFecha(null);
    api(`/actividades-personales/calendario-anual?anio=${anio}`)
      .then(({ fechas }) => { if (vigente) setAgendaPorFecha(new Map(fechas.map(({ fecha, titulos }) => [fecha, titulos]))); })
      .catch(() => { if (vigente) setAgendaPorFecha(new Map()); });
    return () => { vigente = false; };
  }, [anio, vistaPrevia]);

  const meses = useMemo(() => periodos
    ? NOMBRES_MESES.map((_, mes) => mesCalendario(anio, mes, periodos, agendaPorFecha))
    : [], [anio, periodos, agendaPorFecha]);

  return (
    <section className="calendario-anual" aria-label={`Calendario académico completo ${anio}`}>
      <h3>Calendario académico {anio}</h3>
      {error && <p className="actividad-mensaje error" role="alert">No se pudo cargar el calendario anual: {error}</p>}
      {periodos === null || publicacion === null ? <p role="status">Cargando calendario anual…</p> : !publicacion.publicado && !vistaPrevia ? (
        <p role="status">El calendario de este año todavía no fue confirmado por administración.</p>
      ) : (
        <>
          {vistaPrevia && !publicacion.publicado && <p className="calendario-vista-previa" role="status">Vista previa: este calendario todavía no está publicado.</p>}
          <div className="calendario-anual-leyenda" aria-label="Referencias del calendario">
            <span><i className="calendario-anual-muestra calendario-feriado" aria-hidden="true" /> Feriado</span>
            <span><i className="calendario-anual-muestra calendario-vacaciones" aria-hidden="true" /> Receso de invierno</span>
            <span><i className="calendario-anual-muestra calendario-examenes_finales" aria-hidden="true" /> Mesas de examen</span>
            <span><i className="calendario-anual-muestra calendario-inicio_cuatrimestre" aria-hidden="true" /> Inicio de cuatrimestre</span>
            <span><i className="calendario-anual-muestra calendario-fin_cuatrimestre" aria-hidden="true" /> Fin de cuatrimestre</span>
            {!vistaPrevia && <span><i className="calendario-anual-muestra tiene-horario" aria-hidden="true" /> Tenés algo en tu horario</span>}
          </div>
          {!periodos.length && <p>No hay períodos configurados para este año.</p>}
          <div className="calendario-anual-meses">{meses}</div>
        </>
      )}
    </section>
  );
}

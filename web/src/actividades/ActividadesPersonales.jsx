import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import "./actividades.css";

const DIAS = [
  ["LUNES", "Lunes"],
  ["MARTES", "Martes"],
  ["MIERCOLES", "Miércoles"],
  ["JUEVES", "Jueves"],
  ["VIERNES", "Viernes"],
  ["SABADO", "Sábado"],
  ["DOMINGO", "Domingo"],
];
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
const FORMULARIO_VACIO = {
  titulo: "",
  duracion: "",
  categoria: "OTRA",
  etiquetas: "",
  programacion: "PUNTUAL",
  dia: "LUNES",
  fecha: hoyLocal(),
  horaInicio: "09:00",
};

const fechaLocal = (fecha) => new Date(fecha).toISOString().slice(0, 10);
const fechaDeDia = (fecha, desplazamiento) => {
  const resultado = new Date(`${fecha}T00:00:00.000Z`);
  resultado.setUTCDate(resultado.getUTCDate() + desplazamiento);
  return fechaLocal(resultado);
};

function prepararDatos(formulario) {
  return {
    titulo: formulario.titulo,
    duracion: Number(formulario.duracion),
    categoria: formulario.categoria,
    etiquetas: formulario.etiquetas.split(",").map((etiqueta) => etiqueta.trim()).filter(Boolean),
    programacion: formulario.programacion,
    dia: formulario.programacion === "RECURRENTE" ? formulario.dia : null,
    fecha: formulario.programacion === "PUNTUAL" ? formulario.fecha : null,
    horaInicio: formulario.horaInicio,
  };
}

function horarioDe(actividad) {
  if (!actividad.horaInicio) return "Sin horario";
  const finMinutos = Number(actividad.horaInicio.slice(0, 2)) * 60 + Number(actividad.horaInicio.slice(3)) + actividad.duracion;
  const fin = finMinutos === 1440
    ? "24:00"
    : `${String(Math.floor(finMinutos / 60)).padStart(2, "0")}:${String(finMinutos % 60).padStart(2, "0")}`;
  return `${actividad.horaInicio}–${fin}`;
}

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

export default function ActividadesPersonales() {
  const [actividades, setActividades] = useState(null);
  const [agenda, setAgenda] = useState(null);
  const [fechaReferencia, setFechaReferencia] = useState(FORMULARIO_VACIO.fecha);
  const [formulario, setFormulario] = useState(FORMULARIO_VACIO);
  const [actividadEditando, setActividadEditando] = useState(null);
  const [etiquetaSeleccionada, setEtiquetaSeleccionada] = useState("");
  const [error, setError] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [conflictos, setConflictos] = useState([]);
  const [guardando, setGuardando] = useState(false);

  async function cargarActividades() {
    try {
      const datos = await api("/actividades-personales");
      setActividades(datos.actividades);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    cargarActividades();
  }, []);

  useEffect(() => {
    api(`/actividades-personales/agenda?fecha=${fechaReferencia}`)
      .then(setAgenda)
      .catch((e) => setError(e.message));
  }, [fechaReferencia]);

  const etiquetas = useMemo(
    () => [...new Set((actividades ?? []).flatMap((actividad) => actividad.etiquetas))].sort((a, b) => a.localeCompare(b, "es")),
    [actividades],
  );
  const actividadesFiltradas = (actividades ?? []).filter(
    (actividad) => !etiquetaSeleccionada || actividad.etiquetas.includes(etiquetaSeleccionada),
  );
  const resumen = useMemo(() => resumir(agenda?.eventos ?? []), [agenda]);
  const lunesSemana = agenda?.desde ? fechaLocal(agenda.desde) : fechaReferencia;

  function actualizarCampo(evento) {
    setFormulario((actual) => ({ ...actual, [evento.target.name]: evento.target.value }));
  }

  function editar(actividad) {
    setActividadEditando(actividad.id);
    setFormulario({
      titulo: actividad.titulo,
      duracion: actividad.duracion == null ? "" : String(actividad.duracion),
      categoria: CATEGORIAS.some(([valor]) => valor === actividad.categoria) ? actividad.categoria : "OTRA",
      etiquetas: [
        ...actividad.etiquetas,
        ...(CATEGORIAS.some(([valor]) => valor === actividad.categoria) ? [] : [actividad.categoria]),
      ].join(", "),
      programacion: actividad.programacion ?? "PUNTUAL",
      dia: actividad.dia ?? "LUNES",
      fecha: actividad.fecha ? fechaLocal(actividad.fecha) : "",
      horaInicio: actividad.horaInicio ?? "",
    });
    setMensaje(null);
    setConflictos([]);
    setError(null);
  }

  function cancelarEdicion() {
    setActividadEditando(null);
    setFormulario({ ...FORMULARIO_VACIO, fecha: hoyLocal() });
  }

  async function refrescar() {
    const datos = await api("/actividades-personales");
    setActividades(datos.actividades);
    const datosAgenda = await api(`/actividades-personales/agenda?fecha=${fechaReferencia}`);
    setAgenda(datosAgenda);
  }

  async function guardar(evento) {
    evento.preventDefault();
    setGuardando(true);
    setError(null);
    setMensaje(null);
    setConflictos([]);
    try {
      const cuerpo = JSON.stringify(prepararDatos(formulario));
      const respuesta = actividadEditando === null
        ? await api("/actividades-personales", { method: "POST", body: cuerpo })
        : await api(`/actividades-personales/${actividadEditando}`, { method: "PATCH", body: cuerpo });
      setConflictos(respuesta.conflictos ?? []);
      setMensaje(actividadEditando === null ? "Actividad guardada." : "Actividad actualizada.");
      cancelarEdicion();
      await refrescar();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  async function eliminar(actividad) {
    if (!window.confirm(`¿Eliminar la actividad «${actividad.titulo}»?`)) return;
    setError(null);
    setMensaje(null);
    setConflictos([]);
    try {
      await api(`/actividades-personales/${actividad.id}`, { method: "DELETE" });
      setMensaje("Actividad eliminada.");
      if (actividadEditando === actividad.id) cancelarEdicion();
      await refrescar();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <section className="actividades">
      <h2>Mis actividades personales</h2>
      <p>Planificá tus ocupaciones junto con las clases, sin necesidad de usar un calendario.</p>

      <form className="actividad-formulario" onSubmit={guardar}>
        <h3>{actividadEditando === null ? "Agregar actividad" : "Editar actividad"}</h3>
        <label>
          Título
          <input name="titulo" value={formulario.titulo} onChange={actualizarCampo} maxLength={120} required />
        </label>
        <div className="actividad-formulario-fila">
          <label>
            Duración (minutos)
            <input name="duracion" type="number" min="1" max="1440" step="1" value={formulario.duracion} onChange={actualizarCampo} required />
          </label>
        </div>
        <label>
          Categoría
          <select name="categoria" value={formulario.categoria} onChange={actualizarCampo} required>
            {CATEGORIAS.map(([valor, nombre]) => <option key={valor} value={valor}>{nombre}</option>)}
          </select>
        </label>
        <small>¿De qué área es? Elegí un grupo general. Por ejemplo, “Trabajo”.</small>
        <label>
          Frecuencia
          <select name="programacion" value={formulario.programacion} onChange={actualizarCampo}>
            <option value="PUNTUAL">Una sola vez</option>
            <option value="RECURRENTE">Se repite cada semana</option>
          </select>
        </label>
        {formulario.programacion === "RECURRENTE" ? (
          <label>
            Día de la semana
            <select name="dia" value={formulario.dia} onChange={actualizarCampo}>
              {DIAS.map(([valor, nombre]) => <option key={valor} value={valor}>{nombre}</option>)}
            </select>
          </label>
        ) : (
          <label>
            Fecha
            <input name="fecha" type="date" value={formulario.fecha} onChange={actualizarCampo} required />
          </label>
        )}
        <label>
          Hora de inicio
          <input name="horaInicio" type="time" value={formulario.horaInicio} onChange={actualizarCampo} required />
        </label>
        <label>
          Etiquetas
          <input name="etiquetas" value={formulario.etiquetas} onChange={actualizarCampo} placeholder="Remoto, gimnasio, equipo" aria-describedby="actividad-etiquetas-ayuda" />
        </label>
        <small id="actividad-etiquetas-ayuda">¿Qué detalle querés recordar? Agregá etiquetas libres, por ejemplo “remoto” o “gimnasio”; separalas con comas.</small>
        <div className="actividad-acciones">
          <button type="submit" disabled={guardando}>{guardando ? "Guardando..." : actividadEditando === null ? "Guardar actividad" : "Guardar cambios"}</button>
          {actividadEditando !== null && <button type="button" onClick={cancelarEdicion} disabled={guardando}>Cancelar</button>}
        </div>
      </form>

      {error && <p className="actividad-mensaje error" role="alert">{error}</p>}
      {mensaje && <p className="actividad-mensaje exito" role="status">{mensaje}</p>}
      {conflictos.length > 0 && (
        <section className="actividad-conflictos" role="status">
          <h3>Atención: este horario se superpone</h3>
          <ul>
            {conflictos.map((conflicto, indice) => (
              <li key={`${conflicto.tipo}-${conflicto.titulo}-${indice}`}>
                {conflicto.titulo}: {conflicto.horaInicio}–{conflicto.horaFin}
                {conflicto.fecha ? ` el ${fechaCorta(conflicto.fecha)}` : ` los ${DIAS.find(([dia]) => dia === conflicto.dia)?.[1] ?? conflicto.dia}`}
              </li>
            ))}
          </ul>
          <p>La actividad se guardó igualmente; podés editarla si querés cambiar el horario.</p>
        </section>
      )}

      <section className="actividad-semana">
        <h3>Agenda semanal</h3>
        <p>Clases y actividades, en una lista ordenada por día y hora.</p>
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
        ) : <p>Cargando agenda semanal...</p>}
      </section>

      <section>
        <h3>Todas mis actividades</h3>
        <div className="actividad-filtro">
          <label htmlFor="filtro-etiqueta">Filtrar por etiqueta</label>
          <select id="filtro-etiqueta" value={etiquetaSeleccionada} onChange={(evento) => setEtiquetaSeleccionada(evento.target.value)}>
            <option value="">Todas</option>
            {etiquetas.map((etiqueta) => <option key={etiqueta} value={etiqueta}>{etiqueta}</option>)}
          </select>
        </div>
        {actividades === null ? <p>Cargando actividades...</p> : actividadesFiltradas.length === 0 ? (
          <p>{actividades.length === 0 ? "Todavía no registraste actividades." : "No hay actividades con esa etiqueta."}</p>
        ) : (
          <ul className="actividad-lista">
            {actividadesFiltradas.map((actividad) => (
              <li className="actividad-tarjeta" key={actividad.id}>
                <div>
                  <h4>{actividad.titulo}</h4>
                  <p>{nombreCategoria(actividad.categoria)} · {actividad.duracion ?? "Duración sin registrar"} min</p>
                  <p>
                    {actividad.programacion === "RECURRENTE"
                      ? `Cada ${DIAS.find(([dia]) => dia === actividad.dia)?.[1] ?? actividad.dia}`
                      : actividad.fecha ? `Una vez · ${fechaCorta(actividad.fecha)}` : "Falta programar"}
                    {actividad.horaInicio ? ` · ${horarioDe(actividad)}` : ""}
                  </p>
                  {actividad.etiquetas.length > 0 && (
                    <ul className="actividad-etiquetas" aria-label="Etiquetas">
                      {actividad.etiquetas.map((etiqueta) => <li key={etiqueta}>{etiqueta}</li>)}
                    </ul>
                  )}
                </div>
                <div className="actividad-acciones">
                  <button type="button" onClick={() => editar(actividad)} aria-label={`Editar ${actividad.titulo}`}>Editar</button>
                  <button type="button" onClick={() => eliminar(actividad)} aria-label={`Eliminar ${actividad.titulo}`}>Eliminar</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

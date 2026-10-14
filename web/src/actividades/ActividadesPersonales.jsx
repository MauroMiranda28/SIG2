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
const CATEGORIAS_DOCENTE = [
  ["TRABAJO", "Gestión personal"],
  ["ESTUDIO", "Planificación académica"],
  ["CORRECCION_EXAMENES", "Corrección de exámenes"],
  ["PREPARACION_CLASE", "Preparación de clase"],
  ["PREPARACION_EXAMEN", "Preparación de exámenes"],
  ["OTRA_ACADEMICA", "Otra actividad académica"],
];
const nombreCategoria = (categoria, esDocente = false) => (
  (esDocente ? CATEGORIAS_DOCENTE : CATEGORIAS).find(([valor]) => valor === categoria)?.[1] ?? "Otra"
);
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

export default function ActividadesPersonales({ esDocente = false }) {
  const categorias = esDocente ? CATEGORIAS_DOCENTE : CATEGORIAS;
  const formularioVacio = esDocente
    ? { ...FORMULARIO_VACIO, categoria: "TRABAJO" }
    : FORMULARIO_VACIO;
  const [actividades, setActividades] = useState(null);
  const [formulario, setFormulario] = useState(formularioVacio);
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

  const etiquetas = useMemo(
    () => [...new Set((actividades ?? []).flatMap((actividad) => actividad.etiquetas))].sort((a, b) => a.localeCompare(b, "es")),
    [actividades],
  );
  const actividadesFiltradas = (actividades ?? []).filter(
    (actividad) => !etiquetaSeleccionada || actividad.etiquetas.includes(etiquetaSeleccionada),
  );
  function actualizarCampo(evento) {
    setFormulario((actual) => ({ ...actual, [evento.target.name]: evento.target.value }));
  }

  function editar(actividad) {
    setActividadEditando(actividad.id);
    setFormulario({
      titulo: actividad.titulo,
      duracion: actividad.duracion == null ? "" : String(actividad.duracion),
      categoria: categorias.some(([valor]) => valor === actividad.categoria) ? actividad.categoria : categorias.at(-1)[0],
      etiquetas: [
        ...actividad.etiquetas,
        ...(categorias.some(([valor]) => valor === actividad.categoria) ? [] : [actividad.categoria]),
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
    setFormulario({ ...formularioVacio, fecha: hoyLocal() });
  }

  async function refrescar() {
    const datos = await api("/actividades-personales");
    setActividades(datos.actividades);
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
      setMensaje(actividadEditando === null
        ? esDocente ? "Bloque guardado." : "Actividad guardada."
        : esDocente ? "Bloque actualizado." : "Actividad actualizada.");
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
      setMensaje(esDocente ? "Bloque eliminado." : "Actividad eliminada.");
      if (actividadEditando === actividad.id) cancelarEdicion();
      await refrescar();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <section className="actividades">
      <h2>{esDocente ? "Mi dedicación extra-áulica" : "Mis actividades personales"}</h2>
      <p>
        {esDocente
          ? "Registrá tus bloques de gestión personal y planificación académica para llevar un seguimiento de tu dedicación."
          : "Planificá tus ocupaciones junto con las clases, sin necesidad de usar un calendario."}
      </p>

      <form className="actividad-formulario" onSubmit={guardar}>
        <h3>
          {actividadEditando === null
            ? esDocente ? "Agregar bloque" : "Agregar actividad"
            : esDocente ? "Editar bloque" : "Editar actividad"}
        </h3>
        <label>
          {esDocente ? "Nombre del bloque" : "Título"}
          <input name="titulo" value={formulario.titulo} onChange={actualizarCampo} maxLength={120} required />
        </label>
        <div className="actividad-formulario-fila">
          <label>
            Duración (minutos)
            <input name="duracion" type="number" min="1" max="1440" step="1" value={formulario.duracion} onChange={actualizarCampo} required />
          </label>
        </div>
        <label>
          {esDocente ? "Tipo de dedicación" : "Categoría"}
          <select name="categoria" value={formulario.categoria} onChange={actualizarCampo} required>
            {categorias.map(([valor, nombre]) => <option key={valor} value={valor}>{nombre}</option>)}
          </select>
        </label>
        <small>
          {esDocente
            ? "Elegí el tipo de dedicación: gestión personal, preparación o corrección académica."
            : "¿De qué área es? Elegí un grupo general. Por ejemplo, “Trabajo”."}
        </small>
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
          <input
            name="etiquetas"
            value={formulario.etiquetas}
            onChange={actualizarCampo}
            placeholder={esDocente ? "Correos, reuniones, preparación de clase" : "Remoto, gimnasio, equipo"}
            aria-describedby="actividad-etiquetas-ayuda"
          />
        </label>
        <small id="actividad-etiquetas-ayuda">
          {esDocente
            ? "Agregá detalles para clasificar el bloque, separados por comas."
            : "¿Qué detalle querés recordar? Agregá etiquetas libres, por ejemplo “remoto” o “gimnasio”; separalas con comas."}
        </small>
        <div className="actividad-acciones">
          <button type="submit" className="btn" disabled={guardando}>
            {guardando ? "Guardando..." : actividadEditando === null
              ? esDocente ? "Guardar bloque" : "Guardar actividad"
              : "Guardar cambios"}
          </button>
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
          <p>
            {esDocente
              ? "El bloque se guardó igualmente; podés editarlo si querés cambiar el horario."
              : "La actividad se guardó igualmente; podés editarla si querés cambiar el horario."}
          </p>
        </section>
      )}

      <p className="actividad-mensaje-info">
        {esDocente
          ? "Consultá tus bloques en la grilla de la pestaña «Mi horario»."
          : "Para ver tus clases y actividades juntas en una semana, andá a la pestaña «Mi horario»."}
      </p>

      <section>
        <h3>{esDocente ? "Mis bloques de dedicación" : "Todas mis actividades"}</h3>
        <div className="actividad-filtro">
          <label htmlFor="filtro-etiqueta">Filtrar por etiqueta</label>
          <select id="filtro-etiqueta" value={etiquetaSeleccionada} onChange={(evento) => setEtiquetaSeleccionada(evento.target.value)}>
            <option value="">Todas</option>
            {etiquetas.map((etiqueta) => <option key={etiqueta} value={etiqueta}>{etiqueta}</option>)}
          </select>
        </div>
        {actividades === null ? <p className="loading">Cargando actividades...</p> : actividadesFiltradas.length === 0 ? (
          <p className="empty-state">
            {actividades.length === 0
              ? esDocente ? "Todavía no registraste bloques de dedicación." : "Todavía no registraste actividades."
              : "No hay actividades con esa etiqueta."}
          </p>
        ) : (
          <ul className="actividad-lista">
            {actividadesFiltradas.map((actividad) => (
              <li className="actividad-tarjeta" key={actividad.id}>
                <div>
                  <h4>{actividad.titulo}</h4>
                  <p>{nombreCategoria(actividad.categoria, esDocente)} · {actividad.duracion ?? "Duración sin registrar"} min</p>
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
                  <button type="button" className="btn-danger" onClick={() => eliminar(actividad)} aria-label={`Eliminar ${actividad.titulo}`}>Eliminar</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

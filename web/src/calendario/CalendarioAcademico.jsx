import { useEffect, useState } from "react";
import { api } from "../api.js";
import CalendarioAnual from "../horarios/CalendarioAnual.jsx";
import "./calendario.css";

const TIPOS = [
  ["CLASES_CUATRIMESTRE_1", "Clases · 1.º cuatrimestre"],
  ["CLASES_CUATRIMESTRE_2", "Clases · 2.º cuatrimestre"],
  ["EXAMENES_FINALES", "Exámenes finales"],
  ["VACACIONES", "Receso de invierno"],
  ["FERIADO", "Feriado"],
];
const NOMBRES_MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const nombreTipo = (tipo) => TIPOS.find(([clave]) => clave === tipo)?.[1] ?? tipo;
const fechaISO = (fecha) => new Date(fecha).toISOString().slice(0, 10);
const formularioVacio = (anio) => ({ anio, tipo: "CLASES_CUATRIMESTRE_1", nombre: "", fechaInicio: "", fechaFin: "" });
const DIAS_SEMANA = ["L", "M", "X", "J", "V", "S", "D"];

function fechaDelDia(anio, mes, dia) {
  return `${anio}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function esPeriodoConRango(tipo) {
  return [
    "CLASES_CUATRIMESTRE_1",
    "CLASES_CUATRIMESTRE_2",
    "VACACIONES",
    "EXAMENES_FINALES",
  ].includes(tipo);
}

function requiereMismoAnio(tipo) {
  return tipo !== "VACACIONES" && tipo !== "FERIADO";
}

function calendarioMes(fecha) {
  if (fecha) {
    const [anio, mes] = fecha.split("-").map(Number);
    return new Date(Date.UTC(anio, mes - 1, 1));
  }
  const hoy = new Date();
  return new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), 1));
}

export default function CalendarioAcademico() {
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [periodos, setPeriodos] = useState(null);
  const [publicacion, setPublicacion] = useState(null);
  const [formulario, setFormulario] = useState(formularioVacio(new Date().getFullYear()));
  const [editando, setEditando] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mesVisible, setMesVisible] = useState(() => calendarioMes(""));

  async function cargar() {
    setError("");
    try {
      const [lista, estado] = await Promise.all([
        api(`/calendario-academico?anio=${anio}`),
        api(`/calendario-academico/estado?anio=${anio}`),
      ]);
      setPeriodos(lista);
      setPublicacion(estado);
    }
    catch (e) { setError(e.message); setPeriodos(null); }
  }
  useEffect(() => { cargar(); }, [anio]);

  function cambiarFecha(destino, campo, valor) {
    destino((actual) => ({
      ...actual,
      [campo]: valor,
      ...(actual.tipo === "FERIADO" ? { fechaInicio: valor, fechaFin: valor } : {}),
    }));
  }

  async function guardar(e) {
    e.preventDefault();
    if (guardando) return;
    setError(""); setAviso(""); setGuardando(true);
    try {
      const datos = { ...editando, ...(editando ? {} : formulario) };
      if (datos.tipo === "FERIADO") datos.fechaFin = datos.fechaInicio;
      const editar = Boolean(editando);
      await api(editar ? `/calendario-academico/${editando.id}` : "/calendario-academico", {
        method: editar ? "PUT" : "POST",
        body: JSON.stringify(datos),
      });
      setAviso(editar ? "Período actualizado." : "Período agregado al calendario.");
      setFormulario(formularioVacio(anio));
      setEditando(null);
      await cargar();
    } catch (e) { setError(e.message); }
    finally { setGuardando(false); }
  }

  async function eliminar(periodo) {
    if (!window.confirm(`¿Eliminar «${periodo.nombre}» del calendario?`)) return;
    setError(""); setAviso("");
    try {
      await api(`/calendario-academico/${periodo.id}`, { method: "DELETE" });
      setAviso("Período eliminado.");
      await cargar();
    } catch (e) { setError(e.message); }
  }

  async function cambiarPublicacion(nuevoEstado) {
    setError(""); setAviso(""); setGuardando(true);
    try {
      await api(`/calendario-academico/publicacion/${anio}`, {
        method: "PUT",
        body: JSON.stringify({ publicado: nuevoEstado }),
      });
      setAviso(nuevoEstado
        ? `El calendario ${anio} quedó confirmado y visible para docentes y alumnos.`
        : `El calendario ${anio} dejó de estar visible para docentes y alumnos.`);
      await cargar();
    } catch (e) { setError(e.message); }
    finally { setGuardando(false); }
  }

  const datosForm = editando ?? formulario;
  const setDatosForm = editando ? setEditando : setFormulario;

  function cambiarTipo(tipo) {
    setDatosForm((actual) => ({
      ...actual,
      tipo,
      ...(tipo === "FERIADO" ? { fechaFin: actual.fechaInicio } : {}),
    }));
    if (esPeriodoConRango(tipo)) setMesVisible(calendarioMes(datosForm.fechaInicio));
  }

  return <section className="calendario-academico">
    <h2>Calendario académico</h2>
    <p>Configurá los períodos lectivos, llamados de finales, receso de invierno y feriados. Las fechas se reflejan en las agendas y limitan la programación de exámenes finales.</p>
    <label>Año calendario
      <input type="number" min="1900" max="2100" value={anio} onChange={(e) => {
        const nuevo = Number(e.target.value);
        setAnio(nuevo);
        setFormulario(formularioVacio(nuevo));
        setEditando(null);
        setMesVisible(new Date(Date.UTC(nuevo, 0, 1)));
      }} />
    </label>

    {error && <p className="calendario-error" role="alert">{error}</p>}
    {aviso && <p className="calendario-aviso" role="status">{aviso}</p>}
    {publicacion && (
      <section className="calendario-publicacion" aria-label="Estado de publicación">
        <p>
          Estado: <strong>{publicacion.publicado ? "Confirmado y visible para docentes y alumnos" : "Borrador, solo visible para administración"}</strong>
        </p>
        <button
          type="button"
          disabled={guardando}
          onClick={() => cambiarPublicacion(!publicacion.publicado)}
        >
          {guardando ? "Guardando…" : publicacion.publicado ? "Retirar calendario" : "Confirmar calendario terminado"}
        </button>
      </section>
    )}
    {periodos === null ? <p role="status">Cargando calendario…</p> : periodos.length === 0
      ? <p>Aún no hay fechas configuradas para {anio}.</p>
      : <ul className="calendario-lista">
        {periodos.map((periodo) => <li key={periodo.id}>
          <div><strong>{periodo.nombre}</strong><span>{nombreTipo(periodo.tipo)} · {fechaISO(periodo.fechaInicio)}{fechaISO(periodo.fechaFin) !== fechaISO(periodo.fechaInicio) ? ` al ${fechaISO(periodo.fechaFin)}` : ""}</span></div>
          <button type="button" onClick={() => {
            const inicio = fechaISO(periodo.fechaInicio);
            setEditando({ id: periodo.id, anio: periodo.anio, tipo: periodo.tipo, nombre: periodo.nombre, fechaInicio: inicio, fechaFin: fechaISO(periodo.fechaFin) });
            setMesVisible(calendarioMes(inicio));
            setAviso(""); setError("");
          }}>Editar</button>
          <button type="button" onClick={() => eliminar(periodo)}>Eliminar</button>
        </li>)}
      </ul>}

    <form onSubmit={guardar}>
      <h3>{editando ? "Editar período" : "Agregar período"}</h3>
      <fieldset disabled={guardando}>
        <label>Tipo de período
          <select value={datosForm.tipo} onChange={(e) => cambiarTipo(e.target.value)}>
            {editando?.tipo === "CLASES_ANUALES" && <option value="CLASES_ANUALES">Período anual anterior</option>}
            {TIPOS.map(([tipo, etiqueta]) => <option key={tipo} value={tipo}>{etiqueta}</option>)}
          </select>
        </label>
        <p className="calendario-ayuda">Las materias anuales toman las fechas del primer y segundo cuatrimestre.</p>
        <label>Nombre
          <input required maxLength="120" value={datosForm.nombre} onChange={(e) => setDatosForm((actual) => ({ ...actual, nombre: e.target.value }))} placeholder={datosForm.tipo === "EXAMENES_FINALES" ? "Ej. Primer llamado de julio" : datosForm.tipo === "VACACIONES" ? "Ej. Receso de invierno" : "Ej. Feriado nacional"} />
        </label>
        {esPeriodoConRango(datosForm.tipo) ? (
          <section className="calendario-selector-rango" aria-label="Seleccionar inicio y fin del período">
            <p>
              {datosForm.fechaInicio && datosForm.fechaFin
                ? <>Período seleccionado: <strong>{datosForm.fechaInicio}</strong> al <strong>{datosForm.fechaFin}</strong></>
                : datosForm.fechaInicio
                  ? <>Inicio seleccionado: <strong>{datosForm.fechaInicio}</strong>. Ahora elegí la fecha de fin.</>
                  : "Seleccioná la fecha de inicio y luego la fecha de fin en el calendario."}
            </p>
            <div className="calendario-selector-cabecera">
              <button type="button" aria-label="Mes anterior" onClick={() => setMesVisible((actual) => new Date(Date.UTC(actual.getUTCFullYear(), actual.getUTCMonth() - 1, 1)))}>‹</button>
              <strong>{new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" }).format(mesVisible)}</strong>
              <button type="button" aria-label="Mes siguiente" onClick={() => setMesVisible((actual) => new Date(Date.UTC(actual.getUTCFullYear(), actual.getUTCMonth() + 1, 1)))}>›</button>
            </div>
            <div className="calendario-selector-grilla" role="grid" aria-label="Elegir fechas del período">
              {DIAS_SEMANA.map((dia, indice) => <span className="calendario-selector-dia-semana" key={`${dia}-${indice}`} aria-hidden="true">{dia}</span>)}
              {Array.from({ length: (mesVisible.getUTCDay() + 6) % 7 }, (_, indice) => (
                <span className="calendario-selector-vacio" key={`vacio-${indice}`} aria-hidden="true" />
              ))}
              {Array.from({ length: new Date(Date.UTC(mesVisible.getUTCFullYear(), mesVisible.getUTCMonth() + 1, 0)).getUTCDate() }, (_, indice) => {
                const dia = indice + 1;
                const fecha = fechaDelDia(mesVisible.getUTCFullYear(), mesVisible.getUTCMonth(), dia);
                const dentroDelRango = datosForm.fechaInicio && datosForm.fechaFin &&
                  fecha >= datosForm.fechaInicio && fecha <= datosForm.fechaFin;
                const seleccionado = fecha === datosForm.fechaInicio || fecha === datosForm.fechaFin;
                return (
                  <button
                    type="button"
                    className={[
                      "calendario-selector-numero",
                      dentroDelRango ? "seleccion-rango" : "",
                      seleccionado ? "seleccion-extremo" : "",
                    ].filter(Boolean).join(" ")}
                    key={fecha}
                    aria-pressed={seleccionado}
                    aria-label={`${dia} de ${NOMBRES_MESES[mesVisible.getUTCMonth()]} ${mesVisible.getUTCFullYear()}${seleccionado ? fecha === datosForm.fechaInicio ? ", inicio seleccionado" : ", fin seleccionado" : dentroDelRango ? ", dentro del período seleccionado" : ""}`}
                    onClick={() => {
                      setDatosForm((actual) => {
                        if (!actual.fechaInicio || actual.fechaFin || fecha < actual.fechaInicio) {
                          return { ...actual, fechaInicio: fecha, fechaFin: "" };
                        }
                        return { ...actual, fechaFin: fecha };
                      });
                    }}
                  >
                    {dia}
                  </button>
                );
              })}
            </div>
            {(datosForm.fechaInicio || datosForm.fechaFin) && (
              <button type="button" onClick={() => setDatosForm((actual) => ({ ...actual, fechaInicio: "", fechaFin: "" }))}>
                Limpiar fechas
              </button>
            )}
            {requiereMismoAnio(datosForm.tipo) && datosForm.fechaInicio && datosForm.fechaFin &&
              datosForm.fechaInicio.slice(0, 4) !== datosForm.fechaFin.slice(0, 4) &&
              <p className="calendario-error" role="alert">Este período debe terminar dentro del mismo año en que comienza.</p>}
          </section>
        ) : (
          <>
            <label>Desde
              <input required type="date" value={datosForm.fechaInicio} onChange={(e) => cambiarFecha(setDatosForm, "fechaInicio", e.target.value)} />
            </label>
            {datosForm.tipo !== "FERIADO" && <label>Hasta
              <input required type="date" value={datosForm.fechaFin} onChange={(e) => cambiarFecha(setDatosForm, "fechaFin", e.target.value)} />
            </label>}
          </>
        )}
        <div className="calendario-acciones">
          <button
            type="submit"
            disabled={guardando ||
              (esPeriodoConRango(datosForm.tipo) && (!datosForm.fechaInicio || !datosForm.fechaFin)) ||
              (requiereMismoAnio(datosForm.tipo) && datosForm.fechaInicio && datosForm.fechaFin &&
                datosForm.fechaInicio.slice(0, 4) !== datosForm.fechaFin.slice(0, 4))}
          >
            {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Agregar al calendario"}
          </button>
          {editando && <button type="button" onClick={() => setEditando(null)}>Cancelar edición</button>}
        </div>
      </fieldset>
    </form>
    <section className="calendario-vista-previa-admin">
      <h3>Vista previa para docentes y alumnos</h3>
      <p>Así se mostrará el calendario anual una vez confirmado. Si lo modificás después de publicarlo, se retirará automáticamente hasta que lo confirmes nuevamente.</p>
      <CalendarioAnual anio={anio} vistaPrevia />
    </section>
  </section>;
}

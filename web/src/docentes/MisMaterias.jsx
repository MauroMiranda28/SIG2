import { useEffect, useState } from "react";
import { api, apiArchivo, descargarArchivo } from "../api.js";
import "./docentes.css";

// El docente consulta las materias que dicta y actualiza sus horarios y programa.
// La API solo le devuelve y le deja modificar las materias que tiene asignadas (Seg-05).

const DIAS = [
  ["LUNES", "Lunes"], ["MARTES", "Martes"], ["MIERCOLES", "Miércoles"],
  ["JUEVES", "Jueves"], ["VIERNES", "Viernes"], ["SABADO", "Sábado"],
];
const NOMBRE_DIA = Object.fromEntries(DIAS);

export default function MisMaterias() {
  const [materias, setMaterias] = useState(null);
  const [aulas, setAulas] = useState([]);
  const [errorCarga, setErrorCarga] = useState("");

  function cargar() {
    setErrorCarga("");
    return api("/docentes/mis-materias").then(setMaterias).catch((e) => setErrorCarga(e.message));
  }

  useEffect(() => {
    cargar();
    api("/docentes/aulas").then(setAulas).catch(() => setAulas([])); // sin aulas igual se puede cargar el horario
  }, []);

  return (
    <section className="docente">
      <h2>Mis materias</h2>
      <p>Las materias que tenés asignadas. Desde acá podés actualizar sus horarios y su programa.</p>

      {errorCarga ? (
        <div role="alert"><p>{errorCarga}</p><button onClick={cargar}>Reintentar</button></div>
      ) : materias === null ? (
        <p role="status">Cargando materias…</p>
      ) : !materias.length ? (
        <p>Todavía no tenés materias asignadas. Pedile a administración que te asigne las que dictás.</p>
      ) : (
        materias.map((m) => <TarjetaMateria key={m.id} materia={m} aulas={aulas} onCambio={cargar} />)
      )}
    </section>
  );
}

function TarjetaMateria({ materia, aulas, onCambio }) {
  const [aviso, setAviso] = useState(null); // { tipo: "exito" | "error", texto }
  const [archivo, setArchivo] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [claveInput, setClaveInput] = useState(0); // para vaciar el <input type="file"> después de subir

  async function ejecutar(accion, textoExito) {
    setAviso(null);
    setOcupado(true);
    try {
      await accion();
      if (textoExito) { // las descargas no cambian nada, no hace falta recargar
        setAviso({ tipo: "exito", texto: textoExito });
        await onCambio();
      }
    } catch (e) {
      setAviso({ tipo: "error", texto: e.message });
    } finally {
      setOcupado(false);
    }
  }

  function subirPrograma(e) {
    e.preventDefault();
    if (!archivo) return;
    const datos = new FormData();
    datos.append("archivo", archivo);
    ejecutar(async () => {
      await apiArchivo(`/materias/${materia.id}/programa`, datos);
      setArchivo(null);
      setClaveInput((k) => k + 1);
    }, "Se cargó el programa en PDF.");
  }

  const estadoPrograma = materia.tienePdf
    ? "Programa en PDF cargado."
    : materia.tieneProgramaTexto
      ? "Sin PDF: los alumnos descargan el programa cargado como texto."
      : "Todavía no tiene programa. Subí el PDF para que los alumnos puedan descargarlo.";

  return (
    <article className="docente-materia" aria-labelledby={`materia-${materia.id}`}>
      <header>
        <h3 id={`materia-${materia.id}`}>{materia.nombre}</h3>
        <p className="docente-meta">
          {materia.codigo} · {materia.plan.carrera.nombre} ({materia.plan.nombre}) · {materia.anio}.º año
          {materia.cuatrimestre ? `, ${materia.cuatrimestre}.º cuatrimestre` : ""}
        </p>
      </header>

      <div className="docente-bloque">
        <h4>Programa</h4>
        <p>{estadoPrograma}</p>
        <form className="docente-fila" onSubmit={subirPrograma}>
          <label className="docente-archivo">
            <span>{materia.tienePdf ? "Reemplazar PDF" : "Subir PDF"} (máx. 10 MB)</span>
            <input key={claveInput} type="file" accept="application/pdf,.pdf" disabled={ocupado}
              onChange={(e) => setArchivo(e.target.files[0] ?? null)} />
          </label>
          <button className="docente-primario" type="submit" disabled={!archivo || ocupado}>Subir programa</button>
          {(materia.tienePdf || materia.tieneProgramaTexto) && (
            <button type="button" disabled={ocupado}
              onClick={() => ejecutar(() => descargarArchivo(`/materias/${materia.id}/programa/pdf`, `programa-${materia.codigo}.pdf`))}>
              Descargar
            </button>
          )}
        </form>
      </div>

      <FormCondicion materia={materia} deshabilitado={ocupado}
        onGuardar={(datos) => ejecutar(() => api(`/docentes/materias/${materia.id}/condicion`, { method: "PUT", body: JSON.stringify(datos) }), "Se guardó la condición de la materia.")} />

      <div className="docente-bloque">
        <h4>Horarios</h4>
        {!materia.comisiones.length && <p>Esta materia todavía no tiene comisiones.</p>}
        {materia.comisiones.map((c) => (
          <div className="docente-comision" key={c.id}>
            <h5>{c.nombre}</h5>
            {!c.bloques.length ? <p>Sin horario cargado.</p> : (
              <ul>
                {c.bloques.map((b) => (
                  <li key={b.id}>
                    <span>{NOMBRE_DIA[b.dia]} {b.horaInicio}–{b.horaFin}{b.aula ? ` · ${b.aula.nombre}` : ""}</span>
                    <button type="button" disabled={ocupado} aria-label={`Quitar ${NOMBRE_DIA[b.dia]} ${b.horaInicio} de ${c.nombre}`}
                      onClick={() => ejecutar(() => api(`/horarios/bloques/${b.id}`, { method: "DELETE" }), "Se quitó el horario.")}>
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <FormHorario comision={c} aulas={aulas} deshabilitado={ocupado}
              onAgregar={(datos) => ejecutar(() => api("/horarios", { method: "POST", body: JSON.stringify(datos) }), "Se agregó el horario.")} />
          </div>
        ))}
      </div>

      {aviso && (
        <p role={aviso.tipo === "error" ? "alert" : "status"} className={`docente-${aviso.tipo}`}>{aviso.texto}</p>
      )}
    </article>
  );
}

// Condición de la materia: con cuánto se regulariza, se promociona (si es promocional) y se aprueba el final.
// Rige para las próximas cargas de «Condición final» y «Examen final» en la pestaña «Notas».
function FormCondicion({ materia, deshabilitado, onGuardar }) {
  const texto = (v) => (v == null ? "" : String(v));
  const [esPromocional, setEsPromocional] = useState(materia.esPromocional);
  const [notaRegularizacion, setNotaRegularizacion] = useState(texto(materia.notaRegularizacion));
  const [notaPromocion, setNotaPromocion] = useState(texto(materia.notaPromocion));
  const [notaAprobacionFinal, setNotaAprobacionFinal] = useState(texto(materia.notaAprobacionFinal));
  const configurada = materia.notaRegularizacion != null;

  function enviar(e) {
    e.preventDefault();
    onGuardar({ esPromocional, notaRegularizacion, notaPromocion: esPromocional ? notaPromocion : null, notaAprobacionFinal });
  }

  const nota = (valor, setValor) => (
    <input type="number" min="0" max="10" step="0.01" required value={valor} onChange={(e) => setValor(e.target.value)} />
  );

  return (
    <div className="docente-bloque">
      <h4>Condición</h4>
      <p>
        {configurada
          ? `Se regulariza con ${materia.notaRegularizacion}${materia.esPromocional ? `, se promociona con ${materia.notaPromocion}` : " (no es promocional)"} y el final se aprueba con ${materia.notaAprobacionFinal}.`
          : "Todavía no está configurada: hace falta para cargar condiciones finales y exámenes finales."}
      </p>
      <form className="docente-horario" onSubmit={enviar} aria-label={`Condición de ${materia.nombre}`}>
        <label className="docente-check">
          <input type="checkbox" checked={esPromocional} onChange={(e) => setEsPromocional(e.target.checked)} /> Es promocional
        </label>
        <label>Se regulariza con{nota(notaRegularizacion, setNotaRegularizacion)}</label>
        {esPromocional && <label>Se promociona con{nota(notaPromocion, setNotaPromocion)}</label>}
        <label>El final se aprueba con{nota(notaAprobacionFinal, setNotaAprobacionFinal)}</label>
        <button type="submit" disabled={deshabilitado}>Guardar condición</button>
      </form>
    </div>
  );
}

function FormHorario({ comision, aulas, deshabilitado, onAgregar }) {
  const [dia, setDia] = useState("LUNES");
  const [horaInicio, setHoraInicio] = useState("18:00");
  const [horaFin, setHoraFin] = useState("20:00");
  const [aulaId, setAulaId] = useState("");

  function enviar(e) {
    e.preventDefault();
    onAgregar({ comisionId: comision.id, dia, horaInicio, horaFin, aulaId: aulaId ? Number(aulaId) : null });
  }

  return (
    <form className="docente-horario" onSubmit={enviar} aria-label={`Agregar horario a ${comision.nombre}`}>
      <label>Día
        <select value={dia} onChange={(e) => setDia(e.target.value)}>
          {DIAS.map(([valor, texto]) => <option key={valor} value={valor}>{texto}</option>)}
        </select>
      </label>
      <label>Desde<input type="time" required value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} /></label>
      <label>Hasta<input type="time" required value={horaFin} onChange={(e) => setHoraFin(e.target.value)} /></label>
      <label>Aula
        <select value={aulaId} onChange={(e) => setAulaId(e.target.value)}>
          <option value="">Sin aula</option>
          {aulas.map((a) => <option key={a.id} value={a.id}>{a.nombre}{a.edificio ? ` (${a.edificio})` : ""}</option>)}
        </select>
      </label>
      <button type="submit" disabled={deshabilitado}>Agregar horario</button>
    </form>
  );
}

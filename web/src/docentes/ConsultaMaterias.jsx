import { useEffect, useState } from "react";
import { api } from "../api.js";
import "./docentes.css";

// El docente consulta la información de una materia, las materias relacionadas con
// la suya dentro del plan (correlativas) y quién modificó sus horarios o su material.
// Las materias relacionadas se abren en solo lectura; el historial lo ve solo quien la dicta.

const NOMBRE_DIA = {
  LUNES: "Lunes", MARTES: "Martes", MIERCOLES: "Miércoles", JUEVES: "Jueves", VIERNES: "Viernes", SABADO: "Sábado",
};
const ETIQUETA_ACCION = {
  HORARIO_AGREGADO: "Horario agregado",
  HORARIO_QUITADO: "Horario quitado",
  PROGRAMA_SUBIDO: "Programa en PDF",
};
const ETIQUETA_ROL = { DOCENTE: "Docente", ADMIN: "Administración" };

// Trae una ruta de la API y se vuelve a pedir cuando cambia (ej. al abrir otra materia).
function useApi(ruta) {
  const [estado, setEstado] = useState({ datos: null, error: "" });
  useEffect(() => {
    if (!ruta) return undefined;
    let vigente = true;
    setEstado({ datos: null, error: "" });
    api(ruta)
      .then((datos) => vigente && setEstado({ datos, error: "" }))
      .catch((e) => vigente && setEstado({ datos: null, error: e.message }));
    return () => { vigente = false; };
  }, [ruta]);
  return estado;
}

export default function ConsultaMaterias() {
  const { datos: misMaterias, error: errorLista } = useApi("/docentes/mis-materias");
  const [materiaId, setMateriaId] = useState(null);

  useEffect(() => {
    if (materiaId === null && misMaterias?.length) setMateriaId(misMaterias[0].id);
  }, [misMaterias, materiaId]);

  const esMia = (id) => misMaterias?.some((m) => m.id === id) ?? false;

  return (
    <section className="docente">
      <h2>Consultar materias</h2>
      <p>Consultá la información de tus materias y de las que se relacionan con ellas dentro del plan.</p>

      {errorLista ? (
        <p role="alert" className="docente-error">{errorLista}</p>
      ) : misMaterias === null ? (
        <p role="status">Cargando materias…</p>
      ) : !misMaterias.length ? (
        <p>Todavía no tenés materias asignadas. Pedile a administración que te asigne las que dictás.</p>
      ) : (
        <>
          <label className="docente-campo">
            Mis materias
            <select value={esMia(materiaId) ? materiaId : ""} onChange={(e) => setMateriaId(Number(e.target.value))}>
              {!esMia(materiaId) && <option value="">— Materia relacionada —</option>}
              {misMaterias.map((m) => <option key={m.id} value={m.id}>{m.nombre} ({m.codigo})</option>)}
            </select>
          </label>
          {materiaId !== null && <DetalleMateria key={materiaId} materiaId={materiaId} onAbrir={setMateriaId} />}
        </>
      )}
    </section>
  );
}

function DetalleMateria({ materiaId, onAbrir }) {
  const { datos: materia, error } = useApi(`/docentes/materias/${materiaId}`);

  if (error) return <p role="alert" className="docente-error">{error}</p>;
  if (!materia) return <p role="status">Cargando información…</p>;

  return (
    <>
      <InformacionMateria materia={materia} />
      <Relacionadas materiaId={materiaId} onAbrir={onAbrir} />
      {materia.puedeModificar ? (
        <Historial materiaId={materiaId} />
      ) : (
        <article className="docente-materia">
          <p className="docente-meta">
            Esta materia no figura entre las que dictás: la consultás en modo lectura y no ves su historial de cambios.
          </p>
        </article>
      )}
    </>
  );
}

function InformacionMateria({ materia }) {
  const { plan } = materia;
  return (
    <article className="docente-materia" aria-labelledby={`info-${materia.id}`}>
      <header>
        <h3 id={`info-${materia.id}`}>{materia.nombre}</h3>
        <p className="docente-meta">
          {materia.codigo} · {plan.carrera.nombre} ({plan.nombre}{plan.vigente ? "" : ", plan no vigente"})
        </p>
      </header>

      <div className="docente-bloque">
        <h4>Datos académicos</h4>
        <dl className="docente-datos">
          <div><dt>Año del plan</dt><dd>{materia.anio}.º año</dd></div>
          <div><dt>Cuatrimestre</dt><dd>{materia.cuatrimestre ? `${materia.cuatrimestre}.º` : "Sin especificar"}</dd></div>
          <div><dt>Carga horaria</dt><dd>{materia.cargaHoraria ? `${materia.cargaHoraria} hs` : "Sin especificar"}</dd></div>
          <div><dt>Docentes</dt><dd>{materia.docentes.length ? materia.docentes.map((d) => `${d.nombre} ${d.apellido}`).join(", ") : "Sin docentes asignados"}</dd></div>
        </dl>
        {materia.descripcion && <p>{materia.descripcion}</p>}
      </div>

      <div className="docente-bloque">
        <h4>Programa</h4>
        <p>{materia.tienePdf ? "Hay un programa en PDF cargado." : "No hay un programa en PDF cargado."}</p>
        {materia.programa ? (
          <>
            <p className="docente-texto"><strong>Contenidos:</strong> {materia.programa.contenidos}</p>
            {materia.programa.bibliografia && <p className="docente-texto"><strong>Bibliografía:</strong>{"\n"}{materia.programa.bibliografia}</p>}
          </>
        ) : (
          <p>No hay un programa publicado en texto.</p>
        )}
      </div>

      <div className="docente-bloque">
        <h4>Horarios</h4>
        {!materia.comisiones.length && <p>Esta materia todavía no tiene comisiones.</p>}
        {materia.comisiones.map((c) => (
          <div className="docente-comision" key={c.id}>
            <h5>{c.nombre}</h5>
            {!c.bloques.length ? <p>Sin horario cargado.</p> : (
              <ul>
                {c.bloques.map((b) => (
                  <li key={b.id}>{NOMBRE_DIA[b.dia]} {b.horaInicio}–{b.horaFin}{b.aula ? ` · ${b.aula.nombre}` : ""}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </article>
  );
}

function Relacionadas({ materiaId, onAbrir }) {
  const { datos, error } = useApi(`/docentes/materias/${materiaId}/relacionadas`);

  return (
    <article className="docente-materia" aria-label="Materias relacionadas">
      <div>
        <h3>Materias relacionadas</h3>
        <p className="docente-meta">Correlatividades dentro del plan.</p>
      </div>
      {error ? <p role="alert" className="docente-error">{error}</p>
        : !datos ? <p role="status">Cargando…</p>
        : (
          <>
            <ListaRelacionadas titulo="Hay que tenerlas antes (correlativas previas)" vacio="No tiene correlativas previas."
              materias={datos.previas} onAbrir={onAbrir} />
            <ListaRelacionadas titulo="La exigen como correlativa (posteriores)" vacio="Ninguna materia la exige como correlativa."
              materias={datos.posteriores} onAbrir={onAbrir} />
          </>
        )}
    </article>
  );
}

function ListaRelacionadas({ titulo, vacio, materias, onAbrir }) {
  return (
    <div className="docente-bloque">
      <h4>{titulo}</h4>
      {!materias.length ? <p>{vacio}</p> : (
        <ul className="docente-lista">
          {materias.map((m) => (
            <li key={m.id}>
              <span>
                <strong>{m.nombre}</strong> ({m.codigo}) · {m.anio}.º año{m.cuatrimestre ? `, ${m.cuatrimestre}.º cuatrimestre` : ""}
                {m.laDicto && <span className="docente-etiqueta">La dictás</span>}
              </span>
              <button type="button" onClick={() => onAbrir(m.id)}>Ver información</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Historial({ materiaId }) {
  const { datos, error } = useApi(`/docentes/materias/${materiaId}/historial`);

  return (
    <article className="docente-materia" aria-label="Historial de cambios">
      <div>
        <h3>Historial de cambios</h3>
        <p className="docente-meta">Quién modificó los horarios o el programa de esta materia, y cuándo.</p>
      </div>
      {error ? <p role="alert" className="docente-error">{error}</p>
        : !datos ? <p role="status">Cargando…</p>
        : !datos.cambios.length ? <p>Todavía no se registraron cambios en esta materia.</p>
        : (
          <table className="docente-tabla">
            <thead>
              <tr><th>Fecha</th><th>Qué se hizo</th><th>Detalle</th><th>Quién</th></tr>
            </thead>
            <tbody>
              {datos.cambios.map((c) => (
                <tr key={c.id}>
                  <td>{new Date(c.creadoEn).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td>{ETIQUETA_ACCION[c.accion] ?? c.accion}</td>
                  <td>{c.detalle}</td>
                  <td>{c.autor.nombre} {c.autor.apellido} <span className="docente-etiqueta">{ETIQUETA_ROL[c.autor.rol] ?? c.autor.rol}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
    </article>
  );
}

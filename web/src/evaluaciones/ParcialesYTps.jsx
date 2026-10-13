import { useEffect, useState } from "react";
import { api } from "../api.js";
import { formatFecha } from "../formatFecha.js";

// Historia: como alumno quiero consultar mis parciales a rendir y trabajos prácticos,
// observando su fecha y horario. Los parciales salen de las fechas de examen que programa
// el docente y los TPs, de las tareas con fecha (y hora) de entrega.

const TIPO = {
  PARCIAL: { nombre: "Parcial", color: "var(--color-primary)" },
  RECUPERATORIO: { nombre: "Recuperatorio", color: "#b45309" },
  TRABAJO_PRACTICO: { nombre: "Trabajo práctico", color: "var(--color-success)" },
};
const FILTROS = [["TODOS", "Todos"], ["EXAMENES", "Parciales y recuperatorios"], ["TRABAJO_PRACTICO", "Trabajos prácticos"]];

const DIA_MS = 86400e3;
const hoy = () => new Date(`${new Date().toLocaleDateString("en-CA")}T00:00:00Z`);
const diaSemana = (fecha) => new Date(fecha).toLocaleDateString("es-AR", { weekday: "long", timeZone: "UTC" });

function cuantoFalta(fecha) {
  const dias = Math.round((new Date(fecha) - hoy()) / DIA_MS);
  if (dias <= 0) return "Hoy";
  if (dias === 1) return "Mañana";
  return `En ${dias} días`;
}

export default function ParcialesYTps() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [filtro, setFiltro] = useState("TODOS");

  useEffect(() => {
    api("/evaluaciones/proximas").then(setItems).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="form-error">No se pudieron cargar tus parciales y trabajos prácticos: {error}</p>;
  if (!items) return <p className="loading">Cargando parciales y trabajos prácticos...</p>;

  const visibles = items.filter((i) =>
    filtro === "TODOS" || (filtro === "TRABAJO_PRACTICO" ? i.tipo === "TRABAJO_PRACTICO" : i.tipo !== "TRABAJO_PRACTICO"));

  return (
    <div className="page">
      <h2>Parciales y trabajos prácticos</h2>
      <p className="text-muted">Lo que tenés por delante en las materias que estás cursando, del más próximo al más lejano.</p>

      <div className="field" style={{ maxWidth: "20rem" }}>
        <label htmlFor="filtro-evaluaciones">Mostrar</label>
        <select id="filtro-evaluaciones" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          {FILTROS.map(([valor, texto]) => <option key={valor} value={valor}>{texto}</option>)}
        </select>
      </div>

      {!visibles.length ? (
        <p className="empty-state">
          {items.length ? "No hay nada de este tipo por ahora." : "No tenés parciales ni trabajos prácticos programados en las materias que cursás."}
        </p>
      ) : (
        <ul className="list-clean">
          {visibles.map((i) => (
            <li key={i.clave} className="list-row">
              <div className="row-between">
                <span>
                  <strong>{i.materia.nombre}</strong> <span className="text-muted">({i.materia.codigo})</span>
                  {i.titulo && <> · {i.titulo}</>}
                  <br />
                  <span style={{ textTransform: "capitalize" }}>{diaSemana(i.fecha)}</span> {formatFecha(i.fecha)}
                  {i.hora
                    ? (i.tipo === "TRABAJO_PRACTICO" ? ` · entrega hasta las ${i.hora}` : ` · ${i.hora} hs`)
                    : (i.tipo === "TRABAJO_PRACTICO" ? " · entrega en el día" : " · horario a confirmar")}
                  {i.aula ? ` · ${i.aula.nombre}` : ""}
                  {i.descripcion && <small className="text-muted" style={{ display: "block" }}>{i.descripcion}</small>}
                </span>
                <span style={{ display: "grid", gap: "0.25rem", justifyItems: "end" }}>
                  <span className="badge" style={{ background: TIPO[i.tipo].color }}>{TIPO[i.tipo].nombre}</span>
                  <small className="text-muted">{cuantoFalta(i.fecha)}</small>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

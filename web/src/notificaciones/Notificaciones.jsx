import { useEffect, useState } from "react";
import { api } from "../api.js";

const ETIQUETA_TIPO = {
  AVISO_DOCENTE: "Aviso del docente",
  HORARIO_MODIFICADO: "Cambio de horario",
  CALIFICACION_PUBLICADA: "Calificación",
  FECHA_EXAMEN: "Examen",
  RECORDATORIO_ENTREGA: "Entrega",
  SOLICITUD_REVISION: "Solicitud de revisión",
  REVISION_RESUELTA: "Revisión de nota",
};

const POR_PAGINA = 20;

function formatFechaHora(fecha) {
  return new Date(fecha).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

// Historia: como alumno quiero ver un historial de todas mis notificaciones dentro del
// sistema, para revisar avisos anteriores que no leí a tiempo.
// `onCambioNoLeidas` le avisa a App cuántas quedan sin leer (el número del menú).
export default function Notificaciones({ onCambioNoLeidas }) {
  const [notificaciones, setNotificaciones] = useState(null);
  const [hayMas, setHayMas] = useState(false);
  const [noLeidas, setNoLeidas] = useState(0);
  const [soloNoLeidas, setSoloNoLeidas] = useState(false);
  const [error, setError] = useState(null);
  const [cargandoMas, setCargandoMas] = useState(false);

  function actualizarNoLeidas(cantidad) {
    setNoLeidas(cantidad);
    onCambioNoLeidas?.(cantidad);
  }

  function consulta(antesDeId) {
    const params = new URLSearchParams({ limite: String(POR_PAGINA) });
    if (soloNoLeidas) params.set("soloNoLeidas", "true");
    if (antesDeId) params.set("antesDeId", String(antesDeId));
    return api(`/notificaciones?${params}`);
  }

  useEffect(() => {
    setNotificaciones(null);
    setError(null);
    consulta()
      .then((data) => {
        setNotificaciones(data.notificaciones);
        setHayMas(data.hayMas);
        actualizarNoLeidas(data.noLeidas);
      })
      .catch((e) => setError(e.message));
  }, [soloNoLeidas]);

  async function verMas() {
    setCargandoMas(true);
    try {
      const data = await consulta(notificaciones[notificaciones.length - 1].id);
      setNotificaciones([...notificaciones, ...data.notificaciones]);
      setHayMas(data.hayMas);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargandoMas(false);
    }
  }

  async function marcarLeida(id) {
    try {
      const { leidaEn } = await api(`/notificaciones/${id}/leer`, { method: "POST" });
      setNotificaciones((lista) => lista.map((n) => (n.id === id ? { ...n, leida: true, leidaEn } : n)));
      actualizarNoLeidas(Math.max(0, noLeidas - 1));
    } catch (e) {
      setError(e.message);
    }
  }

  async function marcarTodas() {
    try {
      await api("/notificaciones/leer-todas", { method: "POST" });
      const ahora = new Date().toISOString();
      setNotificaciones((lista) => lista.map((n) => (n.leida ? n : { ...n, leida: true, leidaEn: ahora })));
      actualizarNoLeidas(0);
    } catch (e) {
      setError(e.message);
    }
  }

  if (error) return <p style={{ color: "#b00020" }}>No se pudieron cargar las notificaciones: {error}</p>;
  if (notificaciones === null) return <p>Cargando...</p>;

  return (
    <div style={{ fontFamily: "system-ui" }}>
      <h2>Notificaciones</h2>

      <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap", marginBottom: "1rem" }}>
        <label style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
          <input type="checkbox" checked={soloNoLeidas} onChange={(e) => setSoloNoLeidas(e.target.checked)} />
          Solo no leídas
        </label>
        <button onClick={marcarTodas} disabled={noLeidas === 0} style={{ cursor: "pointer" }}>
          Marcar todas como leídas{noLeidas > 0 ? ` (${noLeidas})` : ""}
        </button>
      </div>

      {notificaciones.length === 0 ? (
        <p>{soloNoLeidas ? "No tenés notificaciones sin leer." : "Todavía no tenés notificaciones."}</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.6rem" }}>
          {notificaciones.map((n) => (
            <li
              key={n.id}
              style={{
                padding: "0.75rem 1rem",
                borderRadius: "6px",
                background: n.leida ? "#fafafa" : "#eef5ff",
                borderLeft: `4px solid ${n.leida ? "#ddd" : "#164e83"}`,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap", fontSize: "0.85rem", color: "#475569" }}>
                <span>
                  {ETIQUETA_TIPO[n.tipo] ?? n.tipo}
                  {n.materia ? ` · ${n.materia.nombre}` : ""}
                  {n.autor ? ` · ${n.autor.nombre} ${n.autor.apellido}` : ""}
                </span>
                <span>{formatFechaHora(n.creadoEn)}</span>
              </div>
              <strong style={{ display: "block", marginTop: "0.25rem" }}>{n.titulo}</strong>
              <p style={{ margin: "0.25rem 0 0", whiteSpace: "pre-line" }}>{n.mensaje}</p>
              {!n.leida && (
                <button onClick={() => marcarLeida(n.id)} style={{ cursor: "pointer", marginTop: "0.5rem" }}>
                  Marcar como leída
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {hayMas && (
        <button onClick={verMas} disabled={cargandoMas} style={{ cursor: "pointer", marginTop: "1rem" }}>
          {cargandoMas ? "Cargando..." : "Ver más antiguas"}
        </button>
      )}
    </div>
  );
}

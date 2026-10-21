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
  PROPUESTA_PROGRAMA_RESUELTA: "Propuesta de programa",
};

const POR_PAGINA = 20;

function formatFechaHora(fecha) {
  return new Date(fecha).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

// Historias: ver el historial de notificaciones, marcarlas como leídas o no leídas, y abrir
// el enlace directo a la sección a la que se refiere cada una.
// `onCambioNoLeidas` le avisa a App cuántas quedan sin leer (el número de la campanita) y
// `onIrA(seccion)` lleva a otra pantalla (la de un aviso, o las preferencias).
export default function Notificaciones({ onCambioNoLeidas, onIrA }) {
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

  async function marcarNoLeida(id) {
    try {
      await api(`/notificaciones/${id}/no-leida`, { method: "POST" });
      setNotificaciones((lista) => lista.map((n) => (n.id === id ? { ...n, leida: false, leidaEn: null } : n)));
      actualizarNoLeidas(noLeidas + 1);
    } catch (e) {
      setError(e.message);
    }
  }

  // Seguir el enlace de un aviso también lo marca como leído: ya lo vio.
  async function abrir(n) {
    if (!n.leida) await marcarLeida(n.id);
    onIrA?.(n.enlace.seccion);
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

  if (error) return <p className="form-error">No se pudieron cargar las notificaciones: {error}</p>;
  if (notificaciones === null) return <p className="loading">Cargando...</p>;

  return (
    <div className="page">
      <div className="row-between" style={{ flexWrap: "wrap" }}>
        <h2 style={{ marginTop: 0 }}>Notificaciones</h2>
        {onIrA && <button onClick={() => onIrA("preferencias-notificaciones")}>Configurar notificaciones</button>}
      </div>

      <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap", marginBottom: "1rem" }}>
        <label style={{ display: "flex", gap: "0.4rem", alignItems: "center", fontWeight: 400 }}>
          <input type="checkbox" checked={soloNoLeidas} onChange={(e) => setSoloNoLeidas(e.target.checked)} style={{ width: "auto" }} />
          Solo no leídas
        </label>
        <button onClick={marcarTodas} disabled={noLeidas === 0}>
          Marcar todas como leídas{noLeidas > 0 ? ` (${noLeidas})` : ""}
        </button>
      </div>

      {notificaciones.length === 0 ? (
        <p className="empty-state">{soloNoLeidas ? "No tenés notificaciones sin leer." : "Todavía no tenés notificaciones."}</p>
      ) : (
        <ul className="list-clean" style={{ display: "grid", gap: "0.6rem" }}>
          {notificaciones.map((n) => (
            <li
              key={n.id}
              style={{
                padding: "0.75rem 1rem",
                borderRadius: "var(--radius-sm)",
                background: n.leida ? "var(--color-white)" : "var(--color-primary-soft)",
                border: "1px solid var(--color-border)",
                borderLeft: `4px solid ${n.leida ? "var(--color-border)" : "var(--color-primary)"}`,
              }}
            >
              <div className="text-muted row-between" style={{ gap: "0.5rem", flexWrap: "wrap", fontSize: "0.85rem" }}>
                <span>
                  {ETIQUETA_TIPO[n.tipo] ?? n.tipo}
                  {n.materia ? ` · ${n.materia.nombre}` : ""}
                  {n.autor ? ` · ${n.autor.nombre} ${n.autor.apellido}` : ""}
                </span>
                <span>{formatFechaHora(n.creadoEn)}</span>
              </div>
              <strong style={{ display: "block", marginTop: "0.25rem" }}>{n.titulo}</strong>
              <p style={{ margin: "0.25rem 0 0", whiteSpace: "pre-line" }}>{n.mensaje}</p>
              <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap", marginTop: "0.5rem" }}>
                {n.enlace && (
                  <a
                    href={`#${n.enlace.seccion}`}
                    onClick={(e) => {
                      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return; // abrir en otra pestaña sigue funcionando
                      e.preventDefault();
                      abrir(n);
                    }}
                  >
                    {n.enlace.texto}
                  </a>
                )}
                {n.leida
                  ? <button onClick={() => marcarNoLeida(n.id)}>Marcar como no leída</button>
                  : <button onClick={() => marcarLeida(n.id)}>Marcar como leída</button>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {hayMas && (
        <button onClick={verMas} disabled={cargandoMas} style={{ marginTop: "1rem" }}>
          {cargandoMas ? "Cargando..." : "Ver más antiguas"}
        </button>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { api } from "../api.js";
import { desuscribirEsteNavegador, soportaPush, suscribirEsteNavegador, suscripcionActual } from "./push.js";

// Historia: como alumno quiero configurar qué tipo de notificaciones deseo recibir y por qué medio
// (email, push), para evitar recibir información que no me interesa.

const TIPOS = {
  AVISO_DOCENTE: ["Avisos del docente", "Mensajes que tus docentes mandan a los alumnos de una materia."],
  HORARIO_MODIFICADO: ["Cambios de horario o aula", "Cuando cambia el horario o el aula de una comisión en la que estás inscripto."],
  CALIFICACION_PUBLICADA: ["Calificaciones", "Cuando se publica o se corrige una de tus notas."],
  FECHA_EXAMEN: ["Fechas de exámenes", "Cuando se programa, se reprograma o se cancela un parcial, recuperatorio o final."],
  RECORDATORIO_ENTREGA: ["Entrega de tareas", "Un recordatorio cuando se acerca la fecha de entrega de una tarea."],
  REVISION_RESUELTA: ["Respuesta a tus revisiones de nota", "Cuando el docente resuelve o rechaza una solicitud de revisión."],
  SOLICITUD_REVISION: ["Solicitudes de revisión", "Cuando un alumno pide la revisión de una nota de tus materias."],
};
const CANALES = [["SISTEMA", "En el sistema"], ["EMAIL", "Email"], ["PUSH", "Push"]];

export default function PreferenciasNotificaciones({ onVolver }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [guardando, setGuardando] = useState(null); // "tipo:canal" mientras se guarda
  const [esteNavegador, setEsteNavegador] = useState(null); // ¿este navegador está suscripto a push?

  function recargar() {
    return api("/notificaciones/preferencias").then(setDatos).catch((e) => setError(e.message));
  }

  useEffect(() => {
    recargar();
    suscripcionActual().then((s) => setEsteNavegador(Boolean(s))).catch(() => setEsteNavegador(false));
  }, []);

  async function ejecutar(clave, accion, textoExito) {
    setError(""); setAviso(""); setGuardando(clave);
    try {
      await accion();
      if (textoExito) setAviso(textoExito);
    } catch (e) {
      setError(e.message);
      await recargar(); // por si el cambio se hizo a medias (ej. se permitió el push pero no se pudo guardar)
    } finally {
      setGuardando(null);
    }
  }

  function cambiar(tipo, canal, activa) {
    return ejecutar(`${tipo}:${canal}`, async () => {
      // Activar el push sin ningún dispositivo registrado: primero se permite en este navegador.
      if (canal === "PUSH" && activa && datos.canales.PUSH.dispositivos === 0) {
        await suscribirEsteNavegador(datos.canales.PUSH.clavePublica);
        setEsteNavegador(true);
      }
      setDatos(await api("/notificaciones/preferencias", { method: "PUT", body: JSON.stringify({ preferencias: [{ tipo, canal, activa }] }) }));
    }, "Guardado.");
  }

  const permitirEnEsteNavegador = () => ejecutar("navegador", async () => {
    await suscribirEsteNavegador(datos.canales.PUSH.clavePublica);
    setEsteNavegador(true);
    await recargar();
  }, "Este navegador ya puede recibir avisos push.");

  const dejarEnEsteNavegador = () => ejecutar("navegador", async () => {
    await desuscribirEsteNavegador();
    setEsteNavegador(false);
    await recargar();
  }, "Este navegador dejó de recibir avisos push.");

  if (!datos) return error ? <p className="form-error">{error}</p> : <p className="loading">Cargando…</p>;

  const { EMAIL: email, PUSH: push } = datos.canales;
  const disponible = { SISTEMA: true, EMAIL: email.disponible, PUSH: push.disponible && soportaPush() };
  const sinMedios = (fila) => !Object.values(fila.canales).some(Boolean);

  return (
    <div className="page">
      <div className="row-between" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
        <h2 style={{ marginTop: 0 }}>Preferencias de notificaciones</h2>
        {onVolver && <button onClick={onVolver}>Volver a las notificaciones</button>}
      </div>
      <p className="text-muted">
        Elegí qué avisos querés recibir y por qué medio. Los cambios se guardan al tildar. Si destildás todos los medios de un aviso, no vas a recibirlo.
      </p>

      <div className="panel-soft" style={{ display: "grid", gap: "0.6rem", marginBottom: "1rem" }}>
        <div><strong>En el sistema:</strong> la campanita de arriba. Siempre disponible.</div>
        <div>
          <strong>Email:</strong>{" "}
          {email.disponible
            ? <>se envía a <strong>{email.destino}</strong>. Podés cambiar tu correo personal en «Mis datos».</>
            : <span className="text-muted">no disponible: este servidor no tiene configurado el envío de correo.</span>}
        </div>
        <div>
          <strong>Push:</strong>{" "}
          {!push.disponible ? <span className="text-muted">no disponible: este servidor no tiene configuradas las notificaciones push.</span>
            : !soportaPush() ? <span className="text-muted">tu navegador no admite notificaciones push.</span>
            : (
              <>
                avisos del navegador en tus dispositivos ({push.dispositivos} {push.dispositivos === 1 ? "registrado" : "registrados"}).{" "}
                {esteNavegador
                  ? <button onClick={dejarEnEsteNavegador} disabled={guardando === "navegador"}>Dejar de recibir en este navegador</button>
                  : <button onClick={permitirEnEsteNavegador} disabled={guardando === "navegador"}>Permitir en este navegador</button>}
              </>
            )}
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th scope="col">Aviso</th>
              {CANALES.map(([canal, etiqueta]) => <th key={canal} scope="col" style={{ textAlign: "center" }}>{etiqueta}</th>)}
            </tr>
          </thead>
          <tbody>
            {datos.tipos.map((fila) => {
              const [nombre, descripcion] = TIPOS[fila.tipo] ?? [fila.tipo, ""];
              return (
                <tr key={fila.tipo}>
                  <td>
                    <strong>{nombre}</strong>
                    <div className="text-muted" style={{ fontSize: "0.85rem" }}>{descripcion}</div>
                    {sinMedios(fila) && <div style={{ fontSize: "0.85rem", color: "var(--color-warning)" }}>No vas a recibir este aviso.</div>}
                  </td>
                  {CANALES.map(([canal, etiqueta]) => (
                    <td key={canal} style={{ textAlign: "center", verticalAlign: "middle" }}>
                      <input
                        type="checkbox"
                        style={{ width: "auto" }}
                        checked={fila.canales[canal]}
                        disabled={(!disponible[canal] && !fila.canales[canal]) || guardando !== null}
                        aria-label={`${nombre} por ${etiqueta.toLowerCase()}`}
                        onChange={(e) => cambiar(fila.tipo, canal, e.target.checked)}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {aviso && <p role="status" style={{ color: "var(--color-success)", margin: "0.75rem 0 0" }}>{aviso}</p>}
    </div>
  );
}

import { useEffect, useState } from "react";
import { api } from "../api.js";

// Historia: como alumno quiero inscribirme a una materia para poder cursar, seleccionando
// comisión si esta lo solicita. La API dice si puede (correlatividades, estado de la materia)
// y avisa qué comisiones se le superponen con lo que ya cursa.

const ETIQUETA_DIA = { LUNES: "Lunes", MARTES: "Martes", MIERCOLES: "Miércoles", JUEVES: "Jueves", VIERNES: "Viernes", SABADO: "Sábado" };
const NECESITA = { FUERTE: "aprobada", DEBIL: "regular o aprobada" };

const horario = (bloques) => (bloques.length
  ? bloques.map((b) => `${ETIQUETA_DIA[b.dia]} ${b.horaInicio}-${b.horaFin}${b.aula ? ` (${b.aula.nombre})` : ""}`).join(" · ")
  : "Sin horario cargado");

export default function InscribirseMateria({ materiaId, onInscripto }) {
  const [opciones, setOpciones] = useState(null);
  const [error, setError] = useState("");
  const [comisionId, setComisionId] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api(`/inscripciones-cursada/${materiaId}`)
      .then((datos) => {
        setOpciones(datos);
        // Si hay una sola comisión sin choque, queda elegida.
        const libres = datos.comisiones.filter((c) => !c.choque);
        if (datos.comisiones.length === 1 && libres.length === 1) setComisionId(String(libres[0].id));
      })
      .catch((e) => setError(e.message));
  }, [materiaId]);

  async function inscribirse(e) {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      const resultado = await api("/inscripciones-cursada", {
        method: "POST",
        body: JSON.stringify({ materiaId, comisionId: comisionId ? Number(comisionId) : null }),
      });
      onInscripto?.(resultado);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  if (!opciones) return error ? <p className="form-error">{error}</p> : <p className="loading">Cargando...</p>;

  return (
    <form onSubmit={inscribirse} style={{ display: "grid", gap: "0.75rem" }} aria-label={`Inscribirme a ${opciones.materia.nombre}`}>
      <strong>Inscripción a {opciones.materia.nombre}</strong>

      {opciones.requisitos.length > 0 && (
        <div>
          <span>Correlativas</span>
          <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.2rem" }}>
            {opciones.requisitos.map((r) => (
              <li key={r.materia.id} style={{ color: r.cumple ? "var(--color-success)" : "var(--color-danger)" }}>
                {r.cumple ? "✔" : "✖"} {r.materia.nombre} <span className="text-muted">— la necesitás {NECESITA[r.tipo]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!opciones.puedeInscribirse ? (
        <p className="form-error" style={{ margin: 0 }}>{opciones.motivo}</p>
      ) : (
        <>
          {opciones.requiereComision ? (
            <fieldset style={{ border: "none", padding: 0, margin: 0, display: "grid", gap: "0.4rem" }}>
              <legend style={{ marginBottom: "0.35rem" }}>Elegí la comisión con la que vas a cursar</legend>
              {opciones.comisiones.map((c) => (
                <label key={c.id} className="list-row" style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", opacity: c.choque ? 0.6 : 1, cursor: c.choque ? "not-allowed" : "pointer" }}>
                  <input type="radio" name={`comision-${materiaId}`} value={c.id} disabled={!!c.choque}
                    checked={comisionId === String(c.id)} onChange={(e) => setComisionId(e.target.value)} />
                  <span>
                    <strong>{c.nombre}</strong>
                    <small className="text-muted" style={{ display: "block" }}>{horario(c.bloques)}</small>
                    {c.choque && <small className="form-error" style={{ display: "block", margin: 0 }}>{c.choque}</small>}
                  </span>
                </label>
              ))}
            </fieldset>
          ) : (
            <p className="text-muted" style={{ margin: 0 }}>Esta materia no tiene comisiones: te inscribís directamente.</p>
          )}

          {error && <p className="form-error" style={{ margin: 0 }}>{error}</p>}
          <div>
            <button type="submit" className="btn" disabled={enviando || (opciones.requiereComision && !comisionId)}>
              {enviando ? "Inscribiendo..." : "Confirmar inscripción"}
            </button>
          </div>
        </>
      )}
    </form>
  );
}

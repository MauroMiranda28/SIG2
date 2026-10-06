import { useEffect, useState } from "react";
import { api } from "../api.js";
import "./docentes.css";

const LARGO_TITULO = 120;
const LARGO_MENSAJE = 1000;

// Historia: como docente quiero enviar notificaciones a mis alumnos sobre avisos de la materia,
// para comunicar cambios o información relevante de forma rápida.
// La API arma la lista de destinatarios (los alumnos de la materia) y solo deja avisar
// en las materias que el docente tiene asignadas.
export default function EnviarAviso() {
  const [materias, setMaterias] = useState(null);
  const [errorCarga, setErrorCarga] = useState("");
  const [materiaId, setMateriaId] = useState("");
  const [titulo, setTitulo] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState(null);

  function cargar() {
    setErrorCarga("");
    api("/docentes/mis-materias")
      .then((lista) => {
        setMaterias(lista);
        if (lista.length) setMateriaId(String(lista[0].id));
      })
      .catch((e) => setErrorCarga(e.message));
  }

  useEffect(cargar, []);

  async function enviar(e) {
    e.preventDefault();
    setEnviando(true);
    setError("");
    setResultado(null);
    try {
      const data = await api(`/docentes/materias/${materiaId}/avisos`, {
        method: "POST",
        body: JSON.stringify({ titulo, mensaje }),
      });
      setResultado(data);
      setTitulo("");
      setMensaje("");
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="docente">
      <h2>Enviar aviso</h2>
      <p>El aviso le llega como notificación a todos los alumnos de la materia.</p>

      {errorCarga ? (
        <div role="alert"><p>{errorCarga}</p><button onClick={cargar}>Reintentar</button></div>
      ) : materias === null ? (
        <p role="status">Cargando materias…</p>
      ) : !materias.length ? (
        <p>Todavía no tenés materias asignadas. Pedile a administración que te asigne las que dictás.</p>
      ) : (
        <form onSubmit={enviar} style={{ display: "grid", gap: "0.75rem", maxWidth: "32rem" }}>
          <label>
            Materia
            <select value={materiaId} onChange={(e) => setMateriaId(e.target.value)} style={{ display: "block", width: "100%", padding: "0.4rem" }}>
              {materias.map((m) => (
                <option key={m.id} value={m.id}>{m.nombre} ({m.codigo})</option>
              ))}
            </select>
          </label>

          <label>
            Título
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              maxLength={LARGO_TITULO}
              required
              style={{ display: "block", width: "100%", padding: "0.4rem", boxSizing: "border-box" }}
            />
          </label>

          <label>
            Mensaje
            <textarea
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              maxLength={LARGO_MENSAJE}
              rows={5}
              required
              style={{ display: "block", width: "100%", padding: "0.4rem", boxSizing: "border-box" }}
            />
            <small>{mensaje.length} / {LARGO_MENSAJE}</small>
          </label>

          {error && <p role="alert" style={{ color: "#b00020", margin: 0 }}>{error}</p>}
          {resultado && (
            <p role="status" style={{ color: "#2e7d32", margin: 0 }}>
              Aviso enviado a {resultado.enviadas} {resultado.enviadas === 1 ? "alumno" : "alumnos"} de {resultado.materia.nombre}.
            </p>
          )}

          <button type="submit" disabled={enviando} style={{ cursor: "pointer", justifySelf: "start" }}>
            {enviando ? "Enviando..." : "Enviar aviso"}
          </button>
        </form>
      )}
    </section>
  );
}

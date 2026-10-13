import { useEffect, useState } from "react";
import { api } from "../api.js";

// Historia: como alumno quiero simular cómo afectaría una nota futura a mi
// promedio final, para planificar mejor mi desempeño en las evaluaciones pendientes.
export default function SimularPromedio() {
  const [promedioActual, setPromedioActual] = useState(null);
  const [materiasPendientes, setMateriasPendientes] = useState(null);
  const [error, setError] = useState(null);

  const [materiaId, setMateriaId] = useState("");
  const [nota, setNota] = useState("");
  const [resultado, setResultado] = useState(null);
  const [errorSimulacion, setErrorSimulacion] = useState(null);
  const [simulando, setSimulando] = useState(false);

  useEffect(() => {
    api("/promedio")
      .then((data) => {
        setPromedioActual(data.promedioActual);
        setMateriasPendientes(data.materiasPendientes);
        if (data.materiasPendientes.length > 0) setMateriaId(String(data.materiasPendientes[0].id));
      })
      .catch((e) => setError(e.message));
  }, []);

  async function handleSimular(e) {
    e.preventDefault();
    setSimulando(true);
    setErrorSimulacion(null);
    setResultado(null);
    try {
      const data = await api("/promedio/simular", {
        method: "POST",
        body: JSON.stringify({ materiaId: Number(materiaId), nota: Number(nota) }),
      });
      setResultado(data);
    } catch (e) {
      setErrorSimulacion(e.message);
    } finally {
      setSimulando(false);
    }
  }

  if (error) {
    return <p className="form-error">No se pudo cargar tu promedio: {error}</p>;
  }

  if (materiasPendientes === null) {
    return <p className="loading">Cargando...</p>;
  }

  return (
    <div className="page" style={{ maxWidth: "30rem" }}>
      <h2>Simular promedio</h2>

      <p>
        Promedio actual:{" "}
        <strong>{promedioActual !== null ? promedioActual : "todavía no tenés materias aprobadas"}</strong>
      </p>

      {materiasPendientes.length === 0 ? (
        <p className="empty-state">No te quedan materias pendientes de tu plan para simular.</p>
      ) : (
        <form onSubmit={handleSimular} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <label className="field">
            Materia
            <select value={materiaId} onChange={(e) => setMateriaId(e.target.value)}>
              {materiasPendientes.map((materia) => (
                <option key={materia.id} value={materia.id}>
                  {materia.nombre} ({materia.codigo})
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            Nota hipotética (0 a 10)
            <input type="number" min="0" max="10" step="0.01" value={nota} onChange={(e) => setNota(e.target.value)} required />
          </label>

          {errorSimulacion && <p className="form-error">{errorSimulacion}</p>}

          <button type="submit" className="btn" disabled={simulando} style={{ alignSelf: "flex-start" }}>
            {simulando ? "Simulando..." : "Simular"}
          </button>
        </form>
      )}

      {resultado && (
        <div className="panel-soft" style={{ marginTop: "1.5rem" }}>
          <p style={{ margin: "0 0 0.5rem 0" }}>
            Si aprobás <strong>{resultado.materia.nombre}</strong> con nota <strong>{resultado.notaSimulada}</strong>:
          </p>
          <p style={{ margin: 0 }}>
            Promedio actual: <strong>{resultado.promedioActual ?? "-"}</strong>
            {" → "}
            Promedio simulado: <strong>{resultado.promedioSimulado}</strong>
            {resultado.diferencia !== null && (
              <span style={{ color: resultado.diferencia >= 0 ? "var(--color-success)" : "var(--color-danger)" }}>
                {" "}({resultado.diferencia >= 0 ? "+" : ""}{resultado.diferencia})
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

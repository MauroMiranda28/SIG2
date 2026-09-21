import { useState } from "react";
import { api } from "../api.js";

// U-02: el usuario edita sus propios datos personales.
export default function MisDatos({ usuario, onActualizado }) {
  const [nombre, setNombre] = useState(usuario.nombre);
  const [apellido, setApellido] = useState(usuario.apellido);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setGuardando(true);
    setMensaje(null);
    setError(null);
    try {
      const actualizado = await api("/auth/perfil", {
        method: "PATCH",
        body: JSON.stringify({ nombre, apellido }),
      });
      onActualizado(actualizado);
      setMensaje("Tus datos fueron actualizados.");
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div style={{ fontFamily: "system-ui", maxWidth: "30rem" }}>
      <h2>Mis datos personales</h2>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <label>
          Nombre
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
            style={{ display: "block", width: "100%", padding: "0.4rem" }}
          />
        </label>
        <label>
          Apellido
          <input
            value={apellido}
            onChange={(e) => setApellido(e.target.value)}
            required
            style={{ display: "block", width: "100%", padding: "0.4rem" }}
          />
        </label>

        {error && <p style={{ color: "#b00020", margin: 0 }}>{error}</p>}
        {mensaje && <p style={{ color: "#2e7d32", margin: 0 }}>{mensaje}</p>}

        <button type="submit" disabled={guardando} style={{ cursor: "pointer", alignSelf: "flex-start" }}>
          {guardando ? "Guardando..." : "Guardar cambios"}
        </button>
      </form>
    </div>
  );
}

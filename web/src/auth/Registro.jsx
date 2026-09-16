import { useState } from "react";
import { api } from "../api.js";

export default function Registro({ onRegistrado, onIrALogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await api("/auth/registro", {
        method: "POST",
        body: JSON.stringify({ email, password, nombre, apellido }),
      });
      onRegistrado();
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ fontFamily: "system-ui", maxWidth: "24rem", margin: "3rem auto" }}>
      <h1>Crear cuenta</h1>
      <form onSubmit={enviar} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <label>
          Nombre
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
            style={{ display: "block", width: "100%", padding: "0.5rem" }}
          />
        </label>
        <label>
          Apellido
          <input
            value={apellido}
            onChange={(e) => setApellido(e.target.value)}
            required
            style={{ display: "block", width: "100%", padding: "0.5rem" }}
          />
        </label>
        <label>
          Correo institucional
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ display: "block", width: "100%", padding: "0.5rem" }}
          />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ display: "block", width: "100%", padding: "0.5rem" }}
          />
        </label>

        {error && <p style={{ color: "#b00020", margin: 0 }}>{error}</p>}

        <button type="submit" disabled={enviando} style={{ padding: "0.5rem", cursor: "pointer" }}>
          {enviando ? "Creando..." : "Crear cuenta"}
        </button>
      </form>

      <p style={{ marginTop: "1rem" }}>
        ¿Ya tenés cuenta?{" "}
        <button onClick={onIrALogin} style={{ cursor: "pointer" }}>
          Iniciá sesión
        </button>
      </p>
    </div>
  );
}

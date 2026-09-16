import { useState } from "react";
import { api, guardarToken } from "../api.js";

export default function Login({ onLogin, onIrARegistro }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const data = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      guardarToken(data.token);
      onLogin(data.usuario);
    } catch (e) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ fontFamily: "system-ui", maxWidth: "24rem", margin: "3rem auto" }}>
      <h1>Iniciar sesión</h1>
      <form onSubmit={enviar} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
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
          {enviando ? "Entrando..." : "Entrar"}
        </button>
      </form>

      <p style={{ marginTop: "1rem" }}>
        ¿No tenés cuenta?{" "}
        <button onClick={onIrARegistro} style={{ cursor: "pointer" }}>
          Registrate
        </button>
      </p>
    </div>
  );
}

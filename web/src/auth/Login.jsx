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
    <div className="auth-shell">
      <div className="auth-card">
        <img src="/logo-ucse.png" alt="UCSE" className="auth-card__logo" />
        <h1>Iniciar sesión</h1>
        <form onSubmit={enviar}>
          <label className="field">
            Correo institucional
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="field">
            Contraseña
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>

          {error && <p className="form-error">{error}</p>}

          <button type="submit" disabled={enviando} className="btn">
            {enviando ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <p className="auth-card__footer">
          ¿No tenés cuenta? <button onClick={onIrARegistro}>Registrate</button>
        </p>
      </div>
    </div>
  );
}

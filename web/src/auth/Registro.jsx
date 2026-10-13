import { useState } from "react";
import { api } from "../api.js";

export default function Registro({ onRegistrado, onIrALogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [dni, setDni] = useState("");
  const [telefono, setTelefono] = useState("");
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  // Los docentes usan @ucse.edu.ar (los alumnos, @alumnos.ucse.edu.ar)
  const esDocente = email.trim().toLowerCase().endsWith("@ucse.edu.ar");

  async function enviar(e) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await api("/auth/registro", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          nombre,
          apellido,
          ...(esDocente && { dni, telefono }),
        }),
      });
      onRegistrado();
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
        <h1>Crear cuenta</h1>
        <form onSubmit={enviar}>
          <label className="field">
            Nombre
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          </label>
          <label className="field">
            Apellido
            <input value={apellido} onChange={(e) => setApellido(e.target.value)} required />
          </label>
          <label className="field">
            Correo institucional
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>

          {esDocente && (
            <>
              <label className="field">
                DNI (sin puntos)
                <input
                  value={dni}
                  onChange={(e) => setDni(e.target.value)}
                  required
                  inputMode="numeric"
                  pattern="\d{7,8}"
                  title="7 u 8 dígitos, sin puntos"
                />
              </label>
              <label className="field">
                Teléfono
                <input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} required />
              </label>
            </>
          )}

          <label className="field">
            Contraseña
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>

          {error && <p className="form-error">{error}</p>}

          <button type="submit" disabled={enviando} className="btn">
            {enviando ? "Creando..." : "Crear cuenta"}
          </button>
        </form>

        <p className="auth-card__footer">
          ¿Ya tenés cuenta? <button onClick={onIrALogin}>Iniciá sesión</button>
        </p>
      </div>
    </div>
  );
}
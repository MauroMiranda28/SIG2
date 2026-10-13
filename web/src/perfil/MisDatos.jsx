import { useEffect, useState } from "react";
import { api } from "../api.js";

// U-02: el usuario edita sus propios datos personales y de contacto.
export default function MisDatos({ usuario, onActualizado }) {
  const [cargando, setCargando] = useState(true);
  const [email, setEmail] = useState("");
  const [dni, setDni] = useState("");
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [telefono, setTelefono] = useState("");
  const [emailPersonal, setEmailPersonal] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const [error, setError] = useState(null);

  const esDocente = usuario.rol === "DOCENTE";

  // Traemos los datos completos: después del login solo tenemos id, nombre y rol
  useEffect(() => {
    api("/auth/perfil")
      .then((datos) => {
        setEmail(datos.email ?? "");
        setDni(datos.dni ?? "");
        setNombre(datos.nombre ?? "");
        setApellido(datos.apellido ?? "");
        setTelefono(datos.telefono ?? "");
        setEmailPersonal(datos.emailPersonal ?? "");
      })
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setGuardando(true);
    setMensaje(null);
    setError(null);
    try {
      const actualizado = await api("/auth/perfil", {
        method: "PATCH",
        body: JSON.stringify({ nombre, apellido, telefono, emailPersonal }),
      });
      onActualizado(actualizado);
      setMensaje("Tus datos fueron actualizados.");
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) return <p className="loading">Cargando...</p>;

  return (
    <div className="page" style={{ maxWidth: "30rem" }}>
      <h2>Mis datos personales</h2>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <label className="field">
          Correo institucional
          <input value={email} disabled />
        </label>
        {dni && (
          <label className="field">
            DNI
            <input value={dni} disabled />
          </label>
        )}
        <label className="field">
          Nombre
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        </label>
        <label className="field">
          Apellido
          <input value={apellido} onChange={(e) => setApellido(e.target.value)} required />
        </label>
        <label className="field">
          Teléfono{esDocente ? "" : " (opcional)"}
          <input type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} required={esDocente} />
        </label>
        <label className="field">
          Correo personal (opcional)
          <input type="email" value={emailPersonal} onChange={(e) => setEmailPersonal(e.target.value)} />
        </label>

        {error && <p className="form-error">{error}</p>}
        {mensaje && <p style={{ color: "var(--color-success)", margin: 0 }}>{mensaje}</p>}

        <button type="submit" className="btn" disabled={guardando} style={{ alignSelf: "flex-start" }}>
          {guardando ? "Guardando..." : "Guardar cambios"}
        </button>
      </form>
    </div>
  );
}
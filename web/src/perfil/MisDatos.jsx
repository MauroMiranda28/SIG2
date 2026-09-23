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

  if (cargando) return <p style={{ fontFamily: "system-ui" }}>Cargando...</p>;

  const campo = { display: "block", width: "100%", padding: "0.4rem" };

  return (
    <div style={{ fontFamily: "system-ui", maxWidth: "30rem" }}>
      <h2>Mis datos personales</h2>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <label>
          Correo institucional
          <input value={email} disabled style={campo} />
        </label>
        {dni && (
          <label>
            DNI
            <input value={dni} disabled style={campo} />
          </label>
        )}
        <label>
          Nombre
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} required style={campo} />
        </label>
        <label>
          Apellido
          <input value={apellido} onChange={(e) => setApellido(e.target.value)} required style={campo} />
        </label>
        <label>
          Teléfono{esDocente ? "" : " (opcional)"}
          <input
            type="tel"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            required={esDocente}
            style={campo}
          />
        </label>
        <label>
          Correo personal (opcional)
          <input
            type="email"
            value={emailPersonal}
            onChange={(e) => setEmailPersonal(e.target.value)}
            style={campo}
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
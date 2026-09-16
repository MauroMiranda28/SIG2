import { useEffect, useState } from "react";
import { api, leerToken, borrarToken } from "./api.js";
import Login from "./auth/Login.jsx";
import Registro from "./auth/Registro.jsx";
import MateriasCarrera from "./materias/MateriasCarrera.jsx";
import GrillaSemanal from "./horarios/GrillaSemanal.jsx";

export default function App() {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [vista, setVista] = useState("login");
  const [tab, setTab] = useState("materias");

  useEffect(() => {
    if (!leerToken()) {
      setCargando(false);
      return;
    }
    api("/auth/perfil")
      .then(setUsuario)
      .catch(() => borrarToken())
      .finally(() => setCargando(false));
  }, []);

  function cerrarSesion() {
    borrarToken();
    setUsuario(null);
    setVista("login");
  }

  if (cargando) return null;

  if (!usuario) {
    return vista === "login" ? (
      <Login onLogin={setUsuario} onIrARegistro={() => setVista("registro")} />
    ) : (
      <Registro onRegistrado={() => setVista("login")} onIrALogin={() => setVista("login")} />
    );
  }

  return (
    <div style={{ fontFamily: "system-ui", maxWidth: "40rem", margin: "0 auto", padding: "1.5rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>
          Hola, <strong>{usuario.nombre}</strong>
        </span>
        <button onClick={cerrarSesion} style={{ cursor: "pointer" }}>
          Cerrar sesión
        </button>
      </header>

      <hr style={{ margin: "1rem 0" }} />

      <nav style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
        <button onClick={() => setTab("materias")} disabled={tab === "materias"} style={{ cursor: "pointer" }}>
          Materias
        </button>
        <button onClick={() => setTab("horario")} disabled={tab === "horario"} style={{ cursor: "pointer" }}>
          Mi horario
        </button>
      </nav>

      {tab === "materias" ? <MateriasCarrera /> : <GrillaSemanal />}
    </div>
  );
}

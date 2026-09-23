import { useEffect, useState } from "react";
import { api, leerToken, borrarToken } from "./api.js";
import Login from "./auth/Login.jsx";
import Registro from "./auth/Registro.jsx";
import MateriasCarrera from "./materias/MateriasCarrera.jsx";
import GrillaSemanal from "./horarios/GrillaSemanal.jsx";
import MisDatos from "./perfil/MisDatos.jsx";
import MisNotas from "./notas/MisNotas.jsx";

import CrearPlan from "./planes/CrearPlan.jsx";
import MiPlan from "./planes/MiPlan.jsx";
import Carreras from "./carreras/Carreras.jsx";

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
    setTab("materias");
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

      <nav style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <button onClick={() => setTab("materias")} disabled={tab === "materias"} style={{ cursor: "pointer" }}>
          Materias
        </button>
        <button onClick={() => setTab("horario")} disabled={tab === "horario"} style={{ cursor: "pointer" }}>
          Mi horario
        </button>
        {usuario.rol === "ADMIN" && <button onClick={() => setTab("carreras")} disabled={tab === "carreras"}>Carreras</button>}
        {usuario.rol === "ADMIN" && <button onClick={() => setTab("crear-plan")} disabled={tab === "crear-plan"}>Crear plan</button>}
        {usuario.rol === "ALUMNO" && <button onClick={() => setTab("mi-plan")} disabled={tab === "mi-plan"}>Mi plan de estudios</button>}
        {usuario.rol === "ALUMNO" && <button onClick={() => setTab("notas")} disabled={tab === "notas"}>Mis notas</button>}
        <button onClick={() => setTab("mis-datos")} disabled={tab === "mis-datos"} style={{ cursor: "pointer" }}>
          Mis datos
        </button>
      </nav>

      {tab === "materias" && <MateriasCarrera />}
      {tab === "horario" && <GrillaSemanal />}
      {tab === "carreras" && usuario.rol === "ADMIN" && <Carreras />}
      {tab === "crear-plan" && usuario.rol === "ADMIN" && <CrearPlan />}
      {tab === "mi-plan" && usuario.rol === "ALUMNO" && <MiPlan />}
      {tab === "notas" && usuario.rol === "ALUMNO" && <MisNotas />}
      {tab === "mis-datos" && <MisDatos usuario={usuario} onActualizado={(datos) => setUsuario({ ...usuario, ...datos })} />}
    </div>
  );
}

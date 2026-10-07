import { useEffect, useState } from "react";
import { api, leerToken, borrarToken } from "./api.js";
import Login from "./auth/Login.jsx";
import Registro from "./auth/Registro.jsx";
import MateriasCarrera from "./materias/MateriasCarrera.jsx";
import Bibliografia from "./materias/Bibliografia.jsx";
import Correlatividades from "./correlatividades/Correlatividades.jsx";
import CargarCorrelatividades from "./correlatividades/CargarCorrelatividades.jsx";
import GrillaSemanal from "./horarios/GrillaSemanal.jsx";
import MisDatos from "./perfil/MisDatos.jsx";
import MisNotas from "./notas/MisNotas.jsx";
import HistorialNotas from "./evaluaciones/HistorialNotas.jsx";
import MiAsistencia from "./asistencia/MiAsistencia.jsx";
import SimularPromedio from "./promedio/SimularPromedio.jsx";
import Notificaciones from "./notificaciones/Notificaciones.jsx";

import CrearPlan from "./planes/CrearPlan.jsx";
import MiPlan from "./planes/MiPlan.jsx";
import Carreras from "./carreras/Carreras.jsx";
import MisMaterias from "./docentes/MisMaterias.jsx";
import ConsultaMaterias from "./docentes/ConsultaMaterias.jsx";
import NotasDocente from "./docentes/NotasDocente.jsx";
import EnviarAviso from "./docentes/EnviarAviso.jsx";
import FechasExamen from "./docentes/FechasExamen.jsx";
import Tareas from "./docentes/Tareas.jsx";

import MiCarrera from "./carreras/MiCarrera.jsx";
import CargarPrograma from "./programas/CargarPrograma.jsx";

// «Materias» y «Mi horario» son del alumno; el docente arranca en «Mis materias».
const tabInicial = (rol) => (rol === "DOCENTE" ? "mis-materias" : "materias");

function Campana({ noLeidas, activa, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label={noLeidas > 0 ? `Notificaciones (${noLeidas} sin leer)` : "Notificaciones"}
      title="Notificaciones"
      style={{
        position: "relative", cursor: "pointer", display: "inline-flex", alignItems: "center", padding: "0.3rem 0.5rem",
        background: activa ? "#e2ebf5" : undefined,
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.7 21a2 2 0 0 1-3.4 0" />
      </svg>
      {noLeidas > 0 && (
        <span
          style={{
            position: "absolute", top: "-6px", right: "-6px", minWidth: "1.1rem", height: "1.1rem", padding: "0 0.2rem", boxSizing: "border-box",
            borderRadius: "999px", background: "#b00020", color: "#fff", fontSize: "0.7rem", lineHeight: "1.1rem", textAlign: "center", fontWeight: 700,
          }}
        >
          {noLeidas > 99 ? "99+" : noLeidas}
        </span>
      )}
    </button>
  );
}

export default function App() {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [vista, setVista] = useState("login");
  const [tab, setTab] = useState("materias");
  const [noLeidas, setNoLeidas] = useState(0);

  function iniciarSesion(datos) {
    setUsuario(datos);
    setTab(tabInicial(datos.rol));
  }

  useEffect(() => {
    if (!leerToken()) {
      setCargando(false);
      return;
    }
    api("/auth/perfil")
      .then(iniciarSesion)
      .catch(() => borrarToken())
      .finally(() => setCargando(false));
  }, []);

  // El número de notificaciones sin leer del menú (solo alumnos).
  useEffect(() => {
    if (usuario?.rol !== "ALUMNO") return;
    api("/notificaciones?limite=1&soloNoLeidas=true").then((d) => setNoLeidas(d.noLeidas)).catch(() => {});
  }, [usuario]);

  function cerrarSesion() {
    borrarToken();
    setNoLeidas(0);
    setUsuario(null);
    setVista("login");
    setTab("materias");
  }

  if (cargando) return null;

  if (!usuario) {
    return vista === "login" ? (
      <Login onLogin={iniciarSesion} onIrARegistro={() => setVista("registro")} />
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
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {usuario.rol === "ALUMNO" && <Campana noLeidas={noLeidas} activa={tab === "notificaciones"} onClick={() => setTab("notificaciones")} />}
          <button onClick={cerrarSesion} style={{ cursor: "pointer" }}>
            Cerrar sesión
          </button>
        </div>
      </header>

      <hr style={{ margin: "1rem 0" }} />

      <nav style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        {usuario.rol !== "DOCENTE" && (
          <button onClick={() => setTab("materias")} disabled={tab === "materias"} style={{ cursor: "pointer" }}>
            Materias
          </button>
        )}
        {usuario.rol !== "DOCENTE" && (
          <button onClick={() => setTab("horario")} disabled={tab === "horario"} style={{ cursor: "pointer" }}>
            Mi horario
          </button>
        )}
        {usuario.rol === "DOCENTE" && <button onClick={() => setTab("mis-materias")} disabled={tab === "mis-materias"}>Mis materias</button>}
        {usuario.rol === "DOCENTE" && <button onClick={() => setTab("consultar-materias")} disabled={tab === "consultar-materias"}>Consultar materias</button>}
        {usuario.rol === "DOCENTE" && <button onClick={() => setTab("notas-docente")} disabled={tab === "notas-docente"}>Notas</button>}
        {usuario.rol === "DOCENTE" && <button onClick={() => setTab("enviar-aviso")} disabled={tab === "enviar-aviso"}>Enviar aviso</button>}
        {usuario.rol === "DOCENTE" && <button onClick={() => setTab("fechas-examen")} disabled={tab === "fechas-examen"}>Fechas de examen</button>}
        {usuario.rol === "DOCENTE" && <button onClick={() => setTab("tareas")} disabled={tab === "tareas"}>Tareas</button>}
        {usuario.rol === "ADMIN" && <button onClick={() => setTab("carreras")} disabled={tab === "carreras"}>Carreras</button>}
        {usuario.rol === "ADMIN" && <button onClick={() => setTab("crear-plan")} disabled={tab === "crear-plan"}>Crear plan</button>}
        {usuario.rol === "ADMIN" && <button onClick={() => setTab("correlatividades-admin")} disabled={tab === "correlatividades-admin"}>Correlatividades</button>}
        {usuario.rol === "ALUMNO" && <button onClick={() => setTab("mi-plan")} disabled={tab === "mi-plan"}>Mi plan de estudios</button>}
        {usuario.rol === "ALUMNO" && <button onClick={() => setTab("bibliografia")} disabled={tab === "bibliografia"}>Bibliografía</button>}
        {usuario.rol === "ALUMNO" && <button onClick={() => setTab("correlatividades")} disabled={tab === "correlatividades"}>Correlatividades</button>}
        {usuario.rol === "ALUMNO" && <button onClick={() => setTab("notas")} disabled={tab === "notas"}>Mis notas</button>}
        {usuario.rol === "ALUMNO" && <button onClick={() => setTab("historial-notas")} disabled={tab === "historial-notas"}>Historial de notas</button>}
        {usuario.rol === "ALUMNO" && <button onClick={() => setTab("asistencia")} disabled={tab === "asistencia"}>Mi asistencia</button>}
        {usuario.rol === "ALUMNO" && <button onClick={() => setTab("simular-promedio")} disabled={tab === "simular-promedio"}>Simular promedio</button>}
        <button onClick={() => setTab("mis-datos")} disabled={tab === "mis-datos"} style={{ cursor: "pointer" }}>
          Mis datos
        </button>
        {usuario.rol === "ADMIN" && <button onClick={() => setTab("cargar-programa")} disabled={tab === "cargar-programa"}>Cargar programa</button>}
        {usuario.rol === "ALUMNO" && <button onClick={() => setTab("mi-carrera")} disabled={tab === "mi-carrera"}>Mi carrera</button>}
      </nav>

      {tab === "materias" && usuario.rol !== "DOCENTE" && <MateriasCarrera />}
      {tab === "horario" && usuario.rol !== "DOCENTE" && <GrillaSemanal />}
      {tab === "mis-materias" && usuario.rol === "DOCENTE" && <MisMaterias />}
      {tab === "consultar-materias" && usuario.rol === "DOCENTE" && <ConsultaMaterias />}
      {tab === "notas-docente" && usuario.rol === "DOCENTE" && <NotasDocente />}
      {tab === "enviar-aviso" && usuario.rol === "DOCENTE" && <EnviarAviso />}
      {tab === "fechas-examen" && usuario.rol === "DOCENTE" && <FechasExamen />}
      {tab === "tareas" && usuario.rol === "DOCENTE" && <Tareas />}
      {tab === "carreras" && usuario.rol === "ADMIN" && <Carreras />}
      {tab === "crear-plan" && usuario.rol === "ADMIN" && <CrearPlan />}
      {tab === "correlatividades-admin" && usuario.rol === "ADMIN" && <CargarCorrelatividades />}
      {tab === "mi-plan" && usuario.rol === "ALUMNO" && <MiPlan />}
      {tab === "bibliografia" && usuario.rol === "ALUMNO" && <Bibliografia />}
      {tab === "correlatividades" && usuario.rol === "ALUMNO" && <Correlatividades />}
      {tab === "notas" && usuario.rol === "ALUMNO" && <MisNotas />}
      {tab === "historial-notas" && usuario.rol === "ALUMNO" && <HistorialNotas />}
      {tab === "asistencia" && usuario.rol === "ALUMNO" && <MiAsistencia />}
      {tab === "simular-promedio" && usuario.rol === "ALUMNO" && <SimularPromedio />}
      {tab === "notificaciones" && usuario.rol === "ALUMNO" && <Notificaciones onCambioNoLeidas={setNoLeidas} />}
      {tab === "cargar-programa" && usuario.rol === "ADMIN" && <CargarPrograma />}
      {tab === "mi-carrera" && usuario.rol === "ALUMNO" && <MiCarrera />}
      {tab === "mis-datos" && <MisDatos usuario={usuario} onActualizado={(datos) => setUsuario({ ...usuario, ...datos })} />}
    </div>
  );
}

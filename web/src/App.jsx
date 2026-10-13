import { useEffect, useState } from "react";
import { api, leerToken, borrarToken } from "./api.js";
import Login from "./auth/Login.jsx";
import Registro from "./auth/Registro.jsx";
import MateriasCarrera from "./materias/MateriasCarrera.jsx";
import Bibliografia from "./materias/Bibliografia.jsx";
import Correlatividades from "./correlatividades/Correlatividades.jsx";
import CargarCorrelatividades from "./correlatividades/CargarCorrelatividades.jsx";
import AgendaSemanal from "./horarios/AgendaSemanal.jsx";
import MisDatos from "./perfil/MisDatos.jsx";
import MisNotas from "./notas/MisNotas.jsx";
import HistorialNotas from "./evaluaciones/HistorialNotas.jsx";
import MiAsistencia from "./asistencia/MiAsistencia.jsx";
import SimularPromedio from "./promedio/SimularPromedio.jsx";
import Notificaciones from "./notificaciones/Notificaciones.jsx";
import ActividadesPersonales from "./actividades/ActividadesPersonales.jsx";

import CrearPlan from "./planes/CrearPlan.jsx";
import MiPlan from "./planes/MiPlan.jsx";
import Carreras from "./carreras/Carreras.jsx";
import MisMaterias from "./docentes/MisMaterias.jsx";
import ConsultaMaterias from "./docentes/ConsultaMaterias.jsx";
import NotasDocente from "./docentes/NotasDocente.jsx";
import EnviarAviso from "./docentes/EnviarAviso.jsx";
import FechasExamen from "./docentes/FechasExamen.jsx";
import Tareas from "./docentes/Tareas.jsx";
import Revisiones from "./docentes/Revisiones.jsx";

import MiCarrera from "./carreras/MiCarrera.jsx";
import ActualizarPrograma from "./programas/ActualizarPrograma.jsx";
import CargarPrograma from "./programas/CargarPrograma.jsx";

// «Materias» y «Mi horario» son del alumno; el docente arranca en «Mis materias».
const tabInicial = (rol) => (rol === "DOCENTE" ? "mis-materias" : "materias");

// El alumno recibe avisos de sus materias y el docente, las solicitudes de revisión de sus alumnos.
const tieneNotificaciones = (rol) => rol === "ALUMNO" || rol === "DOCENTE";

function Campana({ noLeidas, activa, onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label={noLeidas > 0 ? `Notificaciones (${noLeidas} sin leer)` : "Notificaciones"}
      title="Notificaciones"
      className={`bell-btn${activa ? " bell-btn--active" : ""}`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.7 21a2 2 0 0 1-3.4 0" />
      </svg>
      {noLeidas > 0 && <span className="bell-btn__badge">{noLeidas > 99 ? "99+" : noLeidas}</span>}
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

  // El número de notificaciones sin leer de la campanita (alumnos y docentes).
  useEffect(() => {
    if (!tieneNotificaciones(usuario?.rol)) return;
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
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__brand">
          <img src="/logo-ucse.png" alt="UCSE" className="app-header__logo" />
          <div className="app-header__title">
            <strong>Sistema Académico</strong>
            <span>Universidad Católica de Santiago del Estero</span>
          </div>
        </div>
        <div className="app-header__user">
          <span>
            Hola, <strong>{usuario.nombre}</strong>
          </span>
          {tieneNotificaciones(usuario.rol) && <Campana noLeidas={noLeidas} activa={tab === "notificaciones"} onClick={() => setTab("notificaciones")} />}
          <button onClick={cerrarSesion} className="btn btn-secondary">
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="app-main">
        <nav className="app-nav">
          {usuario.rol !== "DOCENTE" && (
            <button className="nav-btn" onClick={() => setTab("materias")} disabled={tab === "materias"}>
              Materias
            </button>
          )}
          {usuario.rol === "ALUMNO" && (
            <button className="nav-btn" onClick={() => setTab("horario")} disabled={tab === "horario"}>
              Mi horario
            </button>
          )}
          {usuario.rol === "DOCENTE" && <button className="nav-btn" onClick={() => setTab("mis-materias")} disabled={tab === "mis-materias"}>Mis materias</button>}
          {usuario.rol === "DOCENTE" && <button className="nav-btn" onClick={() => setTab("consultar-materias")} disabled={tab === "consultar-materias"}>Consultar materias</button>}
          {usuario.rol === "DOCENTE" && <button className="nav-btn" onClick={() => setTab("notas-docente")} disabled={tab === "notas-docente"}>Notas</button>}
          {usuario.rol === "DOCENTE" && <button className="nav-btn" onClick={() => setTab("revisiones")} disabled={tab === "revisiones"}>Revisiones</button>}
          {usuario.rol === "DOCENTE" && <button className="nav-btn" onClick={() => setTab("enviar-aviso")} disabled={tab === "enviar-aviso"}>Enviar aviso</button>}
          {usuario.rol === "DOCENTE" && <button className="nav-btn" onClick={() => setTab("fechas-examen")} disabled={tab === "fechas-examen"}>Fechas de examen</button>}
          {usuario.rol === "DOCENTE" && <button className="nav-btn" onClick={() => setTab("tareas")} disabled={tab === "tareas"}>Tareas</button>}
          {usuario.rol === "ADMIN" && <button className="nav-btn" onClick={() => setTab("carreras")} disabled={tab === "carreras"}>Carreras</button>}
          {usuario.rol === "ADMIN" && <button className="nav-btn" onClick={() => setTab("crear-plan")} disabled={tab === "crear-plan"}>Crear plan</button>}
          {usuario.rol === "ADMIN" && <button className="nav-btn" onClick={() => setTab("correlatividades-admin")} disabled={tab === "correlatividades-admin"}>Correlatividades</button>}
          {usuario.rol === "ALUMNO" && <button className="nav-btn" onClick={() => setTab("mi-plan")} disabled={tab === "mi-plan"}>Mi plan de estudios</button>}
          {usuario.rol === "ALUMNO" && <button className="nav-btn" onClick={() => setTab("bibliografia")} disabled={tab === "bibliografia"}>Bibliografía</button>}
          {usuario.rol === "ALUMNO" && <button className="nav-btn" onClick={() => setTab("correlatividades")} disabled={tab === "correlatividades"}>Correlatividades</button>}
          {usuario.rol === "ALUMNO" && <button className="nav-btn" onClick={() => setTab("notas")} disabled={tab === "notas"}>Mis notas</button>}
          {usuario.rol === "ALUMNO" && <button className="nav-btn" onClick={() => setTab("historial-notas")} disabled={tab === "historial-notas"}>Historial de notas</button>}
          {usuario.rol === "ALUMNO" && <button className="nav-btn" onClick={() => setTab("asistencia")} disabled={tab === "asistencia"}>Mi asistencia</button>}
          {usuario.rol === "ALUMNO" && <button className="nav-btn" onClick={() => setTab("actividades-personales")} disabled={tab === "actividades-personales"}>Actividades personales</button>}
          {usuario.rol === "ALUMNO" && <button className="nav-btn" onClick={() => setTab("simular-promedio")} disabled={tab === "simular-promedio"}>Simular promedio</button>}
          <button className="nav-btn" onClick={() => setTab("mis-datos")} disabled={tab === "mis-datos"}>
            Mis datos
          </button>
          {usuario.rol === "ADMIN" && <button className="nav-btn" onClick={() => setTab("cargar-programa")} disabled={tab === "cargar-programa"}>Cargar programa</button>}
          {usuario.rol === "ALUMNO" && <button className="nav-btn" onClick={() => setTab("mi-carrera")} disabled={tab === "mi-carrera"}>Mi carrera</button>}
          {usuario.rol === "ADMIN" && <button className="nav-btn" onClick={() => setTab("actualizar-programa")} disabled={tab === "actualizar-programa"}>Actualizar programa</button>}
        </nav>

        {tab === "materias" && usuario.rol !== "DOCENTE" && <MateriasCarrera />}
        {tab === "horario" && usuario.rol === "ALUMNO" && <AgendaSemanal />}
        {tab === "mis-materias" && usuario.rol === "DOCENTE" && <MisMaterias />}
        {tab === "consultar-materias" && usuario.rol === "DOCENTE" && <ConsultaMaterias />}
        {tab === "notas-docente" && usuario.rol === "DOCENTE" && <NotasDocente />}
        {tab === "revisiones" && usuario.rol === "DOCENTE" && <Revisiones />}
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
        {tab === "actividades-personales" && usuario.rol === "ALUMNO" && <ActividadesPersonales />}
        {tab === "simular-promedio" && usuario.rol === "ALUMNO" && <SimularPromedio />}
        {tab === "notificaciones" && tieneNotificaciones(usuario.rol) && <Notificaciones onCambioNoLeidas={setNoLeidas} />}
        {tab === "actualizar-programa" && usuario.rol === "ADMIN" && <ActualizarPrograma />}
        {tab === "cargar-programa" && usuario.rol === "ADMIN" && <CargarPrograma />}
        {tab === "mi-carrera" && usuario.rol === "ALUMNO" && <MiCarrera />}
        {tab === "mis-datos" && <MisDatos usuario={usuario} onActualizado={(datos) => setUsuario({ ...usuario, ...datos })} />}
      </main>
    </div>
  );
}

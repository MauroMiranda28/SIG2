import { useEffect, useRef, useState } from "react";
import { api, leerToken, borrarToken } from "./api.js";
import Login from "./auth/Login.jsx";
import Registro from "./auth/Registro.jsx";
import MateriasCarrera from "./materias/MateriasCarrera.jsx";
import Bibliografia from "./materias/Bibliografia.jsx";
import Correlatividades from "./correlatividades/Correlatividades.jsx";
import CargarCorrelatividades from "./correlatividades/CargarCorrelatividades.jsx";
import AgendaSemanal from "./horarios/AgendaSemanal.jsx";
import AsignarDocentesHorario from "./horarios/AsignarDocentesHorario.jsx";
import PaginaCalendarioAnual from "./horarios/PaginaCalendarioAnual.jsx";
import MisDatos from "./perfil/MisDatos.jsx";
import MisNotas from "./notas/MisNotas.jsx";
import HistorialNotas from "./evaluaciones/HistorialNotas.jsx";
import InscripcionFinal from "./evaluaciones/InscripcionFinal.jsx";
import ParcialesYTps from "./evaluaciones/ParcialesYTps.jsx";
import MiAsistencia from "./asistencia/MiAsistencia.jsx";
import SimularPromedio from "./promedio/SimularPromedio.jsx";
import Notificaciones from "./notificaciones/Notificaciones.jsx";
import PreferenciasNotificaciones from "./notificaciones/PreferenciasNotificaciones.jsx";
import ActividadesPersonales from "./actividades/ActividadesPersonales.jsx";
import CalendarioAcademico from "./calendario/CalendarioAcademico.jsx";

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
import ProgramaDocente from "./docentes/ProgramaDocente.jsx";
import BibliografiaDocente from "./docentes/BibliografiaDocente.jsx";
import PropuestasPrograma from "./docentes/PropuestasPrograma.jsx";

import MiCarrera from "./carreras/MiCarrera.jsx";
import ConsultaCarreras from "./carreras/ConsultaCarreras.jsx";
import ActualizarPrograma from "./programas/ActualizarPrograma.jsx";
import CargarPrograma from "./programas/CargarPrograma.jsx";
import PropuestasDocentes from "./programas/PropuestasDocentes.jsx";

function AgendaSemanalDocente() {
  return <AgendaSemanal esDocente />;
}

function DedicacionDocente() {
  return <ActividadesPersonales esDocente />;
}

// El alumno recibe avisos de sus materias y el docente, las solicitudes de revisión de sus alumnos.
const tieneNotificaciones = (rol) => rol === "ALUMNO" || rol === "DOCENTE";

// La sección activa también viaja en la URL (ej. http://localhost:5173/#historial-notas). Así un enlace
// de una notificación, de un email o de un push abre directo la pantalla correspondiente.
const seccionDelHash = () => window.location.hash.replace(/^#/, "");

// Solo se abre una sección que existe y que ese rol puede ver.
function seccionPermitida(id, rol) {
  if (id === "notificaciones" || id === "preferencias-notificaciones") return tieneNotificaciones(rol);
  return NAV_ITEMS.some((item) => item.id === id && visibleParaRol(item, rol));
}

// Pantalla con la que se entra: la del enlace, si hay una válida; si no, «Materias» (alumno) o «Mis materias» (docente).
// «Materias» y «Mi horario» son del alumno.
function tabInicial(rol) {
  const enlace = seccionDelHash();
  if (seccionPermitida(enlace, rol)) return enlace;
  return rol === "DOCENTE" ? "mis-materias" : rol === "ADMIN" ? "asignar-docentes-horario" : "materias";
}

// Categorías del menú, en el orden en que se muestran. Una categoría solo aparece si el rol
// actual tiene al menos un ítem dentro (ver NAV_ITEMS). «roles: null» significa «todos los roles».
const GRUPOS = [
  { id: "materias", label: "Materias" },
  { id: "agenda", label: "Agenda" },
  { id: "mi-carrera", label: "Mi carrera" },
  { id: "evaluacion", label: "Evaluación" },
  { id: "mis-materias", label: "Mis materias" },
  { id: "evaluacion-docente", label: "Evaluación" },
  { id: "comunicacion", label: "Comunicación" },
  { id: "organizacion-academica", label: "Organización académica" },
  { id: "planes", label: "Carreras y planes" },
  { id: "programas", label: "Programas" },
  { id: "cuenta", label: "Cuenta" },
];

const NAV_ITEMS = [
  { id: "materias", label: "Materias", grupo: "materias", roles: ["ALUMNO"], Componente: MateriasCarrera },
  { id: "horario", label: "Mi horario", grupo: "agenda", roles: ["ALUMNO"], Componente: AgendaSemanal },
  { id: "calendario-anual-alumno", label: "Calendario académico", grupo: "agenda", roles: ["ALUMNO"], Componente: PaginaCalendarioAnual },
  { id: "actividades-personales", label: "Actividades personales", grupo: "agenda", roles: ["ALUMNO"], Componente: ActividadesPersonales },
  { id: "horario-docente", label: "Mi horario", grupo: "agenda", roles: ["DOCENTE"], Componente: AgendaSemanalDocente },
  { id: "calendario-anual-docente", label: "Calendario académico", grupo: "agenda", roles: ["DOCENTE"], Componente: PaginaCalendarioAnual },
  { id: "dedicacion-docente", label: "Dedicación extra-áulica", grupo: "agenda", roles: ["DOCENTE"], Componente: DedicacionDocente },
  { id: "mi-plan", label: "Mi plan de estudios", grupo: "mi-carrera", roles: ["ALUMNO"], Componente: MiPlan },
  { id: "bibliografia", label: "Bibliografía", grupo: "mi-carrera", roles: ["ALUMNO"], Componente: Bibliografia },
  { id: "correlatividades", label: "Correlatividades", grupo: "mi-carrera", roles: ["ALUMNO"], Componente: Correlatividades },
  { id: "mi-carrera", label: "Mi carrera", grupo: "mi-carrera", roles: ["ALUMNO"], Componente: MiCarrera },
  { id: "notas", label: "Mis notas", grupo: "evaluacion", roles: ["ALUMNO"], Componente: MisNotas },
  { id: "parciales-tps", label: "Parciales y TPs", grupo: "evaluacion", roles: ["ALUMNO"], Componente: ParcialesYTps },
  { id: "historial-notas", label: "Historial de notas", grupo: "evaluacion", roles: ["ALUMNO"], Componente: HistorialNotas },
  { id: "inscripcion-final", label: "Inscripción a finales", grupo: "evaluacion", roles: ["ALUMNO"], Componente: InscripcionFinal },
  { id: "asistencia", label: "Mi asistencia", grupo: "evaluacion", roles: ["ALUMNO"], Componente: MiAsistencia },
  { id: "simular-promedio", label: "Simular promedio", grupo: "evaluacion", roles: ["ALUMNO"], Componente: SimularPromedio },
  { id: "mis-materias", label: "Mis materias", grupo: "mis-materias", roles: ["DOCENTE"], Componente: MisMaterias },
  { id: "consultar-materias", label: "Consultar materias", grupo: "mis-materias", roles: ["DOCENTE"], Componente: ConsultaMaterias },
  { id: "consultar-carreras", label: "Carreras", grupo: "planes", roles: ["DOCENTE"], Componente: ConsultaCarreras },
  { id: "notas-docente", label: "Notas", grupo: "evaluacion-docente", roles: ["DOCENTE"], Componente: NotasDocente },
  { id: "revisiones", label: "Revisiones", grupo: "evaluacion-docente", roles: ["DOCENTE"], Componente: Revisiones },
  { id: "fechas-examen", label: "Fechas de examen", grupo: "evaluacion-docente", roles: ["DOCENTE"], Componente: FechasExamen },
  { id: "enviar-aviso", label: "Enviar aviso", grupo: "comunicacion", roles: ["DOCENTE"], Componente: EnviarAviso },
  { id: "tareas", label: "Tareas", grupo: "comunicacion", roles: ["DOCENTE"], Componente: Tareas },
  { id: "carreras", label: "Carreras", grupo: "planes", roles: ["ADMIN"], Componente: Carreras },
  { id: "crear-plan", label: "Planes de estudio", grupo: "planes", roles: ["ADMIN"], Componente: CrearPlan },
  { id: "correlatividades-admin", label: "Correlatividades", grupo: "planes", roles: ["ADMIN"], Componente: CargarCorrelatividades },
  { id: "cargar-programa", label: "Cargar programa", grupo: "programas", roles: ["ADMIN"], Componente: CargarPrograma },
  { id: "actualizar-programa", label: "Actualizar programa", grupo: "programas", roles: ["ADMIN"], Componente: ActualizarPrograma },
  { id: "propuestas-docentes", label: "Propuestas de docentes", grupo: "programas", roles: ["ADMIN"], Componente: PropuestasDocentes },
  { id: "programa-docente", label: "Consultar programa", grupo: "programas", roles: ["DOCENTE"], Componente: ProgramaDocente },
  { id: "bibliografia-docente", label: "Bibliografía", grupo: "programas", roles: ["DOCENTE"], Componente: BibliografiaDocente },
  { id: "propuestas-programa-docente", label: "Proponer modificaciones", grupo: "programas", roles: ["DOCENTE"], Componente: PropuestasPrograma },
  { id: "asignar-docentes-horario", label: "Asignar docentes a clases", grupo: "organizacion-academica", roles: ["ADMIN"], Componente: AsignarDocentesHorario },
  { id: "calendario-academico", label: "Calendario académico", grupo: "organizacion-academica", roles: ["ADMIN"], Componente: CalendarioAcademico },
  // «Mis datos» se renderiza aparte porque necesita props (usuario, onActualizado); va igual en NAV_ITEMS para que el menú lo agrupe.
  { id: "mis-datos", label: "Mis datos", grupo: "cuenta", roles: null, Componente: null },
];

const visibleParaRol = (item, rol) => !item.roles || item.roles.includes(rol);
const itemsDelRol = (rol) => NAV_ITEMS.filter((item) => visibleParaRol(item, rol));
const itemsDelGrupo = (grupoId, rol) => itemsDelRol(rol).filter((item) => item.grupo === grupoId);
const gruposDelRol = (rol) => GRUPOS.filter((grupo) => itemsDelGrupo(grupo.id, rol).length > 0);

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
  const tabAbierta = useRef(tab); // la pantalla abierta, para el listener de hashchange
  tabAbierta.current = tab;

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

  // Mantiene la URL al día con la pantalla abierta (sin llenar el historial del navegador).
  useEffect(() => {
    if (usuario) window.history.replaceState(null, "", `#${tab}`);
  }, [tab, usuario]);

  // Si cambia el # con la sesión abierta (un enlace tocado en la misma pestaña), se abre esa sección.
  useEffect(() => {
    if (!usuario) return undefined;
    const alCambiar = () => {
      const seccion = seccionDelHash();
      if (seccionPermitida(seccion, usuario.rol)) setTab(seccion);
      else window.history.replaceState(null, "", `#${tabAbierta.current}`); // una sección que no existe o que no es de tu rol se ignora
    };
    window.addEventListener("hashchange", alCambiar);
    return () => window.removeEventListener("hashchange", alCambiar);
  }, [usuario]);

  // El número de notificaciones sin leer de la campanita (alumnos y docentes).
  useEffect(() => {
    if (!tieneNotificaciones(usuario?.rol)) return;
    api("/notificaciones?limite=1&soloNoLeidas=true").then((d) => setNoLeidas(d.noLeidas)).catch(() => {});
  }, [usuario]);

  function cerrarSesion() {
    borrarToken();
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
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

  const grupos = gruposDelRol(usuario.rol);
  const itemActual = NAV_ITEMS.find((item) => item.id === tab && visibleParaRol(item, usuario.rol));
  const grupoActivoId = itemActual?.grupo ?? null;
  const itemsDelGrupoActivo = grupoActivoId ? itemsDelGrupo(grupoActivoId, usuario.rol) : [];

  function irAGrupo(grupoId) {
    const items = itemsDelGrupo(grupoId, usuario.rol);
    if (!items.some((item) => item.id === tab)) setTab(items[0].id);
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
          {tieneNotificaciones(usuario.rol) && <Campana noLeidas={noLeidas} activa={tab === "notificaciones" || tab === "preferencias-notificaciones"} onClick={() => setTab("notificaciones")} />}
          <button onClick={cerrarSesion} className="btn btn-secondary">
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="app-main">
        <nav className="app-nav">
          {grupos.map((grupo) => (
            <button
              key={grupo.id}
              className={`nav-btn${grupoActivoId === grupo.id ? " nav-btn--activo" : ""}`}
              onClick={() => irAGrupo(grupo.id)}
              disabled={grupoActivoId === grupo.id}
            >
              {grupo.label}
            </button>
          ))}
        </nav>

        {itemsDelGrupoActivo.length > 1 && (
          <nav className="app-subnav">
            {itemsDelGrupoActivo.map((item) => (
              <button key={item.id} className="nav-btn nav-btn--sub" onClick={() => setTab(item.id)} disabled={tab === item.id}>
                {item.label}
              </button>
            ))}
          </nav>
        )}

        {itemActual?.Componente && <itemActual.Componente />}
        {tab === "mis-datos" && <MisDatos usuario={usuario} onActualizado={(datos) => setUsuario({ ...usuario, ...datos })} />}
        {tab === "notificaciones" && tieneNotificaciones(usuario.rol) && (
          <Notificaciones onCambioNoLeidas={setNoLeidas} onIrA={(seccion) => seccionPermitida(seccion, usuario.rol) && setTab(seccion)} />
        )}
        {tab === "preferencias-notificaciones" && tieneNotificaciones(usuario.rol) && (
          <PreferenciasNotificaciones onVolver={() => setTab("notificaciones")} />
        )}
      </main>
    </div>
  );
}

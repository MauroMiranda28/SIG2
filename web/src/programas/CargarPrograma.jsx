import { useEffect, useState } from "react";
import { api } from "../api.js";
import "./programas.css";

export default function CargarPrograma() {
  const [materias, setMaterias] = useState(null);
  const [errorCarga, setErrorCarga] = useState("");
  const [materiaId, setMateriaId] = useState("");
  const [contenidos, setContenidos] = useState("");
  const [bibliografia, setBibliografia] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState(null);

  function cargarMaterias() {
    setErrorCarga("");
    api("/programas/materias").then(setMaterias).catch(e => setErrorCarga(e.message));
  }
  useEffect(cargarMaterias, []);
  const materia = materias?.find(m => m.id === Number(materiaId));

  async function guardar(e) {
    e.preventDefault();
    if (guardando || !materia || materia.programa) return;
    setError(""); setExito(null); setGuardando(true);
    try {
      const programa = await api("/programas", {
        method: "POST",
        body: JSON.stringify({ materiaId: materia.id, contenidos, bibliografia }),
      });
      setMaterias(actual => actual.map(m => m.id === materia.id ? { ...m, programa } : m));
      setExito({ nombre: materia.nombre, contenidos: programa.contenidos, bibliografia: programa.bibliografia });
      setContenidos(""); setBibliografia(""); setMateriaId("");
    } catch (e) { setError(e.message); }
    finally { setGuardando(false); }
  }

  return <section className="programas">
    <h2>Cargar programa de una materia</h2>
    <p>Seleccioná la materia y completá su programa. Al publicarlo, los usuarios podrán consultarlo desde «Ver programa».</p>
    {errorCarga ? <div role="alert"><p>{errorCarga}</p><button onClick={cargarMaterias}>Reintentar</button></div>
      : materias === null ? <p role="status">Cargando materias…</p>
      : materias.length === 0 ? <p>No hay materias cargadas. Primero creá un plan con sus materias desde «Crear plan».</p>
      : <form onSubmit={guardar}>
        <fieldset disabled={guardando}>
          <legend>Nuevo programa</legend>
          <label>Materia
            <select required value={materiaId} onChange={e => { setMateriaId(e.target.value); setError(""); setExito(null); }}>
              <option value="">Seleccioná una materia</option>
              {materias.map(m => <option key={m.id} value={m.id}>
                {m.nombre} ({m.codigo}) — {m.plan.carrera.nombre} / {m.plan.nombre} ({m.plan.anio}){m.programa ? " · Programa ya cargado" : ""}
              </option>)}
            </select>
          </label>
          {materia?.programaUrl && <p>Esta materia ya tiene un PDF. El texto se consulta con «Ver programa»; «Descargar PDF» seguirá entregando el archivo existente.</p>}
          {materia?.programa ? <p role="status">Esta materia ya tiene un programa {materia.programa.vigente ? "publicado" : "no vigente"}. La carga inicial no reemplaza programas existentes.</p>
            : <>
              <label>Contenidos (obligatorio)
                <textarea required rows={12} maxLength={20000} value={contenidos} onChange={e => setContenidos(e.target.value)} placeholder={"Unidad 1: Introducción\nObjetivos y temas principales…\n\nUnidad 2: …"} />
              </label>
              <small>{contenidos.length}/20000 caracteres</small>
              <label>Bibliografía (opcional)
                <textarea rows={5} maxLength={10000} value={bibliografia} onChange={e => setBibliografia(e.target.value)} placeholder="Autor, título, edición y año." />
              </label>
              <small>{bibliografia.length}/10000 caracteres</small>
              <button type="submit" disabled={!materia || !contenidos.trim()}>{guardando ? "Publicando…" : "Publicar programa"}</button>
            </>}
        </fieldset>
      </form>}
    {error && <p role="alert" className="programas-error">{error}</p>}
    {exito && <div>
      <p role="status" className="programas-exito">Programa de {exito.nombre} publicado correctamente.</p>
      <h3>Contenidos publicados</h3><p className="programas-texto">{exito.contenidos}</p>
      {exito.bibliografia && <><h3>Bibliografía</h3><p className="programas-texto">{exito.bibliografia}</p></>}
    </div>}
  </section>;
}

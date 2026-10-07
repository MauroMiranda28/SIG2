import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import "./programas.css";

export default function ActualizarPrograma() {
  const [materias, setMaterias] = useState(null);
  const [errorLista, setErrorLista] = useState("");
  const [id, setId] = useState("");
  const [programa, setPrograma] = useState(null);
  const [contenidos, setContenidos] = useState("");
  const [bibliografia, setBibliografia] = useState("");
  const [reemplazarPdf, setReemplazarPdf] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [intento, setIntento] = useState(0);
  const envio = useRef(false);
  const sucio = programa && (contenidos !== programa.contenidos || bibliografia !== (programa.bibliografia ?? ""));
  const hayCambio = programa && (contenidos.trim() !== programa.contenidos || (bibliografia.trim() || null) !== (programa.bibliografia ?? null) || !programa.vigente || (programa.materia.programaUrl && reemplazarPdf));

  function cargarLista() {
    setErrorLista("");
    api("/programas/materias").then(setMaterias).catch(e => setErrorLista(e.message));
  }
  useEffect(cargarLista, []);
  useEffect(() => {
    let activo = true;
    setPrograma(null); setError(""); setAviso(""); setReemplazarPdf(false);
    if (!id) { setCargando(false); return; }
    setCargando(true);
    api(`/programas/${id}`).then(p => {
      if (!activo) return;
      setPrograma(p); setContenidos(p.contenidos); setBibliografia(p.bibliografia ?? "");
    }).catch(e => { if (activo) setError(e.message); }).finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, [id, intento]);

  function recargar() {
    if (sucio && !window.confirm("Se descartarán los cambios del formulario y se cargará la versión guardada. ¿Continuar?")) return;
    setIntento(i => i + 1);
  }
  async function guardar(e) {
    e.preventDefault();
    if (!programa || envio.current || !hayCambio) return;
    envio.current = true; setGuardando(true); setError(""); setAviso("");
    try {
      const actualizado = await api(`/programas/${programa.id}`, { method: "PATCH", body: JSON.stringify({
        contenidos, bibliografia, version: programa.version, reemplazarPdf, pdfEsperado: programa.materia.programaUrl ?? null,
      }) });
      const completo = { ...actualizado, materia: { ...programa.materia, programaUrl: null } };
      setPrograma(completo); setContenidos(actualizado.contenidos); setBibliografia(actualizado.bibliografia ?? ""); setReemplazarPdf(false);
      setMaterias(lista => lista.map(m => m.programa?.id === actualizado.id ? { ...m, programa: actualizado, programaUrl: null } : m));
      setAviso(`Versión ${actualizado.version} publicada. Ya está disponible para consulta y descarga.`);
    } catch (e) { setError(e.message); }
    finally { envio.current = false; setGuardando(false); }
  }

  return <section className="programas">
    <h2>Actualizar programa</h2>
    <p>Modificá los contenidos y la bibliografía. Al guardar se publicará una nueva versión vigente.</p>
    {errorLista ? <div role="alert"><p>{errorLista}</p><button onClick={cargarLista}>Reintentar</button></div>
      : materias === null ? <p role="status">Cargando materias…</p>
      : !materias.some(m => m.programa) ? <p>No hay programas en texto cargados. Primero usá «Cargar programa».</p>
      : <label>Programa de la materia<select disabled={guardando} value={id} onChange={e => {
        if (sucio && !window.confirm("Tenés cambios sin guardar. ¿Descartarlos y cambiar de materia?")) return;
        setId(e.target.value);
      }}>
        <option value="">Seleccioná una materia</option>
        {materias.filter(m => m.programa).map(m => <option key={m.id} value={m.programa.id}>{m.nombre} ({m.codigo}) — {m.plan.carrera.nombre} / {m.plan.nombre}</option>)}
      </select></label>}
    {cargando && <p role="status">Cargando programa…</p>}
    {programa && !cargando && <form onSubmit={guardar}>
      <fieldset disabled={guardando}>
        <legend>{programa.materia.nombre} · Versión {programa.version}</legend>
        <p>Estado: {programa.vigente ? "Vigente" : "No vigente"}. Última actualización: {new Date(programa.actualizadoEn).toLocaleString("es-AR")}.</p>
        <label>Contenidos (obligatorio)<textarea required rows={12} maxLength={20000} value={contenidos} onChange={e => setContenidos(e.target.value)} /></label>
        <small>{contenidos.length}/20000 caracteres</small>
        <label>Bibliografía (opcional)<textarea rows={5} maxLength={10000} value={bibliografia} onChange={e => setBibliografia(e.target.value)} /></label>
        <small>{bibliografia.length}/10000 caracteres</small>
        {programa.materia.programaUrl && <label><span><input type="checkbox" checked={reemplazarPdf} onChange={e => setReemplazarPdf(e.target.checked)} /> Confirmo que la descarga PDF pase a generarse desde el texto actualizado y deje de ofrecer el archivo anterior.</span></label>}
        <button type="submit" disabled={!hayCambio || !contenidos.trim() || Boolean(programa.materia.programaUrl && !reemplazarPdf)}>{guardando ? "Guardando…" : `Publicar versión ${programa.version + 1}`}</button>
        <button type="button" onClick={recargar}>Recargar versión guardada</button>
      </fieldset>
    </form>}
    {error && <p role="alert" className="programas-error">{error}</p>}
    {id && !programa && !cargando && error && <button onClick={recargar}>Reintentar</button>}
    {aviso && <p role="status" className="programas-exito">{aviso}</p>}
  </section>;
}

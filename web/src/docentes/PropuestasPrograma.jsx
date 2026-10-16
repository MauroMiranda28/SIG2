import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import "./docentes.css";

// Historia: como docente quiero proponer modificaciones al programa, para mantener actualizados sus contenidos.
// El docente no cambia el programa directo: edita una copia y la propone; administración la aprueba o la rechaza.

const ESTADO = { PENDIENTE: "Pendiente de revisión", APROBADA: "Aprobada", RECHAZADA: "Rechazada" };
const fechaHora = (f) => new Date(f).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });

export default function PropuestasPrograma() {
  const [materias, setMaterias] = useState(null);
  const [materiaId, setMateriaId] = useState("");
  const [programa, setPrograma] = useState(undefined); // undefined = cargando; null = la materia no tiene programa
  const [propuestas, setPropuestas] = useState(null);
  const [contenidos, setContenidos] = useState("");
  const [bibliografia, setBibliografia] = useState("");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [enviando, setEnviando] = useState(false);
  const envio = useRef(false);

  useEffect(() => {
    let activo = true;
    api("/docentes/mis-materias")
      .then((datos) => {
        if (!activo) return;
        setMaterias(datos);
        if (datos.length) setMateriaId(String(datos[0].id));
      })
      .catch((e) => activo && setError(e.message));
    return () => { activo = false; };
  }, []);

  // Programa vigente + propuestas de la materia elegida; el formulario parte del programa actual.
  useEffect(() => {
    if (!materiaId) return undefined;
    let activo = true;
    setPrograma(undefined); setPropuestas(null); setError(""); setAviso("");
    Promise.all([api(`/docentes/materias/${materiaId}`), api(`/propuestas-programa/mias?materiaId=${materiaId}`)])
      .then(([materia, mias]) => {
        if (!activo) return;
        setPrograma(materia.programa ?? null);
        setContenidos(materia.programa?.contenidos ?? "");
        setBibliografia(materia.programa?.bibliografia ?? "");
        setMotivo("");
        setPropuestas(mias);
      })
      .catch((e) => activo && setError(e.message));
    return () => { activo = false; };
  }, [materiaId]);

  const pendiente = propuestas?.find((p) => p.estado === "PENDIENTE");
  const hayCambio = programa === undefined ? false
    : !programa || contenidos.trim() !== programa.contenidos || (bibliografia.trim() || null) !== (programa.bibliografia ?? null);
  const sucio = programa !== undefined && (contenidos !== (programa?.contenidos ?? "") || bibliografia !== (programa?.bibliografia ?? "") || motivo !== "");

  function cambiarMateria(e) {
    if (sucio && !window.confirm("Tenés una propuesta sin enviar. ¿Descartarla y cambiar de materia?")) return;
    setMateriaId(e.target.value);
  }

  async function enviar(e) {
    e.preventDefault();
    if (envio.current || !hayCambio || pendiente) return;
    envio.current = true; setEnviando(true); setError(""); setAviso("");
    try {
      const creada = await api("/propuestas-programa", {
        method: "POST", body: JSON.stringify({ materiaId: Number(materiaId), contenidos, bibliografia, motivo }),
      });
      setPropuestas((lista) => [creada, ...(lista ?? [])]);
      setMotivo("");
      setAviso("Propuesta enviada. Administración la va a revisar y te avisamos cuando la resuelva.");
    } catch (err) { setError(err.message); }
    finally { envio.current = false; setEnviando(false); }
  }

  return (
    <section className="docente">
      <h2>Proponer modificaciones al programa</h2>
      <p>Editá los contenidos o la bibliografía y explicá el motivo. Administración revisa la propuesta: si la aprueba, se publica como la nueva versión del programa.</p>

      {error && <p role="alert" className="docente-error">{error}</p>}
      {materias === null ? (
        !error && <p role="status">Cargando materias…</p>
      ) : materias.length === 0 ? (
        <p>Todavía no tenés materias asignadas. Pedile a administración que te asigne las que dictás.</p>
      ) : (
        <>
          <label className="docente-campo">
            Materia
            <select value={materiaId} onChange={cambiarMateria} disabled={enviando}>
              {materias.map((m) => <option key={m.id} value={m.id}>{m.nombre} ({m.codigo})</option>)}
            </select>
          </label>

          {programa === undefined ? (
            !error && <p role="status">Cargando programa…</p>
          ) : (
            <form className="docente-materia" onSubmit={enviar}>
              <header>
                <h3>{programa ? `Programa vigente: versión ${programa.version}` : "Esta materia todavía no tiene programa en texto"}</h3>
                <p className="docente-meta">
                  {programa ? "La propuesta parte de este texto. Solo se envía si cambiaste algo." : "Tu propuesta sería el programa inicial, si administración la aprueba."}
                </p>
              </header>

              {pendiente && <p role="status" className="docente-meta">Ya tenés una propuesta pendiente para esta materia (enviada el {fechaHora(pendiente.creadoEn)}). Esperá a que administración la resuelva para enviar otra.</p>}

              <fieldset disabled={enviando || Boolean(pendiente)} className="docente-formulario">
                <label className="docente-campo docente-ancho">
                  Contenidos
                  <textarea required rows={12} maxLength={20000} value={contenidos} onChange={(e) => setContenidos(e.target.value)} />
                  <small>{contenidos.length}/20000 caracteres</small>
                </label>
                <label className="docente-campo docente-ancho">
                  Bibliografía (una obra por renglón)
                  <textarea rows={5} maxLength={10000} value={bibliografia} onChange={(e) => setBibliografia(e.target.value)} />
                  <small>{bibliografia.length}/10000 caracteres</small>
                </label>
                <label className="docente-campo docente-ancho">
                  Motivo del cambio
                  <textarea required rows={3} minLength={10} maxLength={1000} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: se incorporó la unidad 5 y se actualizó la bibliografía de la unidad 2." />
                </label>
                <div>
                  <button type="submit" className="docente-primario" disabled={!hayCambio || enviando}>{enviando ? "Enviando…" : "Enviar propuesta"}</button>
                </div>
              </fieldset>
              {aviso && <p role="status" className="docente-exito">{aviso}</p>}
            </form>
          )}

          <section className="docente-bloque">
            <h3>Mis propuestas para esta materia</h3>
            {propuestas === null ? (
              !error && <p role="status">Cargando propuestas…</p>
            ) : propuestas.length === 0 ? (
              <p>Todavía no hiciste ninguna propuesta para esta materia.</p>
            ) : (
              <ul className="docente-propuestas">
                {propuestas.map((p) => (
                  <li key={p.id} className={`docente-propuesta docente-propuesta--${p.estado.toLowerCase()}`}>
                    <p><strong>{ESTADO[p.estado]}</strong> · enviada el {fechaHora(p.creadoEn)} · parte de la versión {p.versionBase || "—"}</p>
                    <p className="docente-texto"><em>Motivo:</em> {p.motivo}</p>
                    {p.resueltaEn && <p className="docente-meta">Resuelta el {fechaHora(p.resueltaEn)}.</p>}
                    {p.respuesta && <p className="docente-texto"><em>Respuesta de administración:</em> {p.respuesta}</p>}
                    <details>
                      <summary>Ver lo que propuse</summary>
                      <p className="docente-texto">{p.contenidos}</p>
                      {p.bibliografia && <><h4>Bibliografía</h4><p className="docente-texto">{p.bibliografia}</p></>}
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </section>
  );
}

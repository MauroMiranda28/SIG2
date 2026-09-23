import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import "./carreras.css";

// Registrar y modificar carreras (ADMIN). El mismo formulario sirve para las dos cosas:
// vacío registra una carrera nueva; al tocar «Editar» en el listado, se precarga y guarda cambios.

const vacio = { nombre: "", codigo: "", descripcion: "" };

export default function Carreras() {
  const [carreras, setCarreras] = useState(null);
  const [errorCarga, setErrorCarga] = useState("");
  const [form, setForm] = useState(vacio);
  const [editando, setEditando] = useState(null); // carrera original mientras se edita
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const primerCampo = useRef(null);

  function cargar() {
    setErrorCarga("");
    api("/carreras").then(setCarreras).catch((e) => setErrorCarga(e.message));
  }
  useEffect(cargar, []);

  function cambiar(campo, valor) {
    setError("");
    setForm((actual) => ({ ...actual, [campo]: campo === "codigo" ? valor.toUpperCase() : valor }));
  }

  function empezarEdicion(carrera) {
    setEditando(carrera);
    setForm({ nombre: carrera.nombre, codigo: carrera.codigo, descripcion: carrera.descripcion ?? "" });
    setError(""); setAviso("");
    primerCampo.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    primerCampo.current?.focus({ preventScroll: true });
  }

  function cancelarEdicion() {
    setEditando(null); setForm(vacio); setError("");
  }

  // Al modificar se mandan solo los campos que cambiaron.
  function cambiosRespectoDe(original) {
    const cambios = {};
    if (form.nombre.trim() !== original.nombre) cambios.nombre = form.nombre;
    if (form.codigo.trim().toUpperCase() !== original.codigo) cambios.codigo = form.codigo;
    if (form.descripcion.trim() !== (original.descripcion ?? "")) cambios.descripcion = form.descripcion;
    return cambios;
  }

  async function guardar(e) {
    e.preventDefault();
    if (guardando) return;
    setError(""); setAviso("");

    let peticion;
    if (editando) {
      const cambios = cambiosRespectoDe(editando);
      if (!Object.keys(cambios).length) {
        setError("No modificaste ningún dato.");
        return;
      }
      peticion = api(`/carreras/${editando.id}`, { method: "PATCH", body: JSON.stringify(cambios) });
    } else {
      peticion = api("/carreras", { method: "POST", body: JSON.stringify(form) });
    }

    setGuardando(true);
    try {
      const guardada = await peticion;
      setCarreras((lista) => {
        const otras = (lista ?? []).filter((c) => c.id !== guardada.id);
        return [...otras, guardada].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
      });
      setAviso(editando
        ? `Se guardaron los cambios de «${guardada.nombre}».`
        : `Se registró «${guardada.nombre}» con el código ${guardada.codigo}.`);
      setEditando(null); setForm(vacio);
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="carreras">
      <h2>Carreras</h2>
      <p>Cargá la oferta académica y mantené actualizados los datos de cada carrera.</p>

      <form onSubmit={guardar}>
        <fieldset disabled={guardando} className="carrera-formulario">
          <legend>{editando ? `Modificar «${editando.nombre}»` : "Registrar carrera"}</legend>

          <label>Nombre
            <input ref={primerCampo} required maxLength={160} value={form.nombre}
              placeholder="Ej. Licenciatura en Sistemas de Información"
              onChange={(e) => cambiar("nombre", e.target.value)} />
          </label>

          <label>Código
            <input required maxLength={20} value={form.codigo} placeholder="Ej. LSI"
              pattern="[A-Za-z0-9][A-Za-z0-9_\-]{0,19}"
              title="Hasta 20 caracteres: letras, números, guion o guion bajo, sin espacios."
              aria-describedby="ayuda-codigo"
              onChange={(e) => cambiar("codigo", e.target.value)} />
            <small id="ayuda-codigo">
              Único en el sistema. {editando && editando._count?.planes > 0
                ? "Cambiarlo no afecta los planes ni los alumnos de la carrera."
                : "Letras, números, guion o guion bajo."}
            </small>
          </label>

          <label>Descripción (opcional)
            <textarea rows={3} maxLength={1000} value={form.descripcion}
              onChange={(e) => cambiar("descripcion", e.target.value)} />
          </label>

          <div className="carrera-acciones">
            <button className="carrera-primario" type="submit">
              {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Registrar carrera"}
            </button>
            {editando && <button type="button" onClick={cancelarEdicion}>Cancelar</button>}
          </div>
        </fieldset>
      </form>

      {error && <p role="alert" className="carrera-error">{error}</p>}
      {aviso && <p role="status" className="carrera-exito">{aviso}</p>}

      <h3>Carreras cargadas</h3>
      {errorCarga ? (
        <div role="alert"><p>{errorCarga}</p><button onClick={cargar}>Reintentar</button></div>
      ) : carreras === null ? (
        <p role="status">Cargando carreras…</p>
      ) : !carreras.length ? (
        <p>Todavía no hay carreras. Registrá la primera con el formulario de arriba.</p>
      ) : (
        <div className="carrera-tabla">
          <table>
            <thead>
              <tr><th scope="col">Carrera</th><th scope="col">Código</th><th scope="col">Estado</th><th scope="col">Planes</th><th scope="col"><span className="solo-lector">Acciones</span></th></tr>
            </thead>
            <tbody>
              {carreras.map((c) => (
                <tr key={c.id} className={editando?.id === c.id ? "carrera-editando" : undefined}>
                  <td>{c.nombre}{c.descripcion && <small>{c.descripcion}</small>}</td>
                  <td className="carrera-codigo">{c.codigo}</td>
                  <td>{c.vigente ? "Vigente" : "No vigente"}</td>
                  <td>{c._count?.planes ?? 0}</td>
                  <td>
                    <button type="button" onClick={() => empezarEdicion(c)} disabled={guardando}
                      aria-label={`Editar ${c.nombre}`}>Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

import { useState } from "react";
import CalendarioAnual from "./CalendarioAnual.jsx";
import "../actividades/actividades.css";

export default function PaginaCalendarioAnual() {
  const [anio, setAnio] = useState(new Date().getFullYear());
  return (
    <section className="actividades agenda-semanal calendario-anual-pagina">
      <h2>Calendario académico</h2>
      <p>Consultá los feriados, el receso de invierno, los períodos de exámenes y las fechas de inicio y fin de cuatrimestre.</p>
      <label className="calendario-anual-selector">
        Año
        <input
          type="number"
          min="1900"
          max="2100"
          value={anio}
          onChange={(evento) => setAnio(Number(evento.target.value))}
        />
      </label>
      <CalendarioAnual anio={anio} />
    </section>
  );
}

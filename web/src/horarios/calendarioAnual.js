const FECHAS_LECTIVAS = new Set(["CLASES_CUATRIMESTRE_1", "CLASES_CUATRIMESTRE_2"]);
const FECHAS_SIN_MARCA_CONTINUA = new Set([...FECHAS_LECTIVAS, "CLASES_ANUALES"]);

const fechaISO = (fecha) => new Date(fecha).toISOString().slice(0, 10);

export function marcasDelDia(fecha, periodos) {
  const marcas = [];
  const esDomingo = new Date(`${fecha}T00:00:00.000Z`).getUTCDay() === 0;
  for (const periodo of periodos) {
    const inicio = fechaISO(periodo.fechaInicio);
    const fin = fechaISO(periodo.fechaFin);
    if (fecha >= inicio && fecha <= fin &&
        !FECHAS_SIN_MARCA_CONTINUA.has(periodo.tipo) &&
        !(esDomingo && ["EXAMENES_FINALES", "VACACIONES"].includes(periodo.tipo))) {
      marcas.push({ tipo: periodo.tipo, nombre: periodo.nombre });
    }
    if (!FECHAS_LECTIVAS.has(periodo.tipo)) continue;
    const etiqueta = periodo.tipo === "CLASES_CUATRIMESTRE_1" ? "1.º cuatrimestre" : "2.º cuatrimestre";
    if (fecha === inicio) marcas.push({ tipo: "INICIO_CUATRIMESTRE", nombre: `Inicio del ${etiqueta}` });
    if (fecha === fin) marcas.push({ tipo: "FIN_CUATRIMESTRE", nombre: `Fin del ${etiqueta}` });
  }
  if (marcas.some(({ tipo }) => tipo === "FERIADO")) {
    return marcas.filter(({ tipo }) => tipo !== "EXAMENES_FINALES");
  }
  return marcas;
}

export function clasePrincipal(marcas) {
  if (marcas.some(({ tipo }) => tipo === "FERIADO")) return "calendario-feriado";
  if (marcas.some(({ tipo }) => tipo === "VACACIONES")) return "calendario-vacaciones";
  if (marcas.some(({ tipo }) => tipo === "EXAMENES_FINALES")) return "calendario-examenes_finales";
  if (marcas.some(({ tipo }) => tipo === "INICIO_CUATRIMESTRE")) return "calendario-inicio_cuatrimestre";
  if (marcas.some(({ tipo }) => tipo === "FIN_CUATRIMESTRE")) return "calendario-fin_cuatrimestre";
  return "";
}

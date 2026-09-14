import { useEffect, useState } from "react";
import { api } from "./api.js";

// Cáscara mínima: sirve para verificar que el front habla con la API.
// La pantalla de verdad la arma cada pareja en su módulo.

export default function App() {
  const [estado, setEstado] = useState("probando");

  useEffect(() => {
    api("/health")
      .then(() => setEstado("conectado"))
      .catch(() => setEstado("sin conexión con la API"));
  }, []);

  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem", maxWidth: "40rem" }}>
      <h1>Sistema Académico</h1>
      <p>Estado de la API: {estado}</p>
      <p>
        Si dice "sin conexión", levantá la API con <code>npm run dev:api</code>.
      </p>
    </main>
  );
}

# Deshabilitar carreras — ADMIN

Historia: Como administrador IT, quiero deshabilitar carreras, para conservar la información de carreras que ya no se encuentran vigentes.

## Aplicación

Entrega incremental sobre las historias anteriores (carga de programas y Mi carrera), partiendo de SIG2(1).zip. Se conserva la ruta corregida de Mi carrera. Este ZIP contiene solo cuatro archivos: dos modificados y dos nuevos.

1. Detené los servidores con Ctrl+C, guardá los archivos y revisá `git status`. Guardá en Git los cambios anteriores que quieras conservar.
2. Creá la rama: `git switch -c carreras/deshabilitar`.
3. Extraé el ZIP y copiá las carpetas api, web y docs dentro de SIG2. Combiná carpetas; no borres las existentes.
4. Reemplazá api/src/routes/carreras.js y web/src/carreras/Carreras.jsx sobre la versión que venimos trabajando. Si los modificaste posteriormente, comparalos primero.
5. Reiniciá API y frontend en sus respectivas terminales:

```powershell
npm run dev:api
```

```powershell
npm run dev:web
```

No requiere db:push, cambios de esquema ni dependencias nuevas. No cambia .env ni datos automáticamente.

## Uso

Ingresá como ADMIN → Carreras → Deshabilitar, en la fila de la carrera.

La confirmación identifica la carrera e informa que se conserva la información. Cancelar no envía ninguna solicitud. Confirmar actualiza vigente=false y muestra No vigente. La fila permanece visible. El botón pasa a Habilitar, respetando la reactivación que ya existía.

Durante la solicitud se bloquean edición, guardado y nuevos cambios de estado. Si falla, se conserva la fila y el estado previo y se muestra el error.

## Alcance y criterios

- Solo ADMIN puede cambiar el estado. ALUMNO/DOCENTE: 403; sin sesión: 401.
- El servidor acepta un identificador entero positivo y únicamente un campo vigente booleano. Rechaza campos extra, valores omitidos, texto "false", números y null.
- Baja lógica: solo se actualiza Carrera.vigente. No se elimina la carrera, no se cambian nombre/código/descripción y no se eliminan ni modifican sus planes, materias, usuarios o asignaciones.
- Repetir la petición vigente=false mantiene el estado deshabilitado; no lo alterna en el servidor.
- Carrera inexistente: 404; otros errores se delegan al manejador global sin revelar detalles internos.
- El administrador sigue viendo todas las carreras, incluidas las no vigentes.
- El alumno asignado puede seguir consultando su carrera no vigente con la historia anterior Mi carrera.
- La selección y creación de nuevos planes ya verifica vigente; las carreras deshabilitadas no se ofrecen allí. No se deshabilitan en cascada planes existentes.

El esquema posee activa y vigente. Esta historia mantiene vigente como estado que utiliza el módulo administrativo y los planes. No modifica activa ni agrega una migración; el grupo puede unificar ese campo duplicado en una tarea separada. No se añaden reglas sobre inscripción o cursado que no estén especificadas en esta historia.

## Archivos

- api/src/routes/carreras.js: refuerza la ruta PUT /api/carreras/:id/estado y conserva registro, edición, listado y Mi carrera.
- web/src/carreras/Carreras.jsx: confirmación, estado de guardado, bloqueo de acciones y aviso de conservación.
- api/test/estado-carrera.test.js: seis pruebas nuevas.
- docs/DESHABILITAR_CARRERAS.md: esta guía.

Ejemplo de petición autenticada ADMIN:

```http
PUT /api/carreras/3/estado
Content-Type: application/json

{"vigente":false}
```

Usá un ID real. Responde 200 con la carrera actualizada y sus cantidades de planes/usuarios. Para reactivar, enviá true.

## Prueba manual local

1. Elegí una carrera de prueba con al menos un plan, materias y un alumno asignado; anotá sus IDs y cantidades.
2. Presioná Deshabilitar y cancelá: debe seguir vigente.
3. Repetí y confirmá: debe figurar No vigente, conservar la fila y ofrecer Habilitar.
4. Recargá la página: debe seguir no vigente.
5. Verificá en Studio que el registro y sus relaciones siguen existiendo con los mismos IDs. No se requiere editar nada en Studio.
6. Como alumno asignado, Mi carrera debe mostrar el estado no vigente y mantener su información.
7. Como ADMIN, Crear plan no debe ofrecer esa carrera al cargar nuevamente el selector.
8. Habilitá de nuevo: recupera Vigente, conservando los datos.

## Verificación realizada

36 pruebas relacionadas aprobadas: gestión de carreras, estado, Mi carrera y planes. Compilación de Vite correcta. Seis pruebas nuevas cubren permisos, validación, baja lógica idempotente, reactivación, registro inexistente y errores internos.

Las pruebas usan una base simulada, incluyendo comprobación de que la única escritura es vigente y de que no se invocan borrados ni cambios de relaciones. No se ejecutó contra tu PostgreSQL ni se inspeccionó visualmente el navegador: completá la prueba manual local.

```powershell
node --test api/test/estado-carrera.test.js api/test/carreras.test.js api/test/mi-carrera.test.js api/test/planes.test.js
npm run build --workspace=web
```

## Entrega al grupo

Después de probar:

```powershell
git add api/src/routes/carreras.js web/src/carreras/Carreras.jsx api/test/estado-carrera.test.js docs/DESHABILITAR_CARRERAS.md
git diff --cached --stat
git commit -m "Completa baja logica de carreras con validaciones"
git push -u origin carreras/deshabilitar
```

Abrí el PR con la base acordada. Si Mi carrera aún no está integrado, esta rama puede incluirlo como dependencia; coordiná la base para evitar mezclar PRs. No se hizo commit ni push desde el asistente.

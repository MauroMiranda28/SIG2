# Consultar la información de mi carrera (ALUMNO)

## Instalar

Esta entrega continúa sobre SIG2(1).zip más la entrega inmediatamente anterior de carga de programas. Aplicá primero SIG2-carga-programa-actualizado.zip: App.jsx conserva el acceso a Cargar programa.

1. Detené API y web con Ctrl+C. Guardá tus cambios anteriores en Git.
2. Creá la rama: `git switch -c carreras/consultar-mi-carrera`. Sale de tu estado actual; si la historia anterior aún no fue integrada a main, coordiná con el grupo la base del PR.
3. Extraé este ZIP y copiá api, web y docs dentro de SIG2, combinando carpetas. Reemplazá los archivos de esta entrega sobre la versión mencionada. Si cambiaste rutas/carreras.js o App.jsx después, comparalos antes de reemplazar.
4. No se requieren cambios de esquema, db:push ni nuevas dependencias.
5. Reiniciá `npm run dev:api` y `npm run dev:web` en terminales separadas.
6. Ingresá como ALUMNO y abrí «Mi carrera».

## Qué hace

Muestra nombre, código, descripción y vigencia de la carrera asignada al alumno. Son los datos disponibles en el modelo actual; no se inventaron campos de duración, título, modalidad ni datos de una carrera real.

- Conserva los párrafos de la descripción.
- Si no hay descripción, informa que aún no se cargó.
- Si no hay carrera asignada, pide consultar a administración y permite volver a consultar.
- Permite consultar una carrera no vigente si el alumno continúa asignado; informa su estado sin deducir efectos sobre su cursado.
- Botón para actualizar la información, estado de carga y errores.
- Solo consulta: no permite al alumno modificar la carrera.

## Corrección de la ruta existente

Ya existía GET /api/carreras/mi-carrera, pero buscaba carreraId en el JWT. El login actual solo firma id y rol, por lo que podía devolver incorrectamente «sin carrera».

Ahora usa el id del alumno autenticado para consultar Usuario.carrera en la base de datos. Ignora IDs enviados por query y cualquier carreraId antiguo en el token. Selecciona solo id, nombre, código, descripción y vigente; no devuelve usuarios, cantidades de alumnos ni datos administrativos adicionales.

Requiere ALUMNO. Las rutas de gestión ADMIN se conservan. La consulta queda antes del middleware exclusivo de ADMIN.

El esquema tiene tanto vigente como activa. Se usa vigente, que es el campo que consulta y modifica el módulo administrativo actual; no se cambia ni se intenta sincronizar activa en esta historia.

## Preparar una prueba

1. Como ADMIN, en «Carreras», verificá que exista una carrera y cargale una descripción, por ejemplo «Carrera orientada al diseño, desarrollo y gestión de sistemas informáticos» como dato de prueba.
2. El alumno debe tener carreraId asignado. Para desarrollo local, podés comprobarlo con `npm run db:studio --workspace=api`, tabla Usuario, usando el ID real de Carrera. No modifiques su contraseña ni su rol.
3. Entrá como ese alumno y abrí «Mi carrera»: verificá nombre, código, descripción y estado.
4. Editá la descripción desde ADMIN; al volver como alumno y consultar de nuevo, debe verse el cambio.
5. Un alumno sin carrera debe recibir un mensaje claro. Sin descripción debe mostrarse el texto alternativo.
6. El alumno no debe ver controles de modificación ni poder acceder al listado administrativo de carreras.

Para consultar Mi carrera no hace falta que el alumno tenga plan de estudios; alcanza con su carrera asignada.

## Archivos

- api/src/routes/carreras.js: corrige solo la ruta mi-carrera y conserva la gestión administrativa.
- web/src/carreras/MiCarrera.jsx: nueva pantalla.
- web/src/carreras/mi-carrera.css: estilos propios.
- web/src/App.jsx: import, pestaña y vista para ALUMNO; conserva los demás módulos, incluida la carga de programas anterior.
- api/test/mi-carrera.test.js: siete pruebas nuevas.

## Validación

Pasaron 27 pruebas: las siete nuevas más las existentes de gestión de carreras y carga de programas. Frontend compilado con Vite. Las pruebas usan base simulada: no se verificó contra tu PostgreSQL ni visualmente en navegador. Completá la prueba manual anterior antes de subir el PR.

```powershell
node --test api/test/mi-carrera.test.js api/test/carreras.test.js
npm run build --workspace=web
```

Criterios cubiertos: sesión obligatoria, rol ALUMNO, consulta solo de la carrera propia, asignación actual desde DB, alumno sin carrera, usuario eliminado, carrera no vigente, descripción nula y manejo de errores internos sin filtrar detalles.

## Entregar al grupo

Después de probar:

```powershell
git add api/src/routes/carreras.js api/test/mi-carrera.test.js web/src/App.jsx web/src/carreras/MiCarrera.jsx web/src/carreras/mi-carrera.css docs/MI_CARRERA.md
git diff --cached --stat
git commit -m "Agrega consulta de la carrera del alumno"
git push -u origin carreras/consultar-mi-carrera
```

Abrí PR con la base acordada. Explicá que se corrige la ruta previa para resolver la carrera desde la base en lugar del JWT y se agrega la vista de solo lectura. No hay cambios de esquema. No se hizo push desde el asistente.

# Historia: cargar el programa de una materia

Como administrador IT, quiero cargar el programa de una materia, para ponerlo a disposición de los usuarios.

## Alcance

Formato texto, según lo acordado: contenidos obligatorios y bibliografía opcional. Se reutilizan la tabla Programa y la consulta del alumno existentes. Se conservan la carga y descarga de PDF implementadas por el equipo, sin modificar sus rutas, servicios ni pruebas.

## Instalar en tu copia actualizada

Esta entrega está basada en SIG2(1).zip, recibido el 30/09/2026, no en el ZIP anterior. El paquete contiene solo archivos nuevos o modificados.

1. Detené los servidores con Ctrl+C y guardá los archivos en VS Code.
2. En la raíz SIG2, ejecutá `git status`. Guardá tus cambios anteriores antes de reemplazar archivos. No incluyas .env ni node_modules en Git.
3. Creá una rama `git switch -c programas/carga-texto-admin`. Si ya existe, usá `git switch programas/carga-texto-admin`.
4. Extraé el ZIP y copiá sus carpetas api, web y docs dentro de SIG2. Se combinan con las existentes: NO borres tus carpetas.
5. Aceptá reemplazar api/src/index.js, web/src/App.jsx y web/src/materias/MateriasCarrera.jsx solo si no los cambiaste después de enviar SIG2(1).zip. Esta entrega ya conserva los módulos del ZIP nuevo. Si hubo cambios posteriores, comparalos antes de reemplazar.
6. Conservá api/.env, api/prisma/schema.prisma, api/src/services/programas.js y api/test/programas.test.js: no se reemplazan en esta entrega.
7. No se agregaron dependencias ni cambios de esquema. Si tu proyecto actualizado ya arranca, no necesitás ejecutar db:push ni reinstalar paquetes.
8. Reiniciá los servidores en dos terminales ubicadas en SIG2:

```powershell
npm run dev:api
```

```powershell
npm run dev:web
```

## Usar y probar

1. Ingresá con la cuenta ADMIN que ya preparaste. Si cambiaste el rol desde Studio, cerrá sesión e ingresá nuevamente.
2. Abrí «Cargar programa».
3. Elegí una materia existente. El selector identifica código, carrera y plan; el administrador no necesita tener una carrera asignada.
4. Completá, por ejemplo:

Contenidos:

Unidad 1: Introducción a la programación.
Variables, tipos de datos y expresiones.

Unidad 2: Estructuras de control.
Condicionales, ciclos y ejercicios de aplicación.

Bibliografía: escribí las fuentes que correspondan a la materia, o dejala vacía.

5. Presioná «Publicar programa». Debe aparecer la confirmación y el texto publicado.
6. Cerrá sesión e ingresá con un alumno cuyo plan contenga esa materia.
7. En «Materias», presioná «Ver programa». Deben aparecer contenidos y bibliografía con los saltos de línea. El botón está en Materias, no en Mi plan de estudios.
8. En «Ver información y horarios», la descarga de PDF existente sigue disponible: si no hay archivo PDF subido, el sistema genera uno a partir del texto. Si ya hay un archivo PDF, la descarga conserva ese archivo y la consulta «Ver programa» muestra el texto.

Si no hay materias, cargalas desde el flujo de planes existente. Esta entrega no crea datos de prueba ni cambia usuarios automáticamente.

## Criterios de aceptación

- Solo ADMIN accede al catálogo administrativo y a la carga en texto. Sin sesión: 401. Con ALUMNO o DOCENTE: 403. La carga PDF de docentes asignados se mantiene como estaba.
- La materia debe existir; si fue eliminada se informa 404.
- Contenidos obligatorios, no solo espacios, máximo 20000 caracteres.
- Bibliografía opcional, máximo 10000 caracteres; vacía se guarda como null.
- El programa queda asociado a la materia, vigente y con versión 1, valores definidos por el servidor.
- Programa consultable inmediatamente mediante la ruta existente de lectura autenticada.
- Los errores muestran un mensaje y conservan el texto para corregirlo.
- Una materia con programa en texto previo no admite una segunda carga: retorna 409 y no sobrescribe datos. La restricción única también protege contra dos cargas simultáneas.
- Editar, reactivar o versionar un programa previo no forma parte de esta historia. Si ya existe uno no vigente, también se informa en la pantalla sin reemplazarlo.

## Archivos y explicación

Nuevos:
- api/src/routes/programas.js: GET /api/programas/materias y POST /api/programas; autenticación, rol, validación y guardado.
- web/src/programas/CargarPrograma.jsx: selector, formulario, estados de carga y confirmación.
- web/src/programas/programas.css: estilos acotados a la pantalla.
- api/test/carga-programas.test.js: nueve pruebas HTTP con base simulada, separadas de los tests PDF existentes.
- docs/CARGA_PROGRAMA.md: esta guía.

Modificados:
- api/src/index.js: import y montaje de /api/programas antes del manejador global de errores.
- web/src/App.jsx: import, pestaña y vista CargarPrograma exclusivas de ADMIN; conserva las demás vistas.
- web/src/materias/MateriasCarrera.jsx: agrega whiteSpace: pre-wrap y overflowWrap: anywhere a contenidos y bibliografía.

Se conserva api/src/services/programas.js, que ya gestiona archivos PDF. El nuevo módulo de carga no lo sustituye.

## Contrato HTTP

POST /api/programas, token ADMIN, JSON:

```json
{
  "materiaId": 4,
  "contenidos": "Unidad 1: Introducción.\nUnidad 2: Estructuras de control.",
  "bibliografia": "Referencias bibliográficas"
}
```

Usá un materiaId real. Devuelve 201 con el programa guardado. La lectura continúa en GET /api/materias/:id/programa. La descarga continúa en GET /api/materias/:id/programa/pdf.

## Verificación

Ejecutado sobre esta versión: generación de Prisma, build de Vite y 87 pruebas aprobadas, incluidas nueve nuevas. Las pruebas HTTP usan Express/JWT y base simulada; cubren permisos, catálogo independiente de la carrera del admin, validación, materia inexistente, duplicados, lectura del programa publicado y conservación del PDF. No se probó contra tu PostgreSQL ni se hizo inspección visual en navegador; verificá el flujo manual anterior en tu computadora.

Para repetir las nueve pruebas y la compilación:

```powershell
node --test api/test/carga-programas.test.js
npm run build --workspace=web
```

Si Prisma aún no está generado, primero: `npx prisma generate --schema=api/prisma/schema.prisma`.

## Subir al grupo después de probar

```powershell
git add api/src/routes/programas.js api/src/index.js api/test/carga-programas.test.js web/src/App.jsx web/src/materias/MateriasCarrera.jsx web/src/programas docs/CARGA_PROGRAMA.md
git diff --cached --stat
git commit -m "Agrega carga de programas en texto para administrador"
git push -u origin programas/carga-texto-admin
```

Abrí PR hacia la rama que acuerde el grupo. Explicá: carga inicial de contenidos y bibliografía por ADMIN, reutilización de consulta/descarga existentes y ausencia de cambios de esquema. Esta entrega no hizo push ni modificó el remoto.

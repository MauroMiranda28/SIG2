# Sistema Académico — Sistemas de Información II

Sistema de gestión académica: materias, planes de estudio, horarios, evaluaciones
y notificaciones. El backlog vive en Trello, en el tablero "Sistemas de Información II".

## Stack

| Capa | Elección | Por qué |
|---|---|---|
| API | Node + Express | Un solo lenguaje en todo el proyecto |
| Base de datos | PostgreSQL + Prisma | El schema es legible y funciona como contrato compartido |
| Front | React + Vite | Arranque rápido, sin configuración |
| Auth | JWT | Suficiente para el alcance de la materia |

Monorepo con workspaces de npm: `api/` y `web/` se instalan y se corren juntos.

## Arrancar

Necesitás **Node 20+** y **PostgreSQL** corriendo (local o en Docker).

### 1. Clonar e instalar dependencias

**Linux / macOS**

```bash
git clone <url-del-repo>
cd sig2
npm install
```

**Windows (PowerShell)**

```powershell
git clone <url-del-repo>
cd sig2
npm install
```

### 2. Levantar PostgreSQL

Si no tenés Postgres instalado, lo más simple es Docker (igual en las dos plataformas):

```bash
docker run --name sig2-db -e POSTGRES_USER=sig2 -e POSTGRES_PASSWORD=sig2 -e POSTGRES_DB=sig2 -p 5432:5432 -d postgres
```

Si ya tenés Postgres nativo, alcanza con crear la base `sig2` con `createdb sig2` (Linux/macOS)
o desde pgAdmin / `psql` en Windows.

### 3. Configurar las variables de entorno

**Linux / macOS**

```bash
cp api/.env.example api/.env
# editá api/.env con tu usuario y contraseña de Postgres
```

**Windows (PowerShell)**

```powershell
Copy-Item api\.env.example api\.env
# editá api\.env con tu usuario y contraseña de Postgres
```

Si usaste el comando de Docker de arriba tal cual, `api/.env.example` ya sirve sin tocarlo
(`postgresql://sig2:sig2@localhost:5432/sig2`).

### 4. Crear las tablas y (opcional) cargar datos de prueba

Mismo comando en las dos plataformas, parado en la raíz del repo:

```bash
npm run db:push --workspace=api
node api/prisma/seed.js   # opcional: carga una carrera, materias, comisiones y aulas de ejemplo
```

### 5. Levantar API y front

**Linux / macOS** — un solo comando levanta los dos:

```bash
npm run dev
```

**Windows (PowerShell)** — el script combinado usa `&` de bash para correr los dos procesos en
paralelo, lo que en PowerShell no funciona igual. Abrí **dos terminales** en la raíz del repo:

```powershell
# Terminal 1
npm run dev:api
```

```powershell
# Terminal 2
npm run dev:web
```

(Esto también funciona en Linux/macOS si preferís ver los logs de cada proceso por separado.)

La API queda en `http://localhost:3000` y el front en `http://localhost:5173`. Si la pantalla de
login carga sin errores en la consola del navegador, está todo bien.

### Primer usuario ADMIN

El registro (`/auth/registro`) asigna el rol según el dominio del correo (`@ucse.edu.ar` →
DOCENTE, `@alumnos.ucse.edu.ar` → ALUMNO): no hay forma de registrarse como ADMIN desde la web,
a propósito. Para tener un admin de prueba: registrate normalmente, abrí Prisma Studio
(`npm run db:studio --workspace=api`), tabla `Usuario`, y cambiá tu `rol` a `ADMIN` a mano. Cerrá
sesión y volvé a entrar para que el token se renueve con el rol nuevo. Más detalle del flujo de
planes en [`docs/PLANES_ESTUDIO.md`](docs/PLANES_ESTUDIO.md).

## Estructura

```
api/
  prisma/schema.prisma    modelo de datos (ver abajo)
  prisma/seed.js          datos de prueba opcionales
  src/index.js            servidor, registra los routers
  src/middleware/auth.js  requiereAuth y requiereRol
  src/middleware/errores.js  manejador de errores (no expone detalles internos)
  src/routes/             un archivo por módulo (auth, materias, horarios, planes, carreras)
  src/services/           lógica compartida entre rutas (ej. resolverPlanAlumno)
  test/                   tests con node:test, sin depender de Postgres real
web/
  src/api.js              cliente HTTP, maneja el token
  src/App.jsx             login/registro + pestañas según rol
  src/auth/               Login y Registro
  src/materias/           lista de materias, detalle, elegir comisión
  src/horarios/           grilla semanal del alumno
  src/planes/             crear plan, mi plan, asignar carrera/plan (ADMIN)
  src/carreras/           registrar y modificar carreras (ADMIN)
  src/docentes/           mis materias (horarios y programa), consulta de materias, carga de notas, avisos,
                          fechas de examen y tareas (DOCENTE)
  src/correlatividades/   consulta del alumno y carga del ADMIN
  src/notificaciones/     historial de notificaciones del alumno
```

## Cómo trabajamos

Cada pareja toma una historia del Sprint backlog y la hace completa: modelo si
hace falta, endpoint en `api/src/routes/`, pantalla en `web/src/`. Nadie depende
de que otro termine primero.

**Ramas.** Una por historia, nombrada con el módulo y una descripción corta:
`horarios/cargar-bloques`, `materias/detalle`. De `main` sale todo y a `main`
vuelve todo.

**Pull requests.** Aunque sea un proyecto de cursada, abrí PR en vez de pushear
a `main`. Que lo mire alguien de otra pareja antes de mergear: es la forma más
barata de que nadie se entere tarde de que le cambiaron el modelo.

**El schema es de todos.** Si necesitás un campo nuevo en `schema.prisma`,
agregalo y decilo en la descripción del PR. Es el archivo que más conflictos
va a generar.

**Convención de nombres.** Todo en castellano, sin tildes en los identificadores
de código: `bloqueHorario`, `requiereAuth`, `carreraId`. Los comentarios y los
mensajes de error sí van con tildes.

## Estado actual

Lo que ya está implementado, para no repetir trabajo:

**Autenticación (Seg-01, Seg-04, U-01, U-02)**
- `POST /api/auth/registro` y `POST /api/auth/login`. El rol se deduce del dominio del
  correo (`@alumnos.ucse.edu.ar` → ALUMNO, `@ucse.edu.ar` → DOCENTE); no se puede elegir
  por body.
- `GET /api/auth/perfil` y `PATCH /api/auth/perfil`.

**Materias (Mat-01, Mat-03)**
- `GET /api/materias` — materias del plan resuelto del alumno, con estado de cursada.
- `GET /api/materias/:id` — características, carrera/plan y docentes.
- `GET /api/materias/:id/comisiones` — comisiones con horario y aula, y cuál eligió el alumno.
- `GET /api/materias/:id/programa` (HU-PRO) — contenidos y bibliografía.
- `GET /api/materias/bibliografia` (ALUMNO) — bibliografía del programa vigente de cada materia de su plan,
  una obra por renglón (se sacan viñetas y numeración). Pestaña «Bibliografía» con buscador por materia,
  título o autor. Tests: `node --test api/test/bibliografia.test.js`.

**Actividades personales (ACT-01 a ACT-06, ALUMNO)**
- La pestaña «Actividades personales» permite crear ocupaciones con título, duración, una categoría
  general (Trabajo, Estudio, Salud, Hogar, Ocio u Otra) y hasta diez etiquetas libres para detalles
  (por ejemplo, «remoto» o «gimnasio»). La categoría permite resumir; las etiquetas permiten filtrar.
- Las actividades previas con un tipo libre conservan su texto original como etiqueta y pasan a la
  categoría «Otra».
- Cada actividad se programa con fecha (puntual) o día de la semana (recurrente) y hora de inicio.
  La vista «Agenda semanal» presenta en listas por día las actividades y las clases de «Mi horario»;
  permite cambiar de semana sin requerir una vista de calendario.
- Al guardar, se avisa si la actividad coincide con una clase o con otra actividad personal; el aviso
  no impide guardarla. La agenda resume el tiempo personal planificado por categoría y etiqueta.
- La lista de actividades se puede filtrar por etiqueta. La API expone `GET` y `POST /api/actividades-personales`,
  `PATCH /api/actividades-personales/:id` y `DELETE /api/actividades-personales/:id`; cada operación
  requiere rol ALUMNO y limita los datos al propietario autenticado.
- Tras actualizar el esquema, correr `npm run db:push --workspace=api`. Tests:
  `node --test api/test/actividadesPersonales.test.js`.

**Historias de usuario cubiertas**
- Como alumno, quiero planificar una actividad personal puntual con fecha, hora y duración o una
  actividad recurrente con día, hora y duración, para organizar mis ocupaciones dentro de la semana.
- Como alumno, quiero consultar una agenda semanal en listas por día que reúna mis clases y actividades
  personales, para ver cuándo tengo tiempo ocupado sin depender de un calendario.
- Como alumno, quiero recibir una advertencia cuando una actividad se superponga con una clase u otra
  actividad, para poder ajustar mi organización antes de guardarla; puedo conservarla si decido hacerlo.
- Como alumno, quiero consultar el tiempo personal planificado por semana, categoría y etiqueta, para entender
  cómo se distribuyen mis ocupaciones.

**Horarios (Horarios U-01)**
- `GET /api/horarios/comision/:id` — grilla de una comisión puntual.
- `POST /api/horarios` (DOCENTE/ADMIN) — carga bloque horario + aula; rechaza si el aula ya
  tiene otro bloque asignado en ese horario.
- `POST /api/horarios/inscripcion` — el alumno elige con qué comisión cursa cada materia;
  rechaza con 409 si se superpone con otra materia ya elegida, y reemplaza la elección
  anterior si es la misma materia.
- `GET /api/horarios/mi-grilla` — grilla semanal armada con las comisiones elegidas.

**Planes de estudio** (ver [`docs/PLANES_ESTUDIO.md`](docs/PLANES_ESTUDIO.md) para el detalle)
- `POST /api/planes` (ADMIN) — crea un plan con sus materias en una transacción.
- `GET /api/planes/mi-plan` (ALUMNO) — todas las materias del plan asignado.
- `GET /api/planes/carreras` (ADMIN) — carreras vigentes, para los formularios.
- `GET /api/planes/alumnos` y `PATCH /api/planes/alumnos/:id` (ADMIN) — asignar carrera y
  plan a un alumno puntual.

**Carreras** (registrar y modificar)
- `GET /api/carreras` (ADMIN) — todas las carreras, vigentes y no vigentes, con cantidad de planes.
- `POST /api/carreras` (ADMIN) — registra una carrera (nombre, código, descripción opcional). El
  código se guarda en mayúsculas y es único; tampoco se permite repetir el nombre. Nace vigente.
- `PATCH /api/carreras/:id` (ADMIN) — modifica nombre, código y/o descripción; solo cambia lo que
  se envía. Planes y alumnos quedan vinculados porque apuntan al id, no al código.
- La vigencia (dar de baja / reactivar) no se toca desde acá: queda para su propia historia.
- Pestaña «Carreras» en el front para el ADMIN. Tests: `node --test api/test/carreras.test.js`.

**Docentes (Seg-05: acceso restringido a materias asignadas)**
- `GET /api/docentes/mis-materias` (DOCENTE) — materias que dicta (tabla `MateriaDocente`), con comisiones
  y horarios. El docente sale siempre del token.
- `GET /api/docentes/aulas` (DOCENTE/ADMIN) — aulas para el formulario de horarios.
- `POST /api/horarios` y `DELETE /api/horarios/bloques/:id` — un DOCENTE solo puede cargar o quitar
  horarios de materias que tiene asignadas (403 si no). ADMIN puede en cualquiera.
- `POST /api/materias/:id/programa` (DOCENTE asignado o ADMIN) — sube el programa en PDF (máx. 10 MB, se
  verifica que sea un PDF real). Los archivos quedan en `api/uploads/programas/`, que no se sube a git.
- Pestaña «Mis materias» para el DOCENTE. La asignación docente-materia todavía se carga a mano en
  Prisma Studio (tabla `MateriaDocente`).

**Consulta de materias y registro de cambios (DOCENTE)**
- `GET /api/docentes/materias/:id` (DOCENTE/ADMIN) — información académica de cualquier materia: datos, plan y carrera,
  docentes, programa, comisiones y horarios. Es de solo lectura (la misma información que ya es visible para cualquier
  usuario en `GET /api/materias/:id`); `esMia` y `puedeModificar` indican si el docente la dicta.
- `GET /api/docentes/materias/:id/relacionadas` — correlativas previas y posteriores de la materia dentro del plan,
  marcando cuáles dicta el docente.
- `GET /api/docentes/materias/:id/historial` (docente asignado o ADMIN) — quién modificó los horarios o el programa de
  la materia y cuándo (tabla `CambioMateria`, últimos 200). Un horario agregado o quitado y una subida de programa dejan
  su registro en la misma transacción que el cambio, así que no puede haber uno sin el otro; el registro no se edita ni
  se borra.
- Pestaña «Consultar materias» para el DOCENTE. Las correlatividades (tabla `Correlatividad`) todavía no se cargan desde
  ninguna pantalla: hoy se agregan a mano en Prisma Studio o con `api/prisma/seed.js`.

**Programa en PDF**
- `GET /api/materias/:id/programa/pdf` (cualquier usuario logueado) — descarga el PDF subido; si no hay,
  arma uno con el programa cargado como texto. Botón «Descargar programa (PDF)» en el detalle de la materia.

**Notas cargadas por el docente (carga y corrección con registro)**
- `GET /api/notas/materias/:id` (DOCENTE asignado o ADMIN) — alumnos de la materia (con cursada o comisión
  elegida) y las notas que ya tienen, con el historial de correcciones de cada una.
- `POST /api/notas/materias/:id` — publica una evaluación (tipo + fecha) con la nota de cada alumno, de 0 a 10
  con hasta dos decimales. Todo o nada: si un alumno no cursa la materia, no se guarda ninguna. Rechaza con 409
  si ese alumno ya tiene la misma evaluación en esa fecha. Si no había `Cursada`, la crea EN_CURSO.
- `PATCH /api/notas/evaluaciones/:id` — corrige una nota ya publicada; el motivo es obligatorio. Cada corrección
  deja una fila en `CambioNota` (nota anterior, nueva, autor, fecha, motivo) que no se edita ni se borra.
- **Condición de la materia** (`PUT /api/docentes/materias/:id/condicion`, bloque «Condición» en «Mis materias»):
  el docente define si es promocional y con cuánto se regulariza, se promociona y se aprueba el final.
  Sin esto configurado no se pueden cargar condiciones finales ni exámenes finales.
- **Condición final** (tipo `CONDICION_FINAL`): el docente elige por alumno *Regular*, *Promocionado* o *Libre* y el
  sistema valida la nota contra la condición de la materia. Promocionado → APROBADA con esa nota. Regular → estado
  nuevo `REGULAR`, desde esa fecha corren 2 años y 3 intentos de final. Libre → estado nuevo `LIBRE`.
- **Examen final** (tipo `FINAL`): solo para regulares vigentes; cada uno es un intento. Con la nota de aprobación del
  final → APROBADA. Desaprobado el 3.º intento → `LIBRE`. Fuera de los 2 años se rechaza (y se muestra como libre).
- **Libre**: deja de cursar. Se le quita la comisión de esa materia (sale de «Mi horario») y no se le cargan más notas
  hasta que vuelva a inscribirse (la inscripción a materias queda para otra historia).
- El alumno ve la condición de la materia en «Ver información y horarios», y en «Mis notas» el estado (Pendiente,
  Cursando, Regular, Libre, Aprobada) con la nota de cada intento de final. «Cursando» = cursada en curso o comisión
  elegida (`inscripto` en `GET /api/materias`); el `estado` que devuelve la API no cambia, así «Mi asistencia» sigue igual. El estado se recalcula desde las evaluaciones (`estadoDeCursada` en `services/notas.js`) cada vez que se
  carga o corrige una condición final o un final.
- Schema: modelo nuevo `CambioNota` y campo `Evaluacion.cargadaPorId` (quién cargó la nota). Correr `db:push`.
- Schema (condición final): estados `REGULAR` y `LIBRE` en `EstadoMateria`, tipo `CONDICION_FINAL` y enum `CondicionFinal`,
  `Evaluacion.condicion`, `Cursada.regularDesde` e `intentosFinal`, y en `Materia` `esPromocional`,
  `notaRegularizacion`, `notaPromocion` y `notaAprobacionFinal`.
- El alumno ve las notas al instante en «Historial de notas», y si una fue corregida, el valor anterior y el motivo.
- Pestaña «Notas» para el DOCENTE. Tests: `node --test api/test/notas.test.js`.

**Correlatividades**
- `GET /api/correlatividades` (ALUMNO) — cada materia de su plan con sus correlativas, si las cumple y si puede
  cursarla. **Fuerte**: la requerida tiene que estar APROBADA. **Débil**: alcanza con REGULAR vigente (o aprobada).
  Una materia puede tener de los dos tipos. Pestaña «Correlatividades» del alumno.
- ADMIN (pestaña «Correlatividades»): `GET /api/correlatividades/planes`, `GET /api/correlatividades/plan/:id`,
  `POST /api/correlatividades` (`materiaId`, `requiereId`, `tipo`), `PATCH /:id` (cambia el tipo) y `DELETE /:id`.
  Las dos materias tienen que ser del mismo plan y no se permiten ciclos (A necesita B y B necesita A).
- Schema: enum `TipoCorrelatividad` y `Correlatividad.tipo` (las que ya existían quedan como FUERTE).
- Solo informa: todavía no bloquea elegir comisión si no se cumplen (eso va con la historia de inscripción).
  Tests: `node --test api/test/correlatividades.test.js`.

**Notificaciones (historial del alumno)**
- `GET /api/notificaciones` (cualquier usuario logueado) — historial propio, de la más nueva a la más vieja, con las
  leídas incluidas. Devuelve `{ noLeidas, hayMas, notificaciones }`. Parámetros: `soloNoLeidas=true`, `limite`
  (1 a 100, por defecto 30) y `antesDeId` (el id de la última que ya se vio, para pedir las anteriores).
- `POST /api/notificaciones/:id/leer` y `POST /api/notificaciones/leer-todas` — marcan como leídas. Una ajena
  responde 404 igual que una inexistente.
- El destinatario sale siempre del token, nunca de un id por query o body. Una fila por destinatario: cada uno
  marca como leídas solo las suyas y el historial no se borra.
- Campanita junto a «Cerrar sesión» (alumno y docente) con el número de no leídas; abre el historial, con filtro
  «Solo no leídas» y «Ver más antiguas».
- Para que otras historias avisen algo: `crearNotificaciones(db, destinatarioIds, { tipo, titulo, mensaje, materiaId })`
  en `services/notificaciones.js` (acepta una transacción, así el aviso se guarda junto con el cambio que lo origina).
- Schema: modelo nuevo `Notificacion` y enum `TipoNotificacion`. Correr `db:push`.
  Tests: `node --test api/test/notificaciones.test.js`.

**Notificaciones: avisos del docente**
- `POST /api/docentes/materias/:id/avisos` (DOCENTE asignado o ADMIN) con `{ titulo, mensaje }` — le envía una
  notificación `AVISO_DOCENTE` a cada alumno de la materia (los que tienen cursada o eligieron una de sus comisiones).
  Responde `{ materia, enviadas }`; con 409 si la materia todavía no tiene alumnos.
- Los destinatarios, la materia y el autor los arma el servidor: el cuerpo no acepta una lista de alumnos ni ids.
  Título hasta 120 caracteres y mensaje hasta 1000. Un docente no asignado recibe 403 y no se envía nada.
- El alumno ve el aviso en su historial con la materia y quién lo envió. Pestaña «Enviar aviso» del DOCENTE.
- Schema: `Notificacion.autorId` (quién la envió; null en las que genera el sistema). Correr `db:push`.
  Tests: `node --test api/test/avisos-docente.test.js`.

**Notificaciones: cambio de horario o aula**
- Cuando un DOCENTE (o ADMIN) agrega o quita un horario de una comisión (`POST /api/horarios` y
  `DELETE /api/horarios/bloques/:id`), los alumnos **inscriptos en esa comisión** reciben una notificación
  `HORARIO_MODIFICADO` con la materia, quién lo cambió y el horario o aula afectado
  (ej. «Se agregó este horario: Comisión A: Jueves 08:00–10:00 · Aula 1»).
- El aviso se guarda en la misma transacción que el cambio y su registro (`CambioMateria`): si falla uno, no queda ninguno.
  Los alumnos de otras comisiones o de otras materias no reciben nada.
- Cambiar el aula o el día de un bloque existente se hace quitándolo y volviéndolo a cargar, así que el alumno recibe
  dos avisos: el del horario viejo que se quitó y el del nuevo.
- Sin cambios de schema. Tests: `node --test api/test/auditoriaMateria.test.js`.

**Notificaciones: calificación publicada**
- Al publicar notas (`POST /api/notas/materias/:id`) cada alumno recibe una notificación `CALIFICACION_PUBLICADA`
  **con su propia nota**, ej. «Parcial del 12/5/2026: nota 7,5.». Para la condición final avisa el resultado
  (ej. «Condición final del 30/6/2026: Promocionado (nota 8).»).
- Si el docente corrige una nota ya publicada (`PATCH /api/notas/evaluaciones/:id`), el alumno recibe otro aviso con la
  nota anterior y la nueva. Una carga o corrección rechazada (alumno que no cursa, docente no asignado, nota repetida
  o sin cambios) no avisa a nadie.
- El aviso se guarda en la misma transacción que la nota: si falla uno, no queda ninguno. El autor es el docente.
- Sin cambios de schema. Tests: `node --test api/test/notas.test.js`.

**Notificaciones: fechas de exámenes**
- El DOCENTE asignado (o ADMIN) programa parciales, recuperatorios y finales de su materia:
  `GET /api/examenes/materias/:id` (las fechas programadas), `POST /api/examenes/materias/:id`
  (`tipo`, `fecha`, `hora` y `aulaId` opcionales), `PATCH /api/examenes/:id` (reprograma fecha, hora o aula; `null` vacía
  hora o aula) y `DELETE /api/examenes/:id` (cancela). La fecha no puede ser anterior a hoy (fecha de Argentina).
- Los alumnos de la materia (los que tienen cursada o eligieron una de sus comisiones) reciben una notificación
  `FECHA_EXAMEN` cuando se carga («Fecha: martes, 20/10/2026 a las 18:00 · Aula 1.»), se reprograma (con la fecha nueva y
  la anterior) o se cancela. Reprogramar sin cambiar nada responde 400 y no avisa.
- El aviso se guarda en la misma transacción que el cambio: si falla uno, no queda ninguno. Un docente no asignado recibe 403.
- Pestaña «Fechas de examen» del DOCENTE (programar, reprogramar, cancelar).
- Schema: modelo `FechaExamen` y enum `TipoExamen`. Correr `db:push`. Tests: `node --test api/test/examenes.test.js`.

**Notificaciones: recordatorio de entrega de tareas**
- El DOCENTE asignado (o ADMIN) carga las tareas de su materia con fecha de entrega: `GET /api/tareas/materias/:id`,
  `POST /api/tareas/materias/:id` (`titulo`, `descripcion` opcional, `fechaEntrega`), `PATCH /api/tareas/:id` y
  `DELETE /api/tareas/:id`. La entrega no puede ser anterior a hoy (fecha de Argentina). Un docente no asignado recibe 403.
- Cuando se acerca la entrega (de hoy a **3 días antes**, `DIAS_ANTICIPACION`), los alumnos de la materia reciben una
  notificación `RECORDATORIO_ENTREGA` (ej. «La entrega de «TP 1» (Programación I) vence mañana: miércoles, 7/10/2026.»).
- No hay un proceso programado: el recordatorio se genera cuando el alumno abre su historial (`GET /api/notificaciones`,
  primera página). Se manda **una sola vez** por alumno, tarea y fecha de entrega (clave única en `Notificacion.clave`),
  aunque consulte muchas veces o a la vez. Si el docente cambia la fecha, se vuelve a avisar con la nueva.
  Si falla la generación, el historial igual se muestra.
- Pestaña «Tareas» del DOCENTE.
- Schema: modelo `Tarea` y `Notificacion.clave` con restricción única `[usuarioId, clave]`. Correr
  `db:push --accept-data-loss`: Prisma avisa por la restricción nueva, pero es seguro porque las notificaciones existentes
  quedan con `clave` nula y los nulos no cuentan como duplicados. Tests: `node --test api/test/tareas.test.js`.

**Navegación por rol**
- El DOCENTE no ve «Materias» ni «Mi horario» (son del alumno) y arranca en «Mis materias».
- Las notificaciones son una campanita en el encabezado, junto a «Cerrar sesión» (alumno y docente), y no una pestaña del menú.
- «Solicitar revisión» es una sección al pie de «Mis notas», ya no una pestaña aparte.

**Notificaciones: solicitud de revisión (docente)**
- Cuando un alumno pide la revisión de una nota (`POST /api/revisiones`), los docentes asignados a esa materia reciben una
  notificación `SOLICITUD_REVISION` con quién la pidió, qué evaluación (tipo, fecha y nota) y el motivo del reclamo
  (ej. «Ana Díaz pidió la revisión de su parcial del 12/5/2026 (nota 4). Motivo: …»). Les llega a la campanita.
- Solo les llega a los docentes de esa materia: otro docente no recibe nada. Si la materia no tiene docentes asignados la
  solicitud se crea igual. Pedir de nuevo una revisión pendiente (409) o con datos inválidos (400) no avisa.
- Se guarda en la misma transacción que la solicitud: si falla el aviso, no queda la solicitud.
- El docente la resuelve desde la pestaña «Revisiones» (ver más abajo).
- Schema: valor nuevo `SOLICITUD_REVISION` en `TipoNotificacion`. Correr `db:push`. Tests: `node --test api/test/revisiones.test.js`.

**Revisiones de nota: el docente las resuelve**
- Antes las solicitudes quedaban `PENDIENTE` para siempre: nada cambiaba su estado. Ahora hay dos formas de resolverlas.
- **Desde la pestaña «Revisiones» del DOCENTE:** `GET /api/revisiones/materias/:id` lista las solicitudes de la materia (primero las
  pendientes, con el alumno, la evaluación y el motivo) y `PATCH /api/revisiones/:id/resolver` con `{ estado, respuesta }`
  la deja `RESUELTA` o `RECHAZADA`. La respuesta es obligatoria (5 a 1000 caracteres). Solo el docente asignado a la materia
  (o ADMIN) puede verlas y resolverlas: otro docente recibe 403, y el alumno también.
- **Al corregir la nota reclamada** (`PATCH /api/notas/evaluaciones/:id`), las solicitudes pendientes de esa evaluación pasan solas
  a `RESUELTA`, con la respuesta «Se corrigió la nota: pasó de X a Y. Motivo: …». En ese caso no hay un aviso extra: el alumno ya
  recibe el de la corrección de la nota.
- Una solicitud se resuelve una sola vez: volver a resolverla responde 409. Se guarda quién la resolvió, cuándo y la respuesta.
- El alumno ve el estado y la «Respuesta del docente» en «Mis solicitudes» (dentro de «Mis notas») y recibe una notificación
  `REVISION_RESUELTA` cuando el docente la resuelve o rechaza. Los avisos se guardan en la misma transacción que el cambio.
- Schema: `SolicitudRevision.respuesta`, `resueltaEn` y `resueltaPorId`, y valor nuevo `REVISION_RESUELTA` en `TipoNotificacion`.
  Correr `db:push`. Las solicitudes que ya estaban pendientes se pueden resolver desde la pestaña.
  Tests: `node --test api/test/revisiones-docente.test.js`.

**Privacidad del seguimiento académico**
- Notas, historial, asistencias, promedio, revisiones y certificado filtran siempre por el alumno del
  token y son solo para ALUMNO. `api/test/privacidad.test.js` lo verifica para que no se rompa.
- Los errores internos (500) ya no muestran el mensaje de Prisma al cliente: podía incluir datos de la
  base, como el hash de una contraseña. El detalle queda solo en la consola de la API.
- Regla para el módulo de calendario cuando se haga: las actividades se filtran siempre por
  `req.usuario.id`, nunca por un id que venga en la URL o el body.

Las notificaciones (historial, avisos del docente, cambio de horario, calificaciones, fechas de examen y
recordatorio de entregas) están completas. Todo lo demás (calendario) está sin empezar.

## Una cosa para definir en grupo

Faltan los módulos de calendario y comunicación institucional. En Trello hay dos listas
vacías esperando que alguien decida si entran o no.

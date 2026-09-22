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
  src/routes/             un archivo por módulo (auth, materias, horarios, planes)
  src/services/           lógica compartida entre rutas (ej. resolverPlanAlumno)
  test/                   tests con node:test, sin depender de Postgres real
web/
  src/api.js              cliente HTTP, maneja el token
  src/App.jsx             login/registro + pestañas según rol
  src/auth/               Login y Registro
  src/materias/           lista de materias, detalle, elegir comisión
  src/horarios/           grilla semanal del alumno
  src/planes/             crear plan, mi plan, asignar carrera/plan (ADMIN)
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

Todo lo demás (correlatividades, evaluaciones, calendario, notificaciones) está sin empezar.

## Una cosa para definir en grupo

Faltan los módulos de calendario y comunicación institucional. En Trello hay dos listas
vacías esperando que alguien decida si entran o no.

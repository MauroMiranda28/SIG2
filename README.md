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

Necesitás Node 20+ y PostgreSQL corriendo.

```bash
git clone <url-del-repo>
cd sig2
npm install

cp api/.env.example api/.env
# editá api/.env con tu usuario y contraseña de Postgres

npm run db:push --workspace=api   # crea las tablas
npm run dev                       # levanta API (3000) y front (5173)
```

Si `http://localhost:5173` muestra "conectado", está todo bien.

## Estructura

```
api/
  prisma/schema.prisma    modelo de datos (ver abajo)
  src/index.js            servidor, registra los routers
  src/middleware/auth.js  requiereAuth y requiereRol
  src/routes/             un archivo por módulo
web/
  src/api.js              cliente HTTP, maneja el token
  src/App.jsx             cáscara mínima
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

- `POST /api/auth/registro` y `POST /api/auth/login` (Seg-01, Seg-04, U-01)
- `GET /api/auth/perfil` y `PATCH /api/auth/perfil` (U-02)
- `GET /api/materias` (Mat-01)
- `GET /api/materias/:id` (Mat-03)
- `GET /api/horarios/comision/:id` y `POST /api/horarios` (Horarios U-01, falta
  la validación de superposiciones)

Todo lo demás está sin empezar.

## Dos cosas para definir en grupo

1. La historia "Como estudiante, quiero cargar los bloques horarios y aulas
   asignadas" tiene el rol mal puesto: cargar aulas es gestión, no algo que haga
   un alumno. Por ahora el endpoint está restringido a docente y admin.
2. Faltan los módulos de calendario y comunicación institucional. En Trello hay
   dos listas vacías esperando que alguien decida si entran o no.

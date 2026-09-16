# Planes de estudio — guía para Santiago y el equipo

## Qué incluye

- ADMIN: pestaña «Crear plan», selección de carrera vigente, nombre, año de versión, vigencia y carga opcional de materias nuevas. Cada materia tiene código, nombre, año de cursado, cuatrimestre opcional y carga horaria opcional.
- ALUMNO: pestaña «Mi plan de estudios», carrera, versión y TODAS las materias ordenadas por año y cuatrimestre. No se filtran aprobadas.
- Permisos en la API, mensajes de carga/error/vacío y confirmación de creación.
- Creación atómica: si una materia falla, no se guarda parcialmente el plan.
- No incluye edición/eliminación de planes, correlatividades ni una pantalla para asignar alumnos. Esas funcionalidades se coordinan con sus responsables.

## Aplicar el ZIP de cambios a tu proyecto

Este paquete contiene SOLO archivos nuevos o modificados sobre el ZIP que compartiste. No reemplaza el proyecto completo.

1. Detené API y web con Ctrl+C.
2. En VS Code abrí tu carpeta SIG2, la que clonaste con Git.
3. Ejecutá `git status` y `git branch --show-current`. Trabajá en `feature/planes-estudio` si ya existe. Si no existe, creala con `git switch -c feature/planes-estudio`.
4. Si modificaste alguno de estos archivos después de enviarme el ZIP, compará los cambios antes de reemplazarlo. Si el grupo actualizó esos mismos archivos, integrá ambas versiones, no los sobrescribas sin revisar.
5. Extraé el paquete y copiá las carpetas `api`, `web` y `docs` de su interior dentro de tu SIG2. Aceptá reemplazar los archivos de esta entrega sobre la versión que me enviaste. No borres las otras carpetas.
6. Conservá `api/.env` tal como lo tenías. Este paquete no contiene contraseñas, `.git` ni dependencias.
7. En una terminal ubicada en la raíz SIG2:

```powershell
npm run db:push --workspace=api
npx prisma generate --schema=api/prisma/schema.prisma
npm run build --workspace=web
node --test api/test/planes.test.js
```

El cambio de esquema agrega una relación opcional: no requiere borrar datos. Si Prisma solicita un reset o avisa pérdida de datos, detenete y revisá la diferencia del esquema con el equipo; no uses `--force-reset` ni `--accept-data-loss` para resolverlo.

8. Reiniciá en dos terminales separadas, ambas en SIG2:

```powershell
npm run dev:api
```

```powershell
npm run dev:web
```

Abrí la URL que indique Vite, normalmente http://localhost:5173.

## Preparar datos para una prueba local

El registro actual no crea administradores ni asigna carrera/plan. Para probar sin desarrollar módulos ajenos, usá Prisma Studio sobre TU base local:

```powershell
npm run db:studio --workspace=api
```

1. Registrá dos cuentas de prueba desde la web. Una cuenta con correo del dominio `@alumnos.ucse.edu.ar` se crea como ALUMNO. Usá contraseñas propias de prueba.
2. En Studio, tabla Usuario, cambiá el rol de UNA cuenta de prueba a ADMIN. No cambies `passwordHash`. Guardá y cerrá sesión en la web; ingresá otra vez para renovar el rol en el token.
3. En Carrera, verificá que exista una carrera vigente. Si no existe, creá una de prueba con nombre, código único y `vigente = true`; el ID se genera solo.
4. Ingresá como ADMIN y abrí «Crear plan». Seleccioná esa carrera y cargá, por ejemplo, Plan 2026, versión 2026, con dos materias de distintos años. Usá códigos que no existan, por ejemplo INF26-P1 e INF26-BD1. Guardá y anotá el ID que informa la pantalla.
5. En Studio, Usuario, asigná a la cuenta ALUMNO su `carreraId` y el `planEstudioId` del plan creado. Deben corresponder a la misma carrera. Guardá.
6. Ingresá como ese alumno y abrí «Mi plan de estudios». Deben verse ambas materias, agrupadas por año. La pestaña existente «Materias» también consulta esa misma versión.
7. Esta preparación manual es para desarrollo local. El módulo responsable de inscripciones/perfiles deberá gestionar la asignación en el sistema final. No se agregó un endpoint público para cambiar roles.

## Decisiones que debe conocer el grupo

### Relación alumno-plan

El modelo previo solo tenía `Usuario.carreraId`; una carrera admite varios planes. Se agregan `Usuario.planEstudioId` (opcional) y `PlanEstudio.alumnos` como relación inversa. Esta modificación debe informarse en el PR, tal como pide el README del grupo.

- Si hay asignación explícita, se consulta ese plan, incluso si no está vigente: un alumno puede seguir cursando una versión anterior.
- Si no hay asignación y existe un único plan vigente en su carrera, se usa ese plan como compatibilidad con datos anteriores. No se escribe una asignación automática.
- Si hay varios vigentes, se pide asignación administrativa. Nunca se elige «el más nuevo» ni se mezclan sus materias.
- Sin carrera o sin plan, se informa la situación.
- Si carrera y plan no coinciden, se rechaza la consulta con un mensaje de corrección.
- Crear otro plan NO cambia las asignaciones ni desactiva planes anteriores. Si se dependía de la compatibilidad de plan único, será necesario asignar un plan explícito cuando haya varios vigentes.

### Materias y versiones

Se conserva el diseño existente: cada Materia pertenece a un solo plan y `Materia.codigo` es único en todo el sistema. El formulario crea materias nuevas, no mueve las de otro plan. Si el equipo quiere reutilizar el mismo código en versiones distintas, deberá acordar otro modelo; este cambio no lo redefine.

El plan puede crearse vacío. La carga inicial de materias es una facilidad de esta historia, no sustituye el CRUD del compañero responsable. Cuatrimestre nulo significa «sin especificar», no se asume que sea anual.

Se rechaza el mismo nombre (sin distinguir mayúsculas) y año dentro de la misma carrera. El control usa una transacción serializable; escrituras futuras de otros módulos deberían respetar esa regla. No se agregó una restricción única sobre planes preexistentes para evitar una migración que falle por duplicados anteriores.

Validación: nombre del plan 1–120 caracteres, año de versión 1900–2100; hasta 200 materias, nombre 1–160 y código 1–40, año de cursado 1–20, cuatrimestre 1/2 o nulo y carga horaria 1–10000 o nula. Son límites iniciales ajustables según los requisitos del equipo.

### Integración con materias

`GET /api/materias` ahora utiliza el mismo resolvedor de plan. Antes juntaba materias de todos los planes vigentes de una carrera. Sus objetos de respuesta y estados de cursada se conservan; cuando falta asignación, ahora retorna un error descriptivo que la pantalla existente muestra.

## Endpoints

| Método y ruta | Rol | Función |
|---|---|---|
| GET /api/planes/carreras | ADMIN | Carreras vigentes para el formulario |
| POST /api/planes | ADMIN | Crear plan y materias en una transacción |
| GET /api/planes/mi-plan | ALUMNO | Plan del alumno identificado por JWT |

POST de ejemplo (usá un carreraId real):

```json
{
  "nombre": "Plan 2026",
  "anio": 2026,
  "carreraId": 1,
  "vigente": true,
  "materias": [
    { "nombre": "Programación I", "codigo": "INF26-P1", "anio": 1, "cuatrimestre": 1, "cargaHoraria": 96 }
  ]
}
```

## Archivos y responsabilidades

| Archivo | Cambio |
|---|---|
| api/prisma/schema.prisma | Relación opcional alumno-plan |
| api/src/services/planes.js | Validación y resolución de plan |
| api/src/routes/planes.js | Tres endpoints con autenticación y rol |
| api/src/index.js | Montaje del router |
| api/src/routes/materias.js | Usa el plan resuelto |
| web/src/planes/CrearPlan.jsx | Formulario del administrador |
| web/src/planes/MiPlan.jsx | Consulta de todas las materias |
| web/src/planes/planes.css | Estilos limitados a las nuevas pantallas |
| web/src/App.jsx | Pestañas por rol y reinicio de pestaña al salir |
| api/test/planes.test.js | Validaciones, selección del plan y contrato HTTP |

No se agregaron dependencias ni se cambiaron los scripts del equipo.

## Verificación

En el entorno de desarrollo del asistente: generación de Prisma correcta, build de Vite correcto y 12 pruebas automatizadas aprobadas. Las pruebas HTTP usan Express, JWT y una base simulada: verifican permisos, validaciones, selección del plan, creación anidada y manejo de conflictos, pero NO reemplazan una prueba contra PostgreSQL real. No se ejecutaron los módulos contra tu base local ni se verificó visualmente en un navegador.

Prueba manual pendiente en tu computadora:

- ADMIN crea un plan con dos materias; aparece confirmación y se guardan los registros.
- ALUMNO ve todas esas materias; las aprobadas también deben seguir apareciendo.
- No se puede crear un plan desde una cuenta ALUMNO o DOCENTE.
- Nombre vacío, año inválido, códigos repetidos o existentes generan error sin guardado parcial.
- Carrera sin planes, plan vacío y alumno sin carrera muestran mensajes claros.
- Con dos versiones, el alumno asignado ve solo la suya; sin asignación se informa que debe resolverla administración.
- Las pantallas existentes de materias y horarios siguen funcionando con tus datos.

## Entrega al equipo

Revisá `git diff` y `git status`. Agregá solo los archivos de esta entrega, sin `.env`, y prepará el commit y PR siguiendo las reglas del grupo. Explicá la relación nueva, el ajuste en materias y la compatibilidad del plan único. Este paquete no hizo push ni modificó el repositorio remoto.

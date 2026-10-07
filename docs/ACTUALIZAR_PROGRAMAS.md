# Actualizar programas — administrador IT

Historia: Como administrador IT, quiero actualizar programas, para mantener disponible la versión vigente.

Entrega basada en SIG2 (2).zip, recibido el 07/10/2026. Continúa la carga en texto de contenidos y bibliografía. Se conserva la carga PDF existente del equipo.

## Instalación

1. Guardá todo en VS Code y detené API y web con Ctrl+C.
2. En la raíz de SIG2, ejecutá `git status`. Si hay cambios tuyos pendientes, guardalos en un commit antes de copiar esta entrega; no incluyas .env.
3. Creá una rama desde la versión actualizada que me enviaste:

```powershell
git switch -c programas/actualizar-vigente
```

4. Extraé el ZIP y copiá las carpetas api, web y docs dentro de SIG2, combinando carpetas. No borres las carpetas existentes.
5. Se reemplazan únicamente api/src/routes/programas.js y web/src/App.jsx. Están basados en el ZIP nuevo y conservan sus otras funciones. Si los editaste después de enviarlo, comparalos antes de reemplazar.
6. No hay cambios de esquema ni dependencias nuevas. Si el proyecto ya funciona, no ejecutes db:push por esta historia.
7. Reiniciá los servidores en terminales separadas:

```powershell
npm run dev:api
```

```powershell
npm run dev:web
```

8. Ingresá como ADMIN y abrí «Actualizar programa».

## Funcionamiento

- El selector lista las materias con un programa en texto, indicando carrera y plan.
- Al elegir, se cargan los contenidos, bibliografía, versión, estado y fecha guardados.
- Podés modificar contenidos y bibliografía. La bibliografía puede vaciarse.
- «Publicar versión N» aumenta en uno el número de versión y marca vigente=true.
- La fecha se actualiza mediante el mecanismo existente de Prisma.
- El guardado, el registro del autor y la actualización de la descarga se realizan en una transacción: todo o nada.
- Si el programa no estaba vigente, puede republicarse con una versión nueva.
- Guardar sin cambios un programa ya vigente no crea una versión artificial.
- Cancelar una confirmación para cambiar de materia no descarta el formulario. Durante el guardado se bloquean acciones.
- «Recargar versión guardada» vuelve a consultar la base y pide confirmación si hay texto sin guardar.

## Control de ediciones simultáneas

El formulario envía la versión que abrió. Si otra persona la cambió, el servidor devuelve 409 y no sobrescribe esa publicación. Conservás tu texto en pantalla: podés copiarlo antes de recargar la versión guardada y volver a aplicar los cambios pertinentes.

Se verifica la versión en una actualización condicional y una transacción serializable. También se comprueba que el PDF asociado no haya cambiado desde que se abrió la pantalla.

## PDF vigente

El proyecto prioriza los PDFs subidos cuando se solicita la descarga. Por eso, si una materia tiene un archivo anterior asociado, la pantalla exige marcar:

«Confirmo que la descarga PDF pase a generarse desde el texto actualizado y deje de ofrecer el archivo anterior».

Sin esa confirmación no se publica la actualización. Al guardar se retira la asociación programaUrl de la materia y la descarga existente genera el PDF desde el texto vigente. No se elimina físicamente el archivo anterior del disco; deja de ofrecerse como descarga de la materia. No es un archivo de historial recuperable desde esta pantalla.

Una carga PDF posterior desde el módulo ya existente del equipo volverá a tener prioridad en la descarga. Esta historia actualiza programas en texto; no redefine el flujo PDF de los docentes.

Si la materia solo tiene un PDF y no tiene programa en texto, usá «Cargar programa» para crear el registro antes de actualizarlo.

## Historial y alcance

El modelo existente guarda un Programa por materia. Se conserva su ID y relación con la materia, reemplazando el contenido por el vigente y aumentando version.

Se registra el autor, la fecha y el cambio de versión en CambioMateria, usando la acción existente PROGRAMA_SUBIDO con un detalle explícito de actualización de texto. No se agregan valores al enum ni migraciones.

No se guardan copias completas de los textos anteriores ni se agrega restauración de versiones. Si el grupo requiere ese historial, necesita una historia/modelo adicional. Los programas nuevos siguen creándose con la pantalla original.

## Criterios de aceptación

- Solo ADMIN puede obtener el formulario administrativo y actualizar. Sin token: 401. ALUMNO/DOCENTE: 403.
- El programa debe existir; si no existe: 404.
- Contenidos obligatorios, máximo 20000 caracteres; bibliografía opcional, máximo 10000.
- Solo se aceptan los campos contenidos, bibliografia, version, reemplazarPdf y pdfEsperado. La materia y la vigencia no se eligen en el body de actualización.
- Versión y fecha actualizadas, vigente=true y autor registrado en el mismo guardado.
- El alumno consulta el texto publicado desde la ruta existente; bibliografía recomendada usa el nuevo texto al consultar nuevamente.
- El programa anterior continúa visible hasta que se completa el guardado. No se despublica por adelantado.
- Conflictos o errores no muestran éxito y conservan el formulario.

## Archivos

Modificados:
- api/src/routes/programas.js: GET /api/programas/:id y PATCH /api/programas/:id, bajo el control ADMIN ya existente. Conserva catálogo y carga inicial.
- web/src/App.jsx: import, pestaña y vista de ActualizarPrograma para ADMIN.

Nuevos:
- api/src/services/actualizarProgramas.js: validación, control de versión, publicación transaccional y auditoría.
- web/src/programas/ActualizarPrograma.jsx: formulario de edición, precarga, confirmación PDF y recarga.
- api/test/actualizar-programas.test.js: diez pruebas nuevas.
- docs/ACTUALIZAR_PROGRAMAS.md: esta guía.

## Prueba manual local

1. Elegí un programa en texto ya cargado, anotá su versión y modificá un párrafo y la bibliografía.
2. Publicá: debe aumentar la versión en uno y aparecer el mensaje de éxito. Recargá para comprobar persistencia.
3. Ingresá como alumno de ese plan: «Materias → Ver programa» debe mostrar el contenido actualizado al abrirlo de nuevo. La bibliografía recomendada debe coincidir.
4. Descargá el programa: si confirmaste reemplazar el PDF anterior, debe generarse desde el contenido nuevo.
5. Abrí el mismo programa en dos pestañas ADMIN. Guardá en una y luego intentá guardar desde la otra: debe avisar conflicto sin sobrescribir lo anterior.
6. Si hay un PDF, sin la casilla marcada el botón de publicación debe permanecer deshabilitado. Confirmá solo si querés que la descarga utilice el texto actualizado.
7. Intentá guardar espacios como contenido: no se permite. Vaciar bibliografía sí se permite.
8. Verificá el registro de cambio de materia con el autor y la transición de versión.

## Verificación realizada

Prisma generado y frontend compilado correctamente. Pasaron 41 pruebas relacionadas: diez nuevas, carga inicial, utilidades PDF, descarga, bibliografía y auditoría. Las pruebas HTTP usan Express/JWT y una base simulada; no se probaron transacciones contra tu PostgreSQL real ni se inspeccionó visualmente el navegador. Completá la prueba manual antes de entregar el PR.

Para ejecutar las pruebas relacionadas:

```powershell
node --test api/test/actualizar-programas.test.js api/test/carga-programas.test.js api/test/programas.test.js api/test/descargar-programa.test.js api/test/bibliografia.test.js api/test/auditoriaMateria.test.js
npm run build --workspace=web
```

Si no se generó Prisma en tu entorno nuevo: `npx prisma generate --schema=api/prisma/schema.prisma`.

## Entrega al equipo

Después de probar y revisar los cambios:

```powershell
git add api/src/routes/programas.js api/src/services/actualizarProgramas.js api/test/actualizar-programas.test.js web/src/App.jsx web/src/programas/ActualizarPrograma.jsx docs/ACTUALIZAR_PROGRAMAS.md
git diff --cached --stat
git commit -m "Agrega actualizacion de programas con control de version"
git push -u origin programas/actualizar-vigente
```

Abrí PR hacia la base acordada con el grupo. Destacá el control de versión, la publicación y auditoría en una transacción y la confirmación para retirar un PDF anterior de la descarga. No se hizo push desde el asistente.

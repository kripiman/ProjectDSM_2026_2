# ProjectDSM - Rock & Mineral Analysis Backend

Backend REST API para una aplicación móvil de reconocimiento de rocas y minerales: administra usuarios, roles, catálogo de rocas (con tipos y categorías), reconocimiento de imágenes, colección personal, logros, estadísticas y retroalimentación sobre los resultados del modelo.

---

## Descripción

**ProjectDSM** (`projectdsm_2026_2`) permite que una aplicación móvil:

* **Identifique rocas y minerales** enviando una fotografía. El backend valida la imagen, consulta el modelo de reconocimiento (API GeoDex) y, si no está disponible, recurre a un clasificador heurístico local.
* **Funcione sin cuenta** mediante sesiones de invitado (hasta 10 reconocimientos por sesión) y conserve el progreso al crear una cuenta.
* **Mantenga una colección personal** que se completa automáticamente con cada reconocimiento.
* **Otorgue logros** definidos por datos, que los administradores crean y configuran.
* **Recoja retroalimentación** de los usuarios registrados sobre los resultados de la IA.
* **Ofrezca un panel administrativo** para gestionar usuarios, catálogo, logros y supervisar la actividad.

### Tipos de usuario

| Rol | Cómo se obtiene | Qué puede hacer |
|---|---|---|
| **Invitado** (`guest`) | `POST /auth/anonymous`, sin registrarse | Reconocer hasta 10 rocas por sesión, obtener logros y ver su progreso. |
| **Usuario** (`user`) | Registro / inicio de sesión | Reconocimientos sin límite, colección, logros, progreso, cuestionarios y feedback. |
| **Administrador** (`admin`) | Solo por el *seeder* (`ADMIN_EMAIL` / `ADMIN_PASSWORD`) o por otro administrador | Todo lo anterior más la gestión de usuarios, rocas, tipos, categorías, logros y estadísticas globales. |

Nadie puede asignarse privilegios de administrador al registrarse ni al actualizar su perfil: los campos de rol y estado no se leen de los datos enviados por el cliente.

---

## Tecnología Utilizada

* **Entorno de ejecución**: [Node.js](https://nodejs.org/) (v20.17 o superior)
* **Framework web**: [Express.js](https://expressjs.com/) (v5)
* **Base de datos**: [SQLite3](https://www.sqlite.org/) mediante [Sequelize](https://sequelize.org/) (v6), con convención de tablas en inglés, singular y minúsculas (`user`, `specimen`, `analysis`, `collection_item`, ...)
* **Autenticación y seguridad**: [JSON Web Token](https://jwt.io/) (`jsonwebtoken`), [bcryptjs](https://github.com/dcodeIO/bcrypt.js) para el hash de contraseñas y [CORS](https://github.com/expressjs/cors)
* **Variables de entorno**: [dotenv](https://github.com/motdotla/dotenv)
* **Registro de solicitudes HTTP**: [Morgan](https://github.com/expressjs/morgan)
* **Carga de archivos**: [Multer](https://github.com/expressjs/multer)
* **Validación de datos**: [Zod](https://zod.dev/)
* **Migraciones**: [sequelize-cli](https://github.com/sequelize/cli)
* **Pruebas**: [Jest](https://jestjs.io/) y [Supertest](https://github.com/ladjs/supertest)

La aplicación sigue una arquitectura modular por capas (configuración, modelos, rutas, controladores, middlewares, servicios y utilidades).

---

## Requisitos Previos

* **Node.js** 20.17 o superior (requisito del controlador `sqlite3`; se recomienda Node 20 LTS).
* **npm** 9 o superior.
* **Git**.
* *(Opcional)* Una **API key de GeoDex** para usar el modelo de reconocimiento real (ver [Reconocimiento con GeoDex](#reconocimiento-con-geodex)).

No es necesario instalar SQLite por separado: el controlador `sqlite3` incluye el motor.

---

## Instalación

1. **Clonar el repositorio**:
   ```bash
   git clone <URL_DEL_REPOSITORIO>
   cd ProjectDSM_2026_2
   ```

2. **Instalar las dependencias**:
   ```bash
   npm install
   ```

3. **Configurar las variables de entorno** a partir de la plantilla [`.env.example`](.env.example) (no contiene credenciales reales):
   ```bash
   cp .env.example .env
   ```
   Edite `.env` y defina al menos `JWT_SECRET`, `ADMIN_EMAIL` y `ADMIN_PASSWORD`.

4. **Inicializar la base de datos** (crea las tablas y carga los datos iniciales, incluido el administrador):
   ```bash
   npm run db:init
   ```

5. **Iniciar el servidor**:
   ```bash
   npm start
   ```
   El servidor queda disponible en `http://localhost:8080` (puerto configurable con `PORT`). Puede comprobarlo con `GET /health`.

> `npm start` también crea las tablas que falten y carga los datos iniciales al arrancar, por lo que el paso 4 es opcional en una instalación nueva.

---

## Variables de Entorno

Todas se leen en [`src/config/env.js`](src/config/env.js). La plantilla completa está en [`.env.example`](.env.example).

| Variable | Descripción | Valor por defecto |
|---|---|---|
| `PORT` | Puerto HTTP | `8080` |
| `NODE_ENV` | `development`, `production` o `test` | `development` |
| `DATABASE_STORAGE` | Archivo SQLite | `./rock.sqlite` |
| `LOG_SQL` | Imprime las sentencias SQL (por defecto solo en `development`) | `true` en desarrollo |
| `JWT_SECRET` | Clave de firma de los tokens. **Obligatoria en producción** (mínimo 32 caracteres). Si falta en otros entornos se usa una clave aleatoria por proceso y los tokens dejan de valer al reiniciar. | *(ninguno)* |
| `JWT_EXPIRES_IN` | Vigencia de los tokens de usuarios registrados (`30d`, `12h` o un número de segundos) | `30d` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Credenciales del administrador inicial (la contraseña requiere 8+ caracteres). Si están vacías no se crea ningún administrador. | *(vacío)* |
| `ADMIN_NAME` | Nombre visible del administrador inicial | `Administrator` |
| `GEODEX_API_URL` | URL base de la API GeoDex | `https://geodex-ml-api-76365064073.southamerica-west1.run.app` |
| `GEODEX_API_KEY` | API key de GeoDex. Sin ella se usa el clasificador heurístico. | *(vacío)* |
| `GEODEX_TIMEOUT_MS` | Tiempo máximo de espera de GeoDex (una consulta tarda 5–15 s) | `30000` |
| `ML_SERVER_URL` | Microservicio ML local opcional (vacío = deshabilitado) | *(vacío)* |
| `ML_TIMEOUT_MS` | Tiempo máximo de espera del microservicio ML local | `4000` |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | Adjudicador asistido opcional | *(vacío)* / `gpt-4o-mini` |
| `UPLOAD_DIR` | Carpeta de las imágenes enviadas a reconocimiento | `uploads/analyses` |
| `SPECIMEN_UPLOAD_DIR` | Carpeta de las imágenes del catálogo | `uploads/specimens` |
| `BCRYPT_ROUNDS` | Costo del hash de contraseñas | `10` (`4` en pruebas) |
| `LOGIN_MAX_ATTEMPTS` | Intentos de login fallidos permitidos por dirección IP y correo antes de bloquearlos | `3` |
| `LOGIN_LOCK_MINUTES` | Minutos que dura ese bloqueo | `15` |
| `TRUST_PROXY` | Cantidad de proxies inversos delante del servidor (`1` si hay uno), `true`, `false` o un valor de Express (`loopback`, una subred). Determina de dónde sale la dirección IP del cliente. | `false` |

---

## Base de Datos

El esquema está definido en los modelos de [`src/models`](src/models) y en las migraciones de [`src/database/migrations`](src/database/migrations).

| Comando | Descripción |
|---|---|
| `npm run db:init` | Crea las tablas que falten y carga los datos iniciales (idempotente). |
| `npm run db:reset` | **Borra todo** y reconstruye el esquema desde cero con los datos iniciales. Con `NODE_ENV=production` exige confirmar con `npm run db:reset -- --yes`. |
| `npm run db:seed` | Carga solo los datos iniciales (el esquema debe existir). |
| `npm run db:migrate` | Aplica las migraciones pendientes. |
| `npm run db:migrate:status` | Muestra qué migraciones están aplicadas. |
| `npm run db:migrate:undo` | Revierte la última migración. |

### Datos iniciales (seeders)

Se cargan desde [`src/database/seeders.js`](src/database/seeders.js) y son idempotentes: pueden ejecutarse varias veces y nunca sobrescriben lo que un administrador haya editado.

* **Roles**: `guest`, `user`, `admin`.
* **Usuario administrador**: creado con `ADMIN_EMAIL` y `ADMIN_PASSWORD` (contraseña almacenada con hash bcrypt). No existen credenciales por defecto.
* **Categorías**: `mineral`, `igneous_rock`, `sedimentary_rock`, `metamorphic_rock`.
* **Tipos**: `silicato`, `oxido`, `sulfuro`, `carbonato`.
* **Catálogo**: 12 especímenes, cada uno asociado a una categoría y un tipo.
* **Logros**: seis logros automáticos con su regla de desbloqueo.
* **Cuestionario** de ejemplo.

### Actualizar una base de datos existente

Las tablas ya creadas no se modifican solas. Si el servidor informa que *el esquema de la base de datos está desactualizado*, aplique las migraciones:

```bash
npm run db:migrate
npm run db:seed
```

o reconstruya la base desde cero con `npm run db:reset` (elimina los datos). Las migraciones pueden aplicarse tanto sobre una base vacía como sobre una creada con una versión anterior.

---

## Ejecución

```bash
npm run dev      # desarrollo, con recarga automática (nodemon)
npm start        # producción
npm test         # suite de pruebas
```

---

## Reglas de Negocio

### Inicio de sesión

* `POST /auth/login` admite un número limitado de intentos fallidos por dirección IP y correo (`LOGIN_MAX_ATTEMPTS`, por defecto 3). Al agotarlos, los siguientes se rechazan con `429` y `errorCode: "TOO_MANY_LOGIN_ATTEMPTS"` durante `LOGIN_LOCK_MINUTES` (por defecto 15), **incluso con la contraseña correcta**. La respuesta trae la cabecera `Retry-After` y `details.retry_after_seconds` para avisar al usuario.
* Un inicio de sesión exitoso reinicia el conteo. Un correo que no existe se trata igual que uno que existe (mismo conteo, mismo `401` y un tiempo de respuesta equivalente), de modo que el login no revela qué cuentas existen; el registro, en cambio, sí informa cuando un correo ya está en uso. Las solicitudes mal formadas (`400`) y el acceso con la contraseña correcta de una cuenta suspendida (`403`) no consumen intentos.
* El conteo vive en memoria (se reinicia con el servidor), es compartido por `/auth/login` y su alias `/api/user/login` y no guarda los correos, solo una huella de ellos. Es una barrera contra adivinar la contraseña de una cuenta, no reemplaza la limitación por IP de un proxy inverso: probar una misma contraseña en muchas cuentas, o desde muchas direcciones, no se frena.
* La dirección es la que Express ve en la conexión. Detrás de un proxy inverso o de un servicio de alojamiento todos los clientes compartirían la del proxy y cualquiera podría bloquear la cuenta de otra persona: configure `TRUST_PROXY` para tomarla de `X-Forwarded-For`. Con clientes que llegan directo déjelo en `false`; de lo contrario podrían elegir su propia dirección.

### Sesiones de invitado

* `POST /auth/anonymous` crea una sesión temporal guardada en la base de datos; su identificador es un UUID v4 protegido por el token JWT.
* Cada sesión admite **10 reconocimientos**. Al intentar el undécimo, la API responde `403` con `errorCode: "GUEST_LIMIT_REACHED"` (y `details.registration_required: true`) para que la aplicación pida crear la cuenta. El límite se comprueba antes de recibir la imagen y de nuevo, de forma atómica, al guardar el resultado, por lo que solicitudes simultáneas no pueden superarlo. Las imágenes rechazadas (por no ser rocas) no cuentan.
* Un invitado puede obtener logros y ver su progreso y cuota restante en `GET /collection/progress`.
* Al registrarse enviando el `guest_token`, la misma cuenta pasa a ser un usuario registrado: **reconocimientos, descubrimientos y logros se conservan**. La sesión temporal se **invalida** en ese momento (el token anterior deja de funcionar) y no puede transferirse a una segunda cuenta.

### Fotos de los reconocimientos

Las fotos enviadas a reconocimiento son privadas: no existe una URL pública de archivo. El campo `image_url` de cualquier respuesta es la ruta `/analysis/:id/image`, que solo entrega la foto a su dueño (también una sesión de invitado) y a los administradores. El cliente la pide con su token, como el resto de las llamadas:

```js
// React Native
<Image source={{ uri: `${API}${analysis.image_url}`, headers: { Authorization: `Bearer ${token}` } }} />
```

Las imágenes del catálogo (`/uploads/specimens/...`) siguen siendo públicas.

### Colección personal

* Cada reconocimiento registra automáticamente la roca identificada en la colección del usuario; no existe un endpoint para agregar o quitar entradas manualmente.
* Una roca nunca se duplica: se conserva la **fecha del primer descubrimiento** y un contador (`occurrences_count`, con `additional_recognitions` para los reconocimientos adicionales).
* Cada usuario solo consulta su propia colección. El usuario puede anotar sus descubrimientos (`notes`, `is_favorite`, `custom_image_url`).

### Logros

Los administradores definen cada logro con un tipo de condición, un umbral y un parámetro opcional:

| `condition_type` | Se cumple cuando... | `condition_value` |
|---|---|---|
| `FIRST_SCAN` / `TOTAL_SCANS` | el usuario acumula `required_count` reconocimientos | — |
| `UNIQUE_SPECIMENS` | descubre `required_count` rocas distintas | — |
| `CATEGORY_SPECIMENS` | descubre `required_count` rocas de una categoría | id de la categoría |
| `REFINEMENTS` | refina `required_count` reconocimientos | — |
| `QUIZ_SCORE` | aprueba `required_count` cuestionarios con al menos ese puntaje | puntaje mínimo (por defecto 60) |

Cada logro se otorga una sola vez y registra su fecha de desbloqueo y su recompensa de experiencia. Eliminar un logro en el panel de administración lo **desactiva** (deja de otorgarse) sin perder el historial de quienes ya lo obtuvieron.

### Retroalimentación

Solo los usuarios registrados pueden evaluar un reconocimiento, y únicamente los propios. Cada reconocimiento admite **una** evaluación (`correct`, `incorrect` o `uncertain`, con comentario opcional), que su autor puede consultar y actualizar. El administrador puede consultarlas todas.

### Tipos y categorías

Son dos entidades independientes, con nombres únicos (se normalizan: `"Oxido"` y `" oxido "` son el mismo). Un tipo o una categoría **con rocas asociadas no puede eliminarse**. Toda roca exige tipo, categoría, descripción e imagen.

---

## Documentación de la API

Todas las rutas se exponen en la raíz (`/`). Las respuestas usan una estructura uniforme:

```json
{ "success": true, "statusCode": 200, "message": "Operación completada", "data": { } }
```
```json
{ "success": false, "statusCode": 403, "errorCode": "403_FORBIDDEN", "message": "...", "details": null }
```

Las rutas protegidas requieren la cabecera `Authorization: Bearer <token>`. Niveles de acceso: **Público**, **Sesión** (invitado o registrado), **Registrado** (usuario o administrador, no invitados) y **Admin**.

| Código HTTP | `errorCode` | Situación |
|---|---|---|
| 400 | `400_VALIDATION_ERROR` | Datos inválidos o incompletos |
| 401 | `401_UNAUTHORIZED` | Token ausente, inválido, vencido o sesión invalidada |
| 403 | `403_FORBIDDEN` | Sin permiso o cuenta suspendida |
| 403 | `GUEST_LIMIT_REACHED` | La sesión de invitado agotó sus 10 reconocimientos |
| 404 | `404_NOT_FOUND` | Recurso inexistente |
| 409 | `409_CONFLICT` | Duplicado o conflicto con otros registros. En un duplicado, `details.field` nombra el campo repetido (`email`, `userName`, `scientific_name`, `name`, `code`, `analysis_id`). |
| 422 | `422_NON_SPECIMEN_IMAGE` | La imagen no corresponde a una roca o mineral |
| 429 | `TOO_MANY_LOGIN_ATTEMPTS` | Se agotaron los intentos de login (ver [Inicio de sesión](#inicio-de-sesión)) |
| 500 | `500_INTERNAL_SERVER_ERROR` | Error interno (sin detalles internos en la respuesta) |

### Autenticación (`/auth`)

| Método | Endpoint | Acceso | Descripción |
|---|---|:---:|---|
| `POST` | `/auth/anonymous` | Público | Crea una sesión de invitado. |
| `POST` | `/auth/register` | Público | Registra una cuenta (`email`, `password`, `userName`, `phone`, `display_name`). Con `guest_token` migra la sesión de invitado. |
| `POST` | `/auth/login` | Público | Inicia sesión con correo y contraseña. Limita los intentos fallidos (ver [Inicio de sesión](#inicio-de-sesión)). |
| `DELETE` | `/auth/account` | Sesión | Baja lógica de la cuenta. |

Alias de compatibilidad: `/auth/registro`, `/api/user/registro`, `/api/user/login`.

### Perfil (`/user`)

| Método | Endpoint | Acceso | Descripción |
|---|---|:---:|---|
| `GET` | `/user/profile` | Sesión | Perfil, nivel y cuota restante de invitado. |
| `PATCH` | `/user/profile` | Sesión | Actualiza `display_name`, `userName`, `phone`, `avatar_url` (cualquier otro campo se ignora). |
| `GET` / `PUT` | `/user/preferences` | Sesión | Consulta / actualiza preferencias. |

### Catálogo de rocas

| Método | Endpoint | Acceso | Descripción |
|---|---|:---:|---|
| `GET` | `/rock` | Público | Catálogo completo. Filtros: `category_id`, `category`, `type_id`, `type`, `rarity`, `magnetism`, `q`; paginación opcional (`page`, `limit`). |
| `GET` | `/rock/:id` | Público | Detalle de una roca (por id o índice de catálogo). |
| `POST` | `/rock` | Admin | Crea una roca. Datos JSON (con `imgUrl`) o `multipart/form-data` con el archivo `image`. Obligatorios: nombre, descripción, `categoryId`, `typeId` e imagen. |
| `PATCH` / `PUT` | `/rock/:id` | Admin | Actualiza una roca (también permite `is_active` para desactivarla). |
| `DELETE` | `/rock/:id` | Admin | Elimina la roca del catálogo (baja lógica). |
| `GET` | `/specimen`, `/specimen/:id`, `/specimen/categories` | Público | Vista paginada del catálogo (20 por página), ficha de una roca y categorías con conteo. |

Alias de compatibilidad: `/api/rock`, `/rock/agregar`, `/rock/actualizar/:id`, `/rock/eliminar/:id`.

**`/rock` y `/specimen` leen la misma tabla** (`specimen`) con los mismos filtros; se diferencian en el uso:

* `/rock` es la gestión del catálogo: las altas, cambios y bajas son de administradores. Conserva el formato de respuesta de la clase (los datos van en `data` y repetidos en la raíz: `rock`, `rocks`), pagina solo si se envía `limit`, busca el detalle por id o por índice de catálogo y deja a un administrador ver las rocas desactivadas (`include_inactive=true`).
* `/specimen` es la vista de solo lectura pensada para la aplicación móvil: formato estándar de la API (`data.specimens`), siempre paginada, solo rocas activas y con el resumen de categorías con conteo (`/specimen/categories`). No modifica nada.

### Tipos y categorías (`/type`, `/category`)

| Método | Endpoint | Acceso | Descripción |
|---|---|:---:|---|
| `GET` | `/category`, `/type` | Público | Lista con la cantidad de rocas de cada una. |
| `GET` | `/category/:id`, `/type/:id` | Público | Detalle. |
| `GET` | `/category/:id/rocks`, `/type/:id/rocks` | Público | Rocas pertenecientes al tipo o categoría. |
| `POST` | `/category`, `/type` | Admin | Crea (`name`, `description`). |
| `PUT` / `PATCH` | `/category/:id`, `/type/:id` | Admin | Actualiza. |
| `DELETE` | `/category/:id`, `/type/:id` | Admin | Elimina, salvo que tenga rocas asociadas. |

### Reconocimiento (`/analysis`)

| Método | Endpoint | Acceso | Descripción |
|---|---|:---:|---|
| `POST` | `/analysis` | Sesión | Recibe una imagen (`multipart/form-data`, campo `image`; JPEG, PNG o WebP de hasta 8 MB), la valida, la reconoce, la registra y actualiza colección, experiencia y logros. La respuesta incluye `discovery` y `unlocked_achievements`. |
| `GET` | `/analysis` | Sesión | Historial de reconocimientos propios (paginado). |
| `GET` | `/analysis/:id` | Sesión | Detalle de un reconocimiento (su dueño o un administrador). |
| `GET` | `/analysis/:id/image` | Sesión | Foto del reconocimiento (solo su dueño o un administrador; `image_url` apunta aquí). |
| `POST` | `/analysis/:id/refine` | Sesión | Envía respuestas físicas (dureza, raya, magnetismo) para refinar un reconocimiento propio. |

### Colección y progreso (`/collection`)

| Método | Endpoint | Acceso | Descripción |
|---|---|:---:|---|
| `GET` | `/collection` | Sesión | Colección propia. Filtros: `category`, `category_id`, `favorite`; `include_locked=true` incluye las rocas aún no descubiertas. |
| `GET` | `/collection/progress` | Sesión | Total de reconocimientos, rocas distintas descubiertas, porcentaje del catálogo, desglose por categoría y tipo, logros desbloqueados, experiencia e historial de actividad (`activity_limit`). |
| `GET` | `/collection/:specimenId` | Sesión | Detalle de una roca descubierta: fecha del primer descubrimiento, contador y reconocimientos asociados. |
| `PATCH` | `/collection/:specimenId` | Sesión | Anota un descubrimiento (`notes`, `is_favorite`, `custom_image_url`). |

### Logros y cuestionarios

| Método | Endpoint | Acceso | Descripción |
|---|---|:---:|---|
| `GET` | `/achievement` | Sesión | Logros con el progreso del usuario. `?status=unlocked` o `locked`. |
| `GET` | `/quiz`, `/quiz/:id` | Sesión | Cuestionarios y sus preguntas. |
| `POST` | `/quiz/:id/submit` | Sesión | Evalúa las respuestas, acredita experiencia y evalúa logros. |

### Retroalimentación y telemetría (`/feedback`, `/event`)

| Método | Endpoint | Acceso | Descripción |
|---|---|:---:|---|
| `POST` | `/feedback/analysis/:analysisId` | Registrado | Evalúa un reconocimiento propio (`rating`, `comments`, `suggested_specimen_id`). Una evaluación por reconocimiento. |
| `GET` | `/feedback/analysis/:analysisId` | Registrado | Consulta la evaluación (su autor o un administrador). |
| `PUT` | `/feedback/analysis/:analysisId` | Registrado | Actualiza la evaluación propia. |
| `GET` | `/feedback/me` | Registrado | Evaluaciones enviadas por el usuario. |
| `POST` | `/event` | Público | Registra un evento de telemetría (el token es opcional). |

### Administración (`/admin`)

Todas las rutas exigen sesión válida **y** rol `admin`.

| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/admin/users` | Usuarios registrados (paginado). Filtros: `role`, `status`, `q`, `is_anonymous=all\|true`. |
| `GET` | `/admin/users/:id` | Ficha del usuario: perfil, progreso, colección y logros. |
| `GET` | `/admin/users/:id/collection` | Colección del usuario. |
| `GET` | `/admin/users/:id/achievements` | Logros obtenidos y bloqueados del usuario. |
| `PATCH` | `/admin/users/:id/role` | Cambia el rol (`user` / `admin`). |
| `PATCH` | `/admin/users/:id/status` | Cambia el estado (`active` / `suspended` / `banned`). |
| `GET` | `/admin/stats` | Usuarios registrados, total de reconocimientos, rocas más reconocidas (`top`), retroalimentación y tasa de aciertos, logros. |
| `GET` | `/admin/history` | Historial de reconocimientos (filtros `user_id`, `specimen_id`, `from`, `to`, `status`). |
| `GET` | `/admin/feedback` | Todas las evaluaciones de los usuarios (filtros `rating`, `user_id`). |
| `GET` / `POST` | `/admin/achievements` | Lista todos los logros / crea uno. |
| `GET` / `PUT` / `PATCH` | `/admin/achievements/:id` | Consulta / actualiza un logro. |
| `DELETE` | `/admin/achievements/:id` | Desactiva un logro (conserva el historial). |

Reglas de protección: un administrador nunca puede degradarse ni suspenderse si es el último administrador activo; no se puede cambiar el rol de una sesión de invitado; una cuenta suspendida pierde el acceso de inmediato, incluso con un token vigente.

---

## Reconocimiento con GeoDex

El reconocimiento usa la API **GeoDex** (`POST /api/v1/identify`). Para obtener una API key debe solicitarse una invitación y registrarse en `<GEODEX_API_URL>/signup`; luego se define en `GEODEX_API_KEY`.

Flujo de cada reconocimiento:

1. **Validación previa**: si la imagen no parece una roca se responde `422 NON_SPECIMEN_IMAGE` y el archivo se elimina.
2. **GeoDex**: se envía la imagen (base64) junto con el catálogo local como `candidates`; la respuesta se asocia a las rocas del catálogo por su `specimen_id`. Las identificaciones que no coinciden con una roca del catálogo se descartan. GeoDex informa la confianza como porcentaje (97 = 97 %) y el sistema la convierte a la escala 0–1 que usa el resto de la API.
3. **Respaldo**: si GeoDex no está configurado, tarda más de `GEODEX_TIMEOUT_MS`, supera su cuota diaria o no devuelve un resultado aprovechable, se usa el clasificador heurístico local; así el sistema funciona completo sin depender del servicio externo. El motivo de cada intento queda guardado en `raw_ai_response.provider_attempts` del análisis.
4. **Adjudicador asistido** (opcional) para resultados con confianza intermedia.

### Cuota de la API key

Cada key tiene una cuota diaria (la de este proyecto es de **50 consultas por día**) que se renueva a las 00:00 UTC. Una consulta tarda entre 5 y 15 segundos, por eso `GEODEX_TIMEOUT_MS` vale 30000 por defecto: una consulta abortada antes de tiempo igualmente se descuenta de la cuota. Para no gastarla:

* Una foto que ya fue consultada (mismo archivo y mismo catálogo) se responde desde memoria, sin llamar a GeoDex. La memoria guarda las últimas 100 fotos y se vacía al reiniciar el servidor.
* Si GeoDex rechaza la key o la cuota (HTTP 401, 403 o 429), el servidor deja de consultarlo durante 15 minutos (o el plazo que indique `Retry-After`) y los reconocimientos siguen con el clasificador local, sin volver a subir la imagen.
* Las pruebas automatizadas nunca llaman a GeoDex, de modo que no consumen la cuota.

El consumo del día se consulta con:

```bash
curl -H "Authorization: Bearer $GEODEX_API_KEY" "$GEODEX_API_URL/api/v1/key/usage"
# {"success":true,...,"daily_quota":50,"used_today":3,"remaining":47,"resets_at":"2026-10-02T00:00:00+00:00"}
```

---

## Estructura del Proyecto

```text
ProjectDSM_2026_2/
├── src/
│   ├── config/                # Constantes de dominio, variables de entorno, conexión y configuración de sequelize-cli
│   ├── controllers/           # Controladores HTTP (auth, user, rock, taxonomy, analysis, collection, achievement, feedback, quiz, event, admin)
│   ├── database/
│   │   ├── migrations/        # Migraciones de sequelize-cli
│   │   ├── init.js            # Creación del esquema y carga inicial (db:init, db:reset, db:seed)
│   │   └── seeders.js         # Datos iniciales idempotentes
│   ├── middlewares/           # Autenticación y autorización por rol, validación, carga de archivos, cuota de invitados y errores
│   ├── models/                # Modelos Sequelize y sus relaciones
│   ├── routers/               # Definición de rutas (incluye /admin, /category y /type)
│   ├── services/
│   │   ├── ai/                # Clientes de GeoDex, microservicio ML local y adjudicador
│   │   ├── analysis/          # Orquestación del reconocimiento y preprocesamiento de imágenes
│   │   ├── gamification/      # Logros configurables y experiencia
│   │   ├── heuristics/        # Clasificador heurístico de respaldo
│   │   └── *.service.js       # Catálogo, colección, cuota de invitados, estadísticas, usuarios y tokens
│   ├── utils/                 # Servidor, formato de respuestas, utilidades de archivos, exclusión mutua y UUID
│   ├── validations/           # Esquemas Zod de cada recurso
│   └── index.js               # Punto de entrada
├── tests/                     # Pruebas con Jest y Supertest (fixtures y utilidades compartidas)
├── uploads/                   # Imágenes recibidas (no se versiona)
├── .env.example               # Plantilla de configuración
├── .sequelizerc               # Rutas de sequelize-cli
├── package.json
└── README.md
```

---

## Pruebas

```bash
npm test
```

Las pruebas (Jest + Supertest) son herméticas: cada archivo usa su propia base de datos temporal, construida desde los modelos, con sus imágenes en una carpeta temporal y con la configuración fijada por [`tests/setup.js`](tests/setup.js), sin importar el contenido del `.env`. Nunca llaman a proveedores externos y se ejecutan en paralelo.

| Archivo | Cubre |
|---|---|
| [`tests/auth.test.js`](tests/auth.test.js) | Registro, inicio de sesión, hash de contraseñas, tokens, estado de cuenta, perfil, protección del último administrador y registros simultáneos. |
| [`tests/guest.test.js`](tests/guest.test.js) | Límite de 10 reconocimientos (incluso en paralelo), logros de invitados, migración a cuenta e invalidación del token. |
| [`tests/rock.test.js`](tests/rock.test.js) | CRUD de rocas protegido por rol, campos obligatorios, filtros, paginación y subida de imágenes. |
| [`tests/taxonomy.test.js`](tests/taxonomy.test.js) | CRUD de tipos y categorías, nombres únicos normalizados y bloqueo al eliminar con rocas asociadas. |
| [`tests/analysis.test.js`](tests/analysis.test.js) | Reconocimiento, rechazo 422, limpieza de archivos, propiedad de los análisis y refinamiento. |
| [`tests/collection.test.js`](tests/collection.test.js) | Colección automática, contador de reconocimientos, fecha del primer descubrimiento, progreso y estadísticas. |
| [`tests/achievement.test.js`](tests/achievement.test.js) | Desbloqueo de logros, logros configurables por datos, CRUD de administración y desactivación. |
| [`tests/feedback.test.js`](tests/feedback.test.js) | Reglas de retroalimentación: solo registrados, solo reconocimientos propios y una evaluación por reconocimiento. |
| [`tests/admin.test.js`](tests/admin.test.js) | Control de acceso de `/admin`, usuarios, roles, estados, estadísticas, historial y feedback. |
| [`tests/geodex.test.js`](tests/geodex.test.js) | Cliente de GeoDex (con una respuesta real del servicio como fixture): interpretación de respuestas, pausa ante cuota agotada, memoria de fotos repetidas y respaldo heurístico. |
| [`tests/concurrency.test.js`](tests/concurrency.test.js) | Cola de escrituras: exclusión mutua, tiempo de espera máximo y reglas de las transacciones anidadas. |
| [`tests/login_limit.test.js`](tests/login_limit.test.js) | Límite de intentos de login: bloqueo, `Retry-After`, reinicio al ingresar, intentos simultáneos, memoria acotada, cuentas inexistentes y dirección del cliente (`TRUST_PROXY`). |
| [`tests/analysis_photo.test.js`](tests/analysis_photo.test.js) | Fotos privadas: solo el dueño y los administradores, archivos ausentes o ilegibles, referencias fuera de la carpeta y carpetas servidas como archivos estáticos. |
| [`tests/seeders.test.js`](tests/seeders.test.js), [`tests/migrations.test.js`](tests/migrations.test.js), [`tests/database.test.js`](tests/database.test.js) | Datos iniciales, administrador sembrado, migraciones, detección de esquemas desactualizados y la confirmación `--yes` de `db:reset` en producción. |
| [`tests/security.test.js`](tests/security.test.js), [`tests/config.test.js`](tests/config.test.js) | Cuerpos vacíos o mal formados, errores sin detalles internos, cabeceras, secretos y configuración. |
| [`tests/catalog.test.js`](tests/catalog.test.js), [`tests/quiz.test.js`](tests/quiz.test.js), [`tests/event.test.js`](tests/event.test.js) | Catálogo público, cuestionarios y telemetría. |

---

## Cambios respecto a la versión anterior

Para quien consuma la API desde la aplicación móvil:

* **Sesiones**: los tokens ahora llevan una versión de sesión. Al crear una cuenta desde una sesión de invitado, o al suspender/bloquear/eliminar una cuenta, los tokens anteriores dejan de valer (los emitidos antes de esta versión siguen siendo válidos hasta ese momento). Los correos se comparan en minúsculas.
* **Colección**: `POST /collection` y `DELETE /collection/:id` ya no existen; los descubrimientos se registran solos al reconocer. Se agregan `GET /collection/:specimenId` y `PATCH /collection/:specimenId`.
* **Feedback**: `POST /feedback/:id` pasó a `POST /feedback/analysis/:analysisId` (solo usuarios registrados, una evaluación por reconocimiento).
* **Catálogo**: toda roca exige tipo, categoría, descripción e imagen; `GET /rock` lista solo las rocas activas (los administradores pueden pedir las inactivas con `include_inactive=true`). Un `limit` mayor a 100 se reduce a 100.
* **Validaciones más estrictas**: `theme` solo admite `light`, `dark` o `system`; los booleanos de las preferencias deben ser `true`/`false`; `magnetism` admite `true`, `false`, `1` o `0`.
* **Imágenes**: el límite de subida baja de 10 MB a 8 MB y la extensión guardada depende del tipo de imagen, no del nombre del archivo.
* **Cuestionarios**: la experiencia se acredita una vez por cuestionario (primer aprobado; un primer intento fallido paga una fracción) y las preguntas sin responder pueden enviarse como `null`.
* **Cuenta eliminada**: sus datos personales se borran y el correo puede registrarse de nuevo.
* **Login**: los intentos fallidos se limitan por IP y correo; al agotarlos, `POST /auth/login` responde `429` (ver [Inicio de sesión](#inicio-de-sesión)). Los correos de más de 254 caracteres se rechazan.
* **Duplicados**: un correo, nombre de usuario o nombre científico que ya existe responde `409` (`409_CONFLICT`) con `details.field`, igual que los demás duplicados; antes el registro y las rocas respondían `400`.
* **Fotos privadas**: `/uploads/analyses/...` ya no existe; `image_url` pasa a ser `/analysis/:id/image` y requiere el token del dueño o de un administrador.

---

## Autores

* **Gabriel Piñones** — *Desarrollo e Implementación*

### Licencia

Este proyecto está licenciado bajo los términos de la licencia **GNU Affero General Public License v3.0 o posterior** (ver el campo `license` de [`package.json`](package.json)).

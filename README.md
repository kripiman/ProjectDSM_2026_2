# ProjectDSM - Rock & Mineral Analysis Backend

Backend REST API y plataforma de persistencia para el sistema de análisis automatizado e identificación de muestras geológicas (minerales y rocas).

---

## Nombre del Proyecto

**ProjectDSM** (`projectdsm_2026_2`) — Sistema de Identificación y Catalogación Geológica.

---

## Descripción

**ProjectDSM** es una solución backend orientada al reconocimiento, clasificación y gestión educativa de muestras minerales y rocas (ígneas, sedimentarias y metamórficas). El sistema combina técnicas de procesamiento de imágenes, integración con microservicios de aprendizaje automático, heurísticas taxonómicas y un modelo de desambiguación asistido para proveer un flujo de identificación geológica resiliente y preciso.

### Pipeline Híbrido de Clasificación

1. **Filtro de Validación Previa (Non-Specimen Filter)**: Evalúa la imagen ingresada y rechaza aquellas que no corresponden a un espécimen geológico retornando un código de error HTTP `422 Unprocessable Entity` con el identificador `NON_SPECIMEN_IMAGE`.
2. **Extracción de Características Visuales**: Analiza determinísticamente propiedades fundamentales como color dominante, textura y brillo aparente.
3. **Microservicio de Machine Learning en Python**: Cliente HTTP desacoplado que consulta modelos de visión computacional externos con tolerancia a fallos y tiempo de espera configurable (`ML_TIMEOUT_MS`).
4. **Motor de Clasificación Heurístico (Fallback)**: Mecanismo de respaldo determinista basado en catálogo físico que opera de manera autónoma en caso de indisponibilidad del servicio de ML.
5. **Adjudicador Asistido**: Módulo de desambiguación para candidatos con márgenes de confianza cercanos, capaz de generar y evaluar preguntas de refinamiento físico basadas en propiedades empíricas (dureza en la escala de Mohs, color de raya, magnetismo y exfoliación).

### Funcionalidades Adicionales

* **Gestión de Sesiones Flexibles**: Soporte integral de sesiones anónimas (invitados) mediante tokens JWT y migración automática y transparente de colecciones e historial al consolidar el registro de usuario.
* **Colección Personal y Métricas**: Registro de descubrimientos con desglose cuantitativo y porcentual por grupos taxonómicos.
* **Módulo Educativo y Gamificación**: Sistema de cuestionarios evaluados, asignación de puntos de experiencia (XP), niveles y catálogo de logros desbloqueables.
* **Telemetría y Retroalimentación**: Registro de eventos de interacción y envío de feedback sobre la precisión de los análisis para calibración del sistema.

---

## Tecnología Utilizada

El proyecto está construido sobre el ecosistema Node.js adoptando una arquitectura por capas modular y desacoplada:

* **Entorno de Ejecución**: [Node.js](https://nodejs.org/) (v18 o superior)
* **Framework Web**: [Express.js](https://expressjs.com/) (v5.2.1)
* **Base de Datos**: [SQLite3](https://www.sqlite.org/) (v6.0.1)
* **ORM**: [Sequelize](https://sequelize.org/) (v6.37.8) aplicando convenciones en inglés, singular y en minúsculas (`user`, `specimen`, `analysis`, etc.)
* **Autenticación y Seguridad**: 
  * [JSON Web Token (JWT)](https://jwt.io/) (`jsonwebtoken` v9.0.3)
  * [BcryptJS](https://github.com/dcodeIO/bcrypt.js) (v3.0.3) para derivación y hashing seguro de credenciales
  * [CORS](https://github.com/expressjs/cors) (v2.8.6) para políticas de origen cruzado
* **Carga de Archivos**: [Multer](https://github.com/expressjs/multer) (v2.3.0) para procesamiento de transferencias `multipart/form-data`
* **Validación de Datos**: [Zod](https://zod.dev/) (v4.5.4)
* **Generación de Identificadores**: [UUID](https://github.com/uuidjs/uuid) (v14.0.2 - UUIDv4)
* **Logging HTTP**: [Morgan](https://github.com/expressjs/morgan) (v1.12.0)
* **Testing Automatizado**: [Jest](https://jestjs.io/) (v30.5.1) y [Supertest](https://github.com/ladjs/supertest) (v7.2.2)
* **Herramientas de Desarrollo**: [Nodemon](https://nodemon.io/) (v3.1.14), [Dotenv](https://github.com/motdotla/dotenv) (v17.4.2), `sequelize-cli` (v6.6.5)

---

## Requisitos Previos

Antes de configurar y ejecutar el proyecto, asegúrese de contar con los siguientes elementos instalados en su entorno:

* **Node.js**: Versión `18.0.0` o superior (se recomienda Node 20 LTS o superior).
* **npm**: Versión `9.0.0` o superior.
* **SQLite3**: Motor de base de datos relacional ligero instalado en el sistema operativo.
* **Git**: Herramienta de control de versiones.
* *(Opcional)* **Microservicio ML**: Servicio externo en ejecución para inferencia avanzada de imágenes.
* *(Opcional)* **OpenAI API Key**: Clave de API para el adjudicador de desambiguación asistida.

---

## Instalación

1. **Clonar el repositorio**:
   ```bash
   git clone <URL_DEL_REPOSITORIO>
   cd ProjectDSM_2026_2
   ```

2. **Instalar las dependencias del proyecto**:
   ```bash
   npm install
   ```

3. **Configurar las variables de entorno**:
   Crear un archivo `.env` en la raíz del proyecto a partir de la siguiente plantilla:
   ```bash
   touch .env
   ```

4. **Crear directorio para almacenamiento de cargas**:
   ```bash
   mkdir -p uploads/analyses
   ```

5. **Inicializar y poblar la base de datos**:
   Ejecutar el script de inicialización para crear el esquema relacional en SQLite y cargar el catálogo inicial de especímenes, logros y cuestionarios:
   ```bash
   node src/database/init.js
   ```

---

## Variables de Entorno

El sistema se parametriza mediante un archivo `.env` ubicado en la raíz del proyecto. Las variables soportadas por la configuración centralizada ([`src/config/env.js`](file:///home/kripi/Documentos/GitHub/ProjectDSM_2026_2/src/config/env.js)) son:

| Variable | Tipo | Descripción | Valor por Defecto / Ejemplo | Requerida |
|---|---|---|---|:---:|
| `PORT` | Número | Puerto de red en el que escucha el servidor HTTP | `8080` | No |
| `NODE_ENV` | String | Entorno de ejecución (`development`, `production`, `test`) | `development` | No |
| `DATABASE_NAME` | String | Identificador lógico de la base de datos | `rock` | No |
| `DATABASE_STORAGE` | String | Ruta del archivo de persistencia SQLite | `./rock.sqlite` | No |
| `JWT_SECRET` | String | Clave criptográfica para la firma y verificación de tokens JWT | `c3a657...` | Sí (en prod) |
| `JWT_EXPIRES_IN` | String | Vigencia temporal de los tokens emitidos | `30d` | No |
| `ML_SERVER_URL` | String | Dirección base del microservicio de Machine Learning en Python | `http://localhost:5000` | No |
| `ML_TIMEOUT_MS` | Número | Tiempo máximo de espera en milisegundos para respuesta de ML | `4000` | No |
| `OPENAI_API_KEY` | String | Llave de acceso a la API de OpenAI para adjudicación | *(vacío)* | No |
| `OPENAI_MODEL` | String | Identificador del modelo de lenguaje para adjudicación | `gpt-4o-mini` | No |
| `UPLOAD_DIR` | String | Directorio local de almacenamiento de imágenes subidas | `uploads/analyses` | No |

### Ejemplo de archivo `.env`:

```env
PORT=8080
NODE_ENV=development
DATABASE_NAME=rock
DATABASE_STORAGE=./rock.sqlite
JWT_SECRET=tu_secreto_jwt_seguro_para_desarrollo
JWT_EXPIRES_IN=30d
ML_SERVER_URL=http://localhost:5000
ML_TIMEOUT_MS=4000
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
UPLOAD_DIR=uploads/analyses
```

---

## Ejecución

### Modo Desarrollo
Inicia el servidor con recarga en caliente automática ante cambios en el código fuente mediante `nodemon`:
```bash
npm run dev
```

### Modo Producción
Inicia el servidor en modo estándar mediante Node.js:
```bash
npm start
```

### Inicialización de Datos
Para recrear las tablas y sembrar el catálogo taxonómico desde cero:
```bash
node src/database/init.js
```

---

## Estructura del Proyecto

El código fuente sigue una separación de responsabilidades estricta por capas:

```text
ProjectDSM_2026_2/
├── docs/                      # Especificaciones técnicas, modelo de datos y requerimientos
│   ├── backend_architecture.md
│   ├── backend_implementation_plan.md
│   ├── database_design.md
│   └── requirements.md
├── src/                       # Código fuente de la aplicación
│   ├── config/                # Constantes de dominio, configuración de base de datos y entorno
│   │   ├── constants.js
│   │   ├── database.js
│   │   └── env.js
│   ├── controllers/           # Controladores HTTP desacoplados por entidad
│   │   ├── achievement.controller.js
│   │   ├── analysis.controller.js
│   │   ├── auth.controller.js
│   │   ├── catalog.controller.js
│   │   ├── collection.controller.js
│   │   ├── event.controller.js
│   │   ├── feedback.controller.js
│   │   ├── quiz.controller.js
│   │   └── user.controller.js
│   ├── database/              # Scripts de inicialización y carga de datos maestros (seeders)
│   │   ├── init.js
│   │   └── seeders.js
│   ├── middlewares/           # Interceptores de autenticación JWT, subida de archivos y errores
│   │   ├── auth.middleware.js
│   │   ├── error.middleware.js
│   │   └── upload.middleware.js
│   ├── models/                # Modelos relacionales Sequelize (convención singular en inglés)
│   │   ├── achievement.model.js
│   │   ├── analysis.model.js
│   │   ├── analysis_candidate.model.js
│   │   ├── analysis_refinement.model.js
│   │   ├── collection_item.model.js
│   │   ├── feedback.model.js
│   │   ├── index.js
│   │   ├── notification.model.js
│   │   ├── quiz.model.js
│   │   ├── quiz_question.model.js
│   │   ├── specimen.model.js
│   │   ├── user.model.js
│   │   ├── user_achievement.model.js
│   │   ├── user_event.model.js
│   │   ├── user_preference.model.js
│   │   └── user_quiz_attempt.model.js
│   ├── routers/               # Definición y agrupamiento de rutas HTTP
│   │   ├── achievement.router.js
│   │   ├── analysis.router.js
│   │   ├── api.router.js
│   │   ├── auth.router.js
│   │   ├── catalog.router.js
│   │   ├── collection.router.js
│   │   ├── event.router.js
│   │   ├── feedback.router.js
│   │   ├── quiz.router.js
│   │   └── user.router.js
│   ├── services/              # Capa de lógica de negocio y proveedores
│   │   ├── ai/                # Clientes para ML externo y adjudicador OpenAI
│   │   ├── analysis/          # Orquestador del pipeline y preprocesamiento de imágenes
│   │   ├── gamification/      # Lógica de asignación de logros y niveles de experiencia
│   │   └── heuristics/        # Motor de clasificación por reglas físicas de respaldo
│   ├── utils/                 # Utilidades de servidor, formateo de respuestas y UUID
│   │   ├── response_formatter.js
│   │   ├── server.js
│   │   └── uuid.js
│   └── index.js               # Punto de entrada principal de la aplicación
├── tests/                     # Suite de pruebas automatizadas con Jest y Supertest
│   ├── fixtures/              # Muestras e imágenes sintéticas para pruebas de integración
│   ├── setup.js               # Configuración global del arnés de pruebas
│   ├── analysis.test.js
│   ├── auth.test.js
│   ├── catalog.test.js
│   ├── collection.test.js
│   ├── event.test.js
│   └── quiz.test.js
├── uploads/                   # Directorio físico donde se almacenan las imágenes recibidas
├── .env                       # Configuración de variables de entorno local
├── package.json               # Dependencias y scripts de automatización del proyecto
└── README.md                  # Documentación técnica principal del proyecto
```

---

## Documentación de la API

Todas las rutas públicas y protegidas se exponen de forma directa y limpia bajo la raíz (`/`). Las respuestas exitosas y de error emplean una estructura JSON uniforme:

```json
{
  "success": true,
  "data": { ... },
  "message": "Operación completada exitosamente"
}
```

### 1. Autenticación (`/auth`)

| Método | Endpoint | Autenticación | Descripción |
|---|---|:---:|---|
| `POST` | `/auth/anonymous` | No | Crea una sesión anónima de invitado y devuelve un token JWT temporal. |
| `POST` | `/auth/register` | No | Registra una cuenta formal (`email`, `password`, `username`) y migra colecciones anónimas previas asociadas al token. |
| `POST` | `/auth/login` | No | Autentica un usuario registrado mediante credenciales y genera un token JWT. |
| `DELETE` | `/auth/account` | Bearer Token | Ejecuta la baja lógica (*soft delete*) de la cuenta del usuario autenticado. |

### 2. Perfil y Preferencias de Usuario (`/user`)

| Método | Endpoint | Autenticación | Descripción |
|---|---|:---:|---|
| `GET` | `/user/profile` | Bearer Token | Obtiene la información del perfil del usuario en sesión. |
| `GET` | `/user/preferences` | Bearer Token | Consulta las configuraciones y preferencias personalizadas del usuario. |
| `PUT` | `/user/preferences` | Bearer Token | Actualiza las preferencias del usuario (notificaciones, unidades, etc.). |

### 3. Catálogo de Especímenes (`/specimen`)

| Método | Endpoint | Autenticación | Descripción |
|---|---|:---:|---|
| `GET` | `/specimen` | No | Retorna el catálogo con soporte de paginación y filtros (`type`, `hardness`, búsqueda textual). |
| `GET` | `/specimen/categories` | No | Provee métricas y conteo de especímenes agrupados por clases taxonómicas. |
| `GET` | `/specimen/:id` | No | Entrega la ficha técnica completa de un mineral o roca por su identificador UUID. |

### 4. Análisis e Identificación (`/analysis`)

| Método | Endpoint | Autenticación | Descripción |
|---|---|:---:|---|
| `POST` | `/analysis` | Bearer Token | Recibe una imagen (`multipart/form-data`, campo `image`), valida que sea un espécimen válido y ejecuta el pipeline de identificación. |
| `GET` | `/analysis/:id` | Bearer Token | Consulta el resultado de un análisis previo, lista de candidatos y niveles de confianza calculados. |
| `POST` | `/analysis/:id/refine` | Bearer Token | Envía atributos físicos observados (dureza, raya, magnetismo) para refinar y desempatar los candidatos clasificados. |

> **Nota**: Si la imagen enviada a `POST /analysis` no corresponde a un mineral o roca reconocible, el servidor responde con código `422 Unprocessable Entity` y el mensaje estructurado `NON_SPECIMEN_IMAGE`.

### 5. Colección Personal (`/collection`)

| Método | Endpoint | Autenticación | Descripción |
|---|---|:---:|---|
| `POST` | `/collection` | Bearer Token | Agrega un espécimen identificado a la colección del usuario activo. |
| `GET` | `/collection` | Bearer Token | Lista los especímenes descubiertos y bloqueados en la colección del usuario. |
| `GET` | `/collection/progress` | Bearer Token | Calcula el porcentaje de completitud de la colección clasificado por categorías geológicas. |
| `DELETE` | `/collection/:id` | Bearer Token | Elimina una muestra registrada de la colección del usuario. |

### 6. Cuestionarios Educativos (`/quiz`)

| Método | Endpoint | Autenticación | Descripción |
|---|---|:---:|---|
| `GET` | `/quiz` | Bearer Token | Obtiene la lista de cuestionarios disponibles clasificados por nivel de dificultad. |
| `GET` | `/quiz/:id` | Bearer Token | Obtiene las preguntas y opciones de un cuestionario específico. |
| `POST` | `/quiz/:id/submit` | Bearer Token | Evalúa las respuestas enviadas, calcula el puntaje obtenido y acredita puntos de experiencia (XP). |

### 7. Logros y Gamificación (`/achievement`)

| Método | Endpoint | Autenticación | Descripción |
|---|---|:---:|---|
| `GET` | `/achievement` | Bearer Token | Consulta el listado de logros del sistema con el estado de desbloqueo y progreso del usuario. |

### 8. Feedback y Telemetría (`/feedback`, `/event`)

| Método | Endpoint | Autenticación | Descripción |
|---|---|:---:|---|
| `POST` | `/feedback/:id` | Opcional | Permite al usuario calificar la precisión del análisis obtenido (`accuracy_rating`, comentarios). |
| `POST` | `/event` | Opcional | Registra eventos de telemetría e interacción dentro de la plataforma. |

---

## Pruebas

El proyecto cuenta con una suite integral de pruebas unitarias y de integración construida con [Jest](https://jestjs.io/) y [Supertest](https://github.com/ladjs/supertest).

### Ejecución de Pruebas

Para ejecutar la suite completa de pruebas:

```bash
npm test
```

Este comando ejecuta las pruebas de forma secuencial (`--runInBand`), garantizando aislamiento en la base de datos temporal y forzando la liberación ordenada de conexiones activas.

### Cobertura de la Suite

* **Autenticación ([`tests/auth.test.js`](file:///home/kripi/Documentos/GitHub/ProjectDSM_2026_2/tests/auth.test.js))**: Pruebas de sesiones anónimas, registro de usuarios, login con credenciales válidas e inválidas, protección de rutas y eliminación de cuenta.
* **Catálogo ([`tests/catalog.test.js`](file:///home/kripi/Documentos/GitHub/ProjectDSM_2026_2/tests/catalog.test.js))**: Listado con filtros, agrupación taxonómica y consulta de fichas técnicas por identificador.
* **Análisis ([`tests/analysis.test.js`](file:///home/kripi/Documentos/GitHub/ProjectDSM_2026_2/tests/analysis.test.js))**: Flujo de carga de imágenes con Multer, validación de error 422 para no-especímenes, fallback heurístico y refinamiento interactivo de resultados.
* **Colección ([`tests/collection.test.js`](file:///home/kripi/Documentos/GitHub/ProjectDSM_2026_2/tests/collection.test.js))**: Adición y remoción de muestras, cálculo de progreso y prevención de registros duplicados.
* **Cuestionarios ([`tests/quiz.test.js`](file:///home/kripi/Documentos/GitHub/ProjectDSM_2026_2/tests/quiz.test.js))**: Obtención de preguntas y evaluación con asignación de puntajes.
* **Eventos ([`tests/event.test.js`](file:///home/kripi/Documentos/GitHub/ProjectDSM_2026_2/tests/event.test.js))**: Registro de telemetría con usuario anónimo o autenticado.

---

## Autores

* **Gabriel Piñones** — *Desarrollo e Implementación*

### Licencia

Este proyecto está licenciado bajo los términos de la licencia **GNU Affero General Public License v3.0 o posterior** ([AGPL-3.0-or-later](file:///home/kripi/Documentos/GitHub/ProjectDSM_2026_2/package.json)).

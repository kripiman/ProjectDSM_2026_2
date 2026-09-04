# ProjectDSM - Rock & Mineral Analysis Backend

Backend REST API y capa de persistencia para el sistema de análisis automatizado e identificación de muestras geológicas (minerales y rocas).

## Características Principales

* **Base de Datos SQLite**: Persistencia relacional estructurada con integridad referencial activa y convención singular en minúsculas en inglés (`user`, `specimen`, `analysis`, etc.).
* **Pipeline de Clasificación Híbrido**:
  * Validación previa de espécimen (código HTTP `422 NON SPECIMEN IMAGE`).
  * Extracción de características visuales (color dominante, textura, brillo).
  * Interfaz desacoplada para microservicio de Machine Learning en Python con control de timeout.
  * Motor de clasificación heurístico de respaldo (fallback) basado en catálogo físico.
  * Adjudicador asistido para desambiguación de candidatos cercanos y soporte a preguntas de refinamiento físico (dureza Mohs, raya, magnetismo).
* **Gestión de Sesiones**: Soporte de sesiones anónimas para invitados y migración transparente de colecciones a cuentas registradas.
* **Colección Personal & Progreso**: Descubrimientos con desgloses cuantitativos por minerales, rocas ígneas, sedimentarias y metamórficas.
* **Gamificación y Educación**: Sistema de logros por hitos, puntos de experiencia (XP) y cuestionarios evaluados.

## Requisitos

* Node.js v18 o superior
* npm v9 o superior
* SQLite3

## Instalación

1. Clonar el repositorio y acceder al directorio del proyecto:
   ```bash
   git clone <url-del-repositorio>
   cd ProjectDSM_2026_2
   ```

2. Instalar dependencias:
   ```bash
   npm install
   ```

3. Configurar variables de entorno en el archivo `.env`:
   ```env
   PORT=8080
   DATABASE_STORAGE=./rock.sqlite
   JWT_SECRET=tu_secreto_jwt
   JWT_EXPIRES_IN=30d
   ML_SERVER_URL=http://localhost:5000
   OPENAI_API_KEY=tu_api_key_opcional
   NODE_ENV=development
   ```

4. Inicializar y poblar la base de datos con el catálogo maestro de especímenes:
   ```bash
   node src/database/init.js
   ```

## Ejecución

* Modo desarrollo con recarga en caliente:
  ```bash
  npm run dev
  ```

* Modo producción:
  ```bash
  npm start
  ```

## Pruebas Automatizadas

Ejecutar la suite de pruebas unitarias e integración con Jest y Supertest:
```bash
npm test
```

## Rutas Principales de la API (`/api/v1`)

| Módulo | Método | Endpoint | Descripción |
|---|---|---|---|
| **Auth** | `POST` | `/api/v1/auth/anonymous` | Creación de sesión para usuario invitado |
| | `POST` | `/api/v1/auth/register` | Registro de usuario y migración de datos |
| | `POST` | `/api/v1/auth/login` | Autenticación con credenciales |
| | `DELETE` | `/api/v1/auth/account` | Eliminación de cuenta (soft delete) |
| **Catálogo** | `GET` | `/api/v1/specimen` | Listado y filtros de catálogo |
| | `GET` | `/api/v1/specimen/categories` | Métricas por grupos taxonómicos |
| | `GET` | `/api/v1/specimen/:id` | Ficha técnica de espécimen |
| **Análisis** | `POST` | `/api/v1/analysis` | Subida e identificación de muestra |
| | `GET` | `/api/v1/analysis/:id` | Consulta de resultado y candidatos |
| | `POST` | `/api/v1/analysis/:id/refine` | Refinamiento por propiedades físicas |
| **Colección** | `POST` | `/api/v1/collection` | Guardar muestra en colección |
| | `GET` | `/api/v1/collection` | Colección descubierta y bloqueada |
| | `GET` | `/api/v1/collection/progress` | Métricas de avance de usuario |
| **Educación** | `GET` | `/api/v1/quiz` | Listado de cuestionarios |
| | `POST` | `/api/v1/quiz/:id/submit` | Envío y evaluación de cuestionario |
| **Logros** | `GET` | `/api/v1/achievement` | Logros y progreso de usuario |
| **Feedback** | `POST` | `/api/v1/feedback/:id` | Evaluación de precisión de análisis |

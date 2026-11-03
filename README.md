# IntegraTrip — Agente de viajes sobre MCP

Tareas 1 y 2 de IIC3103.

- **Tarea 1 (Configuración):** el usuario inicia sesión, conecta servidores
  [MCP](https://modelcontextprotocol.info/) con tres mecanismos OAuth (PRE, DCR,
  CIMD), lista sus tools (`tools/list`) y las ejecuta (`tools/call`).
- **Tarea 2 (Chat):** un agente de IA usa las tools de los MCP conectados para
  planificar el viaje (vuelos, hotel y clima). El LLM se consume vía gRPC
  (`iic3103.llm.v1.Llm/Generate`) y el loop del agente se implementa a mano.

## Tarea 3 — RAG sobre revistas

La extensión de Tarea 3 mantiene la misma interfaz de chat y agrega la tool
local `rag_search_magazines`. Esta tool se ejecuta en el BFF y consulta un
dataset propio de Nomic construido desde chunks de Traveling Magazine; las
tools MCP existentes continúan ejecutándose mediante `tools/call`.

### Corpus procesado

Los PDF originales se descargan localmente, pero no se versionan. Los chunks
JSONL sí se incluyen en [`data/processed/`](./data/processed/). Se procesaron y
validaron las 21 ediciones 58–78, con 7.366 chunks. El descargador intenta el
mismo rango para que el corpus sea reproducible sin cambiar el código.

El pipeline usa Docling sin OCR, `HybridChunker` y el tokenizer
`sentence-transformers/all-MiniLM-L6-v2`:

```bash
uv venv --python 3.12 .venv-rag
uv pip install --python .venv-rag/bin/python -r scripts/rag/requirements.txt
.venv-rag/bin/python scripts/rag/download_magazines.py
.venv-rag/bin/python scripts/rag/parse_magazines.py
.venv-rag/bin/python scripts/rag/validate_chunks.py
.venv-rag/bin/python scripts/rag/test_contract.py
.venv-rag/bin/python scripts/rag/analyze_corpus.py
```

El análisis reproducible está en [`output/pdf/Informe_Dataset_Tarea3.pdf`](./output/pdf/Informe_Dataset_Tarea3.pdf)
y sus métricas fuente en [`output/pdf/corpus_metrics.json`](./output/pdf/corpus_metrics.json).

### Exploración previa del dataset

La auditoría local y la vista de Atlas muestran temas de viajes, historia, arte,
cultura, gastronomía, vinos, restaurantes, hoteles, naturaleza y arquitectura.
Atlas etiqueta clusters como `Spanish Gastronomy Magazine`, `Beaches Spain`,
`Spanish Villages`, `Portuguese Wine Tourism`, `Andalusian History`, `Japanese
Cuisine`, `Rural Tourism Argentina`, `African Safari`, `Japanese Tea` y
`Armenian Wine`.

No hay IDs duplicados; sí existen 29 grupos de texto exactamente repetido
(256 chunks), que deben compararse con la vista de duplicados de Atlas. También
hay 152 chunks potencialmente editoriales (publicidad, redacción, portada y
créditos), conservados para no alterar el corpus pero marcados como posible
ruido de retrieval. La estructura sugiere clusters de destinos/cultura,
gastronomía/vino, hoteles/restaurantes y naturaleza/paisaje; esta hipótesis
debe confirmarse visualmente en Atlas.

En la inspección de Atlas, las tres consultas devolvieron 369 resultados (el
5,01% superior): `playas` con umbral 0.59781, `castillos` con 0.61005 y
`comida romántica` con 0.55632. `playas` mostró el cluster Beaches Spain, pero
también ruido editorial de Magazine Publishing/Executive Leadership; `castillos`
recuperó una ruta patrimonial y turismo de naturaleza; `comida romántica`
recuperó el encabezado La Casa Romántica dentro de gastronomía. Estas
observaciones están documentadas en el PDF.

La carga a Nomic requiere únicamente una variable local no versionada:

```bash
NOMIC_API_KEY=... .venv-rag/bin/python scripts/rag/upload_nomic.py \
  --dataset integratrip-traveling-rag \
  --index-name traveling-rag
```

La API key no se incluye en el README, el repositorio, el cliente del
navegador ni las solicitudes a `Generate`. La URL pública del dataset y su
identificador públicos ya fueron creados en Atlas:

- Dataset: [maximiliano/integratrip-traveling-rag](https://atlas.nomic.ai/data/maximiliano/integratrip-traveling-rag)
- Mapa: [Traveling RAG en Atlas](https://atlas.nomic.ai/data/maximiliano/integratrip-traveling-rag/map)
- `NOMIC_PROJECTION_ID`: `fa545497-39bc-4f71-bbd8-a966e93d396e`

El backend queda preparado para consumirlos mediante `NOMIC_API_KEY` y
`NOMIC_PROJECTION_ID`; la API key permanece únicamente en el entorno
server-side y nunca se expone al navegador.

Cuando se cree otro dataset, `upload_nomic.py` imprime el `Projection ID`, el
identificador y las URLs pública de dataset y mapa para actualizar Render.

## Tarea 2 — Agente

| Pieza | Dónde |
|---|---|
| Contrato gRPC (copia del proxy del curso) | [`proto/llm.proto`](./proto/llm.proto) |
| Cliente gRPC (`@grpc/grpc-js` + `@grpc/proto-loader`, metadata `x-student-email`/`x-student-id`) | `src/lib/llm/client.ts` |
| Catálogo de tools con prefijo por servidor (`pre_*`, `dcr_*`, `cimd_*`) | `src/lib/agent/catalog.ts` |
| Instrucciones del agente (pedir datos, confirmar antes de reservar) | `src/lib/agent/prompt.ts` |
| Loop (máx. 12 turnos, ejecuta todas las `function_calls` antes del siguiente `Generate`) | `src/lib/agent/loop.ts` |
| API de chat con streaming NDJSON | `src/app/api/chat/route.ts` |
| Vista de chat (historial, nueva conversación, traza de tools, markdown sanitizado) | `src/app/chat`, `src/components/chat` |

**Persistencia:** `chats` (por usuario), `chat_messages` (USER / MODEL con
`function_calls` / TOOL con `function_results` / `error`, ordenados por `seq`) y
`tool_invocations` (servidor, conexión, argumentos, resultado, duración). Al
retomar un chat se reconstruye exactamente el mismo historial que se envió a
`Generate`; una conversación nueva parte con contexto vacío.

**Rate limit:** ante `RESOURCE_EXHAUSTED` el backend **no** reintenta: guarda y
muestra el error; el usuario reintenta enviando un nuevo mensaje.

**Seguridad:** a `Generate` sólo viajan mensajes y definiciones de tools; los
access tokens de los MCP nunca salen del servidor. El texto del modelo se
renderiza con `react-markdown` (sin HTML crudo).

**Conversaciones con IA:** los transcripts del desarrollo están en
[`ai-conversations/`](./ai-conversations) (generados con
`node scripts/export-ai-conversations.mjs`, que censura secretos).

**Informe de aprendizajes:** [`docs/Informe_Aprendizajes.pdf`](./docs/Informe_Aprendizajes.pdf).

**Despliegue:** https://integratrip-tarea2.onrender.com

## Stack

- **Next.js (App Router) + TypeScript** — monolito que sirve frontend y API.
  Toda la comunicación con credenciales ocurre server-side (Route Handlers).
- **PostgreSQL (Supabase) + Drizzle ORM** — persistencia por usuario.
- **jose** — validación de JWT (RS256) contra el JWKS del AS.
- **@modelcontextprotocol/sdk** — transporte Streamable HTTP hacia los MCP.
- **AES-256-GCM** — cifrado de secretos y tokens en reposo.

## Arquitectura (resumen)

La documentación detallada, incluyendo el modelo entidad-relación y los
diagramas de secuencia de PRE, DCR y CIMD, está en
[docs/architecture.md](./docs/architecture.md).
```
Navegador ──▶ Next.js (Route Handlers = backend server-side)
                 │
                 ├─ Auth de la app: OAuth code+PKCE contra realm `pre`
                 │  (resource = origin de la app), sesión en cookie httpOnly.
                 │
                 ├─ Capa OAuth desacoplada (src/lib/oauth):
                 │    discovery (401→PRM→AS metadata) · PKCE · engine
                 │    (authorize/token/refresh + resource indicator) ·
                 │    providers pre | dcr | cimd  ◀── única variación por mecanismo
                 │
                 ├─ Capa MCP (src/lib/mcp): cliente SDK + tools/list + tools/call
                 │
                 └─ Persistencia (src/lib/db, src/lib/connections):
                      users · mcp_connections · mcp_client_registrations
                      · mcp_tokens · oauth_flows   (secretos/tokens cifrados)
```

Los tres mecanismos comparten **el mismo flujo OAuth 2.1**; sólo difieren en
cómo se obtiene el `client_id`:

| Mecanismo | Servidor  | Cómo se obtiene el client_id                          |
|-----------|-----------|------------------------------------------------------|
| **PRE**   | Andes Air | Cliente pre-registrado en `/console` (id + secret).  |
| **DCR**   | StayWell  | Registro dinámico (RFC 7591) durante la conexión.    |
| **CIMD**  | Cielo Sur | URL HTTPS de un documento de metadata que hospeda la app (`/oauth/client-metadata.json`). Cliente público, sin secret. |

## Desarrollo local

```bash
cp .env.example .env.local   # completa los valores
npm install
npm run db:generate          # (ya versionado en /drizzle)
npm run db:migrate           # aplica el esquema a tu Postgres
npm run dev                  # http://localhost:3000
```

Para OAuth en local necesitas registrar `http://localhost:3000/callback` como
`redirect_uri` en el `/console` del AS, y usar `APP_BASE_URL=http://localhost:3000`.

## Variables de entorno

Ver [`.env.example`](./.env.example). Resumen:

| Variable | Descripción |
|---|---|
| `APP_BASE_URL` | Origin público de la app (= origin del redirect_uri registrado). |
| `AS_BASE_URL` | Servidor de autenticación del curso. |
| `APP_LOGIN_REALM` | Realm de login (`pre`). |
| `DATABASE_URL` | Postgres (Supabase). |
| `ENCRYPTION_KEY` | Clave AES-256-GCM (32 bytes base64) para cifrado en reposo. |
| `SESSION_SECRET` | Firma HMAC de la cookie de sesión. |
| `PRE_CLIENT_ID` / `PRE_CLIENT_SECRET` | Cliente pre-registrado (login + Andes Air). |
| `LLM_GRPC_TARGET` / `LLM_GRPC_TLS` | Proxy LLM gRPC del curso (`host:443`, TLS). |
| `LLM_STUDENT_EMAIL` / `LLM_STUDENT_ID` | Metadata del proxy LLM (si faltan, se usan las del usuario logueado). |
| `NOMIC_API_KEY` | API key server-side para consultas y carga del dataset Atlas. |
| `NOMIC_PROJECTION_ID` | Identificador del mapa/index público creado en Atlas. |
| `NOMIC_API_BASE_URL` | Base URL de Atlas; por defecto `https://api-atlas.nomic.ai`. |
| `NOMIC_EMBEDDING_MODEL` | Modelo de embeddings; por defecto `gte-multilingual-base`. |

## Despliegue (Render)

El workflow de GitHub Actions en [`.github/workflows/ci.yml`](./.github/workflows/ci.yml)
ejecuta `lint` y `build` en cada pull request y push a `main`. Render está
configurado para desplegar automáticamente los cambios que llegan a `main`,
por lo que un merge aprobado completa el ciclo CI/CD.
1. Crea un proyecto Supabase y copia su `DATABASE_URL`.
2. Render → New → Blueprint → este repo (usa [`render.yaml`](./render.yaml)).
3. Tras el primer deploy, fija `APP_BASE_URL` a la URL pública del servicio y el
   resto de secretos (`DATABASE_URL`, `ENCRYPTION_KEY`, `SESSION_SECRET`,
   `PRE_CLIENT_ID`, `PRE_CLIENT_SECRET`, `LLM_STUDENT_EMAIL`, `LLM_STUDENT_ID`,
   `NOMIC_API_KEY` y `NOMIC_PROJECTION_ID`).
4. En el `/console` del AS registra `redirect_uri = <APP_BASE_URL>/callback`.
5. Redeploy. Las migraciones se aplican en el `startCommand`.

## Seguridad

- Los secretos y tokens **nunca** llegan al navegador: viven cifrados en la BD y
  sólo se descifran server-side para hablar con el AS/MCP.
- No se usa `localStorage`/`sessionStorage` para credenciales; la sesión es una
  cookie `httpOnly`, `Secure`, `SameSite=Lax`.
- `.env*` está en `.gitignore`; no hay secretos hardcodeados en el repositorio.
- Aislamiento por usuario: todas las consultas de conexiones filtran por `user_id`.

# IntegraTrip — Agente de viajes sobre MCP

Tareas 1 y 2 de IIC3103.

- **Tarea 1 (Configuración):** el usuario inicia sesión, conecta servidores
  [MCP](https://modelcontextprotocol.info/) con tres mecanismos OAuth (PRE, DCR,
  CIMD), lista sus tools (`tools/list`) y las ejecuta (`tools/call`).
- **Tarea 2 (Chat):** un agente de IA usa las tools de los MCP conectados para
  planificar el viaje (vuelos, hotel y clima). El LLM se consume vía gRPC
  (`iic3103.llm.v1.Llm/Generate`) y el loop del agente se implementa a mano.

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

**Conversaciones con IA:** `node scripts/export-ai-conversations.mjs` copia los
transcripts a `ai-conversations/` censurando secretos.

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

## Despliegue (Render)

El workflow de GitHub Actions en [`.github/workflows/ci.yml`](./.github/workflows/ci.yml)
ejecuta `lint` y `build` en cada pull request y push a `main`. Render está
configurado para desplegar automáticamente los cambios que llegan a `main`,
por lo que un merge aprobado completa el ciclo CI/CD.
1. Crea un proyecto Supabase y copia su `DATABASE_URL`.
2. Render → New → Blueprint → este repo (usa [`render.yaml`](./render.yaml)).
3. Tras el primer deploy, fija `APP_BASE_URL` a la URL pública del servicio y el
   resto de secretos (`DATABASE_URL`, `ENCRYPTION_KEY`, `SESSION_SECRET`,
   `PRE_CLIENT_ID`, `PRE_CLIENT_SECRET`, `LLM_STUDENT_EMAIL`, `LLM_STUDENT_ID`).
4. En el `/console` del AS registra `redirect_uri = <APP_BASE_URL>/callback`.
5. Redeploy. Las migraciones se aplican en el `startCommand`.

## Seguridad

- Los secretos y tokens **nunca** llegan al navegador: viven cifrados en la BD y
  sólo se descifran server-side para hablar con el AS/MCP.
- No se usa `localStorage`/`sessionStorage` para credenciales; la sesión es una
  cookie `httpOnly`, `Secure`, `SameSite=Lax`.
- `.env*` está en `.gitignore`; no hay secretos hardcodeados en el repositorio.
- Aislamiento por usuario: todas las consultas de conexiones filtran por `user_id`.

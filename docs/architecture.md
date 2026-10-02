# IntegraTrip — Arquitectura detallada

IntegraTrip es un monolito Next.js que funciona como cliente MCP server-side.
El navegador sólo maneja la interfaz y una cookie de sesión httpOnly; los
tokens OAuth, secretos y llamadas a los servidores MCP pasan por los Route
Handlers del servidor.

## Componentes y responsabilidades

```mermaid
flowchart LR
    B[Navegador] -->|HTTP + cookie de sesión| APP[Next.js en Render]
    APP --> AUTH[Authorization Server del curso]
    APP --> DB[(Supabase PostgreSQL)]
    APP --> PRE[Andes Air / PRE]
    APP --> DCR[StayWell / DCR]
    APP --> CIMD[Cielo Sur / CIMD]

    subgraph APP
      UI[App Router + formularios]
      API[Route Handlers]
      OAUTH[Discovery + PKCE + OAuth engine]
      MCP[MCP SDK: tools/list + tools/call]
      SEC[Cookie HMAC + AES-256-GCM]
    end

    UI --> API
    API --> OAUTH
    API --> MCP
    API --> SEC
    OAUTH --> SEC
    MCP --> SEC
    SEC --> DB
```

- **Autenticación de la aplicación:** OAuth 2.1 Authorization Code + PKCE
  contra el realm `pre`. Al volver del callback se valida el JWT con JWKS y se
  crea una sesión mínima firmada con HMAC.
- **Discovery MCP:** el cliente hace una primera llamada al recurso protegido,
  obtiene `resource_metadata` desde `WWW-Authenticate` y descubre el issuer,
  authorization endpoint, token endpoint y scopes.
- **OAuth MCP:** el motor común genera PKCE, maneja `state`, intercambia el
  código y refresca tokens. El proveedor sólo decide cómo obtener el
  `client_id`.
- **MCP:** los tokens se descifran únicamente en server-side. El SDK usa
  Streamable HTTP para `tools/list` y `tools/call`.
- **Persistencia:** Drizzle ORM sobre Supabase. Cada consulta de conexiones,
  tokens y flujos OAuth se filtra por el `user_id` de la sesión.

## Modelo entidad-relación

```mermaid
erDiagram
    USERS ||--o{ MCP_CONNECTIONS : owns
    MCP_CONNECTIONS ||--o| MCP_CLIENT_REGISTRATIONS : has
    MCP_CONNECTIONS ||--o| MCP_TOKENS : stores
    USERS ||--o{ OAUTH_FLOWS : starts

    USERS {
        uuid id PK
        text subject UK
        text email
        text student_id
        timestamptz created_at
    }
    MCP_CONNECTIONS {
        uuid id PK
        uuid user_id FK
        text name
        auth_type auth_type
        text resource_url
        text issuer
        text authorization_endpoint
        text token_endpoint
        text scopes
        timestamptz created_at
    }
    MCP_CLIENT_REGISTRATIONS {
        uuid id PK
        uuid connection_id FK,UK
        text client_id
        text client_secret_enc
        text metadata_document_url
        jsonb raw
        timestamptz created_at
    }
    MCP_TOKENS {
        uuid id PK
        uuid connection_id FK,UK
        text access_token_enc
        text refresh_token_enc
        timestamptz expires_at
        text scope
        timestamptz updated_at
    }
    OAUTH_FLOWS {
        uuid id PK
        text state UK
        flow_kind kind
        uuid user_id FK
        text code_verifier
        text resource
        text redirect_uri
        jsonb payload
        timestamptz created_at
        timestamptz expires_at
    }
```

`MCP_CONNECTIONS` es la entidad central. Una conexión tiene como máximo un
registro de cliente y un conjunto de tokens. `MCP_CLIENT_REGISTRATIONS` guarda
el `client_secret` cifrado para DCR/PRE; CIMD no necesita secreto porque su
`client_id` es la URL pública del documento de metadata. `OAUTH_FLOWS` es
temporal y vincula el `state` y el `code_verifier` con el usuario y recurso.

## Flujo común de login de la aplicación

```mermaid
sequenceDiagram
    actor U as Usuario
    participant B as Navegador
    participant A as Next.js
    participant AS as Authorization Server
    participant DB as Supabase

    U->>B: Presiona Iniciar sesión
    B->>A: GET /api/auth/login
    A->>A: Genera state, PKCE y guarda oauth_flow(login)
    A-->>B: Redirección al authorization endpoint
    B->>AS: Autoriza con realm pre
    AS-->>B: Redirección /callback?code&state
    B->>A: GET /callback
    A->>DB: Verifica y consume oauth_flow
    A->>AS: POST token (code + code_verifier)
    AS-->>A: access_token + identidad
    A->>AS: Verifica JWT usando JWKS
    A->>DB: Upsert users
    A-->>B: Cookie it_session httpOnly + redirect /chat
```

## PRE — Andes Air

PRE usa un cliente confidencial creado previamente en el `/console` del
Authorization Server. El `client_id` y `client_secret` se leen desde variables
de entorno; no hay registro dinámico durante la conexión.

```mermaid
sequenceDiagram
    actor U as Usuario
    participant A as Next.js
    participant AS as AS realm pre
    participant M as Andes Air MCP
    participant DB as Supabase

    U->>A: Selecciona PRE y conecta
    A->>M: initialize sin Bearer
    M-->>A: 401 + resource_metadata
    A->>M: GET protected-resource metadata
    M-->>A: issuer, resource y scopes
    A->>AS: Descubre metadata del issuer
    A->>DB: Guarda oauth_flow(connect)
    A-->>U: Redirección con client_id pre-registrado + PKCE
    U->>AS: Autoriza
    AS-->>A: callback con code
    A->>AS: Intercambia code + client_secret
    AS-->>A: Tokens
    A->>DB: Guarda tokens cifrados y conexión
    A->>M: tools/list con access_token
    M-->>A: Lista de tools
```

## DCR — StayWell

DCR usa Dynamic Client Registration (RFC 7591). Antes de redirigir al usuario,
la app registra un cliente nuevo con su `redirect_uri`; el servidor devuelve un
`client_id` y un `client_secret` que se almacenan cifrados.

```mermaid
sequenceDiagram
    actor U as Usuario
    participant A as Next.js
    participant M as StayWell MCP
    participant AS as AS realm dcr
    participant DB as Supabase

    U->>A: Selecciona DCR y conecta
    A->>M: initialize sin Bearer
    M-->>A: 401 + resource_metadata
    A->>M: Obtiene metadata protegida
    M-->>A: issuer + registration_endpoint
    A->>AS: POST registration_endpoint (RFC 7591)
    AS-->>A: client_id + client_secret
    A->>DB: Guarda oauth_flow y registro DCR cifrado
    A-->>U: Redirección authorization + PKCE
    U->>AS: Autoriza
    AS-->>A: callback con code
    A->>AS: Intercambia code + client_secret DCR
    AS-->>A: Tokens
    A->>DB: Guarda tokens cifrados y conexión
    A->>M: tools/list / tools/call con Bearer
    M-->>A: Resultado MCP
```

## CIMD — Cielo Sur

CIMD usa Client ID Metadata Documents. No registra un cliente mediante una
llamada de registro y no necesita secreto. El `client_id` es la URL HTTPS
estable de `/oauth/client-metadata.json`; el Authorization Server obtiene ese
documento desde la aplicación.

```mermaid
sequenceDiagram
    actor U as Usuario
    participant A as Next.js
    participant M as Cielo Sur MCP
    participant AS as AS realm cimd
    participant DB as Supabase

    U->>A: Selecciona CIMD y conecta
    A->>M: initialize sin Bearer
    M-->>A: 401 + resource_metadata
    A->>M: Obtiene issuer, resource y metadata
    M-->>A: authorization_endpoint
    A->>DB: Guarda oauth_flow(connect)
    A-->>U: Redirección con client_id = URL metadata + PKCE
    U->>AS: Autoriza
    AS->>A: GET /oauth/client-metadata.json
    A-->>AS: Metadata del cliente público
    AS-->>A: callback con code
    A->>AS: Intercambia code sin client_secret
    AS-->>A: Tokens
    A->>DB: Guarda tokens cifrados y conexión
    A->>M: tools/list / tools/call con Bearer
    M-->>A: Resultado MCP
```

## Diferencias entre PRE, DCR y CIMD

| Mecanismo | Obtención del `client_id` | Secreto | Momento de obtención |
|---|---|---|---|
| PRE | Cliente creado en el `/console` | Sí, en variables de entorno | Configuración previa |
| DCR | Registro RFC 7591 | Sí, entregado por el registro | Durante la conexión |
| CIMD | URL HTTPS del documento de metadata | No, cliente público | La URL se construye desde `APP_BASE_URL` |

El resto del flujo es compartido: discovery del recurso protegido, PKCE
S256, `state`, autorización, intercambio de código, persistencia cifrada y
llamadas MCP con Bearer. La única variación de implementación es el proveedor
que resuelve las credenciales del cliente.

## Logout seguro

El logout se implementa como un formulario `POST` a `/api/auth/logout`. No se
usa un `Link` ni un endpoint `GET` que cambie estado: Next.js puede precargar
los enlaces y una precarga nunca debe eliminar la sesión. El endpoint borra la
cookie sólo después de la acción explícita del usuario y redirige al inicio.

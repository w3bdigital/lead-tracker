# Lead Tracker (self-hosted)

Serviço que rastreia **aberturas das demos**. Roda como um container Docker na
**sua VPS** (custo zero), usando o **Redis que você já tem**. O dashboard local
consulta este serviço para marcar leads quentes.

```
Você envia: https://SEU-TRACKER/d/<id>
   -> registra a abertura (clique) e redireciona pra demo real na Vercel
A landing tem um pixel: /t/<id>  -> conta quando a página é aberta de fato
O dashboard consulta: /api/events?secret=...  -> atualiza o CRM (🔥 Aberta)
```

> O Easypanel já roda sobre Docker — não precisa instalar Docker nem usar a linha
> de comando. Este `Dockerfile` é construído pelo próprio Easypanel.

O serviço precisa de 2 variáveis de ambiente:
- `REDIS_URL` — a **URL de conexão interna** do seu Redis (a mesma que aparece no
  Easypanel, em Redis > Credenciais, ex: `redis://default:SENHA@w3bdigital_redis:6379`).
- `TRACKER_SECRET` — o mesmo valor que está no `.env` do projeto principal.

### Deploy no Easypanel
1. No **mesmo projeto** onde está o Redis, clique em **+ Serviço** > **App**.
2. **Source**: GitHub > repositório `w3bdigital/lead-tracker` (público) > branch `main`.
   - **Caminho de Build**: `/` (raiz — o Dockerfile está na raiz deste repo).
   - Repo público: não precisa de token do GitHub.
3. **Build**: deixe **Dockerfile** (ele detecta o `Dockerfile`).
4. **Environment**: adicione `REDIS_URL` e `TRACKER_SECRET`.
5. **Domains**: adicione um subdomínio (ex: `tracker.seudominio.com`) apontando
   para a **porta 3000**. O Easypanel cuida do HTTPS.
6. **Deploy**. Como está no mesmo projeto do Redis, o host interno
   `w3bdigital_redis` resolve sozinho (Redis continua privado, sem exposição).

### Alternativa — Docker manual (outras VPS)
```bash
cd tracker
docker build -t lead-tracker .
docker run -d --name lead-tracker --restart unless-stopped \
  --network <rede-do-redis> \
  -e REDIS_URL='redis://default:SENHA@w3bdigital_redis:6379' \
  -e TRACKER_SECRET='<seu-segredo>' \
  -p 3000:3000 lead-tracker
```

### No projeto principal
Preencha o `.env`:
```
TRACKER_URL=https://tracker.seudominio.com
TRACKER_SECRET=<mesmo valor>
```

Teste rápido: `https://tracker.seudominio.com/health` deve responder `{"ok":true}`.

## Endpoints
| Rota | Uso |
|------|-----|
| `GET /d/<id>` | Link enviado ao dono: registra abertura e redireciona pra demo |
| `GET /t/<id>` | Pixel da landing: conta abertura ao renderizar |
| `POST /api/register` | (interno) mapeia id -> URL real (precisa `x-secret`) |
| `GET /api/events?secret=&since=` | (interno) eventos para o dashboard |
| `GET /health` | healthcheck |

Previews/bots (WhatsApp, etc.) são ignorados para não contar aberturas falsas.

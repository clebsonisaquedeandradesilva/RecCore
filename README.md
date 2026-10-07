# RecFlare — port para Node.js / Docker / Render

Servidor baseado no ZIP `server-0.0.8` fornecido pelo solicitante. O processamento HTTP usa `node:http`, roteador próprio e APIs nativas Fetch. Não usa Express, Fastify, Hono em execução, Wrangler nem serviços Cloudflare.

**Escopo real:** os handlers HTTP do projeto original foram preservados e compilados para JavaScript; os bindings Cloudflare foram substituídos por adaptadores locais. Não se trata de uma reimplementação verificada de todo o Rec Room oficial. Stubs e limitações que já existiam no projeto original continuam identificados, e serviços externos continuam exigindo configuração.

## Contagem de endpoints

A solicitação inicial mencionava 423. Após a confirmação de **preservar todas as rotas**, o inventário do roteador em execução encontrou:

- **516 combinações únicas serviço + método + caminho**, incluindo aliases e catch-alls `ALL`.
- **18** dessas combinações são `/openapi.json`.
- **498** combinações não são rotas de documentação.
- **26 serviços** montados. A fachada `mono` foi substituída pelo dispatcher nativo, não contada como um serviço adicional.
- `/healthz` é um endpoint operacional extra da nova fachada, não incluído nas 516.

A primeira contagem por expressão regular era aproximada; arrays de caminhos e registros dinâmicos mudam o total. Não foram criadas rotas artificiais para atingir um número. O inventário está em `docs/endpoints.json` e `docs/endpoints.csv`; reproduza com `npm run audit:routes`.

## O que significa “Node.js puro” aqui

O servidor e o roteador são JavaScript sobre módulos nativos do Node. `package.json` não tem dependências de produção; o deploy não executa `npm install` nem precisa compilar TypeScript. Porém, **não é uma implementação exclusivamente com a biblioteca padrão**: bibliotecas de validação, filtro de palavras, validação de e-mail e processamento de imagens do original estão incorporadas em JavaScript/WASM. O frontend original inclui React e o visualizador de documentação Scalar como arquivos estáticos pré-compilados. Consulte `docs/vendor-manifest.json` e as licenças. Se “puro” significar proibir qualquer código de terceiros, este pacote não cumpre essa definição estrita.

## Estrutura

```text
src/
  server.js            # HTTP, upgrade WebSocket, PORT, shutdown
  application.js       # montagem, ambiente, bindings e serviço de saúde
  registry.js          # 26 serviços
  runtime/             # roteador nativo, SQLite, KV, buckets, assets, JWT, WS
  modules/
    apps/              # handlers JS organizados por serviço e controlador
    packages/          # domínio e helpers compartilhados em JavaScript
migrations/            # 72 migrações SQL originais, com controle de versão
static/                # catálogos, configurações, imagens e site pré-compilado
vendor/                # recursos JS/WASM incorporados e sem instalação em runtime
scripts/               # inventário, smoke test e backup
tests/                 # testes nativos node:test
Dockerfile
render.yaml
```

`src/modules/apps` contém os handlers JavaScript completos organizados por serviço, e `api/src/routes` mantém os controladores separados por domínio. `src/modules/packages` contém modelos e operações de banco compartilhadas. As importações de framework foram redirecionadas aos adaptadores nativos; não são módulos vazios com uma resposta genérica. Edite os arquivos `.js` diretamente: não é necessário recompilar o backend nem instalar pacotes. JSONs importados pelo código estão representados como módulos `.json.js` para evitar exigir import attributes; o restante dos assets fica em `static/`.

O site é distribuído pré-compilado, portanto alterações em seu JS/CSS podem ser feitas nos assets, mas recompilar o frontend React exigiria ferramentas externas.

## Rodar localmente sem Docker

Requer **Node 24.8 ou superior na linha 24**, por usar `node:sqlite` nativo. A imagem Docker fixa Node 24.8.0.

```bash
cp .env.example .env
# Edite JWT_SECRET. Gere uma chave:
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
node --env-file=.env src/server.js
```

Não execute `npm install`: não há dependências em runtime. `npm start` usa as variáveis do ambiente; ele não carrega `.env` automaticamente. Sem `DATA_DIR`, o processo usa a pasta `data` no projeto. A chave JWT precisa ter pelo menos 32 caracteres. Não use a chave de exemplo em produção.

```bash
curl http://localhost:10000/healthz
curl http://localhost:10000/
curl http://localhost:10000/accounts/
curl http://localhost:10000/api/api/config/v2
```

O site está em `/www/`, e as referências de API em `/www/docs`. Signup via site continua fechado sem a configuração Turnstile exigida pelo original; o grant de criação de conta do cliente segue a lógica de autenticação original.

## Docker local

```bash
cp .env.example .env
# Configure uma JWT_SECRET aleatória no .env.
docker compose up --build -d
docker compose logs -f
```

Ou:

```bash
docker build -t recflare-node .
docker volume create recflare-data
docker run --rm -p 10000:10000 \
  -e JWT_SECRET='SUA_CHAVE_ALEATORIA_COM_PELO_MENOS_32_CARACTERES' \
  -e PUBLIC_BASE_URL=http://localhost:10000 \
  -v recflare-data:/var/data recflare-node
```

## Deploy no Render por Dockerfile

Não foi realizado um deploy na conta Render do usuário. O arquivo Dockerfile está preparado; os testes executados foram locais em Node 24.8.0, não um build Docker neste ambiente.

1. Extraia este ZIP e publique **o conteúdo da pasta `server-node` na raiz de um repositório**. Não envie a pasta de dados ou segredos.
2. Crie um **Web Service**, conecte o repositório e escolha **Docker**.
3. Dockerfile Path: `./Dockerfile`; Docker Context: `.`. O container executa `node src/docker-entrypoint.js`, que ajusta a permissão do diretório do disco, abandona privilégios de root e inicia `src/server.js` como UID/GID 1000. Arquivos trazidos de outro servidor devem estar legíveis/graváveis por esse usuário; o entrypoint não altera recursivamente todo o disco.
4. Escolha um plano **pago**, pois esta configuração precisa de Persistent Disk. O Blueprint usa o identificador `0.5c-512mb`.
5. Adicione um disco persistente montado em **`/var/data`**, inicialmente 1 GB, e mantenha **uma instância**.
6. Configure:

| Variável | Valor |
|---|---|
| `JWT_SECRET` | chave aleatória estável, mínimo 32 caracteres |
| `PUBLIC_BASE_URL` | `https://SEU-SERVICO.onrender.com`, sem barra final |
| `DATA_DIR` | `/var/data` |
| `ROUTING_MODE` | `path` |
| `NODE_ENV` | `production` |
| `PORT` | `10000`, ou a porta injetada pelo Render |
| `TRUST_PROXY` | `1` somente atrás do proxy controlado do Render |

7. Configure o Health Check Path como `/healthz` e faça o deploy.
8. Teste `/healthz`, `/accounts/`, `/api/api/config/v2` e `/www/` no domínio do serviço.

Alternativa: use **Blueprint** com `render.yaml`. A chave JWT é gerada no primeiro provisionamento; preencha `PUBLIC_BASE_URL` quando souber a URL real. Se ela mudar, atualize a variável e faça novo deploy. Se os arquivos ficarem dentro de uma subpasta do repositório, ajuste o Root Directory e o contexto Docker de acordo.

### Persistência e limites do Render

Somente dados gravados no mount persistente sobrevivem ao ciclo de vida do container. O projeto grava:

```text
/var/data/recflare.sqlite
/var/data/recflare.sqlite-wal
/var/data/recflare.sqlite-shm
/var/data/notifications.sqlite
/var/data/cdn/
/var/data/images/
```

Não use o filesystem efêmero nem o plano gratuito para a persistência solicitada. Um disco fica associado a uma instância: este desenho não permite escalar horizontalmente. Deploys com disco podem interromper conexões; o cliente deve reconectar, incluindo WebSocket. Faça backups fora do mesmo disco. Os endpoints de upload têm limite global de 16 MiB por padrão, configurável com `MAX_BODY_BYTES`. Dimensione disco e memória conforme o uso, sem presumir que 512 MB sustente carga de produção.

As orientações foram conferidas em 6 de outubro de 2026 nos documentos oficiais:
- https://render.com/docs/disks
- https://render.com/docs/docker
- https://render.com/docs/blueprint-spec

## Roteamento e cliente do jogo

Em um único domínio do Render, o primeiro segmento escolhe o serviço e é removido antes de executar o handler:

```text
/accounts/account/me -> serviço accounts, caminho /account/me
/auth/connect/token  -> serviço auth, caminho /connect/token
/api/api/config/v2   -> serviço api, caminho /api/config/v2
/notify/hub/v1       -> serviço notify, caminho /hub/v1
```

A descoberta `/` usa `PUBLIC_BASE_URL` e anuncia as URLs com prefixo. O nome-server original também anuncia serviços sem implementação própria no ZIP (por exemplo, serviços de mídia auxiliares); este port não inventa implementations para esses hosts. Configure redirecionamentos `SUBDOMAINS` quando o seu cliente precisar deles, conforme o protocolo suportado.

O cliente precisa aceitar essas URLs com prefixo e já estar modificado para apontar para o seu name-server. Se ele exigir subdomínios, configure DNS, TLS e os domínios personalizados do Render para cada serviço e use `ROUTING_MODE=subdomain`, `DOMAIN=seu-dominio`. O site estático deste pacote foi adaptado para o modo **path**; não considere sua navegação multi-subdomínio validada. A versão oficial não foi testada conectando ao jogo real.

## Autenticação e integrações

- JWT HS256 usa HMAC e comparação de assinatura em tempo constante; expiração e `nbf` são verificados.
- Senhas, plataformas verificáveis, limites de signup, refresh tokens e permissões preservam a lógica do original.
- Notificações usam o hub original com armazenamento SQLite e transporte WebSocket nativo. Foram testados handshake SignalR JSON e inscrição em jogadores; recuperação sob carga e rede instável não foram validadas.
- Presença expirada é varrida a cada cinco minutos enquanto o processo está em execução.
- Photon, Meta, Discord, Turnstile e Tachyon não são substituídos por serviços reais neste pacote. Configure as credenciais pertinentes. Não foi validada a integração externa de ponta a ponta.
- A transformação de imagens incorpora o WASM Photon do original; não foi criado um servidor de salas/voz multiplayer apenas por portar estes endpoints HTTP.
- Nada aqui autoriza usar dados, credenciais ou ativos de terceiros sem permissão.

## Testes e resultados

```bash
npm test
npm run audit:routes
node scripts/smoke-routes.js
```

Resultados locais registrados:
- **17 testes automatizados aprovados**, com criação de conta, JWT, refresh/replay, perfil, persistência, roteamento com regex, uploads em bucket/ranges/ETag, site e handshake WebSocket.
- **516 entradas percorridas** pelo smoke test sem autenticação e com bodies mínimos; nenhuma resposta 5xx ou exceção nesse cenário.
- Respostas 401/403/400/404 são esperadas nesse smoke test. Ele não comprova que cada operação funciona com payloads reais, autorização válida ou serviços externos. Endpoints `ALL` são testados apenas com GET.
- `docs/test-output.txt`, `docs/route-smoke-results.json` e `docs/route-audit-summary.json` registram as evidências. Nenhum resultado de build Docker ou deploy Render é apresentado como se tivesse sido executado.

## Backup

```bash
DATA_DIR=/var/data npm run backup
```

O script usa a API online de backup SQLite, sem copiar apenas o arquivo principal enquanto existe WAL. Ele salva os dois bancos. Também copie `cdn/` e `images/` e transfira os backups para outro armazenamento. Os dois bancos e arquivos não constituem uma única transação: interrompa escritas se precisar de um snapshot conjunto perfeitamente consistente.

## Limitações e revisão antes de produção

Este é um **port funcional para testes/preservação**, não uma declaração de completude comercial de 516 funcionalidades. `docs/original-limitations.json` lista referências do original a stubs/TODOs. Algumas funções já respondiam arrays vazios, acknowledgements ou conteúdo de demonstração. Estes comportamentos não foram trocados por implementações fictícias para fingir completude.

O runtime nativo cobre as APIs do framework e bindings usadas pelos handlers; não é uma implementação geral de Hono ou da plataforma Cloudflare. O cache em memória é limitado e se perde com reinícios. Os buckets fazem leitura em memória, e a entrada HTTP também é bufferizada dentro do limite configurado. Antes de abrir publicamente, faça revisão de segurança, teste os payloads do cliente, atualize as bibliotecas incorporadas após análise de compatibilidade, configure quotas/rate limiting no ingresso, monitore memória e espaço, e verifique as integrações externas.

O projeto original é MIT, copyright 2026 djdevin, preservado em `LICENSE.original`. Este pacote não é afiliado ao Rec Room Inc.


## Diagnóstico: logs de requisições, 404 e Photon Custom Auth

`LOG_LEVEL` (`debug|info|warn|error|off`, padrão `info`). Tokens, senhas e valores com formato JWT são sempre mascarados, em qualquer nível.

```text
[HTTP] POST /match/matchmake/dorm
      account=2
      status=200
      14ms

[HTTP_404] POST /match/FDAJBGDDMEI/whatever
      query={"x":"1"}
      account=2
      status=404
      headers={...} body=...
```

- `[HTTP_404]` registra método, caminho original (com prefixo de serviço), query, conta, headers relevantes e corpo. O caminho que o cliente pede aparece aqui; o nome `FDAJBGDDMEI` é só o rótulo do erro dentro do cliente.
- `GET|POST /auth/photon` (em modo subdomínio, `auth.<domínio>/photon`) é uma rota de **trace** para a URL de Custom Authentication configurada no painel do Photon. Procura qualquer valor com formato JWT (query, corpo ou header), valida assinatura, audiência (`PHOTON_REALTIME_APP_ID`/voz/chat) e conta no banco, e responde no formato documentado pelo Photon (`ResultCode` 1 = sucesso, 2 = falha, 3 = parâmetros inválidos).
- **UNKNOWN / REQUIRES CLIENT TRACE:** em qual parâmetro o build 20230414 envia o token, e se o Photon do jogo exige `Nickname`/`AuthCookie`. Sempre que a autenticação falha, o log `[PHOTON_AUTH]` mostra `tokenSource` e os parâmetros recebidos.
- Esta rota não substitui o Photon: o realtime continua sendo Photon Cloud/Server.
- Dorm: cada jogador tem a própria instância (o Dorm é privado por dono). Chamadas repetidas reutilizam o mesmo `roomInstanceId` e `photonRoomId`.

# Nexa API Backend

Uma API backend estilo Reddit construída com NestJS, Prisma e PostgreSQL.

## 🏗️ Arquitetura

O projeto segue uma arquitetura em camadas com separação clara de responsabilidades:

- **Controllers**: Manipulam requisições HTTP e validações
- **Services**: Contêm a lógica de negócio
- **DTOs (Data Transfer Objects)**: Validação de entrada e saída de dados
- **Modules**: Organizam e injetam dependências

## 📁 Estrutura do Projeto

```
src/
├── auth/                  # Autenticação e autorização
│   ├── dto/              # DTOs de autenticação
│   ├── guards/           # Guards JWT
│   ├── decorators/       # Decorators customizados
│   ├── strategies/       # Estratégias Passport
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   └── auth.module.ts
├── users/                # Gerenciamento de usuários
│   ├── dto/
│   ├── users.controller.ts
│   ├── users.service.ts
│   └── users.module.ts
├── communities/          # Gerenciamento de comunidades
│   ├── dto/
│   ├── communities.controller.ts
│   ├── communities.service.ts
│   └── communities.module.ts
├── posts/                # Gerenciamento de posts e analytics
│   ├── dto/
│   ├── posts.controller.ts
│   ├── posts.service.ts
│   ├── insights.controller.ts
│   ├── insights.service.ts
│   ├── insights.constants.ts
│   └── posts.module.ts
├── comments/             # Gerenciamento de comentários
│   ├── dto/
│   ├── comments.controller.ts
│   ├── comments.service.ts
│   └── comments.module.ts
├── votes/                # Sistema de votação
│   ├── dto/
│   ├── votes.controller.ts
│   ├── votes.service.ts
│   └── votes.module.ts
├── media/                # Gerenciamento de mídia
│   ├── dto/
│   ├── media.controller.ts
│   ├── media.service.ts
│   └── media.module.ts
├── chat/                 # Chat 1:1 e mensagens
│   ├── dto/
│   ├── chat.controller.ts
│   ├── chat.service.ts
│   ├── chat.constants.ts
│   └── chat.module.ts
├── prisma/               # Prisma ORM
│   ├── prisma.service.ts
│   └── prisma.module.ts
├── common/               # Utilitários compartilhados
│   ├── decorators/
│   ├── dto/
│   ├── filters/
│   ├── interceptors/
│   └── pipes/
├── app.module.ts
└── main.ts
```

## 🚀 Endpoints da API

### Autenticação (`/auth`)
- `POST /auth/register` - Registrar novo usuário
- `POST /auth/login` - Login de usuário
- `POST /auth/refresh` - Refresh token
- `POST /auth/logout` - Logout

### Usuários (`/users`)
- `GET /users` - Listar todos os usuários (paginado)
- `GET /users/:id` - Buscar usuário por ID
- `GET /users/username/:username` - Buscar usuário por username
- `PUT /users/:id` - Atualizar perfil (autenticado)
- `DELETE /users/:id` - Desativar conta (autenticado)
- `GET /users/:id/posts` - Buscar posts do usuário
- `GET /users/:id/comments` - Buscar comentários do usuário

### Comunidades (`/communities`)
- `POST /communities` - Criar comunidade (autenticado)
- `GET /communities` - Listar comunidades (paginado)
- `GET /communities/:id` - Buscar comunidade por ID
- `GET /communities/name/:name` - Buscar comunidade por nome
- `PUT /communities/:id` - Atualizar comunidade (autenticado)
- `DELETE /communities/:id` - Deletar comunidade (autenticado)
- `POST /communities/:id/join` - Entrar em comunidade (autenticado)
- `POST /communities/:id/leave` - Sair de comunidade (autenticado)
- `GET /communities/:id/members` - Listar membros da comunidade
- `PUT /communities/:id/members/:userId/role` - Atualizar role de membro (autenticado)
- `POST /communities/:id/members/:userId/ban` - Banir membro (autenticado)

### Posts (`/posts`)
- `POST /posts` - Criar post (autenticado)
- `GET /posts` - Listar posts (paginado, ordenável e filtrável por período)
- `GET /posts/community/:communityId` - Listar posts por comunidade
- `GET /posts/:id` - Buscar post por ID
- `PUT /posts/:id` - Atualizar post (autenticado)
- `DELETE /posts/:id` - Deletar post (autenticado)
- `POST /posts/:id/pin` - Fixar post (autenticado)
- `POST /posts/:id/unpin` - Desafixar post (autenticado)
- `POST /posts/:id/lock` - Bloquear post (autenticado)
- `POST /posts/:id/unlock` - Desbloquear post (autenticado)
- `POST /posts/:id/view` - Registrar uma visualização do post
- `GET /posts/:id/insights` - Alcance e engajamento do post (autor ou moderador, autenticado)

### Comentários (`/comments`)
- `POST /comments` - Criar comentário (autenticado)
- `GET /comments/post/:postId` - Listar comentários de um post
- `GET /comments/:id/replies` - Listar respostas de um comentário
- `GET /comments/:id` - Buscar comentário por ID
- `PUT /comments/:id` - Atualizar comentário (autenticado)
- `DELETE /comments/:id` - Deletar comentário (autenticado)
- `GET /comments/user/:userId` - Listar comentários de um usuário

### Votos (`/votes`)
- `POST /votes/post/:postId` - Votar em post (autenticado)
- `GET /votes/post/:postId` - Buscar voto do usuário em post (autenticado)
- `POST /votes/comment/:commentId` - Votar em comentário (autenticado)
- `GET /votes/comment/:commentId` - Buscar voto do usuário em comentário (autenticado)

### Mídia (`/media`)
- `POST /media` - Upload de mídia (autenticado)
- `GET /media/:id` - Buscar mídia por ID
- `GET /media/post/:postId` - Listar mídia de um post
- `GET /media/comment/:commentId` - Listar mídia de um comentário
- `GET /media/user/:userId` - Listar mídia de um usuário
- `DELETE /media/:id` - Deletar mídia (autenticado)

### Chats (`/chats`)
- `POST /chats` - Abrir conversa 1:1 com outro usuário (autenticado, idempotente)
- `GET /chats` - Listar minhas conversas, mais recentes primeiro (autenticado, paginado)
- `GET /chats/:chatId` - Buscar conversa por ID (autenticado)
- `POST /chats/:chatId/messages` - Enviar mensagem (autenticado)
- `GET /chats/:chatId/messages` - Listar mensagens da conversa, mais antigas primeiro (autenticado, paginado)

## 🔧 Configuração

1. Copie o arquivo `.env.example` para `.env`
2. Configure as variáveis de ambiente:
   - `DATABASE_URL`: URL de conexão PostgreSQL
   - `JWT_SECRET`: Secret para JWT access token
   - `JWT_REFRESH_SECRET`: Secret para JWT refresh token
   - `PORT`: Porta do servidor (default: 3000)

### Ordenação e filtro de período dos posts

`GET /posts` e `GET /posts/community/:communityId` aceitam dois query params
independentes, que podem ser combinados livremente.

`sortBy` define a ordenação:

| Valor | Resultado |
| --- | --- |
| `featured` | Fixados primeiro, depois por `score` e, no empate, mais recentes |
| `hot` | Maior `score` (padrão) |
| `top` | Mais votados (`upvoteCount`) |
| `new` | Mais recentes |

`time` restringe a janela de tempo, aplicada sobre `createdAt`:

| Valor | Resultado |
| --- | --- |
| `hour` | Última hora |
| `today` | Desde as 00:00 do dia de hoje |
| `week` | Desde segunda-feira da semana atual |
| `month` | Desde o dia 1º do mês atual |
| `year` | Desde 1º de janeiro do ano atual |
| `all` | Sem restrição de período (padrão) |

Exemplo: `GET /posts?sortBy=top&time=month` retorna os posts mais votados do
mês. O filtro é aplicado tanto na busca quanto na contagem, então `total` e
`totalPages` refletem sempre a mesma janela.

### Detalhamento do post (insights)

`GET /posts/:id/insights` devolve o painel de analytics de um post: alcance
(total de visualizações, views das últimas 24h), a série horária das views,
o breakdown por país e o engajamento. Quem pode ver é o **autor do post** ou um
**moderador/owner da comunidade** — o mesmo público das ações de moderação,
porque analytics que revelam quem leu um post são tão sensíveis quanto a
capacidade de removê-lo.

```
{
  "postId": 1,
  "reach": { "views": 3110, "viewsLast24h": 16, "hoursTracked": 48 },
  "hourlyViews": [{ "bucketStart": "...", "hour": 1, "views": 35 }],
  "countries": {
    "top": [{ "countryCode": "US", "views": 1020, "percentage": 32.8 }],
    "other": { "countryCode": "XX", "views": 1673, "percentage": 53.9 }
  },
  "engagement": {
    "upvotes": 30, "downvotes": 0, "upvoteRatio": 100,
    "comments": 0, "shares": 10, "reposts": 0, "awards": 0
  }
}
```

Alguns detalhes do contrato:

- `hourlyViews` é **denso**: sempre um item por hora da janela, inclusive as
  horas com zero. Uma série esparsa obrigaria o cliente a adivinhar quais horas
  estão faltando.
- A janela é ancorada em `createdAt`, não em "agora", e nunca passa de 48
  horas. Um post com dez minutos de vida mostra só as horas que já
  aconteceram, sem cortar o gráfico com as zero.
- `countries.other` é calculado a partir de `reach.views` menos o topo, e não
  somando as linhas restantes, para que as porcentagens listadas fechem com o
  total mesmo que o rollup esteja incompleto.
- `engagement.upvoteRatio` é `null` quando ninguém votou. `0%` significaria
  "todo mundo votou contra", que é uma afirmação bem diferente de "ainda não
  houve votos".

A visualização é registrada por `POST /posts/:id/view`, e não dentro de
`GET /posts/:id`: um feed que desenha dez cards reportaria dez views a cada
rolagem, o que mediria rolagem, não alcance. Repetidas visitas do mesmo
visitante dentro de uma janela de 30 minutos não contam de novo, para que
recarregar a página não infle os próprios números.

O visitante é identificado por um hash do id de usuário (quando autenticado) ou
do IP, nunca pelo valor em si: a tabela precisa de uma chave estável para a
deduplicação, mas armazenar o valor bruto transformaria a origem do rollup em
uma lista de leitores. O país vem do header `x-country-code` quando um proxy de
borda o fornece, e cai para `XX` quando não vem.

### Rate limiting

Todos os limites são lidos do ambiente e possuem um padrão seguro, portanto
não é preciso definir nenhum deles para rodar o projeto.

| Variável | Padrão | Escopo |
| --- | --- | --- |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` | 100 / 60s | Global, por IP |
| `AUTH_RATE_LIMIT_MAX` | 5 / 60s | Login e registro, por IP |
| `MEDIA_RATE_LIMIT_MAX` | 10 / 60s | Upload de mídia, por IP |
| `PASSWORD_RESET_RATE_LIMIT_MAX` | 3 / 60s | Recuperação de senha, por IP |
| `VERIFY_RESET_CODE_RATE_LIMIT_MAX` | 5 / 60s | Verificação do código, por IP |
| `CHAT_CREATE_IP_RATE_LIMIT_MAX` | 30 / 60s | `POST /chats`, por IP |
| `CHAT_CREATE_RATE_LIMIT_MAX` | 10 / 60s | `POST /chats`, por usuário |
| `CHAT_MESSAGE_IP_RATE_LIMIT_MAX` | 60 / 60s | `POST /chats/:id/messages`, por IP |
| `CHAT_MESSAGE_RATE_LIMIT_MAX` | 20 / 60s | `POST /chats/:id/messages`, por usuário |
| `USER_RATE_LIMIT_MAX` | 200 / 60s | Fallback do limite por usuário |
| `POST_VIEW_IP_RATE_LIMIT_MAX` | 120 / 60s | `POST /posts/:id/view`, por IP |
| `INSIGHTS_IP_RATE_LIMIT_MAX` | 30 / 60s | `GET /posts/:id/insights`, por IP |
| `TRUST_PROXY_HOPS` | 1 | Buffers de proxy à frente da app |

Endpoints de chat têm dois orçamentos independentes: um por IP (via
`ThrottlerGuard` global) e um por usuário autenticado (via `UserThrottleGuard`).
O limite por usuário é sempre mais apertado que o por IP, porque é ele que
impede um abuso real (uma conta inundando a caixa de entrada de alguém ou
criando conversas em massa), enquanto o limite por IP cobre o caso de um
atacante que troca de IP a cada requisição. Um limite só por IP puniria
usuários legítimos que compartilham a mesma conexão.

## 📦 Instalação

```bash
npm install
```

## 🗄️ Database

Gerar Prisma Client:
```bash
npx prisma generate
```

Executar migrations:
```bash
npx prisma migrate dev
```

Seed database:
```bash
npm run seed
```

## 🏃 Executar o projeto

### Development
```bash
npm run start:dev
```

### Production
```bash
npm run build
npm run start:prod
```

## 📚 Documentação da API

Após iniciar o servidor, acesse a documentação Swagger em:
```
http://localhost:3000/api
```

## 🔒 Autenticação

A API usa JWT (JSON Web Tokens) para autenticação:
- Access Token: válido por 15 minutos
- Refresh Token: válido por 7 dias

Para acessar endpoints protegidos, inclua o header:
```
Authorization: Bearer <access_token>
```

## 📝 Features Implementadas

- ✅ Sistema de autenticação com JWT
- ✅ CRUD completo de usuários
- ✅ CRUD completo de comunidades
- ✅ CRUD completo de posts
- ✅ CRUD completo de comentários com suporte a respostas aninhadas
- ✅ Sistema de votação (upvote/downvote) para posts e comentários
- ✅ Sistema de karma para usuários
- ✅ Upload e gerenciamento de mídia
- ✅ Sistema de roles (MEMBER, MODERATOR, OWNER)
- ✅ Chat 1:1 com mensagens, sem conversas duplicadas e sem acesso de terceiros
- ✅ Detalhamento de post: alcance, views por hora, países e engajamento
- ✅ Rate limiting por IP e por usuário autenticado
- ✅ Paginação em todas as listagens
- ✅ Validação de dados com class-validator
- ✅ Documentação automática com Swagger
- ✅ Interceptores globais para formatação de resposta
- ✅ Filtros globais para tratamento de erros
- ✅ CORS habilitado

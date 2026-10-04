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
├── posts/                # Gerenciamento de posts
│   ├── dto/
│   ├── posts.controller.ts
│   ├── posts.service.ts
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
- `GET /posts` - Listar posts (paginado, filtrável por hot/new/top)
- `GET /posts/community/:communityId` - Listar posts por comunidade
- `GET /posts/:id` - Buscar post por ID
- `PUT /posts/:id` - Atualizar post (autenticado)
- `DELETE /posts/:id` - Deletar post (autenticado)
- `POST /posts/:id/pin` - Fixar post (autenticado)
- `POST /posts/:id/unpin` - Desafixar post (autenticado)
- `POST /posts/:id/lock` - Bloquear post (autenticado)
- `POST /posts/:id/unlock` - Desbloquear post (autenticado)

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

## 🔧 Configuração

1. Copie o arquivo `.env.example` para `.env`
2. Configure as variáveis de ambiente:
   - `DATABASE_URL`: URL de conexão PostgreSQL
   - `JWT_SECRET`: Secret para JWT access token
   - `JWT_REFRESH_SECRET`: Secret para JWT refresh token
   - `PORT`: Porta do servidor (default: 3000)

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
- ✅ Paginação em todas as listagens
- ✅ Validação de dados com class-validator
- ✅ Documentação automática com Swagger
- ✅ Interceptores globais para formatação de resposta
- ✅ Filtros globais para tratamento de erros
- ✅ CORS habilitado

# DaminiHost Backend
**By Damini Codesphere**

Node.js + Express backend for the DaminiHost VPS panel.  
No Docker. No Kubernetes. Just `node index.js` on Render.

---

## Folder Structure

```
daminihost-backend/
├── src/
│   ├── index.js            ← Entry point
│   ├── db.js               ← lowdb JSON database
│   ├── processManager.js   ← Spawns/kills bot processes, SSE logs
│   ├── middleware/
│   │   └── auth.js         ← JWT middleware
│   └── routes/
│       ├── auth.js         ← Register / Login / Me
│       └── servers.js      ← CRUD, Start, Stop, Upload, Logs
├── data/
│   ├── db/                 ← 📁 JSON flat-file database (auto-created)
│   │   ├── users.json      ← User accounts
│   │   └── servers.json    ← Server configs
│   ├── servers/            ← 📁 Each bot's files live here
│   │   └── <server-id>/    ← Isolated folder per server
│   └── uploads_tmp/        ← Temp folder for zip extraction
├── .env.example
├── .gitignore
└── package.json
```

---

## Local Setup

```bash
# 1. Clone and install
git clone https://github.com/YOUR_HANDLE/daminihost-backend
cd daminihost-backend
npm install

# 2. Set up env
cp .env.example .env
# Edit .env — set JWT_SECRET to something strong

# 3. Run
npm run dev     # dev with nodemon
npm start       # production
```

---

## Deploy to Render

1. Push repo to GitHub
2. Create a new **Web Service** on Render
3. Set **Build Command**: `npm install`
4. Set **Start Command**: `node src/index.js`
5. Add environment variables:
   - `JWT_SECRET` → long random string
   - `FRONTEND_URL` → your frontend's Render URL
   - `PORT` → Render sets this automatically

> ⚠️ Render's free tier spins down after inactivity.  
> The `data/` folder is ephemeral on free — use a paid instance or mount a **Render Disk** to persist bot files + DB between restarts.

---

## API Reference

### Auth

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | `{ name, email, password }` | Register new user |
| POST | `/api/auth/login` | `{ email, password }` | Login, get JWT |
| GET | `/api/auth/me` | — | Get current user |

All other routes require `Authorization: Bearer <token>` header.

---

### Servers

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/servers` | List all your servers |
| POST | `/api/servers` | Create server `{ name, startCmd?, nodeVersion? }` |
| GET | `/api/servers/:id` | Get single server + file list |
| PATCH | `/api/servers/:id` | Update name/startCmd |
| DELETE | `/api/servers/:id` | Delete server + all files |

### Control

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/servers/:id/start` | `npm install` then `node index.js` |
| POST | `/api/servers/:id/stop` | Kill the process (SIGTERM → SIGKILL) |
| GET | `/api/servers/:id/logs` | **SSE stream** — real-time log output |

### Files

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/servers/:id/files` | List files in server folder |
| POST | `/api/servers/:id/upload` | Upload `.zip` (multipart `file` field) — auto-extracted |
| DELETE | `/api/servers/:id/files/:filename` | Delete a file |

---

## How a Bot Runs

1. User uploads a `.zip` via the panel → extracted to `data/servers/<id>/`
2. User clicks **Start** → backend runs:
   ```
   npm install          (in data/servers/<id>/)
   node index.js        (or whatever startCmd is set to)
   ```
3. stdout/stderr streamed to frontend via **SSE** (`/api/servers/:id/logs`)
4. User clicks **Stop** → `SIGTERM` sent, then `SIGKILL` after 3s
5. Process exit code broadcast to SSE clients

---

## Database

Uses **lowdb** — flat JSON files, no setup needed.

- `data/db/users.json` — user accounts (hashed passwords)
- `data/db/servers.json` — server configs

These files are in `.gitignore` so your data stays local.  
The `data/db/` folder itself is tracked via `.gitkeep` so it exists when you clone.

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Runtime | Node.js 18+ |
| Framework | Express |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| Database | lowdb (flat JSON) |
| Process management | child_process.spawn |
| Real-time logs | Server-Sent Events (SSE) |
| File uploads | multer + unzipper |
| Hosting | Render (Web Service) |

# DaminiHost
**By Damini Codesphere** — host your bots, no Docker needed.

```
DaminiHost/
├── frontend/   ← React + Vite — deploy as Static Site on Render
└── backend/    ← Node.js + Express — deploy as Web Service on Render
```

---

## Local Dev (both at once)

```bash
# Terminal 1 — backend
cd backend
npm install
cp .env.example .env   # set JWT_SECRET
npm run dev            # runs on :4000

# Terminal 2 — frontend
cd frontend
npm install
npm run dev            # runs on :5173, proxies /api → :4000
```

Open `http://localhost:5173`

---

## Deploy to Render

### 1. Backend — Web Service

| Setting | Value |
|---------|-------|
| Root Directory | `backend` |
| Build Command | `npm install` |
| Start Command | `node src/index.js` |
| Environment | `Node` |

**Environment Variables:**
```
JWT_SECRET=<long random string>
FRONTEND_URL=https://your-daminihost-frontend.onrender.com
PORT=           ← Render sets this automatically, leave blank
```

> ⚠️ Mount a **Render Disk** at `/opt/render/project/src/data` to persist your DB and bot files across deploys.

---

### 2. Frontend — Static Site

| Setting | Value |
|---------|-------|
| Root Directory | `frontend` |
| Build Command | `npm install && npm run build` |
| Publish Directory | `frontend/dist` |

**Environment Variables:**
```
VITE_API_URL=https://your-daminihost-backend.onrender.com
```

---

## How It Works

1. User registers/logs in → gets a JWT
2. Creates a server → backend makes a folder `backend/data/servers/<id>/`
3. Uploads a `.zip` → extracted into that folder
4. Clicks **Start** → backend runs `npm install` then `node index.js`
5. Logs stream live to the Console tab via **SSE**
6. Clicks **Stop** → process killed instantly

const express = require("express");
const multer = require("multer");
const unzipper = require("unzipper");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const { serversDb } = require("../db");
const pm = require("../processManager");

const router = express.Router();

// ─── Paths ────────────────────────────────────────────────────────────────────
const SERVERS_DIR = path.join(__dirname, "../../data/servers");
if (!fs.existsSync(SERVERS_DIR)) fs.mkdirSync(SERVERS_DIR, { recursive: true });

// ─── Multer (zip uploads, 100 MB max) ────────────────────────────────────────
const upload = multer({
  dest: path.join(__dirname, "../../data/uploads_tmp"),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/zip" || file.originalname.endsWith(".zip")) {
      cb(null, true);
    } else {
      cb(new Error("Only .zip files are allowed"));
    }
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ownedBy(serverId, userId) {
  return serversDb.get("servers").find({ id: serverId, ownerId: userId }).value();
}

function serverDir(serverId) {
  return path.join(SERVERS_DIR, serverId);
}

function dirFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).map((name) => {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    return { name, isDir: stat.isDirectory(), size: stat.size };
  });
}

// ─── GET /api/servers — list all servers for this user ────────────────────────
router.get("/", (req, res) => {
  const servers = serversDb
    .get("servers")
    .filter({ ownerId: req.user.id })
    .value()
    .map((s) => ({
      ...s,
      status: pm.getStatus(s.id),
      uptime: pm.getUptime(s.id),
    }));
  res.json(servers);
});

// ─── POST /api/servers — create a new server ──────────────────────────────────
router.post("/", (req, res) => {
  const { name, startCmd = "node index.js", nodeVersion = "20.x" } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });

  const id = uuidv4();
  const dir = serverDir(id);
  fs.mkdirSync(dir, { recursive: true });

  const server = {
    id,
    name,
    startCmd,
    nodeVersion,
    ownerId: req.user.id,
    port: null,
    createdAt: new Date().toISOString(),
  };

  serversDb.get("servers").push(server).write();

  res.status(201).json({ ...server, status: "stopped", uptime: 0 });
});

// ─── GET /api/servers/:id — single server ────────────────────────────────────
router.get("/:id", (req, res) => {
  const server = ownedBy(req.params.id, req.user.id);
  if (!server) return res.status(404).json({ error: "Server not found" });

  res.json({
    ...server,
    status: pm.getStatus(server.id),
    uptime: pm.getUptime(server.id),
    files: dirFiles(serverDir(server.id)),
  });
});

// ─── PATCH /api/servers/:id — update name/startCmd ───────────────────────────
router.patch("/:id", (req, res) => {
  const server = ownedBy(req.params.id, req.user.id);
  if (!server) return res.status(404).json({ error: "Server not found" });

  const { name, startCmd, nodeVersion } = req.body;
  const updates = {};
  if (name) updates.name = name;
  if (startCmd) updates.startCmd = startCmd;
  if (nodeVersion) updates.nodeVersion = nodeVersion;

  serversDb.get("servers").find({ id: req.params.id }).assign(updates).write();
  res.json({ ...server, ...updates });
});

// ─── DELETE /api/servers/:id — delete server + files ─────────────────────────
router.delete("/:id", (req, res) => {
  const server = ownedBy(req.params.id, req.user.id);
  if (!server) return res.status(404).json({ error: "Server not found" });

  // Kill if running
  try { pm.stopProcess(req.params.id); } catch (_) {}

  // Remove files
  const dir = serverDir(req.params.id);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });

  // Remove from DB
  serversDb.get("servers").remove({ id: req.params.id }).write();

  res.json({ ok: true });
});

// ─── POST /api/servers/:id/start ─────────────────────────────────────────────
router.post("/:id/start", (req, res) => {
  const server = ownedBy(req.params.id, req.user.id);
  if (!server) return res.status(404).json({ error: "Server not found" });

  const dir = serverDir(server.id);
  if (!fs.existsSync(dir) || fs.readdirSync(dir).length === 0) {
    return res.status(400).json({ error: "No files uploaded. Upload a .zip first." });
  }

  try {
    pm.startProcess(server.id, dir, server.startCmd);
    res.json({ ok: true, status: "starting" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── POST /api/servers/:id/stop ──────────────────────────────────────────────
router.post("/:id/stop", (req, res) => {
  const server = ownedBy(req.params.id, req.user.id);
  if (!server) return res.status(404).json({ error: "Server not found" });

  try {
    pm.stopProcess(server.id);
    res.json({ ok: true, status: "stopped" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─── GET /api/servers/:id/logs — SSE stream ──────────────────────────────────
router.get("/:id/logs", (req, res) => {
  const server = ownedBy(req.params.id, req.user.id);
  if (!server) return res.status(404).json({ error: "Server not found" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  pm.addSSEClient(server.id, res);

  // Heartbeat every 20s to keep connection alive
  const hb = setInterval(() => {
    try { res.write(": heartbeat\n\n"); } catch (_) { clearInterval(hb); }
  }, 20000);

  req.on("close", () => {
    clearInterval(hb);
    pm.removeSSEClient(server.id, res);
  });
});

// ─── POST /api/servers/:id/upload — upload + extract zip ─────────────────────
router.post("/:id/upload", upload.single("file"), async (req, res) => {
  const server = ownedBy(req.params.id, req.user.id);
  if (!server) return res.status(404).json({ error: "Server not found" });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const dir = serverDir(server.id);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  try {
    await fs
      .createReadStream(req.file.path)
      .pipe(unzipper.Extract({ path: dir }))
      .promise();

    // Remove temp upload
    fs.unlinkSync(req.file.path);

    res.json({ ok: true, files: dirFiles(dir) });
  } catch (err) {
    fs.unlinkSync(req.file.path);
    res.status(500).json({ error: "Failed to extract zip: " + err.message });
  }
});

// ─── GET /api/servers/:id/files — list files ─────────────────────────────────
router.get("/:id/files", (req, res) => {
  const server = ownedBy(req.params.id, req.user.id);
  if (!server) return res.status(404).json({ error: "Server not found" });

  res.json(dirFiles(serverDir(server.id)));
});

// ─── DELETE /api/servers/:id/files/:filename — delete a file ─────────────────
router.delete("/:id/files/:filename", (req, res) => {
  const server = ownedBy(req.params.id, req.user.id);
  if (!server) return res.status(404).json({ error: "Server not found" });

  // Security: prevent path traversal
  const safe = path.basename(req.params.filename);
  const filePath = path.join(serverDir(server.id), safe);

  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });

  fs.rmSync(filePath, { recursive: true, force: true });
  res.json({ ok: true });
});

module.exports = router;

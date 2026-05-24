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

function dirFiles(dir, subpath = "") {
  const target = subpath ? path.join(dir, subpath) : dir;
  if (!fs.existsSync(target)) return [];
  return fs.readdirSync(target).map((name) => {
    const full = path.join(target, name);
    const stat = fs.statSync(full);
    return { name, isDir: stat.isDirectory(), size: stat.size, path: subpath ? `${subpath}/${name}` : name };
  });
}

// After extraction, if the zip had a single root folder, move its contents up
// e.g. mybot-main/index.js → index.js
function flattenSingleRootFolder(dir) {
  const entries = fs.readdirSync(dir);
  if (entries.length !== 1) return;
  const only = path.join(dir, entries[0]);
  if (!fs.statSync(only).isDirectory()) return;

  // Move everything from the nested folder up
  const inner = fs.readdirSync(only);
  for (const item of inner) {
    fs.renameSync(path.join(only, item), path.join(dir, item));
  }
  fs.rmdirSync(only);
}

// ─── GET /api/servers ─────────────────────────────────────────────────────────
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

// ─── POST /api/servers ────────────────────────────────────────────────────────
router.post("/", (req, res) => {
  const { name, startCmd = "node index.js", nodeVersion = "20.x" } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });

  const id = uuidv4();
  const dir = serverDir(id);
  fs.mkdirSync(dir, { recursive: true });

  const server = {
    id, name, startCmd, nodeVersion,
    ownerId: req.user.id, port: null,
    createdAt: new Date().toISOString(),
  };

  serversDb.get("servers").push(server).write();
  res.status(201).json({ ...server, status: "stopped", uptime: 0 });
});

// ─── GET /api/servers/:id ─────────────────────────────────────────────────────
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

// ─── PATCH /api/servers/:id ───────────────────────────────────────────────────
router.patch("/:id", (req, res) => {
  const server = ownedBy(req.params.id, req.user.id);
  if (!server) return res.status(404).json({ error: "Server not found" });

  const { name, startCmd, nodeVersion } = req.body;
  const updates = {};
  if (name) updates.name = name;
  if (startCmd !== undefined) updates.startCmd = startCmd;
  if (nodeVersion) updates.nodeVersion = nodeVersion;

  serversDb.get("servers").find({ id: req.params.id }).assign(updates).write();
  res.json({ ...server, ...updates });
});

// ─── DELETE /api/servers/:id ──────────────────────────────────────────────────
router.delete("/:id", (req, res) => {
  const server = ownedBy(req.params.id, req.user.id);
  if (!server) return res.status(404).json({ error: "Server not found" });

  try { pm.stopProcess(req.params.id); } catch (_) {}

  const dir = serverDir(req.params.id);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });

  serversDb.get("servers").remove({ id: req.params.id }).write();
  res.json({ ok: true });
});

// ─── POST /api/servers/:id/start ─────────────────────────────────────────────
router.post("/:id/start", (req, res) => {
  const server = ownedBy(req.params.id, req.user.id);
  if (!server) return res.status(404).json({ error: "Server not found" });

  const dir = serverDir(server.id);
  const entries = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  if (entries.length === 0) {
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

// ─── GET /api/servers/:id/logs — SSE ─────────────────────────────────────────
router.get("/:id/logs", (req, res) => {
  const server = ownedBy(req.params.id, req.user.id);
  if (!server) return res.status(404).json({ error: "Server not found" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  pm.addSSEClient(server.id, res);

  const hb = setInterval(() => {
    try { res.write(": heartbeat\n\n"); } catch (_) { clearInterval(hb); }
  }, 20000);

  req.on("close", () => { clearInterval(hb); pm.removeSSEClient(server.id, res); });
});

// ─── POST /api/servers/:id/upload ─────────────────────────────────────────────
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

    fs.unlinkSync(req.file.path);

    // Auto-flatten if zip had a single root folder (e.g. mybot-main/)
    flattenSingleRootFolder(dir);

    const files = dirFiles(dir);
    res.json({ ok: true, files });
  } catch (err) {
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    res.status(500).json({ error: "Failed to extract zip: " + err.message });
  }
});

// ─── GET /api/servers/:id/files ──────────────────────────────────────────────
router.get("/:id/files", (req, res) => {
  const server = ownedBy(req.params.id, req.user.id);
  if (!server) return res.status(404).json({ error: "Server not found" });

  const subpath = req.query.path || "";
  // Security: prevent path traversal
  const resolved = path.resolve(serverDir(server.id), subpath);
  if (!resolved.startsWith(serverDir(server.id))) {
    return res.status(400).json({ error: "Invalid path" });
  }

  res.json({ files: dirFiles(serverDir(server.id), subpath), currentPath: subpath });
});

// ─── DELETE /api/servers/:id/files — delete by path in body ──────────────────
router.delete("/:id/files", (req, res) => {
  const server = ownedBy(req.params.id, req.user.id);
  if (!server) return res.status(404).json({ error: "Server not found" });

  const filePath = req.body.path || req.query.path;
  if (!filePath) return res.status(400).json({ error: "path is required" });

  const resolved = path.resolve(serverDir(server.id), filePath);
  if (!resolved.startsWith(serverDir(server.id))) {
    return res.status(400).json({ error: "Invalid path" });
  }

  if (!fs.existsSync(resolved)) return res.status(404).json({ error: "File not found" });

  fs.rmSync(resolved, { recursive: true, force: true });
  res.json({ ok: true });
});

// ─── POST /api/servers/:id/files/move — move file up a level ─────────────────
router.post("/:id/files/move", (req, res) => {
  const server = ownedBy(req.params.id, req.user.id);
  if (!server) return res.status(404).json({ error: "Server not found" });

  const { from, to } = req.body; // both relative to server dir
  if (!from || !to) return res.status(400).json({ error: "from and to are required" });

  const base = serverDir(server.id);
  const src = path.resolve(base, from);
  const dest = path.resolve(base, to);

  if (!src.startsWith(base) || !dest.startsWith(base)) {
    return res.status(400).json({ error: "Invalid path" });
  }

  if (!fs.existsSync(src)) return res.status(404).json({ error: "Source not found" });

  fs.renameSync(src, dest);
  res.json({ ok: true, files: dirFiles(base) });
});

// ─── POST /api/servers/:id/startup — save startup file ───────────────────────
router.post("/:id/startup", (req, res) => {
  const server = ownedBy(req.params.id, req.user.id);
  if (!server) return res.status(404).json({ error: "Server not found" });

  const { content, filename = "index.js" } = req.body;
  if (content === undefined) return res.status(400).json({ error: "content is required" });

  // Security: filename must be safe
  const safe = path.basename(filename);
  const filePath = path.join(serverDir(server.id), safe);

  fs.writeFileSync(filePath, content, "utf8");
  res.json({ ok: true, filename: safe });
});

// ─── GET /api/servers/:id/startup — read a file ──────────────────────────────
router.get("/:id/startup", (req, res) => {
  const server = ownedBy(req.params.id, req.user.id);
  if (!server) return res.status(404).json({ error: "Server not found" });

  const filename = req.query.file || "index.js";
  const safe = path.basename(filename);
  const filePath = path.join(serverDir(server.id), safe);

  if (!fs.existsSync(filePath)) return res.json({ content: "", filename: safe });

  const content = fs.readFileSync(filePath, "utf8");
  res.json({ content, filename: safe });
});

module.exports = router;

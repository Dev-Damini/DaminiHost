const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");
const path = require("path");
const fs = require("fs");

// ─── Ensure db directory exists ───────────────────────────────────────────────
const DB_DIR = path.join(__dirname, "../../data/db");
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

// ─── Adapters ─────────────────────────────────────────────────────────────────
const usersAdapter = new FileSync(path.join(DB_DIR, "users.json"));
const serversAdapter = new FileSync(path.join(DB_DIR, "servers.json"));

const usersDb = low(usersAdapter);
const serversDb = low(serversAdapter);

// ─── Default structure ────────────────────────────────────────────────────────
usersDb.defaults({ users: [] }).write();
serversDb.defaults({ servers: [] }).write();

module.exports = { usersDb, serversDb };

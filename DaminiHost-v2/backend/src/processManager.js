const { spawn } = require("child_process");
const path = require("path");

// ─── In-memory process store ───────────────────────────────────────────────────
// { [serverId]: { process, logBuffer, sseClients } }
const processes = {};

// ─── SSE helpers ──────────────────────────────────────────────────────────────
function broadcast(serverId, data) {
  const entry = processes[serverId];
  if (!entry) return;
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  entry.sseClients.forEach((res) => {
    try { res.write(payload); } catch (_) {}
  });
  // Keep last 500 lines
  entry.logBuffer.push(data);
  if (entry.logBuffer.length > 500) entry.logBuffer.shift();
}

// ─── Start a server ───────────────────────────────────────────────────────────
function startProcess(serverId, serverDir, startCmd) {
  if (processes[serverId]?.process) {
    throw new Error("Server already running");
  }

  const logBuffer = [];
  const sseClients = [];

  // Run npm install first, then the start command
  const installLog = (msg) => broadcast(serverId, { type: "log", line: msg, ts: Date.now() });

  installLog("▶ Running npm install...");

  const install = spawn("npm", ["install"], {
    cwd: serverDir,
    shell: true,
    env: { ...process.env },
  });

  processes[serverId] = { process: install, logBuffer, sseClients, status: "installing" };

  install.stdout.on("data", (d) => installLog(d.toString().trim()));
  install.stderr.on("data", (d) => installLog(d.toString().trim()));

  install.on("close", (code) => {
    if (code !== 0) {
      installLog(`✗ npm install failed (exit ${code})`);
      delete processes[serverId];
      return;
    }

    installLog(`✓ npm install complete`);
    installLog(`▶ Starting: ${startCmd}`);

    const [cmd, ...args] = startCmd.split(" ");
    const bot = spawn(cmd, args, {
      cwd: serverDir,
      shell: true,
      env: { ...process.env },
    });

    processes[serverId] = { process: bot, logBuffer, sseClients, status: "running", startedAt: Date.now() };

    bot.stdout.on("data", (d) => {
      d.toString().split("\n").filter(Boolean).forEach((line) =>
        broadcast(serverId, { type: "log", line, ts: Date.now() })
      );
    });

    bot.stderr.on("data", (d) => {
      d.toString().split("\n").filter(Boolean).forEach((line) =>
        broadcast(serverId, { type: "log", line: `[stderr] ${line}`, ts: Date.now() })
      );
    });

    bot.on("close", (code) => {
      broadcast(serverId, { type: "exit", code, ts: Date.now() });
      if (processes[serverId]) {
        processes[serverId].status = "stopped";
        processes[serverId].process = null;
      }
    });
  });

  return { ok: true };
}

// ─── Stop a server ────────────────────────────────────────────────────────────
function stopProcess(serverId) {
  const entry = processes[serverId];
  if (!entry?.process) throw new Error("Server is not running");

  entry.process.kill("SIGTERM");
  setTimeout(() => {
    if (entry.process && !entry.process.killed) {
      entry.process.kill("SIGKILL");
    }
  }, 3000);

  broadcast(serverId, { type: "log", line: "⬛ Process killed", ts: Date.now() });
  entry.status = "stopped";
  entry.process = null;
}

// ─── Get status ───────────────────────────────────────────────────────────────
function getStatus(serverId) {
  const entry = processes[serverId];
  if (!entry || !entry.process) return "stopped";
  return entry.status || "stopped";
}

function getUptime(serverId) {
  const entry = processes[serverId];
  if (!entry?.startedAt || !entry.process) return 0;
  return Math.floor((Date.now() - entry.startedAt) / 1000);
}

// ─── SSE: add / remove clients ────────────────────────────────────────────────
function addSSEClient(serverId, res) {
  if (!processes[serverId]) {
    processes[serverId] = { process: null, logBuffer: [], sseClients: [], status: "stopped" };
  }
  processes[serverId].sseClients.push(res);
  // Replay last 100 lines to new client
  processes[serverId].logBuffer.slice(-100).forEach((data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  });
}

function removeSSEClient(serverId, res) {
  const entry = processes[serverId];
  if (!entry) return;
  entry.sseClients = entry.sseClients.filter((c) => c !== res);
}

module.exports = { startProcess, stopProcess, getStatus, getUptime, addSSEClient, removeSSEClient };

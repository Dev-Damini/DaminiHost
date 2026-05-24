import { useState, useEffect, useRef, useCallback } from "react";

// ─── Fake data ──────────────────────────────────────────────────────────────
const FAKE_LOGS = [
  "> Initializing bot runtime...",
  "> Loading configuration from config.json",
  "> Connecting to Discord gateway...",
  "> Shard [0] ready",
  "> Logged in as DANI#0001",
  "> Watching 14 guilds | 3,204 users",
  "> Command handler loaded: 42 commands",
  "> Event listeners registered",
  "> Heartbeat OK — latency: 48ms",
  "> Message received in #general",
  "> Command executed: /help by Veronica#0001",
  "> Response sent in 112ms",
  "> Heartbeat OK — latency: 51ms",
  "> Presence updated: Online",
  "> Rate limit hit on endpoint /channels — retrying in 1s",
  "> Retry success",
  "> Heartbeat OK — latency: 44ms",
];

const INITIAL_SERVERS = [
  {
    id: "srv_001",
    name: "DANI Bot",
    status: "running",
    ram: 182,
    cpu: 14,
    uptime: 172800,
    port: 3001,
    files: ["index.js", "config.json", "commands/", "events/"],
  },
  {
    id: "srv_002",
    name: "PrimisAI API",
    status: "stopped",
    ram: 0,
    cpu: 0,
    uptime: 0,
    port: 3002,
    files: ["server.js", "routes/", ".env", "package.json"],
  },
  {
    id: "srv_003",
    name: "DANI Search",
    status: "running",
    ram: 94,
    cpu: 6,
    uptime: 86400,
    port: 3003,
    files: ["main.js", "scraper.js", "utils/", "package.json"],
  },
];

// ─── Utils ───────────────────────────────────────────────────────────────────
function fmtUptime(s) {
  if (!s) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}
function fmtRam(mb) {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}
function uid() {
  return "srv_" + Math.random().toString(36).slice(2, 7);
}

// ─── CPU Sparkline ───────────────────────────────────────────────────────────
function Spark({ data, color = "#00ff88" }) {
  const max = Math.max(...data, 1);
  const w = 60, h = 24;
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`)
    .join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Mini Donut ──────────────────────────────────────────────────────────────
function Donut({ pct, color, size = 40 }) {
  const r = 14, c = size / 2, circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="#1a1a1a" strokeWidth="4" />
      <circle
        cx={c} cy={c} r={r} fill="none"
        stroke={color} strokeWidth="4"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${c} ${c})`}
        style={{ transition: "stroke-dasharray 0.6s ease" }}
      />
      <text x={c} y={c + 4} textAnchor="middle" fontSize="9" fill="#ccc" fontFamily="monospace">
        {pct}%
      </text>
    </svg>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────
export default function DaminiHost() {
  const [servers, setServers] = useState(INITIAL_SERVERS);
  const [active, setActive] = useState("srv_001");
  const [tab, setTab] = useState("console"); // console | files | settings
  const [logs, setLogs] = useState([...FAKE_LOGS]);
  const [cpuHistory, setCpuHistory] = useState({
    srv_001: Array(12).fill(0).map(() => Math.floor(Math.random() * 20 + 5)),
    srv_002: Array(12).fill(0),
    srv_003: Array(12).fill(0).map(() => Math.floor(Math.random() * 12 + 2)),
  });
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [uploadName, setUploadName] = useState("");
  const [consoleInput, setConsoleInput] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const logsEnd = useRef(null);
  const logInterval = useRef(null);

  const activeServer = servers.find((s) => s.id === active);

  // Live log ticker
  useEffect(() => {
    if (activeServer?.status === "running") {
      logInterval.current = setInterval(() => {
        const line = FAKE_LOGS[Math.floor(Math.random() * FAKE_LOGS.length)];
        setLogs((prev) => [...prev.slice(-200), `[${new Date().toLocaleTimeString()}] ${line}`]);
      }, 1800);
    }
    return () => clearInterval(logInterval.current);
  }, [active, activeServer?.status]);

  // Scroll logs
  useEffect(() => {
    logsEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // CPU/RAM tick
  useEffect(() => {
    const t = setInterval(() => {
      setServers((prev) =>
        prev.map((s) => {
          if (s.status !== "running") return s;
          const cpuDelta = (Math.random() - 0.4) * 6;
          const ramDelta = (Math.random() - 0.4) * 10;
          return {
            ...s,
            cpu: Math.max(1, Math.min(99, s.cpu + cpuDelta)),
            ram: Math.max(40, Math.min(512, s.ram + ramDelta)),
            uptime: s.uptime + 2,
          };
        })
      );
      setCpuHistory((prev) => {
        const next = { ...prev };
        servers.forEach((s) => {
          if (s.status === "running") {
            next[s.id] = [...(prev[s.id] || []).slice(-11), Math.round(s.cpu)];
          }
        });
        return next;
      });
    }, 2000);
    return () => clearInterval(t);
  }, [servers]);

  const toggleServer = useCallback((id) => {
    setServers((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const starting = s.status !== "running";
        if (starting) {
          setLogs([
            `[${new Date().toLocaleTimeString()}] > npm install...`,
            `[${new Date().toLocaleTimeString()}] > added 148 packages in 3.2s`,
            `[${new Date().toLocaleTimeString()}] > node index.js`,
            `[${new Date().toLocaleTimeString()}] > Server started on port ${s.port}`,
          ]);
        } else {
          setLogs((p) => [...p, `[${new Date().toLocaleTimeString()}] > Process killed. Exit code 0`]);
        }
        return {
          ...s,
          status: starting ? "running" : "stopped",
          cpu: starting ? 8 : 0,
          ram: starting ? 120 : 0,
          uptime: starting ? 0 : 0,
        };
      })
    );
  }, []);

  const createServer = () => {
    if (!newName.trim()) return;
    const id = uid();
    setServers((prev) => [
      ...prev,
      {
        id,
        name: newName.trim(),
        status: "stopped",
        ram: 0,
        cpu: 0,
        uptime: 0,
        port: 3000 + prev.length + 1,
        files: ["index.js", "package.json"],
      },
    ]);
    setCpuHistory((prev) => ({ ...prev, [id]: Array(12).fill(0) }));
    setNewName("");
    setShowNew(false);
    setActive(id);
  };

  const deleteServer = (id) => {
    setServers((prev) => prev.filter((s) => s.id !== id));
    if (active === id) setActive(servers.find((s) => s.id !== id)?.id);
  };

  const sendCommand = (e) => {
    e.preventDefault();
    if (!consoleInput.trim()) return;
    setLogs((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] $ ${consoleInput}`,
      `[${new Date().toLocaleTimeString()}] > command not found: ${consoleInput.split(" ")[0]}`,
    ]);
    setConsoleInput("");
  };

  const totalRunning = servers.filter((s) => s.status === "running").length;
  const totalRam = servers.reduce((a, s) => a + s.ram, 0);

  // ── Styles ────────────────────────────────────────────────────────────────
  const css = {
    root: {
      fontFamily: "'DM Mono', 'Fira Mono', monospace",
      background: "#080808",
      color: "#e0e0e0",
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      fontSize: "13px",
    },
    topbar: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 20px",
      height: "48px",
      borderBottom: "1px solid #1e1e1e",
      background: "#0c0c0c",
      position: "sticky",
      top: 0,
      zIndex: 100,
    },
    logo: {
      fontSize: "15px",
      fontWeight: "700",
      letterSpacing: "3px",
      textTransform: "uppercase",
      color: "#fff",
      display: "flex",
      alignItems: "center",
      gap: "8px",
    },
    logoDot: {
      width: "8px",
      height: "8px",
      borderRadius: "50%",
      background: "#00ff88",
      boxShadow: "0 0 8px #00ff88",
      animation: "pulse 2s infinite",
    },
    topRight: { display: "flex", alignItems: "center", gap: "16px" },
    badge: (color) => ({
      padding: "2px 8px",
      borderRadius: "3px",
      fontSize: "11px",
      background: color + "22",
      color: color,
      border: `1px solid ${color}44`,
      fontWeight: "600",
    }),
    body: { display: "flex", flex: 1, overflow: "hidden", height: "calc(100vh - 48px)" },
    sidebar: {
      width: sidebarOpen ? "220px" : "0",
      minWidth: sidebarOpen ? "220px" : "0",
      borderRight: "1px solid #1a1a1a",
      background: "#0a0a0a",
      overflowY: "auto",
      overflowX: "hidden",
      transition: "all 0.2s",
      display: "flex",
      flexDirection: "column",
    },
    sideSection: { padding: "12px 14px 4px", fontSize: "10px", color: "#444", letterSpacing: "2px", textTransform: "uppercase" },
    sideItem: (isActive) => ({
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "8px 14px",
      cursor: "pointer",
      background: isActive ? "#141414" : "transparent",
      borderLeft: isActive ? "2px solid #00ff88" : "2px solid transparent",
      color: isActive ? "#fff" : "#666",
      transition: "all 0.15s",
      whiteSpace: "nowrap",
    }),
    statusDot: (status) => ({
      width: "6px",
      height: "6px",
      borderRadius: "50%",
      background: status === "running" ? "#00ff88" : "#333",
      boxShadow: status === "running" ? "0 0 6px #00ff88" : "none",
      flexShrink: 0,
    }),
    main: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
    panelHead: {
      padding: "16px 20px",
      borderBottom: "1px solid #1a1a1a",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      background: "#0c0c0c",
    },
    h2: { fontSize: "16px", fontWeight: "700", letterSpacing: "1px", color: "#fff" },
    btn: (variant = "ghost") => ({
      padding: "6px 14px",
      borderRadius: "4px",
      fontSize: "12px",
      fontWeight: "600",
      fontFamily: "inherit",
      cursor: "pointer",
      border: variant === "primary" ? "none" : "1px solid #2a2a2a",
      background: variant === "primary" ? "#00ff88" : variant === "danger" ? "#ff444422" : "#141414",
      color: variant === "primary" ? "#000" : variant === "danger" ? "#ff4444" : "#ccc",
      transition: "all 0.15s",
      letterSpacing: "0.5px",
    }),
    statsRow: {
      display: "flex",
      gap: "0",
      borderBottom: "1px solid #1a1a1a",
      background: "#0a0a0a",
    },
    statCard: {
      flex: 1,
      padding: "14px 20px",
      borderRight: "1px solid #1a1a1a",
    },
    statLabel: { fontSize: "10px", color: "#444", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "4px" },
    statVal: { fontSize: "20px", fontWeight: "700", color: "#fff" },
    statSub: { fontSize: "11px", color: "#555", marginTop: "2px" },
    content: { flex: 1, display: "flex", overflow: "hidden" },
    serverPanel: {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    },
    serverHead: {
      padding: "14px 20px",
      borderBottom: "1px solid #1a1a1a",
      display: "flex",
      alignItems: "center",
      gap: "12px",
      background: "#0c0c0c",
    },
    tabs: {
      display: "flex",
      gap: "0",
      borderBottom: "1px solid #1a1a1a",
      background: "#0a0a0a",
    },
    tabBtn: (isActive) => ({
      padding: "10px 18px",
      fontSize: "12px",
      fontFamily: "inherit",
      cursor: "pointer",
      background: "transparent",
      border: "none",
      borderBottom: isActive ? "2px solid #00ff88" : "2px solid transparent",
      color: isActive ? "#00ff88" : "#555",
      fontWeight: isActive ? "600" : "400",
      transition: "all 0.15s",
      letterSpacing: "0.5px",
    }),
    console: {
      flex: 1,
      background: "#060606",
      overflowY: "auto",
      padding: "14px 16px",
      fontFamily: "'DM Mono', monospace",
      fontSize: "12px",
      lineHeight: "1.7",
    },
    logLine: (line) => ({
      color: line.includes("Error") || line.includes("error") || line.includes("kill")
        ? "#ff6b6b"
        : line.includes("warn") || line.includes("rate limit")
        ? "#ffcc44"
        : line.includes("ready") || line.includes("success") || line.includes("OK")
        ? "#00ff88"
        : "#7a7a7a",
      margin: 0,
    }),
    consoleInput: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "10px 16px",
      borderTop: "1px solid #1a1a1a",
      background: "#0a0a0a",
    },
    input: {
      flex: 1,
      background: "transparent",
      border: "none",
      outline: "none",
      color: "#00ff88",
      fontFamily: "inherit",
      fontSize: "12px",
    },
    fileList: {
      flex: 1,
      padding: "16px",
      overflowY: "auto",
    },
    fileRow: {
      display: "flex",
      alignItems: "center",
      gap: "10px",
      padding: "8px 12px",
      borderRadius: "4px",
      marginBottom: "4px",
      background: "#0f0f0f",
      border: "1px solid #1a1a1a",
      cursor: "pointer",
      transition: "border-color 0.15s",
    },
    uploadZone: {
      margin: "16px",
      padding: "24px",
      border: "1px dashed #2a2a2a",
      borderRadius: "6px",
      textAlign: "center",
      color: "#444",
      cursor: "pointer",
      transition: "all 0.15s",
    },
    settingsBlock: {
      flex: 1,
      padding: "20px",
      overflowY: "auto",
    },
    settingsRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "12px 0",
      borderBottom: "1px solid #141414",
    },
    settingsLabel: { color: "#888", fontSize: "12px" },
    settingsVal: { color: "#ccc", fontFamily: "inherit" },
    modal: {
      position: "fixed",
      inset: 0,
      background: "#000000cc",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 999,
    },
    modalBox: {
      background: "#111",
      border: "1px solid #2a2a2a",
      borderRadius: "8px",
      padding: "24px",
      width: "340px",
    },
    modalInput: {
      width: "100%",
      background: "#0a0a0a",
      border: "1px solid #2a2a2a",
      borderRadius: "4px",
      padding: "8px 12px",
      color: "#fff",
      fontFamily: "inherit",
      fontSize: "13px",
      outline: "none",
      boxSizing: "border-box",
      marginBottom: "12px",
    },
    rightPanel: {
      width: "240px",
      borderLeft: "1px solid #1a1a1a",
      background: "#0a0a0a",
      display: "flex",
      flexDirection: "column",
      overflowY: "auto",
    },
    metricBox: {
      padding: "14px 16px",
      borderBottom: "1px solid #141414",
    },
    metricLabel: { fontSize: "10px", color: "#444", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "8px" },
    serverList: {
      padding: "10px",
      gap: "8px",
      display: "flex",
      flexDirection: "column",
    },
    serverCard: (isActive) => ({
      padding: "12px",
      borderRadius: "6px",
      border: isActive ? "1px solid #00ff8844" : "1px solid #1a1a1a",
      background: isActive ? "#0d1a12" : "#0f0f0f",
      cursor: "pointer",
      transition: "all 0.15s",
    }),
  };

  return (
    <div style={css.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: #0a0a0a; }
        ::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 2px; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        .srv-card:hover { border-color: #2a2a2a !important; }
        .btn-hover:hover { opacity: 0.85; }
        .file-row:hover { border-color: #2a2a2a !important; }
        .side-item:hover { color: #bbb !important; }
        .upload-zone:hover { border-color: #444 !important; color: #666 !important; }
      `}</style>

      {/* ── Topbar ── */}
      <div style={css.topbar}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ ...css.btn(), padding: "4px 8px", fontSize: "16px" }}>
            ☰
          </button>
          <div style={css.logo}>
            <div style={css.logoDot} />
            DAMINIHOST
          </div>
        </div>
        <div style={css.topRight}>
          <span style={css.badge("#00ff88")}>{totalRunning} RUNNING</span>
          <span style={css.badge("#888")}>{fmtRam(totalRam)} USED</span>
          <span style={{ ...css.badge("#7c6aff"), letterSpacing: "1px" }}>RENDER · ZA</span>
          <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "linear-gradient(135deg,#7c6aff,#00ff88)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "700", color: "#000" }}>V</div>
        </div>
      </div>

      <div style={css.body}>
        {/* ── Sidebar ── */}
        <div style={css.sidebar}>
          <div style={css.sideSection}>Servers</div>
          {servers.map((s) => (
            <div
              key={s.id}
              className="side-item"
              style={css.sideItem(active === s.id)}
              onClick={() => { setActive(s.id); setLogs([...FAKE_LOGS]); setTab("console"); }}
            >
              <div style={css.statusDot(s.status)} />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span>
            </div>
          ))}
          <div style={{ padding: "8px 12px" }}>
            <button style={{ ...css.btn("primary"), width: "100%", padding: "7px" }} onClick={() => setShowNew(true)}>
              + New Server
            </button>
          </div>
          <div style={{ marginTop: "auto" }}>
            <div style={css.sideSection}>Account</div>
            <div style={{ ...css.sideItem(false), gap: "8px" }}>
              <span style={{ color: "#555" }}>⚙</span> Settings
            </div>
            <div style={{ ...css.sideItem(false), gap: "8px" }}>
              <span style={{ color: "#555" }}>?</span> Docs
            </div>
            <div style={{ padding: "12px 14px", fontSize: "10px", color: "#333" }}>
              DaminiHost by Damini Codesphere
            </div>
          </div>
        </div>

        {/* ── Main ── */}
        <div style={css.main}>
          {/* Stats row */}
          <div style={css.statsRow}>
            {[
              { label: "Total Servers", val: servers.length, sub: `${totalRunning} active` },
              { label: "RAM Used", val: fmtRam(totalRam), sub: "512 MB limit" },
              { label: "Avg CPU", val: Math.round(servers.filter(s=>s.status==="running").reduce((a,s)=>a+s.cpu,0) / Math.max(totalRunning,1)) + "%", sub: "across running" },
              { label: "Region", val: "ZA-1", sub: "Cape Town / Render" },
            ].map((s) => (
              <div key={s.label} style={css.statCard}>
                <div style={css.statLabel}>{s.label}</div>
                <div style={css.statVal}>{s.val}</div>
                <div style={css.statSub}>{s.sub}</div>
              </div>
            ))}
          </div>

          <div style={css.content}>
            {/* ── Server panel ── */}
            {activeServer ? (
              <div style={css.serverPanel}>
                {/* Server header */}
                <div style={css.serverHead}>
                  <div style={css.statusDot(activeServer.status)} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "15px", fontWeight: "700", color: "#fff" }}>{activeServer.name}</div>
                    <div style={{ fontSize: "11px", color: "#444", marginTop: "2px" }}>
                      port {activeServer.port} · uptime {fmtUptime(activeServer.uptime)}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <button
                      className="btn-hover"
                      style={css.btn(activeServer.status === "running" ? "danger" : "primary")}
                      onClick={() => toggleServer(activeServer.id)}
                    >
                      {activeServer.status === "running" ? "⬛ Stop" : "▶ Start"}
                    </button>
                    <button
                      className="btn-hover"
                      style={css.btn("ghost")}
                      onClick={() => { setLogs([...FAKE_LOGS]); }}
                    >
                      ↺ Restart
                    </button>
                    <button
                      className="btn-hover"
                      style={{ ...css.btn("danger"), padding: "6px 10px" }}
                      onClick={() => deleteServer(activeServer.id)}
                    >
                      🗑
                    </button>
                  </div>
                </div>

                {/* Tabs */}
                <div style={css.tabs}>
                  {["console", "files", "settings"].map((t) => (
                    <button key={t} style={css.tabBtn(tab === t)} onClick={() => setTab(t)}>
                      {t === "console" ? "⌨ Console" : t === "files" ? "📁 Files" : "⚙ Settings"}
                    </button>
                  ))}
                </div>

                {/* Tab content */}
                {tab === "console" && (
                  <>
                    <div style={css.console}>
                      {activeServer.status !== "running" && (
                        <div style={{ color: "#333", marginBottom: "8px" }}>— Server stopped. Start it to see logs. —</div>
                      )}
                      {logs.map((l, i) => (
                        <p key={i} style={css.logLine(l)}>{l}</p>
                      ))}
                      {activeServer.status === "running" && (
                        <span style={{ color: "#00ff88", animation: "blink 1s infinite" }}>█</span>
                      )}
                      <div ref={logsEnd} />
                    </div>
                    <div style={css.consoleInput}>
                      <span style={{ color: "#444" }}>$</span>
                      <input
                        style={css.input}
                        value={consoleInput}
                        onChange={(e) => setConsoleInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && sendCommand(e)}
                        placeholder={activeServer.status === "running" ? "send command..." : "start server to send commands"}
                        disabled={activeServer.status !== "running"}
                      />
                      <button style={{ ...css.btn(), padding: "4px 10px", fontSize: "11px" }} onClick={sendCommand}>Send</button>
                    </div>
                  </>
                )}

                {tab === "files" && (
                  <>
                    <div style={css.uploadZone} className="upload-zone">
                      <div style={{ fontSize: "20px", marginBottom: "6px" }}>⬆</div>
                      <div>Drop .zip file to upload</div>
                      <div style={{ fontSize: "11px", marginTop: "4px" }}>or click to browse</div>
                    </div>
                    <div style={css.fileList}>
                      {activeServer.files.map((f, i) => (
                        <div key={i} className="file-row" style={css.fileRow}>
                          <span style={{ color: f.endsWith("/") ? "#7c6aff" : "#00ff88" }}>
                            {f.endsWith("/") ? "📁" : "📄"}
                          </span>
                          <span style={{ flex: 1 }}>{f}</span>
                          <span style={{ color: "#333", fontSize: "11px" }}>
                            {f.endsWith("/") ? "dir" : Math.floor(Math.random() * 20 + 1) + " KB"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {tab === "settings" && (
                  <div style={css.settingsBlock}>
                    <div style={{ color: "#555", fontSize: "11px", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "12px" }}>Server Config</div>
                    {[
                      ["Name", activeServer.name],
                      ["Server ID", activeServer.id],
                      ["Port", activeServer.port],
                      ["Start Command", "node index.js"],
                      ["Install Command", "npm install"],
                      ["Region", "ZA-1 (Render)"],
                      ["Node Version", "20.x LTS"],
                    ].map(([k, v]) => (
                      <div key={k} style={css.settingsRow}>
                        <span style={css.settingsLabel}>{k}</span>
                        <span style={css.settingsVal}>{v}</span>
                      </div>
                    ))}
                    <div style={{ marginTop: "20px", display: "flex", gap: "8px" }}>
                      <button style={css.btn("ghost")}>Edit Config</button>
                      <button style={css.btn("danger")} onClick={() => deleteServer(activeServer.id)}>Delete Server</button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#333" }}>
                Select a server →
              </div>
            )}

            {/* ── Right metrics panel ── */}
            {activeServer && (
              <div style={css.rightPanel}>
                <div style={css.metricBox}>
                  <div style={css.metricLabel}>CPU Usage</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <Donut pct={Math.round(activeServer.cpu)} color="#00ff88" />
                    <div>
                      <Spark data={cpuHistory[activeServer.id] || Array(12).fill(0)} />
                      <div style={{ fontSize: "10px", color: "#444", marginTop: "2px" }}>last 24s</div>
                    </div>
                  </div>
                </div>
                <div style={css.metricBox}>
                  <div style={css.metricLabel}>Memory</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <Donut pct={Math.round((activeServer.ram / 512) * 100)} color="#7c6aff" />
                    <div>
                      <div style={{ fontSize: "18px", fontWeight: "700", color: "#fff" }}>{Math.round(activeServer.ram)}</div>
                      <div style={{ fontSize: "10px", color: "#444" }}>MB / 512 MB</div>
                    </div>
                  </div>
                </div>
                <div style={css.metricBox}>
                  <div style={css.metricLabel}>Uptime</div>
                  <div style={{ fontSize: "20px", fontWeight: "700", color: "#fff" }}>{fmtUptime(activeServer.uptime)}</div>
                  <div style={{ fontSize: "11px", color: "#555", marginTop: "2px" }}>
                    {activeServer.status === "running" ? "● Live" : "● Stopped"}
                  </div>
                </div>
                <div style={css.metricBox}>
                  <div style={css.metricLabel}>All Servers</div>
                  <div style={css.serverList}>
                    {servers.map((s) => (
                      <div
                        key={s.id}
                        className="srv-card"
                        style={css.serverCard(s.id === active)}
                        onClick={() => { setActive(s.id); setTab("console"); setLogs([...FAKE_LOGS]); }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                          <div style={css.statusDot(s.status)} />
                          <span style={{ fontSize: "12px", color: s.id === active ? "#fff" : "#888", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                        </div>
                        <div style={{ fontSize: "10px", color: "#444" }}>
                          {s.status === "running" ? `${Math.round(s.cpu)}% cpu · ${Math.round(s.ram)} MB` : "stopped"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── New Server Modal ── */}
      {showNew && (
        <div style={css.modal} onClick={(e) => e.target === e.currentTarget && setShowNew(false)}>
          <div style={css.modalBox}>
            <div style={{ fontSize: "14px", fontWeight: "700", color: "#fff", marginBottom: "16px", letterSpacing: "1px" }}>
              NEW SERVER
            </div>
            <div style={{ fontSize: "11px", color: "#555", marginBottom: "6px", letterSpacing: "1px", textTransform: "uppercase" }}>Server Name</div>
            <input
              autoFocus
              style={css.modalInput}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createServer()}
              placeholder="My Discord Bot"
            />
            <div style={{ fontSize: "11px", color: "#555", marginBottom: "6px", letterSpacing: "1px", textTransform: "uppercase" }}>Start Command</div>
            <input style={css.modalInput} defaultValue="node index.js" />
            <div style={{ fontSize: "11px", color: "#555", marginBottom: "6px", letterSpacing: "1px", textTransform: "uppercase" }}>Node Version</div>
            <input style={css.modalInput} defaultValue="20.x LTS" />
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "4px" }}>
              <button style={css.btn()} onClick={() => setShowNew(false)}>Cancel</button>
              <button style={css.btn("primary")} onClick={createServer}>Create Server</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

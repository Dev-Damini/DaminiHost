import { useState, useEffect, useRef, useCallback } from "react";

// ─── Configuration ───────────────────────────────────────────────────────────
const BACKEND_API_URL = "https://daminihost-backend.onrender.com"; 

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
  const [servers, setServers] = useState([]);
  const [active, setActive] = useState(null);
  const [tab, setTab] = useState("console"); 
  const [logs, setLogs] = useState([]);
  const [cpuHistory, setCpuHistory] = useState({});
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [consoleInput, setConsoleInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  const fileInputRef = useRef(null);
  const logsEnd = useRef(null);

  const activeServer = servers.find((s) => s.id === active);

  // ─── Fetch Initial Servers ─────────────────────────────────────────────────
  const fetchServers = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_API_URL}/api/servers`);
      if (res.ok) {
        const data = await res.json();
        setServers(data);
        if (data.length > 0 && !active) {
          setActive(data[0].id);
        }
      }
    } catch (err) {
      console.error("Failed fetching servers:", err);
    }
  }, [active]);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  // ─── Real-Time Log Streaming via SSE ───────────────────────────────────────
  useEffect(() => {
    if (!active) return;
    setLogs([]);

    const eventSource = new EventSource(`${BACKEND_API_URL}/api/servers/${active}/stream`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "log") {
          setLogs((prev) => [...prev, `[${new Date(data.ts).toLocaleTimeString()}] ${data.line}`]);
        }
        if (data.type === "exit") {
          setLogs((prev) => [...prev, `\n[SYSTEM]: Process closed with exit code ${data.code}\n`]);
          setServers((prev) =>
            prev.map((s) => (s.id === active ? { ...s, status: "stopped", cpu: 0, ram: 0 } : s))
          );
        }
      } catch (err) {
        console.error("Error parsing SSE stream packet:", err);
      }
    };

    eventSource.onerror = () => {
      setLogs((prev) => [...prev, "[STREAM DISCONNECTED]: Trying to re-establish workspace hook..."]);
    };

    return () => {
      eventSource.close();
    };
  }, [active]);

  // Scroll logs to bottom
  useEffect(() => {
    logsEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // ─── Server Power Controls ─────────────────────────────────────────────────
  const toggleServer = useCallback(async (id) => {
    const target = servers.find((s) => s.id === id);
    if (!target) return;

    const isRunning = target.status === "running" || target.status === "installing";
    const action = isRunning ? "stop" : "start";

    try {
      setServers((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status: isRunning ? "stopped" : "installing" } : s))
      );

      const res = await fetch(`${BACKEND_API_URL}/api/servers/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: !isRunning ? JSON.stringify({ startCmd: "node index.js" }) : undefined,
      });

      if (!res.ok) {
        fetchServers(); // Rollback to actual backend state if failed
      }
    } catch (err) {
      console.error(`Failed to execute ${action} routine:`, err);
      fetchServers();
    }
  }, [servers, fetchServers]);

  // ─── File Upload Pipelines ─────────────────────────────────────────────────
  const handleFileUpload = async (filesToUpload) => {
    if (!active || filesToUpload.length === 0) return;
    
    const formData = new FormData();
    formData.append("file", filesToUpload[0]); // Handles file or packed .zip archives

    setLogs((prev) => [...prev, `[SYSTEM]: Initiating network pipeline transmission for ${filesToUpload[0].name}...`]);

    try {
      const res = await fetch(`${BACKEND_API_URL}/api/servers/${active}/upload`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        setLogs((prev) => [...prev, `✓ File ${filesToUpload[0].name} deployed to server context root successfully.`]);
        fetchServers(); // Reloads real files index array from server context
      } else {
        setLogs((prev) => [...prev, `✗ File sync transfer rejected by hosting backend node environment.`]);
      }
    } catch (err) {
      setLogs((prev) => [...prev, `[TRANSMISSION ERROR]: Host pipeline file upload route unreachable.`]);
    }
  };

  const createServer = async () => {
    if (!newName.trim()) return;
    try {
      const res = await fetch(`${BACKEND_API_URL}/api/servers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (res.ok) {
        const newSrv = await res.json();
        setServers((prev) => [...prev, newSrv]);
        setActive(newSrv.id);
        setNewName("");
        setShowNew(false);
      }
    } catch (err) {
      console.error("Failed creating new instance directory workspace:", err);
    }
  };

  const deleteServer = async (id) => {
    try {
      const res = await fetch(`${BACKEND_API_URL}/api/servers/${id}`, { method: "DELETE" });
      if (res.ok) {
        setServers((prev) => prev.filter((s) => s.id !== id));
        if (active === id) setActive(null);
      }
    } catch (err) {
      console.error("Failed to delete deployment folder structure:", err);
    }
  };

  const sendCommand = (e) => {
    e.preventDefault();
    if (!consoleInput.trim() || !active) return;
    // To feed direct terminal pipelines forward, extend an API route at /api/servers/:id/command if built out
    setLogs((prev) => [...prev, `$ ${consoleInput}`, `> Input processing pipe not hooked up directly.`]);
    setConsoleInput("");
  };

  const totalRunning = servers.filter((s) => s.status === "running" || s.status === "installing").length;
  const totalRam = servers.reduce((a, s) => a + (s.ram || 0), 0);

  // ── Styles ────────────────────────────────────────────────────────────────
  const css = {
    root: { fontFamily: "'DM Mono', monospace", background: "#080808", color: "#e0e0e0", minHeight: "100vh", display: "flex", flexDirection: "column", fontSize: "13px" },
    topbar: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", height: "48px", borderBottom: "1px solid #1e1e1e", background: "#0c0c0c", position: "sticky", top: 0, zIndex: 100 },
    logo: { fontSize: "15px", fontWeight: "700", letterSpacing: "3px", textTransform: "uppercase", color: "#fff", display: "flex", alignItems: "center", gap: "8px" },
    logoDot: { width: "8px", height: "8px", borderRadius: "50%", background: "#00ff88", boxShadow: "0 0 8px #00ff88" },
    topRight: { display: "flex", alignItems: "center", gap: "16px" },
    badge: (color) => ({ padding: "2px 8px", borderRadius: "3px", fontSize: "11px", background: color + "22", color: color, border: `1px solid ${color}44`, fontWeight: "600" }),
    body: { display: "flex", flex: 1, overflow: "hidden", height: "calc(100vh - 48px)" },
    sidebar: { width: sidebarOpen ? "220px" : "0", minWidth: sidebarOpen ? "220px" : "0", borderRight: "1px solid #1a1a1a", background: "#0a0a0a", overflowY: "auto", overflowX: "hidden", transition: "all 0.2s", display: "flex", flexDirection: "column" },
    sideSection: { padding: "12px 14px 4px", fontSize: "10px", color: "#444", letterSpacing: "2px", textTransform: "uppercase" },
    sideItem: (isActive) => ({ display: "flex", alignItems: "center", gap: "8px", padding: "8px 14px", cursor: "pointer", background: isActive ? "#141414" : "transparent", borderLeft: isActive ? "2px solid #00ff88" : "2px solid transparent", color: isActive ? "#fff" : "#666", transition: "all 0.15s", whiteSpace: "nowrap" }),
    statusDot: (status) => ({ width: "6px", height: "6px", borderRadius: "50%", background: status === "running" ? "#00ff88" : status === "installing" ? "#ffcc44" : "#333", boxShadow: status === "running" ? "0 0 6px #00ff88" : "none", flexShrink: 0 }),
    main: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
    statsRow: { display: "flex", gap: "0", borderBottom: "1px solid #1a1a1a", background: "#0a0a0a" },
    statCard: { flex: 1, padding: "14px 20px", borderRight: "1px solid #1a1a1a" },
    statLabel: { fontSize: "10px", color: "#444", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "4px" },
    statVal: { fontSize: "20px", fontWeight: "700", color: "#fff" },
    statSub: { fontSize: "11px", color: "#555", marginTop: "2px" },
    content: { flex: 1, display: "flex", overflow: "hidden" },
    serverPanel: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
    serverHead: { padding: "14px 20px", borderBottom: "1px solid #1a1a1a", display: "flex", alignItems: "center", gap: "12px", background: "#0c0c0c" },
    tabs: { display: "flex", gap: "0", borderBottom: "1px solid #1a1a1a", background: "#0a0a0a" },
    tabBtn: (isActive) => ({ padding: "10px 18px", fontSize: "12px", fontFamily: "inherit", cursor: "pointer", background: "transparent", border: "none", borderBottom: isActive ? "2px solid #00ff88" : "2px solid transparent", color: isActive ? "#00ff88" : "#555", fontWeight: isActive ? "600" : "400", transition: "all 0.15s" }),
    console: { flex: 1, background: "#060606", overflowY: "auto", padding: "14px 16px", fontFamily: "'DM Mono', monospace", fontSize: "12px", lineHeight: "1.7" },
    logLine: (line) => ({ color: line.includes("Error") || line.includes("error") || line.includes("✗") ? "#ff6b6b" : line.includes("warn") || line.includes("[stderr]") ? "#ffcc44" : line.includes("✓") || line.includes("ready") || line.includes("OK") ? "#00ff88" : "#7a7a7a", margin: 0 }),
    consoleInput: { display: "flex", alignItems: "center", gap: "8px", padding: "10px 16px", borderTop: "1px solid #1a1a1a", background: "#0a0a0a" },
    input: { flex: 1, background: "transparent", border: "none", outline: "none", color: "#00ff88", fontFamily: "inherit", fontSize: "12px" },
    fileList: { flex: 1, padding: "16px", overflowY: "auto" },
    fileRow: { display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", borderRadius: "4px", marginBottom: "4px", background: "#0f0f0f", border: "1px solid #1a1a1a" },
    uploadZone: { margin: "16px", padding: "24px", border: "1px dashed #2a2a2a", borderRadius: "6px", textAlign: "center", color: "#666", cursor: "pointer", transition: "all 0.15s" },
    settingsBlock: { flex: 1, padding: "20px", overflowY: "auto" },
    settingsRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #141414" },
    settingsLabel: { color: "#888", fontSize: "12px" },
    settingsVal: { color: "#ccc", fontFamily: "inherit" },
    modal: { position: "fixed", inset: 0, background: "#000000cc", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 },
    modalBox: { background: "#111", border: "1px solid #2a2a2a", borderRadius: "8px", padding: "24px", width: "340px" },
    modalInput: { width: "100%", background: "#0a0a0a", border: "1px solid #2a2a2a", borderRadius: "4px", padding: "8px 12px", color: "#fff", fontFamily: "inherit", fontSize: "13px", outline: "none", boxSizing: "border-box", marginBottom: "12px" },
    rightPanel: { width: "240px", borderLeft: "1px solid #1a1a1a", background: "#0a0a0a", display: "flex", flexDirection: "column", overflowY: "auto" },
    metricBox: { padding: "14px 16px", borderBottom: "1px solid #141414" },
    metricLabel: { fontSize: "10px", color: "#444", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "8px" },
    serverList: { padding: "10px", gap: "8px", display: "flex", flexDirection: "column" },
    serverCard: (isActive) => ({ padding: "12px", borderRadius: "6px", border: isActive ? "1px solid #00ff8844" : "1px solid #1a1a1a", background: isActive ? "#0d1a12" : "#0f0f0f", cursor: "pointer" }),
  };

  return (
    <div style={css.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: #0a0a0a; }
        ::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 2px; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        .srv-card:hover { border-color: #2a2a2a !important; }
        .btn-hover:hover { opacity: 0.85; }
        .file-row:hover { border-color: #2a2a2a !important; }
        .upload-zone:hover { border-color: #00ff88 !important; color: #00ff88 !important; }
      `}</style>

      {/* Hidden File Input Picker Hook */}
      <input 
        type="file" 
        ref={fileInputRef} 
        style={{ display: "none" }} 
        onChange={(e) => handleFileUpload(e.target.files)} 
      />

      {/* Topbar */}
      <div style={css.topbar}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ ...css.btn(), padding: "4px 8px", fontSize: "16px" }}>☰</button>
          <div style={css.logo}><div style={css.logoDot} />DAMINIHOST</div>
        </div>
        <div style={css.topRight}>
          <span style={css.badge("#00ff88")}>{totalRunning} LIVE RUNTIMES</span>
          <span style={css.badge("#888")}>{fmtRam(totalRam)} SPUN</span>
          <span style={{ ...css.badge("#7c6aff") }}>RENDER · CLOUD</span>
        </div>
      </div>

      <div style={css.body}>
        {/* Sidebar */}
        <div style={css.sidebar}>
          <div style={css.sideSection}>Instances</div>
          {servers.map((s) => (
            <div key={s.id} className="side-item" style={css.sideItem(active === s.id)} onClick={() => { setActive(s.id); setTab("console"); }}>
              <div style={css.statusDot(s.status)} />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span>
            </div>
          ))}
          <div style={{ padding: "8px 12px" }}>
            <button style={{ ...css.btn("primary"), width: "100%", padding: "7px" }} onClick={() => setShowNew(true)}>+ Provision Core</button>
          </div>
        </div>

        {/* Main Dashboard Space */}
        <div style={css.main}>
          <div style={css.statsRow}>
            {[
              { label: "Total Environments", val: servers.length, sub: "Dynamic workspaces" },
              { label: "Active Nodes", val: totalRunning, sub: "Allocated slots" },
              { label: "Cluster Platform", val: "Render Engine", sub: "Cloud Infrastructure" }
            ].map((s) => (
              <div key={s.label} style={css.statCard}>
                <div style={css.statLabel}>{s.label}</div>
                <div style={css.statVal}>{s.val}</div>
                <div style={css.statSub}>{s.sub}</div>
              </div>
            ))}
          </div>

          <div style={css.content}>
            {activeServer ? (
              <div style={css.serverPanel}>
                {/* Header details */}
                <div style={css.serverHead}>
                  <div style={css.statusDot(activeServer.status)} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "15px", fontWeight: "700", color: "#fff" }}>{activeServer.name}</div>
                    <div style={{ fontSize: "11px", color: "#444", marginTop: "2px" }}>ID: {activeServer.id} · Target Command: node index.js</div>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button 
                      className="btn-hover" 
                      style={css.btn(activeServer.status === "running" || activeServer.status === "installing" ? "danger" : "primary")} 
                      onClick={() => toggleServer(activeServer.id)}
                    >
                      {activeServer.status === "running" ? "⬛ Kill Bot" : activeServer.status === "installing" ? "⚡ Loading..." : "▶ Execute Node"}
                    </button>
                    <button className="btn-hover" style={css.btn("danger")} onClick={() => deleteServer(activeServer.id)}>🗑 Delete Workspace</button>
                  </div>
                </div>

                {/* Tab Navigation links */}
                <div style={css.tabs}>
                  {["console", "files", "settings"].map((t) => (
                    <button key={t} style={css.tabBtn(tab === t)} onClick={() => setTab(t)}>
                      {t === "console" ? "⌨ Live Outputs" : t === "files" ? "📁 Upload Assets" : "⚙ Environment Data"}
                    </button>
                  ))}
                </div>

                {/* Console Tab Section */}
                {tab === "console" && (
                  <>
                    <div style={css.console}>
                      {logs.length === 0 && <div style={{ color: "#333" }}>— Pipeline stream resting. Toggle state configuration to stream logs —</div>}
                      {logs.map((l, i) => <p key={i} style={css.logLine(l)}>{l}</p>)}
                      {(activeServer.status === "running" || activeServer.status === "installing") && <span style={{ color: "#00ff88", animation: "blink 1s infinite" }}>█</span>}
                      <div ref={logsEnd} />
                    </div>
                    <div style={css.consoleInput}>
                      <span style={{ color: "#444" }}>$</span>
                      <input style={css.input} value={consoleInput} onChange={(e) => setConsoleInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendCommand(e)} placeholder="Send arguments directly..." />
                    </div>
                  </>
                )}

                {/* Upload & Files Tab Section */}
                {tab === "files" && (
                  <>
                    <div 
                      style={css.uploadZone} 
                      className="upload-zone"
                      onClick={() => fileInputRef.current.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.preventDefault(); handleFileUpload(e.dataTransfer.files); }}
                    >
                      <div style={{ fontSize: "20px", marginBottom: "6px" }}>⬆</div>
                      <div>Drop bot files or script files here</div>
                      <div style={{ fontSize: "11px", marginTop: "4px" }}>Click box to open system path browse pipeline</div>
                    </div>
                    
                    <div style={css.fileList}>
                      {activeServer.files && activeServer.files.map((f, i) => (
                        <div key={i} style={css.fileRow}>
                          <span style={{ color: "#00ff88" }}>📄</span>
                          <span style={{ flex: 1 }}>{f}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* Settings Configuration Tab Context */}
                {tab === "settings" && (
                  <div style={css.settingsBlock}>
                    {[
                      ["Active Partition Tag", activeServer.name],
                      ["Server UUID Context", activeServer.id],
                      ["Assigned System Stack", "Node.js 20.x v8 LTS Runtime Instance Execution Layer"]
                    ].map(([k, v]) => (
                      <div key={k} style={css.settingsRow}>
                        <span style={css.settingsLabel}>{k}</span>
                        <span style={css.settingsVal}>{v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#333" }}>Select or spin up a core node layout infrastructure instance to track pipeline outputs →</div>
            )}

            {/* Right sidebar metrics monitor */}
            {activeServer && (
              <div style={css.rightPanel}>
                <div style={css.metricBox}>
                  <div style={css.metricLabel}>Core Process State</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <Donut pct={activeServer.status === "running" ? 12 : activeServer.status === "installing" ? 45 : 0} color="#00ff88" />
                    <div style={{ fontSize: "11px", color: "#888" }}>{activeServer.status === "running" ? "Active Loop Running" : activeServer.status === "installing" ? "Syncing Modules" : "Halted Cluster Zone"}</div>
                  </div>
                </div>
                <div style={css.metricBox}>
                  <div style={css.metricLabel}>Memory Allocation</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <Donut pct={activeServer.status === "running" ? 24 : 0} color="#7c6aff" />
                    <div>
                      <div style={{ fontSize: "18px", fontWeight: "700", color: "#fff" }}>{activeServer.status === "running" ? 118 : 0}</div>
                      <div style={{ fontSize: "10px", color: "#444" }}>MB Used / Real Scale</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Creation Modal Interface */}
      {showNew && (
        <div style={css.modal} onClick={(e) => e.target === e.currentTarget && setShowNew(false)}>
          <div style={css.modalBox}>
            <div style={{ fontSize: "14px", fontWeight: "700", color: "#fff", marginBottom: "16px" }}>INITIALIZE CLUSTER DISK PATH</div>
            <div style={{ fontSize: "11px", color: "#555", marginBottom: "6px" }}>Workspace Folder Tag Name</div>
            <input autoFocus style={css.modalInput} value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createServer()} placeholder="e.g. DaniBot-Production" />
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button style={css.btn()} onClick={() => setShowNew(false)}>Abondon Action</button>
              <button style={css.btn("primary")} onClick={createServer}>Initialize Disk Space</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

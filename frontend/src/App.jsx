import { useState, useEffect, useRef, useCallback } from "react";
import { auth as authApi, servers as serversApi } from "./api.js";

// ─── Utils ────────────────────────────────────────────────────────────────────
function fmtUptime(s) {
  if (!s) return "—";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}
function fmtRam(mb) {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

// ─── Sparkline ────────────────────────────────────────────────────────────────
function Spark({ data, color = "#00ff88" }) {
  const max = Math.max(...data, 1), w = 56, h = 22;
  if (data.length < 2) return <svg width={w} height={h} />;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`).join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Donut ────────────────────────────────────────────────────────────────────
function Donut({ pct, color, size = 40 }) {
  const r = 14, c = size / 2, circ = 2 * Math.PI * r;
  const dash = (Math.min(pct, 100) / 100) * circ;
  return (
    <svg width={size} height={size}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="#1a1a1a" strokeWidth="4" />
      <circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth="4"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${c} ${c})`} style={{ transition: "stroke-dasharray 0.5s ease" }} />
      <text x={c} y={c + 4} textAnchor="middle" fontSize="9" fill="#ccc" fontFamily="monospace">{Math.round(pct)}%</text>
    </svg>
  );
}

// ─── Auth Screen ──────────────────────────────────────────────────────────────
function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(""); setLoading(true);
    try {
      const res = mode === "login"
        ? await authApi.login(email, password)
        : await authApi.register(name, email, password);
      authApi.save(res.token);
      onAuth(res.user);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const inp = {
    width: "100%", background: "#0a0a0a", border: "1px solid #2a2a2a",
    borderRadius: "4px", padding: "10px 12px", color: "#fff",
    fontFamily: "inherit", fontSize: "14px", outline: "none",
    boxSizing: "border-box", marginBottom: "10px",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#080808", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Mono','Fira Mono',monospace", padding: "16px" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap'); * { box-sizing: border-box; }`}</style>
      <div style={{ width: "100%", maxWidth: "360px" }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#00ff88", boxShadow: "0 0 12px #00ff88", margin: "0 auto 12px" }} />
          <div style={{ fontSize: "22px", fontWeight: "700", letterSpacing: "4px", color: "#fff" }}>DAMINIHOST</div>
          <div style={{ fontSize: "11px", color: "#444", marginTop: "4px", letterSpacing: "1px" }}>by Damini Codesphere</div>
        </div>
        <div style={{ background: "#0f0f0f", border: "1px solid #1e1e1e", borderRadius: "8px", padding: "24px" }}>
          <div style={{ display: "flex", marginBottom: "20px", borderBottom: "1px solid #1a1a1a" }}>
            {["login", "register"].map(m => (
              <button key={m} onClick={() => { setMode(m); setError(""); }} style={{
                flex: 1, padding: "8px", background: "transparent", border: "none",
                borderBottom: mode === m ? "2px solid #00ff88" : "2px solid transparent",
                color: mode === m ? "#00ff88" : "#555", fontFamily: "inherit",
                fontSize: "12px", fontWeight: "600", cursor: "pointer", letterSpacing: "1px", textTransform: "uppercase"
              }}>{m}</button>
            ))}
          </div>
          {mode === "register" && (
            <input style={inp} placeholder="Name" value={name} onChange={e => setName(e.target.value)} />
          )}
          <input style={inp} placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
          <input style={inp} placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === "Enter" && submit()} />
          {error && <div style={{ color: "#ff6b6b", fontSize: "12px", marginBottom: "10px" }}>{error}</div>}
          <button onClick={submit} disabled={loading} style={{
            width: "100%", padding: "10px", background: loading ? "#006644" : "#00ff88",
            border: "none", borderRadius: "4px", color: "#000", fontFamily: "inherit",
            fontSize: "13px", fontWeight: "700", cursor: loading ? "not-allowed" : "pointer", letterSpacing: "1px"
          }}>
            {loading ? "..." : mode === "login" ? "LOGIN" : "CREATE ACCOUNT"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────
function SettingsTab({ server, onDelete, onSave, S, isMobile }) {
  const [name, setName] = useState(server.name);
  const [startCmd, setStartCmd] = useState(server.startCmd || "node index.js");
  const [nodeVersion, setNodeVersion] = useState(server.nodeVersion || "20.x");
  const [saving, setSaving] = useState(false);

  const PRESETS = ["node index.js", "node main.js", "node src/index.js", "node bot.js", "npm start", "npm run start"];

  const save = async () => {
    setSaving(true);
    await onSave({ name, startCmd, nodeVersion });
    setSaving(false);
  };

  const rowStyle = { padding: "12px 0", borderBottom: "1px solid #141414" };
  const labelStyle = { fontSize: "11px", color: "#555", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "6px" };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "14px" }}>
      {/* Name */}
      <div style={rowStyle}>
        <div style={labelStyle}>Server Name</div>
        <input style={S.inp} value={name} onChange={e => setName(e.target.value)} />
      </div>

      {/* Start Command */}
      <div style={rowStyle}>
        <div style={labelStyle}>Start Command</div>
        <input
          style={{ ...S.inp, marginBottom: "8px", fontFamily: "'DM Mono','Fira Mono',monospace", color: "#00ff88" }}
          value={startCmd}
          onChange={e => setStartCmd(e.target.value)}
          placeholder="node index.js"
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {PRESETS.map(p => (
            <button
              key={p}
              onClick={() => setStartCmd(p)}
              style={{
                ...S.btn(startCmd === p ? "primary" : "ghost"),
                padding: "4px 10px", fontSize: "11px",
                fontFamily: "'DM Mono','Fira Mono',monospace",
              }}>
              {p}
            </button>
          ))}
        </div>
        <div style={{ fontSize: "10px", color: "#3a3a3a", marginTop: "8px" }}>
          Tap a preset or type your own. Runs inside your server folder.
        </div>
      </div>

      {/* Node Version */}
      <div style={rowStyle}>
        <div style={labelStyle}>Node Version</div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {["18.x", "20.x LTS", "21.x"].map(v => (
            <button
              key={v}
              onClick={() => setNodeVersion(v)}
              style={{ ...S.btn(nodeVersion === v ? "primary" : "ghost"), padding: "4px 12px", fontSize: "11px" }}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Read-only info */}
      {[["Server ID", server.id], ["Status", server.status]].map(([k, v]) => (
        <div key={k} style={{ ...rowStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#444", fontSize: "12px" }}>{k}</span>
          <span style={{ color: "#555", fontSize: "12px", wordBreak: "break-all", textAlign: "right" }}>{v}</span>
        </div>
      ))}

      {/* Actions */}
      <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "8px" }}>
        <button
          disabled={saving}
          onClick={save}
          style={{ ...S.btn("primary"), width: "100%", padding: "10px", opacity: saving ? 0.6 : 1 }}>
          {saving ? "Saving..." : "Save Changes"}
        </button>
        <button onClick={() => onDelete(server.id)} style={{ ...S.btn("danger"), width: "100%", padding: "10px" }}>
          Delete Server
        </button>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function DaminiHost() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [servers, setServers] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [tab, setTab] = useState("console");
  const [logs, setLogs] = useState([]);
  const [cpuHistory, setCpuHistory] = useState({});
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCmd, setNewCmd] = useState("node index.js");
  const [newNode, setNewNode] = useState("20.x LTS");
  const [consoleInput, setConsoleInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Files tab state
  const [files, setFiles] = useState([]);
  const [currentPath, setCurrentPath] = useState("");
  const [uploading, setUploading] = useState(false);
  const [filesLoading, setFilesLoading] = useState(false);

  // Startup tab state
  const [startupContent, setStartupContent] = useState("");
  const [startupFile, setStartupFile] = useState("index.js");
  const [startupSaving, setStartupSaving] = useState(false);
  const [startupLoading, setStartupLoading] = useState(false);

  const [toastMsg, setToastMsg] = useState("");
  const [loadingServers, setLoadingServers] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [mobileView, setMobileView] = useState("list");

  const logsEnd = useRef(null);
  const sseRef = useRef(null);
  const fileInputRef = useRef(null);
  const pollRef = useRef(null);

  const activeServer = servers.find(s => s.id === activeId);

  // ── Resize ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const handle = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, []);

  // ── Auth check ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (authApi.token()) {
      authApi.me().then(u => { setUser(u); setAuthChecked(true); }).catch(() => { authApi.clear(); setAuthChecked(true); });
    } else {
      setAuthChecked(true);
    }
  }, []);

  // ── Toast ───────────────────────────────────────────────────────────────────
  const toast = (msg) => { setToastMsg(msg); setTimeout(() => setToastMsg(""), 3000); };

  // ── Load servers ─────────────────────────────────────────────────────────────
  const loadServers = useCallback(async () => {
    if (!user) return;
    try {
      const list = await serversApi.list();
      setServers(list);
      if (!activeId && list.length > 0) setActiveId(list[0].id);
    } catch (e) { console.error(e); }
  }, [user, activeId]);

  useEffect(() => {
    if (user) { setLoadingServers(true); loadServers().finally(() => setLoadingServers(false)); }
  }, [user]);

  // ── Poll stats ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    pollRef.current = setInterval(async () => {
      try {
        const list = await serversApi.list();
        setServers(list);
        list.forEach(s => {
          if (s.status === "running") {
            setCpuHistory(prev => ({ ...prev, [s.id]: [...(prev[s.id] || []).slice(-19), s.cpu || 0] }));
          }
        });
      } catch (_) {}
    }, 5000);
    return () => clearInterval(pollRef.current);
  }, [user]);

  // ── SSE logs ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }
    setLogs([]);
    if (!activeId) return;
    const es = serversApi.logs(activeId);
    sseRef.current = es;
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "log" || data.type === "exit") {
          setLogs(prev => [...prev.slice(-500), data.line ?? `Process exited (code ${data.code})`]);
        }
      } catch (_) {}
    };
    es.onerror = () => {};
    return () => { es.close(); };
  }, [activeId]);

  // ── Auto-scroll logs ─────────────────────────────────────────────────────────
  useEffect(() => {
    logsEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // ── Load files ──────────────────────────────────────────────────────────────
  const loadFiles = useCallback(async (serverId, subpath = "") => {
    setFilesLoading(true);
    try {
      const BASE = import.meta.env.VITE_API_URL || "";
      const token = authApi.token();
      const res = await fetch(`${BASE}/api/servers/${serverId}/files?path=${encodeURIComponent(subpath)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setFiles(data.files || []);
      setCurrentPath(data.currentPath || "");
    } catch (_) { setFiles([]); }
    finally { setFilesLoading(false); }
  }, []);

  useEffect(() => {
    if (tab === "files" && activeId) loadFiles(activeId, "");
  }, [tab, activeId]);

  // ── Load startup file ────────────────────────────────────────────────────────
  const loadStartupFile = useCallback(async (serverId, filename) => {
    setStartupLoading(true);
    try {
      const BASE = import.meta.env.VITE_API_URL || "";
      const token = authApi.token();
      const res = await fetch(`${BASE}/api/servers/${serverId}/startup?file=${encodeURIComponent(filename)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setStartupContent(data.content || "");
    } catch (_) {}
    finally { setStartupLoading(false); }
  }, []);

  useEffect(() => {
    if (tab === "startup" && activeId) loadStartupFile(activeId, startupFile);
  }, [tab, activeId]);

  // ── Select server ────────────────────────────────────────────────────────────
  const selectServer = (id) => {
    setActiveId(id);
    setTab("console");
    setLogs([]);
    setFiles([]);
    setCurrentPath("");
    if (isMobile) { setSidebarOpen(false); setMobileView("detail"); }
  };

  // ── Create server ────────────────────────────────────────────────────────────
  const createServer = async () => {
    if (!newName.trim()) return;
    try {
      const s = await serversApi.create(newName.trim(), newCmd, newNode);
      setServers(prev => [...prev, s]);
      setActiveId(s.id);
      setShowNew(false);
      setNewName(""); setNewCmd("node index.js"); setNewNode("20.x LTS");
      setTab("files");
      if (isMobile) setMobileView("detail");
      toast("Server created — upload your files");
    } catch (e) { toast("Error: " + e.message); }
  };

  // ── Delete server ────────────────────────────────────────────────────────────
  const deleteServer = async (id) => {
    if (!confirm("Delete this server and all its files?")) return;
    try {
      await serversApi.delete(id);
      const remaining = servers.filter(s => s.id !== id);
      setServers(remaining);
      if (activeId === id) {
        setActiveId(remaining[0]?.id ?? null);
        if (isMobile) setMobileView("list");
      }
      toast("Server deleted");
    } catch (e) { toast("Error: " + e.message); }
  };

  // ── Start / Stop ─────────────────────────────────────────────────────────────
  const startServer = async () => {
    if (!activeId || actionLoading) return;
    setActionLoading(true);
    try {
      await serversApi.start(activeId);
      setTab("console");
      toast("Starting...");
      setTimeout(loadServers, 2000);
    } catch (e) { toast("Error: " + e.message); }
    finally { setActionLoading(false); }
  };

  const stopServer = async () => {
    if (!activeId || actionLoading) return;
    setActionLoading(true);
    try {
      await serversApi.stop(activeId);
      toast("Stopped");
      setTimeout(loadServers, 1000);
    } catch (e) { toast("Error: " + e.message); }
    finally { setActionLoading(false); }
  };

  // ── Upload ───────────────────────────────────────────────────────────────────
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !activeId) return;
    if (!file.name.endsWith(".zip")) { toast("Only .zip files allowed"); return; }
    setUploading(true);
    toast("Uploading...");
    try {
      const res = await serversApi.upload(activeId, file);
      // res.files comes directly from the backend after extraction
      setFiles(res.files || []);
      setCurrentPath("");
      setTab("files");
      toast(`✓ Uploaded & extracted ${res.files?.length || 0} items`);
    } catch (e) {
      toast("Upload failed: " + e.message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  // ── Delete file ───────────────────────────────────────────────────────────────
  const handleDeleteFile = async (filePath) => {
    if (!confirm(`Delete ${filePath}?`)) return;
    try {
      const BASE = import.meta.env.VITE_API_URL || "";
      await fetch(`${BASE}/api/servers/${activeId}/files`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${authApi.token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ path: filePath }),
      });
      await loadFiles(activeId, currentPath);
      toast("Deleted");
    } catch (e) { toast("Error: " + e.message); }
  };

  // ── Move file up ──────────────────────────────────────────────────────────────
  const handleMoveUp = async (filePath) => {
    const parts = filePath.split("/");
    if (parts.length < 2) { toast("Already at root"); return; }
    const filename = parts[parts.length - 1];
    const newPath = filename; // move to root
    try {
      const BASE = import.meta.env.VITE_API_URL || "";
      await fetch(`${BASE}/api/servers/${activeId}/files/move`, {
        method: "POST",
        headers: { Authorization: `Bearer ${authApi.token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: filePath, to: newPath }),
      });
      await loadFiles(activeId, "");
      toast(`Moved ${filename} to root`);
    } catch (e) { toast("Error: " + e.message); }
  };

  // ── Extract zip ───────────────────────────────────────────────────────────────
  const handleExtract = async (filename) => {
    toast("Extracting...");
    try {
      const BASE = import.meta.env.VITE_API_URL || "";
      const res = await fetch(`${BASE}/api/servers/${activeId}/extract`, {
        method: "POST",
        headers: { Authorization: `Bearer ${authApi.token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extraction failed");
      setFiles(data.files || []);
      setCurrentPath("");
      toast("✓ Extracted successfully");
    } catch (e) { toast("Error: " + e.message); }
  };

  // ── Save startup file ─────────────────────────────────────────────────────────
  const saveStartup = async () => {
    if (!activeId) return;
    setStartupSaving(true);
    try {
      const BASE = import.meta.env.VITE_API_URL || "";
      await fetch(`${BASE}/api/servers/${activeId}/startup`, {
        method: "POST",
        headers: { Authorization: `Bearer ${authApi.token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content: startupContent, filename: startupFile }),
      });
      toast(`✓ Saved ${startupFile}`);
      // Also update startCmd if needed
      await serversApi.update(activeId, { startCmd: `node ${startupFile}` });
      setServers(prev => prev.map(s => s.id === activeId ? { ...s, startCmd: `node ${startupFile}` } : s));
    } catch (e) { toast("Error: " + e.message); }
    finally { setStartupSaving(false); }
  };

  // ── Logout ───────────────────────────────────────────────────────────────────
  const logout = () => { authApi.clear(); setUser(null); setServers([]); setActiveId(null); };

  // ── Guards ───────────────────────────────────────────────────────────────────
  if (!authChecked) return (
    <div style={{ background: "#080808", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#333", fontFamily: "monospace" }}>
      loading...
    </div>
  );
  if (!user) return <AuthScreen onAuth={u => setUser(u)} />;

  const totalRunning = servers.filter(s => s.status === "running").length;
  const totalRam = servers.reduce((a, s) => a + (s.ram || 0), 0);

  // ── Style helpers ─────────────────────────────────────────────────────────────
  const S = {
    btn: (v = "ghost") => ({
      padding: "7px 14px", borderRadius: "4px", fontSize: "12px", fontWeight: "600",
      fontFamily: "inherit", cursor: "pointer", letterSpacing: "0.5px",
      border: v === "primary" ? "none" : "1px solid #2a2a2a",
      background: v === "primary" ? "#00ff88" : v === "danger" ? "#ff444418" : "#141414",
      color: v === "primary" ? "#000" : v === "danger" ? "#ff6b6b" : "#ccc",
      transition: "opacity 0.15s", whiteSpace: "nowrap",
    }),
    dot: (status) => ({
      width: "7px", height: "7px", borderRadius: "50%", flexShrink: 0,
      background: status === "running" ? "#00ff88" : "#2a2a2a",
      boxShadow: status === "running" ? "0 0 6px #00ff88" : "none",
    }),
    inp: {
      background: "#0a0a0a", border: "1px solid #2a2a2a", borderRadius: "4px",
      padding: "8px 12px", color: "#fff", fontFamily: "inherit", fontSize: "13px",
      outline: "none", width: "100%", boxSizing: "border-box",
    },
    tabBtn: (a) => ({
      padding: isMobile ? "10px 12px" : "9px 16px", fontSize: "12px", fontFamily: "inherit",
      cursor: "pointer", background: "transparent", border: "none",
      borderBottom: a ? "2px solid #00ff88" : "2px solid transparent",
      color: a ? "#00ff88" : "#555", fontWeight: a ? "600" : "400",
      transition: "all 0.15s", letterSpacing: "0.5px", whiteSpace: "nowrap",
    }),
    logLine: (line = "") => ({
      color: /error|Error|kill|fail/i.test(line) ? "#ff6b6b"
        : /warn|rate.limit/i.test(line) ? "#ffcc44"
        : /ready|success|\bOK\b|complete|✓/i.test(line) ? "#00ff88"
        : "#6a6a6a",
      margin: 0, lineHeight: "1.65", wordBreak: "break-all",
    }),
  };

  // ── Sidebar ───────────────────────────────────────────────────────────────────
  const SidebarContent = () => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto" }}>
      <div style={{ padding: "10px 14px 4px", fontSize: "10px", color: "#3a3a3a", letterSpacing: "2px", textTransform: "uppercase" }}>Servers</div>
      {loadingServers && <div style={{ padding: "12px 14px", color: "#3a3a3a", fontSize: "12px" }}>loading...</div>}
      {servers.map(s => (
        <div key={s.id} onClick={() => selectServer(s.id)} style={{
          display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px",
          cursor: "pointer", background: activeId === s.id ? "#141414" : "transparent",
          borderLeft: activeId === s.id ? "2px solid #00ff88" : "2px solid transparent",
          color: activeId === s.id ? "#fff" : "#666",
        }}>
          <div style={S.dot(s.status)} />
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "13px" }}>{s.name}</span>
        </div>
      ))}
      {servers.length === 0 && !loadingServers && (
        <div style={{ padding: "12px 14px", color: "#333", fontSize: "12px" }}>No servers yet</div>
      )}
      <div style={{ padding: "8px 12px", marginTop: "4px" }}>
        <button style={{ ...S.btn("primary"), width: "100%", padding: "8px" }} onClick={() => setShowNew(true)}>+ New Server</button>
      </div>
      <div style={{ marginTop: "auto", borderTop: "1px solid #141414" }}>
        <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "12px", color: "#555", overflow: "hidden", textOverflow: "ellipsis" }}>{user.name}</span>
          <button onClick={logout} style={{ ...S.btn(), padding: "4px 8px", fontSize: "11px" }}>logout</button>
        </div>
        <div style={{ padding: "4px 14px 12px", fontSize: "10px", color: "#2a2a2a" }}>DaminiHost · Damini Codesphere</div>
      </div>
    </div>
  );

  // ── Detail Panel ──────────────────────────────────────────────────────────────
  const DetailPanel = () => {
    if (!activeServer) return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#2a2a2a", gap: "12px" }}>
        <div style={{ fontSize: "32px" }}>◻</div>
        <div style={{ fontSize: "13px", letterSpacing: "1px" }}>Select or create a server</div>
        <button style={S.btn("primary")} onClick={() => setShowNew(true)}>+ New Server</button>
      </div>
    );

    const isRunning = activeServer.status === "running";

    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

        {/* Header */}
        <div style={{ padding: isMobile ? "10px 14px" : "12px 20px", borderBottom: "1px solid #1a1a1a", background: "#0c0c0c", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          {isMobile && (
            <button onClick={() => setMobileView("list")} style={{ ...S.btn(), padding: "5px 8px", fontSize: "15px" }}>←</button>
          )}
          <div style={S.dot(activeServer.status)} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "14px", fontWeight: "700", color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeServer.name}</div>
            <div style={{ fontSize: "10px", color: "#444", marginTop: "1px" }}>{activeServer.startCmd} · uptime {fmtUptime(activeServer.uptime)}</div>
          </div>
          <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
            <button disabled={actionLoading} onClick={isRunning ? stopServer : startServer}
              style={{ ...S.btn(isRunning ? "danger" : "primary"), opacity: actionLoading ? 0.5 : 1 }}>
              {actionLoading ? "..." : isRunning ? "⬛ Stop" : "▶ Start"}
            </button>
            {!isMobile && (
              <button onClick={() => deleteServer(activeServer.id)} style={{ ...S.btn("danger"), padding: "7px 10px" }}>🗑</button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid #1a1a1a", background: "#0a0a0a", overflowX: "auto" }}>
          {[["console","⌨ Console"],["files","📁 Files"],["startup","✏ Startup"],["metrics","📊 Metrics"],["settings","⚙ Settings"]].map(([t, label]) => (
            <button key={t} style={S.tabBtn(tab === t)} onClick={() => setTab(t)}>{label}</button>
          ))}
        </div>

        {/* ── Console ── */}
        {tab === "console" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", background: "#060606", fontFamily: "'DM Mono',monospace", fontSize: isMobile ? "11px" : "12px" }}>
              {logs.length === 0 && (
                <div style={{ color: "#2a2a2a" }}>
                  {isRunning ? "— waiting for output —" : "— server stopped · press Start —"}
                </div>
              )}
              {logs.map((l, i) => <p key={i} style={S.logLine(l)}>{l}</p>)}
              {isRunning && <span style={{ color: "#00ff88", animation: "blink 1s infinite" }}>█</span>}
              <div ref={logsEnd} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", borderTop: "1px solid #1a1a1a", background: "#0a0a0a" }}>
              <span style={{ color: "#333" }}>$</span>
              <input
                style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#00ff88", fontFamily: "inherit", fontSize: "12px" }}
                value={consoleInput}
                onChange={e => setConsoleInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && consoleInput.trim()) {
                    setLogs(p => [...p, `$ ${consoleInput}`]);
                    setConsoleInput("");
                  }
                }}
                placeholder={isRunning ? "type command..." : "start server first"}
                disabled={!isRunning}
              />
            </div>
          </div>
        )}

        {/* ── Files ── */}
        {tab === "files" && (
          <div style={{ flex: 1, overflowY: "auto" }}>
            {/* Upload button */}
            <div style={{ padding: "14px 14px 0" }}>
              <label style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                width: "100%", padding: "12px", borderRadius: "4px", fontSize: "13px",
                fontWeight: "600", letterSpacing: "0.5px", cursor: uploading ? "not-allowed" : "pointer",
                background: uploading ? "#006644" : "#00ff88", color: "#000",
                opacity: uploading ? 0.6 : 1, userSelect: "none",
                WebkitTapHighlightColor: "transparent",
              }}>
                <input
                  type="file"
                  accept=".zip,application/zip"
                  style={{ display: "none" }}
                  disabled={uploading}
                  onChange={handleFileSelect}
                />
                {uploading ? "⟳ Uploading..." : "⬆ Upload .zip"}
              </label>
              <div style={{ fontSize: "11px", color: "#3a3a3a", textAlign: "center", marginTop: "5px" }}>Tap to select from your device</div>
            </div>

            {/* Breadcrumb */}
            <div style={{ padding: "10px 14px 4px", display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#444" }}>
              <span
                style={{ cursor: "pointer", color: currentPath ? "#7c6aff" : "#555" }}
                onClick={() => loadFiles(activeId, "")}>
                root
              </span>
              {currentPath && <>
                <span>/</span>
                <span style={{ color: "#ccc" }}>{currentPath}</span>
              </>}
              {currentPath && (
                <button
                  onClick={() => {
                    const parts = currentPath.split("/");
                    parts.pop();
                    loadFiles(activeId, parts.join("/"));
                  }}
                  style={{ ...S.btn(), padding: "2px 8px", fontSize: "11px", marginLeft: "auto" }}>
                  ← Back
                </button>
              )}
            </div>

            {/* File list */}
            <div style={{ padding: "4px 14px 14px" }}>
              {filesLoading && <div style={{ color: "#333", fontSize: "12px", padding: "12px 0" }}>loading...</div>}
              {!filesLoading && files.length === 0 && (
                <div style={{ color: "#2a2a2a", fontSize: "12px", textAlign: "center", padding: "24px 0" }}>
                  No files yet — upload a .zip above
                </div>
              )}
              {files.map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "9px 12px", borderRadius: "4px", marginBottom: "4px", background: "#0f0f0f", border: `1px solid ${f.name.endsWith(".zip") ? "#7c6aff44" : "#1a1a1a"}` }}>
                  <span
                    style={{ color: f.isDir ? "#7c6aff" : f.name.endsWith(".zip") ? "#ffcc44" : "#00ff88", fontSize: "14px", cursor: f.isDir ? "pointer" : "default" }}
                    onClick={() => f.isDir && loadFiles(activeId, f.path || f.name)}>
                    {f.isDir ? "📁" : f.name.endsWith(".zip") ? "🗜" : "📄"}
                  </span>
                  <span
                    style={{ flex: 1, fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: f.isDir ? "pointer" : "default", color: f.isDir ? "#aaa" : "#ccc" }}
                    onClick={() => f.isDir && loadFiles(activeId, f.path || f.name)}>
                    {f.name}
                  </span>
                  <span style={{ color: "#333", fontSize: "11px", flexShrink: 0 }}>
                    {f.isDir ? "dir" : `${Math.round((f.size || 0) / 1024) || "<1"}KB`}
                  </span>
                  {/* Extract button for zip files */}
                  {f.name.endsWith(".zip") && (
                    <button
                      onClick={() => handleExtract(f.name)}
                      style={{ ...S.btn("primary"), padding: "2px 8px", fontSize: "11px", flexShrink: 0 }}>
                      ⬇ Extract
                    </button>
                  )}
                  {/* Move up button — for files inside a subfolder */}
                  {currentPath && !f.isDir && (
                    <button
                      onClick={() => handleMoveUp(f.path || `${currentPath}/${f.name}`)}
                      style={{ ...S.btn(), padding: "2px 6px", fontSize: "10px", flexShrink: 0 }}>
                      ↑ root
                    </button>
                  )}
                  <button
                    onClick={() => handleDeleteFile(f.path || f.name)}
                    style={{ ...S.btn("danger"), padding: "2px 6px", fontSize: "11px", flexShrink: 0 }}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Startup ── */}
        {tab === "startup" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Filename bar */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", borderBottom: "1px solid #1a1a1a", background: "#0c0c0c" }}>
              <span style={{ fontSize: "11px", color: "#555", flexShrink: 0 }}>File:</span>
              <input
                style={{ ...S.inp, flex: 1, padding: "5px 10px", fontSize: "12px" }}
                value={startupFile}
                onChange={e => setStartupFile(e.target.value)}
                placeholder="index.js"
              />
              <button
                style={{ ...S.btn(), padding: "5px 10px", fontSize: "11px", flexShrink: 0 }}
                onClick={() => loadStartupFile(activeId, startupFile)}>
                Load
              </button>
              <button
                disabled={startupSaving}
                style={{ ...S.btn("primary"), padding: "5px 12px", fontSize: "11px", opacity: startupSaving ? 0.6 : 1, flexShrink: 0 }}
                onClick={saveStartup}>
                {startupSaving ? "Saving..." : "Save"}
              </button>
            </div>
            <div style={{ padding: "6px 14px", fontSize: "10px", color: "#444", borderBottom: "1px solid #111", background: "#0a0a0a" }}>
              Saving will also set start command to: <span style={{ color: "#7c6aff" }}>node {startupFile}</span>
            </div>
            {/* Code editor */}
            {startupLoading ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#333", fontSize: "12px" }}>loading...</div>
            ) : (
              <textarea
                spellCheck={false}
                style={{
                  flex: 1, background: "#060606", color: "#ccc", fontFamily: "'DM Mono','Fira Mono',monospace",
                  fontSize: isMobile ? "12px" : "13px", lineHeight: "1.7", border: "none", outline: "none",
                  resize: "none", padding: "14px 16px", width: "100%", boxSizing: "border-box",
                  tabSize: 2,
                }}
                value={startupContent}
                onChange={e => setStartupContent(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Tab") {
                    e.preventDefault();
                    const s = e.target.selectionStart, en = e.target.selectionEnd;
                    const val = startupContent;
                    setStartupContent(val.substring(0, s) + "  " + val.substring(en));
                    setTimeout(() => { e.target.selectionStart = e.target.selectionEnd = s + 2; }, 0);
                  }
                }}
                placeholder={`// Write your startup file here\n// e.g. index.js\n\nconsole.log("Bot starting...");\n`}
              />
            )}
          </div>
        )}

        {/* ── Metrics ── */}
        {tab === "metrics" && (
          <div style={{ flex: 1, overflowY: "auto", padding: "14px" }}>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr", gap: "10px", marginBottom: "16px" }}>
              {[
                { label: "CPU", val: `${Math.round(activeServer.cpu || 0)}%`, color: "#00ff88" },
                { label: "Memory", val: fmtRam(activeServer.ram || 0), color: "#7c6aff" },
                { label: "Uptime", val: fmtUptime(activeServer.uptime), color: "#ffcc44" },
              ].map(m => (
                <div key={m.label} style={{ background: "#0f0f0f", border: "1px solid #1a1a1a", borderRadius: "6px", padding: "14px" }}>
                  <div style={{ fontSize: "10px", color: "#444", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "8px" }}>{m.label}</div>
                  <div style={{ fontSize: "20px", fontWeight: "700", color: m.color }}>{m.val}</div>
                </div>
              ))}
            </div>
            <div style={{ background: "#0f0f0f", border: "1px solid #1a1a1a", borderRadius: "6px", padding: "14px" }}>
              <div style={{ fontSize: "10px", color: "#444", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "10px" }}>CPU History</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: "60px" }}>
                {(cpuHistory[activeId] || Array(20).fill(0)).map((v, i) => (
                  <div key={i} style={{ flex: 1, background: "#00ff88", opacity: 0.65, borderRadius: "2px 2px 0 0", height: `${Math.max(2, (v / 100) * 60)}px`, transition: "height 0.3s" }} />
                ))}
              </div>
              <div style={{ fontSize: "10px", color: "#2a2a2a", marginTop: "6px" }}>last 100s</div>
            </div>
          </div>
        )}

        {/* ── Settings ── */}
        {tab === "settings" && (
          <SettingsTab server={activeServer} onDelete={deleteServer} onSave={async (updates) => {
            try {
              await serversApi.update(activeServer.id, updates);
              setServers(prev => prev.map(s => s.id === activeServer.id ? { ...s, ...updates } : s));
              toast("✓ Saved");
            } catch (e) { toast("Error: " + e.message); }
          }} S={S} isMobile={isMobile} />
        )}
      </div>
    );
  };

  // ── Root ──────────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'DM Mono','Fira Mono',monospace", background: "#080808", color: "#e0e0e0", height: "100dvh", display: "flex", flexDirection: "column", fontSize: "13px", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: #0a0a0a; }
        ::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 2px; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        button:hover { opacity: 0.82; }
      `}</style>

      {/* Toast */}
      {toastMsg && (
        <div style={{ position: "fixed", bottom: "20px", left: "50%", transform: "translateX(-50%)", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: "6px", padding: "10px 18px", fontSize: "12px", color: "#ccc", zIndex: 9999, whiteSpace: "nowrap", boxShadow: "0 4px 20px #000a" }}>
          {toastMsg}
        </div>
      )}

      {/* Topbar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px", height: "48px", borderBottom: "1px solid #1a1a1a", background: "#0c0c0c", flexShrink: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <button onClick={() => setSidebarOpen(o => !o)} style={{ ...S.btn(), padding: "5px 8px", fontSize: "15px" }}>☰</button>
          <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
            <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#00ff88", boxShadow: "0 0 8px #00ff88", animation: "pulse 2s infinite" }} />
            <span style={{ fontSize: isMobile ? "13px" : "14px", fontWeight: "700", letterSpacing: "3px", color: "#fff" }}>DAMINIHOST</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {!isMobile && (
            <>
              <span style={{ padding: "2px 8px", borderRadius: "3px", fontSize: "11px", background: "#00ff8818", color: "#00ff88", border: "1px solid #00ff8830", fontWeight: "600" }}>{totalRunning} ON</span>
              <span style={{ padding: "2px 8px", borderRadius: "3px", fontSize: "11px", background: "#88888818", color: "#888", border: "1px solid #88888830" }}>{fmtRam(totalRam)}</span>
            </>
          )}
          <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "linear-gradient(135deg,#7c6aff,#00ff88)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: "700", color: "#000", flexShrink: 0 }}>
            {user.name?.[0]?.toUpperCase() || "V"}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
        {/* Sidebar overlay on mobile */}
        {isMobile && sidebarOpen && (
          <div onClick={() => setSidebarOpen(false)} style={{ position: "absolute", inset: 0, background: "#000000aa", zIndex: 50 }} />
        )}

        {/* Sidebar */}
        <div style={{
          ...(isMobile ? {
            position: "absolute", top: 0, left: 0, bottom: 0, width: "240px", zIndex: 51,
            transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)", transition: "transform 0.2s ease",
          } : {
            width: sidebarOpen ? "0" : "220px", minWidth: sidebarOpen ? "0" : "220px", transition: "all 0.2s",
          }),
          background: "#0a0a0a", borderRight: "1px solid #1a1a1a", overflow: "hidden",
        }}>
          <SidebarContent />
        </div>

        {/* Main area */}
        {isMobile ? (
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {mobileView === "list" ? (
              <div style={{ flex: 1, overflowY: "auto" }}>
                <div style={{ padding: "10px 14px 4px", fontSize: "10px", color: "#3a3a3a", letterSpacing: "2px", textTransform: "uppercase" }}>Your Servers</div>
                {servers.map(s => (
                  <div key={s.id} onClick={() => selectServer(s.id)} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px", borderBottom: "1px solid #111", cursor: "pointer" }}>
                    <div style={S.dot(s.status)} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "14px", color: "#ddd" }}>{s.name}</div>
                      <div style={{ fontSize: "11px", color: "#444", marginTop: "2px" }}>{s.status} · {fmtUptime(s.uptime)}</div>
                    </div>
                    <span style={{ color: "#333", fontSize: "18px" }}>›</span>
                  </div>
                ))}
                {servers.length === 0 && !loadingServers && (
                  <div style={{ padding: "40px 16px", textAlign: "center", color: "#333" }}>
                    <div style={{ fontSize: "12px", marginBottom: "12px" }}>No servers yet</div>
                    <button style={S.btn("primary")} onClick={() => setShowNew(true)}>+ New Server</button>
                  </div>
                )}
                <div style={{ padding: "12px 14px" }}>
                  <button style={{ ...S.btn("primary"), width: "100%", padding: "10px" }} onClick={() => setShowNew(true)}>+ New Server</button>
                </div>
              </div>
            ) : (
              <DetailPanel />
            )}
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", overflow: "hidden", minWidth: 0 }}>
            <DetailPanel />
          </div>
        )}
      </div>

      {/* New Server Modal */}
      {showNew && (
        <div onClick={e => e.target === e.currentTarget && setShowNew(false)} style={{ position: "fixed", inset: 0, background: "#000000cc", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: "16px" }}>
          <div style={{ background: "#111", border: "1px solid #2a2a2a", borderRadius: "8px", padding: "24px", width: "100%", maxWidth: "360px" }}>
            <div style={{ fontSize: "14px", fontWeight: "700", color: "#fff", marginBottom: "18px", letterSpacing: "1px" }}>NEW SERVER</div>
            {[
              ["Server Name", newName, setNewName, "My Discord Bot"],
              ["Start Command", newCmd, setNewCmd, "node index.js"],
              ["Node Version", newNode, setNewNode, "20.x LTS"],
            ].map(([label, val, set, ph]) => (
              <div key={label} style={{ marginBottom: "12px" }}>
                <div style={{ fontSize: "10px", color: "#555", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "5px" }}>{label}</div>
                <input style={S.inp} value={val} onChange={e => set(e.target.value)} placeholder={ph} onKeyDown={e => e.key === "Enter" && createServer()} />
              </div>
            ))}
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "4px" }}>
              <button style={S.btn()} onClick={() => setShowNew(false)}>Cancel</button>
              <button style={S.btn("primary")} onClick={createServer}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useEffect, useState, useMemo } from "react";

export default function ResourcesHub({ apiBase }) {
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [semanticMode, setSemanticMode] = useState(true);
  const [activeFilter, setActiveFilter] = useState("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showExtensionGuide, setShowExtensionGuide] = useState(false);
  const [expandedTodos, setExpandedTodos] = useState({});
  const [generatingCardId, setGeneratingCardId] = useState(null);
  const [newResource, setNewResource] = useState({
    title: "",
    url: "",
    category: "study",
    notes: "",
    tags: "#study",
    remind_at: "",
    action: "",
  });
  const [notification, setNotification] = useState("");

  const showToast = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(""), 3000);
  };

  // Fetch resources
  const fetchResources = async () => {
    try {
      setLoading(true);
      let url = `${apiBase}/web-resources?limit=100`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setResources(data);
      }
    } catch (err) {
      console.error("Failed to fetch web resources:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResources();
  }, [apiBase]);

  // Semantic search when user types
  useEffect(() => {
    if (!searchQuery.trim()) {
      fetchResources();
      return;
    }

    const timer = setTimeout(async () => {
      if (semanticMode) {
        try {
          const res = await fetch(`${apiBase}/web-resources/search`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: searchQuery.trim(), limit: 50 }),
          });
          if (res.ok) {
            const data = await res.json();
            const formatted = data.results.map((r) => ({
              ...r.resource,
              matchReason: r.match_reason,
              matchedConcepts: r.matched_concepts,
            }));
            setResources(formatted);
          }
        } catch (err) {
          console.error("Semantic search failed, falling back to filter:", err);
        }
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, semanticMode, apiBase]);

  // Filter items
  const filteredResources = useMemo(() => {
    let list = resources;
    if (!semanticMode && searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (r) =>
          r.title?.toLowerCase().includes(q) ||
          r.notes?.toLowerCase().includes(q) ||
          r.tags?.toLowerCase().includes(q)
      );
    }

    if (activeFilter === "study") {
      list = list.filter((r) => r.category === "study");
    } else if (activeFilter === "youtube") {
      list = list.filter((r) => r.source_type === "youtube");
    } else if (activeFilter === "todos") {
      list = list.filter((r) => {
        try {
          const t = typeof r.todos_json === "string" ? JSON.parse(r.todos_json) : r.todos_json;
          return Array.isArray(t) && t.length > 0;
        } catch {
          return false;
        }
      });
    } else if (activeFilter === "reminders") {
      list = list.filter((r) => r.remind_at);
    }

    return list;
  }, [resources, activeFilter, semanticMode, searchQuery]);

  const handleCreateResource = async (e) => {
    e.preventDefault();
    if (!newResource.title || !newResource.url) return;

    try {
      const payload = {
        ...newResource,
        remind_at: newResource.remind_at ? new Date(newResource.remind_at).toISOString() : null,
      };
      const res = await fetch(`${apiBase}/web-resources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        showToast("✓ Resource saved to your Study Vault!");
        setShowAddModal(false);
        setNewResource({
          title: "",
          url: "",
          category: "study",
          notes: "",
          tags: "#study",
          remind_at: "",
          action: "",
        });
        fetchResources();
      }
    } catch (err) {
      alert("Failed to save resource: " + err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Remove this saved resource?")) return;
    try {
      const res = await fetch(`${apiBase}/web-resources/${id}`, { method: "DELETE" });
      if (res.ok) {
        setResources((prev) => prev.filter((r) => r.id !== id));
        showToast("Resource deleted.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleTodo = async (resourceId, todoId) => {
    const target = resources.find((r) => r.id === resourceId);
    if (!target) return;

    let todos = [];
    try {
      todos = typeof target.todos_json === "string" ? JSON.parse(target.todos_json) : target.todos_json;
    } catch (e) {}

    const updatedTodos = todos.map((t) => (t.id === todoId ? { ...t, completed: !t.completed } : t));
    const updatedJson = JSON.stringify(updatedTodos);

    setResources((prev) =>
      prev.map((r) => (r.id === resourceId ? { ...r, todos_json: updatedJson } : r))
    );

    try {
      await fetch(`${apiBase}/web-resources/${resourceId}/todos`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ todos: updatedTodos }),
      });
    } catch (e) {
      console.error("Failed to sync todo change:", e);
    }
  };

  const handleGenerateTodosForCard = async (resItem) => {
    try {
      setGeneratingCardId(resItem.id);
      const genRes = await fetch(`${apiBase}/web-resources/generate-todos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: resItem.title,
          url: resItem.url,
          notes: resItem.notes,
          tags: resItem.tags,
          category: resItem.category,
        }),
      });

      if (genRes.ok) {
        const plan = await genRes.json();
        const todos = plan.todos || [];
        const todosJson = JSON.stringify(todos);

        await fetch(`${apiBase}/web-resources/${resItem.id}/todos`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ todos }),
        });

        setResources((prev) =>
          prev.map((r) => (r.id === resItem.id ? { ...r, todos_json: todosJson } : r))
        );
        setExpandedTodos((prev) => ({ ...prev, [resItem.id]: true }));
        showToast("✨ AI Study Todos generated!");
      }
    } catch (err) {
      showToast("Could not generate todos: " + err.message);
    } finally {
      setGeneratingCardId(null);
    }
  };

  return (
    <div className="resources-hub-container" style={{ padding: "24px", maxWidth: "1280px", margin: "0 auto" }}>
      {/* Toast */}
      {notification && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 9999,
            background: "#8b5cf6",
            color: "#ffffff",
            padding: "10px 18px",
            borderRadius: "8px",
            fontWeight: 600,
            boxShadow: "0 10px 25px rgba(139, 92, 246, 0.4)",
          }}
        >
          {notification}
        </div>
      )}

      {/* Header Banner */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <div>
          <h2 style={{ fontSize: "22px", fontWeight: 800, margin: "0 0 6px 0", color: "#f8fafc" }}>
            🌐 Study & Web Resources Vault
          </h2>
          <p style={{ margin: 0, color: "#94a3b8", fontSize: "14px" }}>
            All videos, college study notes, and research links captured via the Memora Browser Extension.
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowExtensionGuide(true)}
            style={{ display: "flex", alignItems: "center", gap: "8px" }}
          >
            <span>🧩</span>
            <span>Browser Extension Guide</span>
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowAddModal(true)}
            style={{ display: "flex", alignItems: "center", gap: "8px" }}
          >
            <span>➕</span>
            <span>Add Resource</span>
          </button>
        </div>
      </div>

      {/* Search & Control Bar */}
      <div
        style={{
          background: "var(--card-bg, #18132b)",
          border: "1px solid rgba(139, 92, 246, 0.2)",
          borderRadius: "12px",
          padding: "16px",
          marginBottom: "24px",
        }}
      >
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", marginBottom: "14px" }}>
          <div style={{ flex: 1, minWidth: "260px", position: "relative" }}>
            <span style={{ position: "absolute", left: "14px", top: "12px", fontSize: "16px" }}>🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Single search (e.g. 'compiler design notes', 'virtual memory video', 'algorithms')..."
              style={{
                width: "100%",
                padding: "12px 16px 12px 42px",
                background: "rgba(0, 0, 0, 0.25)",
                border: "1px solid rgba(139, 92, 246, 0.3)",
                borderRadius: "8px",
                color: "#f8fafc",
                fontSize: "14px",
                outline: "none",
              }}
            />
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 600,
              color: semanticMode ? "#a78bfa" : "#94a3b8",
              background: "rgba(139, 92, 246, 0.1)",
              padding: "10px 14px",
              borderRadius: "8px",
              border: "1px solid rgba(139, 92, 246, 0.25)",
            }}
          >
            <input
              type="checkbox"
              checked={semanticMode}
              onChange={(e) => setSemanticMode(e.target.checked)}
              style={{ accentColor: "#8b5cf6" }}
            />
            <span>🧠 Semantic AI Search</span>
          </label>
        </div>

        {/* Filter Chips */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {[
            { id: "all", label: `All (${resources.length})` },
            { id: "study", label: "🎓 College & Study" },
            { id: "youtube", label: "▶️ YouTube Lectures" },
            { id: "todos", label: "🎯 Study Todos" },
            { id: "reminders", label: "⏰ Has Reminder" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveFilter(tab.id)}
              style={{
                background: activeFilter === tab.id ? "rgba(139, 92, 246, 0.3)" : "rgba(255, 255, 255, 0.04)",
                color: activeFilter === tab.id ? "#38bdf8" : "#94a3b8",
                border: `1px solid ${activeFilter === tab.id ? "#8b5cf6" : "rgba(255, 255, 255, 0.08)"}`,
                borderRadius: "20px",
                padding: "6px 14px",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Resource Cards */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#94a3b8" }}>Loading your resources...</div>
      ) : filteredResources.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "60px 20px",
            background: "rgba(255, 255, 255, 0.02)",
            borderRadius: "12px",
            border: "1px dashed rgba(139, 92, 246, 0.2)",
          }}
        >
          <div style={{ fontSize: "36px", marginBottom: "12px" }}>📚</div>
          <h3 style={{ color: "#f8fafc", margin: "0 0 6px 0" }}>No matching resources</h3>
          <p style={{ color: "#94a3b8", fontSize: "14px", maxWidth: "420px", margin: "0 auto 16px auto" }}>
            Install the Memora extension to save YouTube lectures and notes with one click, or add one manually!
          </p>
          <button type="button" className="btn-primary" onClick={() => setShowAddModal(true)}>
            Add Your First Resource
          </button>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: "16px",
          }}
        >
          {filteredResources.map((res) => {
            const isYt = res.source_type === "youtube";
            return (
              <div
                key={res.id}
                style={{
                  background: "var(--card-bg, #151124)",
                  border: "1px solid rgba(139, 92, 246, 0.2)",
                  borderRadius: "12px",
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  transition: "all 0.2s ease",
                  position: "relative",
                }}
              >
                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "10px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        padding: "3px 8px",
                        borderRadius: "6px",
                        background: isYt ? "rgba(239, 68, 68, 0.15)" : "rgba(139, 92, 246, 0.2)",
                        color: isYt ? "#f87171" : "#c084fc",
                        border: `1px solid ${isYt ? "rgba(239, 68, 68, 0.3)" : "rgba(139, 92, 246, 0.3)"}`,
                      }}
                    >
                      {res.source_type?.toUpperCase()}
                    </span>

                    <span style={{ fontSize: "11px", color: "#64748b" }}>
                      {new Date(res.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  <h3
                    style={{
                      fontSize: "15px",
                      fontWeight: 700,
                      color: "#f8fafc",
                      margin: "0 0 8px 0",
                      lineHeight: "1.4",
                    }}
                  >
                    <a
                      href={res.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "inherit", textDecoration: "none" }}
                    >
                      {res.title} ↗
                    </a>
                  </h3>

                  {res.notes && (
                    <p
                      style={{
                        fontSize: "13px",
                        color: "#cbd5e1",
                        margin: "0 0 12px 0",
                        lineHeight: "1.5",
                        background: "rgba(0, 0, 0, 0.2)",
                        padding: "8px 10px",
                        borderRadius: "6px",
                        borderLeft: "3px solid #8b5cf6",
                      }}
                    >
                      {res.notes}
                    </p>
                  )}

                  {res.matchReason && (
                    <div
                      style={{
                        fontSize: "11px",
                        color: "#a78bfa",
                        background: "rgba(139, 92, 246, 0.15)",
                        padding: "3px 8px",
                        borderRadius: "4px",
                        display: "inline-block",
                        marginBottom: "10px",
                      }}
                    >
                      🎯 {res.matchReason}
                    </div>
                  )}

                  {/* Study Milestones & Todos */}
                  {(() => {
                    let todos = [];
                    try {
                      if (res.todos_json) {
                        todos = typeof res.todos_json === "string" ? JSON.parse(res.todos_json) : res.todos_json;
                      }
                    } catch (e) {}

                    const hasTodos = Array.isArray(todos) && todos.length > 0;
                    const isExpanded = !!expandedTodos[res.id];
                    const doneCount = hasTodos ? todos.filter((t) => t.completed).length : 0;
                    const percent = hasTodos ? Math.round((doneCount / todos.length) * 100) : 0;

                    return (
                      <div style={{ marginTop: "10px", marginBottom: "8px" }}>
                        {hasTodos ? (
                          <div
                            style={{
                              background: "rgba(0, 0, 0, 0.25)",
                              border: "1px solid rgba(139, 92, 246, 0.2)",
                              borderRadius: "8px",
                              padding: "8px 10px",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: "5px",
                              }}
                            >
                              <span style={{ fontSize: "11px", fontWeight: 700, color: "#c084fc" }}>
                                🎯 Milestones ({doneCount}/{todos.length})
                              </span>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <span
                                  style={{
                                    fontSize: "11px",
                                    fontWeight: 800,
                                    color: percent === 100 ? "#10b981" : "#38bdf8",
                                  }}
                                >
                                  {percent}%
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedTodos((prev) => ({ ...prev, [res.id]: !prev[res.id] }))
                                  }
                                  style={{
                                    background: "transparent",
                                    border: "none",
                                    color: "#94a3b8",
                                    fontSize: "11px",
                                    cursor: "pointer",
                                    padding: "0 2px",
                                  }}
                                  title={isExpanded ? "Collapse todos" : "Expand todos"}
                                >
                                  {isExpanded ? "▲" : "▼"}
                                </button>
                              </div>
                            </div>

                            <div
                              style={{
                                width: "100%",
                                height: "4px",
                                background: "rgba(255, 255, 255, 0.08)",
                                borderRadius: "2px",
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  width: `${percent}%`,
                                  height: "100%",
                                  background:
                                    percent === 100
                                      ? "#10b981"
                                      : "linear-gradient(90deg, #8b5cf6, #38bdf8)",
                                  transition: "width 0.3s ease",
                                }}
                              />
                            </div>

                            {isExpanded && (
                              <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "5px" }}>
                                {todos.map((todo) => (
                                  <label
                                    key={todo.id}
                                    style={{
                                      display: "flex",
                                      alignItems: "flex-start",
                                      gap: "6px",
                                      cursor: "pointer",
                                      fontSize: "12px",
                                      color: todo.completed ? "#64748b" : "#cbd5e1",
                                      textDecoration: todo.completed ? "line-through" : "none",
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={!!todo.completed}
                                      onChange={() => handleToggleTodo(res.id, todo.id)}
                                      style={{ marginTop: "2px", accentColor: "#8b5cf6" }}
                                    />
                                    <span>{todo.text}</span>
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleGenerateTodosForCard(res)}
                            disabled={generatingCardId === res.id}
                            style={{
                              background: "rgba(139, 92, 246, 0.1)",
                              border: "1px solid rgba(139, 92, 246, 0.3)",
                              borderRadius: "6px",
                              color: "#c084fc",
                              padding: "4px 8px",
                              fontSize: "11px",
                              fontWeight: 600,
                              cursor: "pointer",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "5px",
                              transition: "all 0.15s ease",
                            }}
                          >
                            <span>✨</span>
                            <span>{generatingCardId === res.id ? "Generating..." : "Generate AI Todos"}</span>
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>

                <div
                  style={{
                    borderTop: "1px solid rgba(255, 255, 255, 0.06)",
                    paddingTop: "12px",
                    marginTop: "8px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <span
                      style={{
                        fontSize: "11px",
                        color: "#38bdf8",
                        background: "rgba(56, 189, 248, 0.1)",
                        padding: "2px 6px",
                        borderRadius: "4px",
                      }}
                    >
                      {res.category}
                    </span>

                    {res.remind_at && (
                      <span
                        style={{
                          fontSize: "11px",
                          color: "#f59e0b",
                          display: "flex",
                          alignItems: "center",
                          gap: "3px",
                        }}
                      >
                        ⏰ {new Date(res.remind_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: "6px" }}>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(res.url).then(() => showToast("Copied link!"))}
                      style={{
                        background: "rgba(255, 255, 255, 0.05)",
                        border: "none",
                        color: "#94a3b8",
                        padding: "4px 8px",
                        borderRadius: "4px",
                        cursor: "pointer",
                      }}
                      title="Copy Link"
                    >
                      📋
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(res.id)}
                      style={{
                        background: "rgba(255, 255, 255, 0.05)",
                        border: "none",
                        color: "#ef4444",
                        padding: "4px 8px",
                        borderRadius: "4px",
                        cursor: "pointer",
                      }}
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Resource Modal */}
      {showAddModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "#18132b",
              border: "1px solid rgba(139, 92, 246, 0.3)",
              borderRadius: "12px",
              padding: "24px",
              width: "100%",
              maxWidth: "480px",
              boxShadow: "0 20px 40px rgba(0, 0, 0, 0.6)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, color: "#f8fafc", fontSize: "18px" }}>Save Web Resource</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "16px" }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateResource}>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Compiler Design - Lexical Analysis Lecture"
                  value={newResource.title}
                  onChange={(e) => setNewResource({ ...newResource, title: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "10px",
                    background: "#0f0c20",
                    border: "1px solid rgba(139, 92, 246, 0.2)",
                    borderRadius: "6px",
                    color: "white",
                  }}
                />
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>URL *</label>
                <input
                  type="url"
                  required
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={newResource.url}
                  onChange={(e) => setNewResource({ ...newResource, url: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "10px",
                    background: "#0f0c20",
                    border: "1px solid rgba(139, 92, 246, 0.2)",
                    borderRadius: "6px",
                    color: "white",
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>Category</label>
                  <select
                    value={newResource.category}
                    onChange={(e) => setNewResource({ ...newResource, category: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "10px",
                      background: "#0f0c20",
                      border: "1px solid rgba(139, 92, 246, 0.2)",
                      borderRadius: "6px",
                      color: "white",
                    }}
                  >
                    <option value="study">🎓 Study / College</option>
                    <option value="project">🚀 Project</option>
                    <option value="work">💼 Work</option>
                    <option value="general">📁 General</option>
                  </select>
                </div>

                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>Tags</label>
                  <input
                    type="text"
                    placeholder="#compiler, #gate"
                    value={newResource.tags}
                    onChange={(e) => setNewResource({ ...newResource, tags: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "10px",
                      background: "#0f0c20",
                      border: "1px solid rgba(139, 92, 246, 0.2)",
                      borderRadius: "6px",
                      color: "white",
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>Study Notes / Excerpt</label>
                <textarea
                  rows={3}
                  placeholder="Key concepts, takeaways, or timestamps..."
                  value={newResource.notes}
                  onChange={(e) => setNewResource({ ...newResource, notes: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "10px",
                    background: "#0f0c20",
                    border: "1px solid rgba(139, 92, 246, 0.2)",
                    borderRadius: "6px",
                    color: "white",
                  }}
                />
              </div>

              <div style={{ marginBottom: "18px" }}>
                <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "4px" }}>⏰ Reminder Date & Time (Optional)</label>
                <input
                  type="datetime-local"
                  value={newResource.remind_at}
                  onChange={(e) => setNewResource({ ...newResource, remind_at: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "10px",
                    background: "#0f0c20",
                    border: "1px solid rgba(139, 92, 246, 0.2)",
                    borderRadius: "6px",
                    color: "white",
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Save to Vault
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Extension Guide Modal */}
      {showExtensionGuide && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "#161226",
              border: "1px solid rgba(139, 92, 246, 0.4)",
              borderRadius: "14px",
              padding: "28px",
              width: "100%",
              maxWidth: "520px",
              boxShadow: "0 25px 50px rgba(0, 0, 0, 0.7)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "24px" }}>🧩</span>
                <h3 style={{ margin: 0, color: "#f8fafc", fontSize: "19px" }}>Install Memora Browser Extension</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowExtensionGuide(false)}
                style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "18px" }}
              >
                ✕
              </button>
            </div>

            <p style={{ color: "#cbd5e1", fontSize: "14px", lineHeight: "1.6", marginBottom: "16px" }}>
              Use Memora directly in Google Chrome, Microsoft Edge, Brave, Arc, or Firefox to capture YouTube videos, articles, and college study notes with a single click:
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
              <div style={{ display: "flex", gap: "12px", background: "rgba(0, 0, 0, 0.3)", padding: "12px", borderRadius: "8px" }}>
                <span style={{ fontWeight: 800, color: "#a78bfa" }}>1.</span>
                <span style={{ fontSize: "13px", color: "#f8fafc" }}>
                  Open your browser extensions manager at <code>chrome://extensions</code> (or <code>edge://extensions</code>).
                </span>
              </div>

              <div style={{ display: "flex", gap: "12px", background: "rgba(0, 0, 0, 0.3)", padding: "12px", borderRadius: "8px" }}>
                <span style={{ fontWeight: 800, color: "#a78bfa" }}>2.</span>
                <span style={{ fontSize: "13px", color: "#f8fafc" }}>
                  Turn on <strong>Developer mode</strong> (toggle in the top-right corner).
                </span>
              </div>

              <div style={{ display: "flex", gap: "12px", background: "rgba(0, 0, 0, 0.3)", padding: "12px", borderRadius: "8px" }}>
                <span style={{ fontWeight: 800, color: "#a78bfa" }}>3.</span>
                <span style={{ fontSize: "13px", color: "#f8fafc" }}>
                  Click <strong>"Load unpacked"</strong> and select the <code>MEMORA/extension</code> folder in this repository!
                </span>
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <button type="button" className="btn-primary" onClick={() => setShowExtensionGuide(false)}>
                Got It, Ready to Browse!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

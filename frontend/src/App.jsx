import React, { useEffect, useMemo, useState } from "react";
import Dashboard from "./components/Dashboard";
import DocumentCard from "./components/DocumentCard";
import DocumentDetailModal from "./components/DocumentDetailModal";
import DocumentModal from "./components/DocumentModal";
import AskMemoraModal from "./components/AskMemoraModal";
import MemoryGraphModal from "./components/MemoryGraphModal";
import LifeEventsModal from "./components/LifeEventsModal";
import ResourcesHub from "./components/ResourcesHub";
import { getActionDeadlineCategory, getEffectiveActionItems } from "./utils/datetime";

const API = import.meta.env.VITE_API_URL || "https://memora-w72x.onrender.com";
const CATEGORIES = [
  "study",
  "personal",
  "finance",
  "health",
  "work",
  "project",
  "general",
];

const categoryDisplayNames = {
  study: "College / Study",
  personal: "Personal",
  finance: "Finance",
  health: "Medical / Health",
  work: "Work / Job",
  project: "Projects",
  general: "General",
};

export default function App() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [activePage, setActivePage] = useState("dashboard");

  // Search and Filters
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [actionStatusFilter, setActionStatusFilter] = useState("");
  const [importantOnly, setImportantOnly] = useState(false);
  const [expiryOnly, setExpiryOnly] = useState(false);
  const [reminderOnly, setReminderOnly] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);

  // Theme Management with localStorage persistence & system preference detection
  const [theme, setTheme] = useState(() => {
    try {
      const savedTheme = localStorage.getItem("memora-theme");
      if (savedTheme === "dark" || savedTheme === "light") {
        return savedTheme;
      }
    } catch {
      // fallback
    }
    if (
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    ) {
      return "dark";
    }
    return "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    } else {
      document.documentElement.classList.add("light");
      document.documentElement.classList.remove("dark");
    }
    try {
      localStorage.setItem("memora-theme", theme);
    } catch (e) {
      console.error(e);
    }
  }, [theme]);

  function toggleTheme() {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }

  // Modals
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editingDoc, setEditingDoc] = useState(null);
  const [detailDoc, setDetailDoc] = useState(null);
  const [showAssistant, setShowAssistant] = useState(false);
  const [showGraph, setShowGraph] = useState(false);
  const [showLifeEvents, setShowLifeEvents] = useState(false);

  // =========================================================
  // NOTIFICATIONS (Preserved & Timezone-Correct)
  // =========================================================

  async function enableNotifications() {
    if (!("Notification" in window)) {
      setMessage("This browser does not support desktop notifications.");
      return;
    }

    try {
      const permission =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();

      if (permission !== "granted") {
        setMessage("Notification permission was denied.");
        return;
      }

      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification("MEMORA", {
          body: "Notifications are active and ready! 🔔",
          tag: "memora-test-notification",
        });
      }

      setMessage("Browser notifications enabled successfully.");
      checkReminderNotifications(documents);
    } catch (error) {
      console.error("Notification error:", error);
      setMessage("Could not enable notifications.");
    }
  }

  async function showReminderNotification(doc) {
    if (!("Notification" in window) || Notification.permission !== "granted") {
      return;
    }

    try {
      const title = `🔔 MEMORA Reminder: ${doc.title}`;
      const body = doc.action
        ? `Action Required: ${doc.action}`
        : `Reminder for ${doc.title} (${doc.category})`;

      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.ready;
        await registration.showNotification(title, {
          body,
          tag: `memora-reminder-${doc.id}-${doc.remind_at}`,
          requireInteraction: true,
          data: { documentId: doc.id },
        });
      } else {
        new Notification(title, { body });
      }
    } catch (error) {
      console.error("Reminder notification error:", error);
    }
  }

  function checkReminderNotifications(docs) {
    if (!("Notification" in window) || Notification.permission !== "granted") {
      return;
    }

    const now = Date.now();

    docs.forEach((doc) => {
      if (!doc.remind_at) return;

      const reminderTime = new Date(doc.remind_at).getTime();
      if (Number.isNaN(reminderTime)) return;

      if (reminderTime <= now) {
        const reminderKey = `memora-reminder-${doc.id}-${doc.remind_at}`;
        if (sessionStorage.getItem(reminderKey) === "shown") {
          return;
        }

        sessionStorage.setItem(reminderKey, "shown");
        showReminderNotification(doc);
      }
    });
  }

  function scheduleReminderNotifications(docs) {
    if (!("Notification" in window)) return;

    docs.forEach((doc) => {
      if (!doc.remind_at) return;

      const reminderTime = new Date(doc.remind_at).getTime();
      if (Number.isNaN(reminderTime)) return;

      const delay = reminderTime - Date.now();

      if (delay <= 0) {
        checkReminderNotifications([doc]);
        return;
      }

      window.setTimeout(() => {
        checkReminderNotifications([doc]);
      }, Math.min(delay, 2147483647));
    });
  }

  // Periodic reminder checker every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      checkReminderNotifications(documents);
    }, 10000);
    return () => clearInterval(interval);
  }, [documents]);

  // =========================================================
  // LOAD DOCUMENTS
  // =========================================================

  async function loadDocuments() {
    try {
      setLoading(true);
      const params = new URLSearchParams();

      if (search.trim()) params.append("q", search.trim());
      if (categoryFilter) params.append("category", categoryFilter);
      if (importantOnly) params.append("is_important", "true");
      if (expiryOnly) params.append("has_expiry", "true");
      if (reminderOnly) params.append("has_reminder", "true");
      if (actionStatusFilter) params.append("action_status", actionStatusFilter);
      if (overdueOnly) params.append("is_overdue", "true");

      const url = `${API}/documents${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error("Could not fetch documents");
      }

      const data = await response.json();
      setDocuments(data);
      checkReminderNotifications(data);
      scheduleReminderNotifications(data);
    } catch (error) {
      console.error(error);
      setMessage("Could not connect to FastAPI server. Please verify backend is running on port 8000.");
    } finally {
      setLoading(false);
    }
  }

  // Live filter reload
  useEffect(() => {
    loadDocuments();
  }, [categoryFilter, importantOnly, expiryOnly, reminderOnly, actionStatusFilter, overdueOnly]);

  // Search debounce 350ms
  useEffect(() => {
    const timer = setTimeout(() => {
      loadDocuments();
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  // =========================================================
  // DOCUMENT ACTIONS & OPERATIONS
  // =========================================================

  async function handleSaveDocument(formData, isEditing) {
    const dateFormatted = (val) => (val ? (val.length === 16 ? `${val}:00` : val) : null);

    if (isEditing) {
      const payload = {
        title: formData.title,
        description: formData.description,
        category: formData.category,
        document_date: dateFormatted(formData.document_date),
        expiry_date: dateFormatted(formData.expiry_date),
        remind_at: dateFormatted(formData.remind_at),
        action: formData.action || null,
        action_status: formData.action_status,
        action_due_date: dateFormatted(formData.action_due_date),
        is_important: formData.is_important,
      };

      const res = await fetch(`${API}/documents/${isEditing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail || "Update failed");
      }

      setMessage("Document updated successfully.");
      await loadDocuments();
      return;
    }

    // Creating new document
    const body = new FormData();
    body.append("title", formData.title);
    body.append("category", formData.category);
    body.append("description", formData.description || "");
    body.append("file", formData.file);
    body.append("is_important", formData.is_important ? "true" : "false");

    if (formData.action) body.append("action", formData.action);
    if (formData.action_status) body.append("action_status", formData.action_status);
    if (formData.action_due_date) body.append("action_due_date", dateFormatted(formData.action_due_date));
    if (formData.document_date) body.append("document_date", dateFormatted(formData.document_date));
    if (formData.expiry_date) body.append("expiry_date", dateFormatted(formData.expiry_date));
    if (formData.remind_at) body.append("remind_at", dateFormatted(formData.remind_at));

    const res = await fetch(`${API}/documents`, {
      method: "POST",
      body,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.detail || "Upload failed");
    }

    setMessage("Document uploaded and processed successfully.");
    await loadDocuments();
  }

  async function handleToggleStatus(doc, newStatus) {
    try {
      const payload = { action_status: newStatus };
      if (!doc.action || !doc.action.trim()) {
        payload.action = "Review expired document";
      }
      const res = await fetch(`${API}/documents/${doc.id}/action-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Could not update status");
      const updated = await res.json();

      setDocuments((prev) => prev.map((d) => (d.id === doc.id ? updated : d)));
      if (detailDoc && detailDoc.id === doc.id) {
        setDetailDoc(updated);
      }
      setMessage(`Action status marked as "${newStatus}".`);
    } catch (err) {
      console.error(err);
      setMessage("Failed to update status.");
    }
  }

  async function handleDeleteDocument(id) {
    const confirmDel = window.confirm("Are you sure you want to permanently delete this document?");
    if (!confirmDel) return;

    try {
      const res = await fetch(`${API}/documents/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Delete failed");
      setMessage("Document deleted.");
      await loadDocuments();
    } catch (err) {
      console.error(err);
      setMessage("Failed to delete document.");
    }
  }

  // =========================================================
  // NAVIGATION HELPERS
  // =========================================================

  function resetFilters() {
    setSearch("");
    setCategoryFilter("");
    setActionStatusFilter("");
    setImportantOnly(false);
    setExpiryOnly(false);
    setReminderOnly(false);
    setOverdueOnly(false);
  }

  function handleOpenUploadWithTemplate(template) {
    setEditingDoc({
      title: template.title,
      action: template.action,
      category: "general",
    });
    setShowUploadModal(true);
  }

  const effectiveActionItems = useMemo(() => getEffectiveActionItems(documents), [documents]);
  const pendingActionsCount = useMemo(
    () => effectiveActionItems.filter((i) => !i.isCompleted).length,
    [effectiveActionItems]
  );

  // Active view documents
  const activeViewDocuments = useMemo(() => {
    if (activePage === "important") {
      return documents.filter((d) => d.is_important);
    }
    if (activePage === "reminders") {
      return documents.filter((d) => d.remind_at);
    }
    if (activePage === "actions") {
      if (actionStatusFilter === "Completed") {
        const completedIds = new Set(effectiveActionItems.filter((i) => i.isCompleted).map((i) => i.doc.id));
        return documents.filter((d) => completedIds.has(d.id));
      }
      if (actionStatusFilter === "Pending") {
        const pendingIds = new Set(effectiveActionItems.filter((i) => !i.isCompleted).map((i) => i.doc.id));
        return documents.filter((d) => pendingIds.has(d.id));
      }
      const actionDocIds = new Set(effectiveActionItems.map((i) => i.doc.id));
      return documents.filter((d) => actionDocIds.has(d.id));
    }
    return documents;
  }, [documents, activePage, actionStatusFilter, effectiveActionItems]);

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="app-sidebar">
        <div className="brand-section">
          <div className="brand-logo-badge">M</div>
          <div>
            <div className="brand-name">MEMORA</div>
            <div className="brand-tagline">Life Memory Assistant</div>
          </div>
        </div>

        <div className="nav-group-title">Main Menu</div>
        <nav className="nav-links-list">
          <button
            type="button"
            className={`nav-link-btn ${activePage === "dashboard" ? "active" : ""}`}
            onClick={() => {
              setActivePage("dashboard");
              resetFilters();
            }}
          >
            <span className="nav-link-icon">📊</span>
            <span>Dashboard</span>
          </button>

          <button
            type="button"
            className={`nav-link-btn ${activePage === "documents" ? "active" : ""}`}
            onClick={() => {
              setActivePage("documents");
              resetFilters();
            }}
          >
            <span className="nav-link-icon">📁</span>
            <span>All Documents</span>
            <span className="nav-link-count">{documents.length}</span>
          </button>

          <button
            type="button"
            className={`nav-link-btn ${activePage === "actions" ? "active" : ""}`}
            onClick={() => {
              setActivePage("actions");
              resetFilters();
            }}
          >
            <span className="nav-link-icon">⚡</span>
            <span>Action Items</span>
            <span className="nav-link-count">{pendingActionsCount}</span>
          </button>

          <button
            type="button"
            className={`nav-link-btn ${activePage === "important" ? "active" : ""}`}
            onClick={() => {
              setActivePage("important");
              setImportantOnly(true);
            }}
          >
            <span className="nav-link-icon">⭐</span>
            <span>Important</span>
            <span className="nav-link-count">
              {documents.filter((d) => d.is_important).length}
            </span>
          </button>

          <button
            type="button"
            className={`nav-link-btn ${activePage === "reminders" ? "active" : ""}`}
            onClick={() => {
              setActivePage("reminders");
              resetFilters();
            }}
          >
            <span className="nav-link-icon">⏰</span>
            <span>Reminders</span>
            <span className="nav-link-count">
              {documents.filter((d) => d.remind_at).length}
            </span>
          </button>

          <button
            type="button"
            className={`nav-link-btn ${activePage === "resources" ? "active" : ""}`}
            onClick={() => {
              setActivePage("resources");
              resetFilters();
            }}
          >
            <span className="nav-link-icon">🌐</span>
            <span>Study & Web Vault</span>
          </button>
        </nav>

        <div className="nav-group-title">Intelligence & Graph</div>
        <nav className="nav-links-list">
          <button
            type="button"
            className="nav-link-btn"
            onClick={() => setShowAssistant(true)}
          >
            <span className="nav-link-icon">🤖</span>
            <span>Ask MEMORA</span>
          </button>

          <button
            type="button"
            className="nav-link-btn"
            onClick={() => setShowGraph(true)}
          >
            <span className="nav-link-icon">🕸️</span>
            <span>Memory Graph</span>
          </button>

          <button
            type="button"
            className="nav-link-btn"
            onClick={() => setShowLifeEvents(true)}
          >
            <span className="nav-link-icon">🎯</span>
            <span>Smart Life Events</span>
          </button>
        </nav>

        <div className="nav-group-title">Categories</div>
        <nav className="nav-links-list">
          {CATEGORIES.slice(0, 5).map((cat) => (
            <button
              key={cat}
              type="button"
              className={`nav-link-btn ${categoryFilter === cat ? "active" : ""}`}
              onClick={() => {
                setActivePage("documents");
                setCategoryFilter(cat);
              }}
            >
              <span className="nav-link-icon">🏷️</span>
              <span>{categoryDisplayNames[cat]}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button
            type="button"
            className="btn-secondary btn-sm"
            style={{ width: "100%", justifyContent: "center" }}
            onClick={enableNotifications}
          >
            🔔 Enable Notifications
          </button>
        </div>
      </aside>

      {/* Main App Content Area */}
      <main className="app-main">
        {/* Topbar */}
        <header className="app-topbar">
          <div className="page-heading">
            <h1>
              {activePage === "dashboard" && "Dashboard"}
              {activePage === "documents" && "Document Library"}
              {activePage === "actions" && "What Do I Need To Do?"}
              {activePage === "important" && "Important Documents"}
              {activePage === "reminders" && "Scheduled Reminders"}
              {activePage === "resources" && "Study & Web Vault"}
            </h1>
            <p>
              {activePage === "dashboard" && "Overview of memory, upcoming actions, and deadlines"}
              {activePage === "documents" && "Search, filter, and inspect stored files"}
              {activePage === "actions" && "Actionable items and task lifecycle"}
              {activePage === "important" && "Priority documents marked for quick access"}
              {activePage === "reminders" && "Active reminder schedule and alerts"}
              {activePage === "resources" && "YouTube lectures, college study notes, and research links captured via extension"}
            </p>
          </div>

          <div className="topbar-actions">
            <div className="search-input-wrapper">
              <span className="search-icon-inside">🔍</span>
              <input
                type="text"
                className="topbar-search"
                placeholder="Search title, action, file, category..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <button
              type="button"
              className="btn-theme-toggle"
              onClick={toggleTheme}
              title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
              aria-label="Toggle theme mode"
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>

            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setEditingDoc(null);
                setShowUploadModal(true);
              }}
            >
              + Add Document
            </button>

            <button
              type="button"
              className="btn-icon-btn"
              onClick={() => setShowAssistant(true)}
              title="Open Ask MEMORA Assistant"
            >
              🤖 Ask MEMORA
            </button>
          </div>
        </header>

        {/* Global Feedback Banner */}
        {message && (
          <div className="app-alert">
            <span>{message}</span>
            <button type="button" className="btn-close" onClick={() => setMessage("")}>
              ✕
            </button>
          </div>
        )}

        {/* Page Content */}
        <div className="app-content">
          {activePage === "resources" ? (
            <ResourcesHub apiBase={API} />
          ) : activePage === "dashboard" ? (
            <Dashboard
              documents={documents}
              loading={loading}
              onOpenUpload={() => {
                setEditingDoc(null);
                setShowUploadModal(true);
              }}
              onOpenDocuments={() => {
                setActivePage("documents");
                resetFilters();
              }}
              onViewDetails={(doc) => setDetailDoc(doc)}
              onEdit={(doc) => {
                setEditingDoc(doc);
                setShowUploadModal(true);
              }}
              onDelete={handleDeleteDocument}
              onToggleStatus={handleToggleStatus}
              apiBase={API}
            />
          ) : (
            <div>
              {/* Filter Bar for Documents / Actions */}
              <div className="filter-bar-container">
                <div className="filter-group">
                  <select
                    className="filter-select"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                  >
                    <option value="">All Categories</option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {categoryDisplayNames[c]}
                      </option>
                    ))}
                  </select>

                  <select
                    className="filter-select"
                    value={actionStatusFilter}
                    onChange={(e) => setActionStatusFilter(e.target.value)}
                  >
                    <option value="">All Action Statuses</option>
                    <option value="Pending">Pending</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                    <option value="No Action">No Action</option>
                  </select>

                  <button
                    type="button"
                    className={`filter-toggle-btn ${importantOnly ? "active" : ""}`}
                    onClick={() => setImportantOnly(!importantOnly)}
                  >
                    ⭐ Important
                  </button>

                  <button
                    type="button"
                    className={`filter-toggle-btn ${overdueOnly ? "active" : ""}`}
                    onClick={() => setOverdueOnly(!overdueOnly)}
                  >
                    🔴 Overdue
                  </button>

                  <button
                    type="button"
                    className={`filter-toggle-btn ${expiryOnly ? "active" : ""}`}
                    onClick={() => setExpiryOnly(!expiryOnly)}
                  >
                    ⏳ Has Expiry
                  </button>

                  <button
                    type="button"
                    className={`filter-toggle-btn ${reminderOnly ? "active" : ""}`}
                    onClick={() => setReminderOnly(!reminderOnly)}
                  >
                    ⏰ Has Reminder
                  </button>
                </div>

                {(categoryFilter || actionStatusFilter || importantOnly || expiryOnly || reminderOnly || overdueOnly || search) && (
                  <button type="button" className="btn-link" onClick={resetFilters}>
                    Reset All Filters
                  </button>
                )}
              </div>

              {/* Documents Grid */}
              {loading ? (
                <div className="empty-panel">Loading documents...</div>
              ) : activeViewDocuments.length === 0 ? (
                <div className="empty-panel">
                  <span className="empty-icon">📂</span>
                  <h3>No documents found</h3>
                  <p>Try adjusting your search criteria or add a new document.</p>
                </div>
              ) : (
                <div className="documents-grid">
                  {activeViewDocuments.map((doc) => (
                    <DocumentCard
                      key={doc.id}
                      doc={doc}
                      onDelete={handleDeleteDocument}
                      onEdit={(d) => {
                        setEditingDoc(d);
                        setShowUploadModal(true);
                      }}
                      onViewDetails={(d) => setDetailDoc(d)}
                      onToggleStatus={handleToggleStatus}
                      apiBase={API}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* MODALS */}
      <DocumentModal
        isOpen={showUploadModal}
        onClose={() => {
          setShowUploadModal(false);
          setEditingDoc(null);
        }}
        onSubmit={handleSaveDocument}
        editingDoc={editingDoc}
        apiBase={API}
      />

      <DocumentDetailModal
        doc={detailDoc}
        onClose={() => setDetailDoc(null)}
        onEdit={(doc) => {
          setEditingDoc(doc);
          setShowUploadModal(true);
        }}
        onDelete={handleDeleteDocument}
        onToggleStatus={handleToggleStatus}
        apiBase={API}
      />

      <AskMemoraModal
        isOpen={showAssistant}
        onClose={() => setShowAssistant(false)}
        onViewDoc={(doc) => setDetailDoc(doc)}
        apiBase={API}
      />

      <MemoryGraphModal
        isOpen={showGraph}
        onClose={() => setShowGraph(false)}
        onViewDoc={(doc) => setDetailDoc(doc)}
        apiBase={API}
      />

      <LifeEventsModal
        isOpen={showLifeEvents}
        onClose={() => setShowLifeEvents(false)}
        onOpenUploadWithTemplate={handleOpenUploadWithTemplate}
        apiBase={API}
      />
    </div>
  );
}

import React, { useEffect, useMemo, useState } from "react";
import Dashboard from "./components/Dashboard";
import DocumentCard from "./components/DocumentCard";
import DocumentDetailModal from "./components/DocumentDetailModal";
import DocumentModal from "./components/DocumentModal";
import AskMemoraModal from "./components/AskMemoraModal";
import MemoryGraphModal from "./components/MemoryGraphModal";
import LifeEventsModal from "./components/LifeEventsModal";
import YoutubeLinksModal from "./components/YoutubeLinksModal";
import AuthModal from "./components/AuthModal";
import { useAuth } from "./context/useAuth";
import { useTheme } from "./context/ThemeContext";
import { getActionDeadlineCategory, getEffectiveActionItems } from "./utils/datetime";
import { API_BASE_URL as API } from "./config/api";

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
  const { user, isAuthenticated, loading: authLoading, logout, authFetch, loginAsDemo } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
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

  // Clean Logout & Session Switcher
  const handleLogout = () => {
    logout();
    setDocuments([]);
    setActivePage("dashboard");
    setShowAuthModal(true);
  };

  // Modals
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showYoutubeModal, setShowYoutubeModal] = useState(false);
  const [editingDoc, setEditingDoc] = useState(null);
  const [detailDoc, setDetailDoc] = useState(null);
  const [showAssistant, setShowAssistant] = useState(false);
  const [showGraph, setShowGraph] = useState(false);
  const [showLifeEvents, setShowLifeEvents] = useState(false);

  // =========================================================
  // NOTIFICATIONS
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
      }
    } catch (err) {
      console.error(err);
    }
  }

  function checkReminderNotifications(docList) {
    if (!("Notification" in window) || Notification.permission !== "granted") {
      return;
    }

    const now = Date.now();
    docList.forEach((doc) => {
      if (!doc.remind_at) return;
      const remTime = new Date(doc.remind_at).getTime();
      const diffMs = now - remTime;
      // Alert if reminder fired within the last 60 seconds
      if (diffMs >= 0 && diffMs <= 60000) {
        const key = `memora-notified-${doc.id}-${doc.remind_at}`;
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, "true");
          showReminderNotification(doc);
        }
      }
    });
  }

  function scheduleReminderNotifications(docList) {
    const now = Date.now();
    docList.forEach((doc) => {
      if (!doc.remind_at) return;
      const remTime = new Date(doc.remind_at).getTime();
      const delay = remTime - now;
      if (delay > 0 && delay < 24 * 60 * 60 * 1000) {
        window.setTimeout(() => {
          checkReminderNotifications([doc]);
        }, Math.min(delay, 2147483647));
      }
    });
  }

  // Periodic reminder checker every 10 seconds
  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(() => {
      checkReminderNotifications(documents);
    }, 10000);
    return () => clearInterval(interval);
  }, [documents, isAuthenticated]);

  // =========================================================
  // LOAD DOCUMENTS (Strictly isolated by user token)
  // =========================================================

  async function loadDocuments() {
    if (!isAuthenticated) {
      setDocuments([]);
      setLoading(false);
      return;
    }

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
      const response = await authFetch(url);

      if (!response.ok) {
        if (response.status === 401) return;
        throw new Error("Could not fetch documents");
      }

      const data = await response.json();
      setDocuments(data);
      checkReminderNotifications(data);
      scheduleReminderNotifications(data);
    } catch (error) {
      console.error(error);
      setMessage("Could not connect to backend server. Please verify the backend service is reachable.");
    } finally {
      setLoading(false);
    }
  }

  // Live filter reload
  useEffect(() => {
    loadDocuments();
  }, [isAuthenticated, categoryFilter, importantOnly, expiryOnly, reminderOnly, actionStatusFilter, overdueOnly]);

  // Search debounce 350ms
  useEffect(() => {
    if (!isAuthenticated) return;
    const timer = setTimeout(() => {
      loadDocuments();
    }, 350);
    return () => clearTimeout(timer);
  }, [search, isAuthenticated]);

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

      const res = await authFetch(`${API}/documents/${isEditing.id}`, {
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

    const res = await authFetch(`${API}/documents`, {
      method: "POST",
      body,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.detail || "Upload failed");
    }

    setMessage("Document uploaded and stored securely in Cloud Storage.");
    await loadDocuments();
  }

  async function handleToggleStatus(doc, newStatus) {
    try {
      const payload = { action_status: newStatus };
      if (!doc.action || !doc.action.trim()) {
        payload.action = "Review expired document";
      }
      const res = await authFetch(`${API}/documents/${doc.id}/action-status`, {
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
      const res = await authFetch(`${API}/documents/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Delete failed");
      setMessage("Document deleted.");
      await loadDocuments();
    } catch (err) {
      console.error(err);
      setMessage("Failed to delete document.");
    }
  }

  function handleOpenUploadWithTemplate(_template) {
    setEditingDoc(null);
    setShowUploadModal(true);
  }

  function resetFilters() {
    setSearch("");
    setCategoryFilter("");
    setActionStatusFilter("");
    setImportantOnly(false);
    setExpiryOnly(false);
    setReminderOnly(false);
    setOverdueOnly(false);
  }

  // Filtered documents list for Document Library view
  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      if (activePage === "important" && !doc.is_important) return false;
      if (activePage === "reminders" && !doc.remind_at) return false;
      if (activePage === "actions") {
        const cat = getActionDeadlineCategory(doc);
        const hasAction = Boolean(doc.action && doc.action.trim());
        const isCompleted = (doc.action_status || "").toUpperCase() === "COMPLETED";
        if (!hasAction && (!doc.expiry_date || cat !== "Overdue" || isCompleted)) return false;
      }
      return true;
    });
  }, [documents, activePage]);

  // Loading state during auth initialization
  if (authLoading) {
    return (
      <div className="auth-loading-screen">
        <div className="auth-spinner" />
        <p>Loading MEMORA workspace...</p>
      </div>
    );
  }

  // Unauthenticated Landing & Login View
  if (!isAuthenticated) {
    return (
      <div className="landing-view">
        <nav className="landing-nav">
          <div className="brand-logo">
            <span className="logo-icon">🧠</span>
            <span className="logo-text">MEMORA</span>
          </div>
          <div className="landing-nav-actions">
            <button type="button" className="btn-theme-toggle" onClick={toggleTheme} aria-label="Toggle theme">
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setShowAuthModal(true)}>
              Sign In
            </button>
            <button type="button" className="btn-primary" onClick={() => setShowAuthModal(true)}>
              Get Started →
            </button>
          </div>
        </nav>

        <header className="landing-hero">
          <div className="hero-pill">⚡ PRODUCTION-READY LIFE ADMIN ASSISTANT</div>
          <h1 className="hero-title">
            The Intelligent Second Brain for <span className="text-gradient">Your Documents & Life Admin</span>
          </h1>
          <p className="hero-description">
            Never miss an insurance renewal, exam admit card, or tax deadline again. MEMORA provides
            end-to-end user isolation, Cloud PostgreSQL persistence, automated deadline calculation,
            and smart recommendations.
          </p>

          <div className="hero-cta-group">
            <button
              type="button"
              className="btn-hero-primary"
              onClick={async () => {
                try {
                  await loginAsDemo();
                } catch {
                  setShowAuthModal(true);
                }
              }}
            >
              🚀 Explore with Demo Account (Instant 1-Click)
            </button>

            <button
              type="button"
              className="btn-hero-secondary"
              onClick={() => setShowAuthModal(true)}
            >
              Sign In or Register
            </button>
          </div>
        </header>

        <section className="landing-features-grid">
          <div className="feature-card">
            <div className="feature-icon">🔒</div>
            <h3>Multi-Tenant Data Privacy</h3>
            <p>Every uploaded document, life event, and video memory is isolated to your cryptographic user identity.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">☁️</div>
            <h3>Permanent Cloud Storage</h3>
            <p>Powered by Supabase Cloud PostgreSQL and resilient cloud storage bucket persistence.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">⚡</div>
            <h3>Smart Action Suggestions</h3>
            <p>Deterministic AI extracts due dates, renewal steps, and priority actions right as you upload.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">📊</div>
            <h3>Real-Time Analytics & Sync</h3>
            <p>Interactive progress meters and category breakdowns react immediately to live updates.</p>
          </div>
        </section>

        <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
      </div>
    );
  }

  // =========================================================
  // AUTHENTICATED APPLICATION
  // =========================================================

  return (
    <div className="app-layout flex flex-col md:flex-row min-h-screen w-full justify-start items-stretch">
      {/* Sidebar Navigation */}
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <div className="brand-logo">
            <span className="logo-icon">🧠</span>
            <span className="logo-text">MEMORA</span>
          </div>
          <span className="badge-pro">PRO</span>
        </div>

        {/* User Card in Sidebar */}
        <div className="sidebar-user-pill">
          <div className="user-avatar-circle">
            {(user?.full_name || user?.email || "U").charAt(0).toUpperCase()}
          </div>
          <div className="user-meta-truncate">
            <span className="user-name-text">{user?.full_name || "My Workspace"}</span>
            <span className="user-email-text">{user?.email}</span>
          </div>
        </div>

        <div className="nav-group-title">Main Workspace</div>
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
            <span>Documents Library</span>
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
            <span>Action Tasks</span>
            <span className="nav-link-count">
              {documents.filter((d) => d.action && d.action.trim()).length}
            </span>
          </button>

          <button
            type="button"
            className={`nav-link-btn ${activePage === "important" ? "active" : ""}`}
            onClick={() => {
              setActivePage("important");
              resetFilters();
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
        </nav>

        <div className="nav-group-title">Intelligence & Media</div>
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
            onClick={() => setShowLifeEvents(true)}
          >
            <span className="nav-link-icon">🎯</span>
            <span>Life Events</span>
          </button>

          <button
            type="button"
            className="nav-link-btn"
            onClick={() => setShowYoutubeModal(true)}
          >
            <span className="nav-link-icon">📺</span>
            <span>YouTube Knowledge</span>
          </button>

          <button
            type="button"
            className="nav-link-btn"
            onClick={() => setShowGraph(true)}
          >
            <span className="nav-link-icon">🕸️</span>
            <span>Memory Graph</span>
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
            style={{ width: "100%", justifyContent: "center", marginBottom: 8 }}
            onClick={enableNotifications}
          >
            🔔 Notifications
          </button>

          <button
            type="button"
            className="btn-logout-sidebar"
            onClick={handleLogout}
            title="Log out and switch account"
            id="sidebar-logout-btn"
          >
            🚪 Sign Out
          </button>
        </div>
      </aside>

      {/* Main App Content Area */}
      <main className="app-main flex-1 flex flex-col min-h-screen justify-start w-full min-w-0">
        {/* Topbar */}
        <header className="app-topbar">
          <div className="page-heading">
            <h1>
              {activePage === "dashboard" && "Dashboard"}
              {activePage === "documents" && "Document Library"}
              {activePage === "actions" && "What Do I Need To Do?"}
              {activePage === "important" && "Important Documents"}
              {activePage === "reminders" && "Scheduled Reminders"}
            </h1>
            <p>
              {activePage === "dashboard" && "Overview of memory, upcoming actions, and deadlines"}
              {activePage === "documents" && "Search, filter, and inspect stored files"}
              {activePage === "actions" && "Actionable items and task lifecycle"}
              {activePage === "important" && "Priority documents marked for quick access"}
              {activePage === "reminders" && "Active reminder schedule and alerts"}
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

            <div className="topbar-user-pill" title={`Signed in as ${user?.email || "User"}`}>
              <div className="topbar-user-avatar">
                {(user?.full_name || user?.email || "U").charAt(0).toUpperCase()}
              </div>
              <span className="topbar-user-label">
                {user?.is_demo ? "Demo Account" : user?.full_name || user?.email || "User"}
              </span>
            </div>

            <button
              type="button"
              className="btn-logout-topbar"
              onClick={handleLogout}
              title="Sign out of this session and switch accounts"
              id="topbar-logout-btn"
            >
              🚪 Sign Out
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
        <div className="app-content flex-1 flex flex-col justify-start w-full">
          {activePage === "dashboard" ? (
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
              onSelectCategory={(cat) => {
                setCategoryFilter(cat);
                setActivePage("documents");
              }}
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
                    <option value="">All Statuses</option>
                    <option value="No Action">No Action</option>
                    <option value="Pending">Pending</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>

                <div className="filter-checkboxes">
                  <label className="filter-checkbox-label">
                    <input
                      type="checkbox"
                      checked={importantOnly}
                      onChange={(e) => setImportantOnly(e.target.checked)}
                    />
                    <span>⭐ Important</span>
                  </label>

                  <label className="filter-checkbox-label">
                    <input
                      type="checkbox"
                      checked={overdueOnly}
                      onChange={(e) => setOverdueOnly(e.target.checked)}
                    />
                    <span>🔴 Overdue</span>
                  </label>

                  <label className="filter-checkbox-label">
                    <input
                      type="checkbox"
                      checked={expiryOnly}
                      onChange={(e) => setExpiryOnly(e.target.checked)}
                    />
                    <span>⏳ Expiring</span>
                  </label>

                  <label className="filter-checkbox-label">
                    <input
                      type="checkbox"
                      checked={reminderOnly}
                      onChange={(e) => setReminderOnly(e.target.checked)}
                    />
                    <span>⏰ Reminders</span>
                  </label>
                </div>

                {(categoryFilter || actionStatusFilter || importantOnly || overdueOnly || expiryOnly || reminderOnly || search) && (
                  <button type="button" className="btn-secondary btn-sm" onClick={resetFilters}>
                    Clear Filters ✕
                  </button>
                )}
              </div>

              {/* Documents Grid */}
              {loading ? (
                <div className="empty-panel">
                  <div className="auth-spinner" />
                  <p>Loading your documents...</p>
                </div>
              ) : filteredDocuments.length === 0 ? (
                <div className="empty-panel">
                  <span className="empty-icon">📂</span>
                  <h3>No documents found</h3>
                  <p>Try clearing your filters or upload a new life admin document to get started.</p>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ marginTop: "1rem" }}
                    onClick={() => {
                      setEditingDoc(null);
                      setShowUploadModal(true);
                    }}
                  >
                    + Add First Document
                  </button>
                </div>
              ) : (
                <div className="documents-grid">
                  {filteredDocuments.map((doc) => (
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
        authFetch={authFetch}
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
        authFetch={authFetch}
        apiBase={API}
      />

      <MemoryGraphModal
        isOpen={showGraph}
        onClose={() => setShowGraph(false)}
        onViewDoc={(doc) => setDetailDoc(doc)}
        authFetch={authFetch}
        apiBase={API}
      />

      <LifeEventsModal
        isOpen={showLifeEvents}
        onClose={() => setShowLifeEvents(false)}
        onOpenUploadWithTemplate={handleOpenUploadWithTemplate}
        authFetch={authFetch}
        apiBase={API}
      />

      <YoutubeLinksModal
        isOpen={showYoutubeModal}
        onClose={() => setShowYoutubeModal(false)}
        authFetch={authFetch}
        apiBase={API}
      />
    </div>
  );
}
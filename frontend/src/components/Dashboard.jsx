import React, { useState, useMemo } from "react";
import DocumentCard from "./DocumentCard";
import {
  computeNextBestAction,
  formatDate,
  getEffectiveActionItems,
  parseDateSafe,
} from "../utils/datetime";

export default function Dashboard({
  documents,
  _loading,
  onOpenUpload,
  onOpenDocuments,
  onViewDetails,
  onEdit,
  onDelete,
  onToggleStatus,
  onSelectCategory,
  apiBase,
}) {
  const [actionFilterTab, setActionFilterTab] = useState("All");

  // Shared single source of truth for action items across metrics & list
  const actionItems = useMemo(() => getEffectiveActionItems(documents), [documents]);

  // Summary Metrics - strictly synchronized with actionItems
  const metrics = useMemo(() => {
    const total = documents.length;
    const important = documents.filter((d) => d.is_important).length;
    const now = Date.now();
    const thirtyDays = now + 30 * 24 * 60 * 60 * 1000;

    const expiringSoon = documents.filter((d) => {
      if (!d.expiry_date) return false;
      const parsed = parseDateSafe(d.expiry_date);
      if (!parsed) return false;
      const t = parsed.getTime();
      return t >= now && t <= thirtyDays;
    }).length;

    const pendingActions = actionItems.filter((item) => !item.isCompleted).length;
    const overdue = actionItems.filter(
      (item) => !item.isCompleted && item.category === "Overdue"
    ).length;
    const completed = actionItems.filter((item) => item.isCompleted).length;

    return { total, important, expiringSoon, pendingActions, overdue, completed };
  }, [documents, actionItems]);

  // Reactive Analytics Data: Progress & Category Breakdown (strictly user-isolated)
  const analyticsData = useMemo(() => {
    const totalDocs = documents.length;
    const totalActions = actionItems.length;
    const completed = actionItems.filter((i) => i.isCompleted).length;
    const overdue = actionItems.filter((i) => !i.isCompleted && i.category === "Overdue").length;
    const dueToday = actionItems.filter((i) => !i.isCompleted && i.category === "Due Today").length;
    const pending = actionItems.filter(
      (i) => !i.isCompleted && i.category !== "Overdue" && i.category !== "Due Today"
    ).length;

    const completionRate = totalActions > 0 ? Math.round((completed / totalActions) * 100) : 0;

    const categoryConfig = [
      { key: "study", label: "College / Study", color: "#6366f1", icon: "🎓" },
      { key: "personal", label: "Personal", color: "#ec4899", icon: "👤" },
      { key: "finance", label: "Finance", color: "#10b981", icon: "💳" },
      { key: "health", label: "Medical / Health", color: "#ef4444", icon: "🩺" },
      { key: "work", label: "Work / Job", color: "#3b82f6", icon: "💼" },
      { key: "project", label: "Projects", color: "#8b5cf6", icon: "📁" },
      { key: "general", label: "General", color: "#f59e0b", icon: "📄" },
    ];

    const categoryBreakdown = categoryConfig.map((cat) => {
      const count = documents.filter((d) => d.category === cat.key).length;
      const pct = totalDocs > 0 ? Math.round((count / totalDocs) * 100) : 0;
      return { ...cat, count, pct };
    });

    return {
      totalDocs,
      totalActions,
      completed,
      overdue,
      dueToday,
      pending,
      completionRate,
      categoryBreakdown,
    };
  }, [documents, actionItems]);

  // Next Best Action (Feature 8)
  const nextAction = useMemo(() => computeNextBestAction(documents), [documents]);

  const filteredActionItems = useMemo(() => {
    if (actionFilterTab === "All") {
      return actionItems.filter((item) => !item.isCompleted);
    }
    if (actionFilterTab === "Completed") {
      return actionItems.filter((item) => item.isCompleted);
    }
    return actionItems.filter(
      (item) => !item.isCompleted && item.category === actionFilterTab
    );
  }, [actionItems, actionFilterTab]);

  function handleFilterTabChange(tab) {
    setActionFilterTab(tab);
    const el = document.getElementById("action-tasks-section");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  }

  // Upcoming deadlines (Feature 4 timeline)
  const upcomingDeadlines = useMemo(() => {
    return documents
      .filter((d) => d.expiry_date || d.remind_at)
      .map((d) => ({
        doc: d,
        date: d.expiry_date || d.remind_at,
        type: d.expiry_date ? "Expiry" : "Reminder",
      }))
      .sort((a, b) => {
        const da = parseDateSafe(a.date)?.getTime() || 0;
        const db = parseDateSafe(b.date)?.getTime() || 0;
        return da - db;
      })
      .slice(0, 5);
  }, [documents]);

  return (
    <div className="dashboard-view flex flex-col justify-start w-full">
      {/* Top Metric Cards */}
      <div className="metrics-grid">
        <div className="metric-card" onClick={onOpenDocuments} style={{ cursor: "pointer" }} title="View All Documents">
          <div className="metric-icon metric-icon-total">📁</div>
          <div className="metric-info">
            <span className="metric-label">Total Documents</span>
            <span className="metric-val">{metrics.total}</span>
          </div>
        </div>

        <div className="metric-card" onClick={onOpenDocuments} style={{ cursor: "pointer" }} title="View Important Documents">
          <div className="metric-icon metric-icon-important">⭐</div>
          <div className="metric-info">
            <span className="metric-label">Important</span>
            <span className="metric-val">{metrics.important}</span>
          </div>
        </div>

        <div
          className={`metric-card ${actionFilterTab === "Due Soon" ? "active metric-card-active" : ""}`}
          onClick={() => handleFilterTabChange("Due Soon")}
          style={{ cursor: "pointer" }}
          title="View Expiring / Due Soon Tasks"
        >
          <div className="metric-icon metric-icon-expiry">⏳</div>
          <div className="metric-info">
            <span className="metric-label">Expiring Soon</span>
            <span className="metric-val">{metrics.expiringSoon}</span>
          </div>
        </div>

        <div
          className={`metric-card ${actionFilterTab === "All" ? "active metric-card-active" : ""}`}
          onClick={() => handleFilterTabChange("All")}
          style={{ cursor: "pointer" }}
          title="Filter all Pending Tasks"
        >
          <div className="metric-icon metric-icon-pending">⚡</div>
          <div className="metric-info">
            <span className="metric-label">Pending Actions</span>
            <span className="metric-val">{metrics.pendingActions}</span>
          </div>
        </div>

        <div
          className={`metric-card ${actionFilterTab === "Overdue" ? "active metric-card-active" : ""}`}
          onClick={() => handleFilterTabChange("Overdue")}
          style={{ cursor: "pointer" }}
          title="Filter Overdue Tasks"
        >
          <div className="metric-icon metric-icon-overdue">🔴</div>
          <div className="metric-info">
            <span className="metric-label">Overdue</span>
            <span className="metric-val">{metrics.overdue}</span>
          </div>
        </div>

        <div
          className={`metric-card ${actionFilterTab === "Completed" ? "active metric-card-active" : ""}`}
          onClick={() => handleFilterTabChange("Completed")}
          style={{ cursor: "pointer" }}
          title="Filter Completed Tasks"
        >
          <div className="metric-icon metric-icon-completed">🟢</div>
          <div className="metric-info">
            <span className="metric-label">Completed</span>
            <span className="metric-val">{metrics.completed}</span>
          </div>
        </div>
      </div>

      {/* REACTIVE ANALYTICS SECTION: PROGRESS BARS & CATEGORY BREAKDOWN */}
      <section className="section-container analytics-section">
        <div className="section-header-flex">
          <div>
            <h2 className="section-title">📊 LIVE ANALYTICS & INSIGHTS</h2>
            <p className="section-subtitle">Real-time status breakdown and category distribution of your data</p>
          </div>
        </div>

        <div className="analytics-dual-grid">
          {/* Card 1: Action Completion Progress (Pending vs Completed) */}
          <div className="analytics-card">
            <div className="analytics-card-header">
              <div>
                <span className="analytics-card-title">Action Completion Rate</span>
                <span className="analytics-card-sub">
                  {analyticsData.completed} of {analyticsData.totalActions} tasks completed
                </span>
              </div>
              <span className="analytics-rate-badge">{analyticsData.completionRate}%</span>
            </div>

            {/* Segmented Progress Bar */}
            <div className="progress-bar-container" title={`${analyticsData.completionRate}% Completed`}>
              {analyticsData.totalActions === 0 ? (
                <div className="progress-bar-empty">No tracked action tasks yet</div>
              ) : (
                <div className="progress-bar-track">
                  <div
                    className="progress-segment segment-completed"
                    style={{
                      width: `${(analyticsData.completed / analyticsData.totalActions) * 100}%`,
                    }}
                    title={`Completed: ${analyticsData.completed}`}
                  />
                  <div
                    className="progress-segment segment-overdue"
                    style={{
                      width: `${(analyticsData.overdue / analyticsData.totalActions) * 100}%`,
                    }}
                    title={`Overdue: ${analyticsData.overdue}`}
                  />
                  <div
                    className="progress-segment segment-today"
                    style={{
                      width: `${(analyticsData.dueToday / analyticsData.totalActions) * 100}%`,
                    }}
                    title={`Due Today: ${analyticsData.dueToday}`}
                  />
                  <div
                    className="progress-segment segment-pending"
                    style={{
                      width: `${(analyticsData.pending / analyticsData.totalActions) * 100}%`,
                    }}
                    title={`Pending: ${analyticsData.pending}`}
                  />
                </div>
              )}
            </div>

            {/* Progress Legend with Counts */}
            <div className="progress-legend">
              <div
                className="legend-item"
                onClick={() => handleFilterTabChange("Completed")}
                style={{ cursor: "pointer" }}
              >
                <span className="legend-dot dot-completed" />
                <span className="legend-label">Completed</span>
                <span className="legend-count">{analyticsData.completed}</span>
              </div>
              <div
                className="legend-item"
                onClick={() => handleFilterTabChange("Overdue")}
                style={{ cursor: "pointer" }}
              >
                <span className="legend-dot dot-overdue" />
                <span className="legend-label">Overdue</span>
                <span className="legend-count">{analyticsData.overdue}</span>
              </div>
              <div
                className="legend-item"
                onClick={() => handleFilterTabChange("Due Today")}
                style={{ cursor: "pointer" }}
              >
                <span className="legend-dot dot-today" />
                <span className="legend-label">Due Today</span>
                <span className="legend-count">{analyticsData.dueToday}</span>
              </div>
              <div
                className="legend-item"
                onClick={() => handleFilterTabChange("All")}
                style={{ cursor: "pointer" }}
              >
                <span className="legend-dot dot-pending" />
                <span className="legend-label">Pending</span>
                <span className="legend-count">{analyticsData.pending}</span>
              </div>
            </div>
          </div>

          {/* Card 2: Category Breakdown Distribution */}
          <div className="analytics-card">
            <div className="analytics-card-header">
              <div>
                <span className="analytics-card-title">Category Breakdown</span>
                <span className="analytics-card-sub">Distribution of {analyticsData.totalDocs} documents</span>
              </div>
              <span className="analytics-count-badge">{analyticsData.totalDocs} Files</span>
            </div>

            <div className="category-bars-list">
              {analyticsData.categoryBreakdown.map((cat) => (
                <div
                  key={cat.key}
                  className="cat-bar-row"
                  onClick={() => onSelectCategory && onSelectCategory(cat.key)}
                  style={{ cursor: "pointer" }}
                  title={`Filter by ${cat.label} (${cat.count} files)`}
                >
                  <div className="cat-bar-meta">
                    <span className="cat-bar-label">
                      {cat.icon} {cat.label}
                    </span>
                    <span className="cat-bar-count">
                      {cat.count} ({cat.pct}%)
                    </span>
                  </div>
                  <div className="cat-bar-track">
                    <div
                      className="cat-bar-fill"
                      style={{
                        width: `${Math.max(cat.pct, cat.count > 0 ? 5 : 0)}%`,
                        backgroundColor: cat.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FEATURE 8: WHAT SHOULD I DO NEXT? */}
      {nextAction && (
        <section className="section-container next-action-section">
          <div className="section-badge-header">
            <span className="hero-tag">FEATURED RECOMMENDATION</span>
            <span className="priority-pill priority-high">
              Priority: {nextAction.priorityLevel}
            </span>
          </div>

          <div className="next-action-card">
            <div className="next-action-main">
              <h2 className="next-action-title">WHAT SHOULD I DO NEXT?</h2>
              <div className="next-action-task">{nextAction.action}</div>
              <div className="next-action-source">
                Source Document: <strong>{nextAction.doc.title}</strong> ({nextAction.doc.file_name})
              </div>

              <div className="next-action-reasons">
                <span className="reasons-heading">Why this is next:</span>
                <ul>
                  {nextAction.reasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="next-action-actions">
              <button
                type="button"
                className="btn-hero-complete"
                onClick={() => onToggleStatus(nextAction.doc, "Completed")}
              >
                ✓ Mark Completed
              </button>
              <button
                type="button"
                className="btn-hero-view"
                onClick={() => onViewDetails(nextAction.doc)}
              >
                Inspect Document Details
              </button>
            </div>
          </div>
        </section>
      )}

      {/* FEATURE 3 & 4: WHAT DO I NEED TO DO? */}
      <section className="section-container" id="action-tasks-section">
        <div className="section-header-flex">
          <div>
            <h2 className="section-title">WHAT DO I NEED TO DO?</h2>
            <p className="section-subtitle">
              Actionable tasks extracted from your stored documents
            </p>
          </div>

          {/* Action category filter pills with live counts */}
          <div className="action-tabs">
            {["All", "Overdue", "Due Today", "Due Soon", "Upcoming", "Completed"].map((tab) => {
              const count =
                tab === "All"
                  ? actionItems.filter((i) => !i.isCompleted).length
                  : tab === "Completed"
                  ? actionItems.filter((i) => i.isCompleted).length
                  : actionItems.filter((i) => !i.isCompleted && i.category === tab).length;

              return (
                <button
                  key={tab}
                  type="button"
                  className={`tab-pill ${actionFilterTab === tab ? "active" : ""}`}
                  onClick={() => setActionFilterTab(tab)}
                >
                  {tab === "Overdue" && "🔴 "}
                  {tab === "Due Today" && "🟡 "}
                  {tab === "Due Soon" && "🟠 "}
                  {tab === "Upcoming" && "🔵 "}
                  {tab === "Completed" && "🟢 "}
                  {tab}
                  {count > 0 && (
                    <span
                      className="tab-pill-count"
                      style={{
                        marginLeft: "6px",
                        padding: "1px 6px",
                        fontSize: "0.75rem",
                        borderRadius: "10px",
                        background: actionFilterTab === tab ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.1)",
                      }}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {filteredActionItems.length === 0 ? (
          <div className="empty-panel">
            <span className="empty-icon">🎉</span>
            <p>No tasks found in "{actionFilterTab}". All caught up!</p>
          </div>
        ) : (
          <div className="action-items-list">
            {filteredActionItems.map(({ doc, category, actionText, isCompleted, isGenerated }) => {
              const isDone = isCompleted;
              const displayText = actionText || doc.action || "Review expired document";
              return (
                <div
                  key={doc.id}
                  className={`action-item-row ${isDone ? "action-row-done" : ""}`}
                  onClick={() => onViewDetails(doc)}
                >
                  <div className="action-item-left">
                    <button
                      type="button"
                      className={`check-btn ${isDone ? "check-btn-checked" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleStatus(doc, isDone ? "Pending" : "Completed");
                      }}
                      title={isDone ? "Mark Pending" : "Mark Complete"}
                    >
                      {isDone ? "✓" : ""}
                    </button>

                    <div className="action-item-details">
                      <div className="action-item-title">
                        {displayText}
                        {isGenerated && (
                          <span
                            style={{
                              marginLeft: "8px",
                              fontSize: "0.72rem",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              background: "rgba(239, 68, 68, 0.15)",
                              color: "var(--color-danger, #ef4444)",
                              fontWeight: 600,
                            }}
                          >
                            Expired
                          </span>
                        )}
                      </div>
                      <div className="action-item-meta">
                        Source: <span className="doc-source-link">{doc.title}</span> ({doc.file_name})
                        {doc.expiry_date && (
                          <span style={{ marginLeft: "8px", color: category === "Overdue" ? "var(--color-danger, #ef4444)" : "inherit" }}>
                            • {category === "Overdue" ? "Expired" : "Expires"}: {formatDate(doc.expiry_date)}
                          </span>
                        )}
                        {doc.action_due_date && (
                          <span style={{ marginLeft: "8px" }}>
                            • Due: {formatDate(doc.action_due_date)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="action-item-right">
                    <span className={`timing-badge timing-${category.toLowerCase().replace(/\s+/g, "-")}`}>
                      {category}
                    </span>
                    <span className={`badge badge-status ${isDone ? "badge-completed" : "badge-pending"}`}>
                      {isDone ? "Completed" : doc.action_status === "In Progress" ? "In Progress" : "Pending"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* UPCOMING DEADLINES & RECENT DOCUMENTS */}
      <div className="dashboard-dual-grid">
        {/* Upcoming Deadlines */}
        <section className="section-container">
          <h2 className="section-title">UPCOMING DEADLINES</h2>
          <p className="section-subtitle">Key dates and reminder alerts</p>

          {upcomingDeadlines.length === 0 ? (
            <div className="empty-panel-compact">No upcoming deadlines tracked.</div>
          ) : (
            <div className="deadlines-list">
              {upcomingDeadlines.map(({ doc, date, type }, idx) => (
                <div
                  key={idx}
                  className="deadline-item"
                  onClick={() => onViewDetails(doc)}
                >
                  <div className="deadline-date-box">
                    <span className="deadline-day">
                      {new Date(date).getDate()}
                    </span>
                    <span className="deadline-month">
                      {new Date(date).toLocaleString("default", { month: "short" })}
                    </span>
                  </div>
                  <div className="deadline-info">
                    <div className="deadline-title">{doc.title}</div>
                    <div className="deadline-tag">{type} • {doc.category}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent Documents */}
        <section className="section-container">
          <div className="section-header-flex">
            <div>
              <h2 className="section-title">RECENT DOCUMENTS</h2>
              <p className="section-subtitle">Latest additions to your memory</p>
            </div>
            <button type="button" className="btn-link" onClick={onOpenDocuments}>
              View All →
            </button>
          </div>

          {documents.length === 0 ? (
            <div className="empty-panel-compact">
              <p>No documents yet.</p>
              {onOpenUpload && (
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  onClick={onOpenUpload}
                  style={{ marginTop: "0.5rem" }}
                >
                  + Add Document
                </button>
              )}
            </div>
          ) : (
            <div className="recent-docs-grid">
              {documents.slice(0, 4).map((doc) => (
                <DocumentCard
                  key={doc.id}
                  doc={doc}
                  onDelete={onDelete}
                  onEdit={onEdit}
                  onViewDetails={onViewDetails}
                  onToggleStatus={onToggleStatus}
                  apiBase={apiBase}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

import React from "react";
import { formatDate, formatFileSize, getActionDeadlineCategory } from "../utils/datetime";

const categoryIcons = {
  study: "🎓",
  personal: "👤",
  finance: "💳",
  health: "🩺",
  work: "💼",
  project: "📁",
  general: "📄",
};

export default function DocumentCard({
  doc,
  onDelete,
  onEdit,
  onViewDetails,
  onToggleStatus,
  apiBase,
}) {
  const icon = categoryIcons[doc.category] || "📄";
  const deadlineCat = getActionDeadlineCategory(doc);

  const isCompleted = (doc.action_status || "").toUpperCase() === "COMPLETED";
  const hasAction = Boolean(doc.action && doc.action.trim());
  const isOverdueExpired = !hasAction && !isCompleted && deadlineCat === "Overdue";
  const displayAction = hasAction ? doc.action : isOverdueExpired ? "Review expired document" : null;

  return (
    <div className={`document-card ${isCompleted ? "completed-card" : ""} ${doc.is_important ? "important-card" : ""}`}>
      <div className="card-top">
        <div className="doc-category-badge">
          <span className="cat-icon">{icon}</span>
          <span className="cat-label">{doc.category}</span>
        </div>

        <div className="card-flags">
          {doc.is_important && (
            <span className="badge badge-important" title="Marked as Important">
              ⭐ Important
            </span>
          )}
          {displayAction && (
            <span
              className={`badge badge-status ${
                isCompleted
                  ? "badge-completed"
                  : doc.action_status === "In Progress"
                  ? "badge-progress"
                  : "badge-pending"
              }`}
            >
              {isCompleted ? "Completed" : doc.action_status === "In Progress" ? "In Progress" : "Pending"}
            </span>
          )}
        </div>
      </div>

      <div
        className="card-main-clickable"
        onClick={() => onViewDetails(doc)}
        role="button"
        tabIndex={0}
        title="Click to view full details"
      >
        <h3 className="doc-title">{doc.title}</h3>
        <p className="doc-description">
          {doc.description || "No description provided."}
        </p>

        {displayAction && (
          <div className={`action-box ${isCompleted ? "action-box-completed" : ""}`}>
            <div className="action-header">
              <span className="action-tag">ACTION REQUIRED</span>
              <span className={`timing-badge timing-${deadlineCat.toLowerCase().replace(/\s+/g, "-")}`}>
                {deadlineCat}
              </span>
            </div>
            <p className="action-text">{displayAction}</p>
            {doc.action_due_date ? (
              <div className="action-due">Due: {formatDate(doc.action_due_date)}</div>
            ) : doc.expiry_date ? (
              <div className="action-due">
                {deadlineCat === "Overdue" ? "Expired: " : "Expires: "}
                {formatDate(doc.expiry_date)}
              </div>
            ) : null}
          </div>
        )}

        <div className="card-meta-list">
          <div className="meta-item">
            <span className="meta-label">File:</span>
            <span className="meta-val truncate" title={doc.file_name}>
              {doc.file_name} ({formatFileSize(doc.file_size)})
            </span>
          </div>

          {doc.document_date && (
            <div className="meta-item">
              <span className="meta-label">Date:</span>
              <span className="meta-val">{formatDate(doc.document_date)}</span>
            </div>
          )}

          {doc.expiry_date && (
            <div className="meta-item">
              <span className="meta-label">Expiry:</span>
              <span className={`meta-val ${deadlineCat === "Overdue" ? "text-danger" : ""}`}>
                {formatDate(doc.expiry_date)}
              </span>
            </div>
          )}

          {doc.remind_at && (
            <div className="meta-item">
              <span className="meta-label">Reminder:</span>
              <span className="meta-val text-accent">
                ⏰ {formatDate(doc.remind_at)} {new Date(doc.remind_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="card-actions">
        {hasAction && (
          <button
            type="button"
            className={`btn-action-toggle ${isCompleted ? "btn-undo" : "btn-complete"}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleStatus(doc, isCompleted ? "Pending" : "Completed");
            }}
            title={isCompleted ? "Mark as Pending" : "Mark as Completed"}
          >
            {isCompleted ? "↩ Reopen" : "✓ Done"}
          </button>
        )}

        <button
          type="button"
          className="btn-card"
          onClick={(e) => {
            e.stopPropagation();
            window.open(`${apiBase}/documents/${doc.id}/file`, "_blank");
          }}
          title="Open original uploaded file in new tab"
        >
          View
        </button>

        <button
          type="button"
          className="btn-card"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(doc);
          }}
          title="Edit document"
        >
          Edit
        </button>

        <button
          type="button"
          className="btn-card btn-card-danger"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(doc.id);
          }}
          title="Delete document"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

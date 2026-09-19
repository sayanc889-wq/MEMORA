import React from "react";
import { formatDate, formatDateTime, formatFileSize, getActionDeadlineCategory } from "../utils/datetime";

export default function DocumentDetailModal({
  doc,
  onClose,
  onEdit,
  onDelete,
  onToggleStatus,
  apiBase,
}) {
  if (!doc) return null;

  const isCompleted = (doc.action_status || "").toUpperCase() === "COMPLETED";
  const hasAction = Boolean(doc.action && doc.action.trim());
  const deadlineCat = getActionDeadlineCategory(doc);
  const isOverdueExpired = !hasAction && !isCompleted && deadlineCat === "Overdue";
  const displayAction = hasAction ? doc.action : isOverdueExpired ? "Review expired document" : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-detail" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="header-left">
            <span className="badge badge-category">{doc.category}</span>
            {doc.is_important && <span className="badge badge-important">⭐ Important</span>}
            {displayAction && (
              <span className={`badge badge-status ${isCompleted ? "badge-completed" : "badge-pending"}`}>
                {isCompleted ? "Completed" : doc.action_status === "In Progress" ? "In Progress" : "Pending"}
              </span>
            )}
          </div>
          <button type="button" className="btn-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="detail-body">
          <h2 className="detail-title">{doc.title}</h2>
          <p className="detail-description">
            {doc.description || "No description provided."}
          </p>

          {displayAction && (
            <div className={`detail-action-card ${isCompleted ? "action-box-completed" : ""}`}>
              <div className="action-header">
                <span className="action-tag">ACTION / TASK</span>
                <span className={`timing-badge timing-${deadlineCat.toLowerCase().replace(/\s+/g, "-")}`}>
                  {deadlineCat}
                </span>
              </div>
              <div className="detail-action-text">{displayAction}</div>
              {doc.action_due_date ? (
                <div className="detail-action-meta">
                  Due: <strong>{formatDate(doc.action_due_date)}</strong>
                </div>
              ) : doc.expiry_date ? (
                <div className="detail-action-meta">
                  {deadlineCat === "Overdue" ? "Expired: " : "Expires: "}
                  <strong>{formatDate(doc.expiry_date)}</strong>
                </div>
              ) : null}
            </div>
          )}

          <div className="detail-grid">
            <div className="detail-cell">
              <span className="cell-label">File Name</span>
              <span className="cell-val truncate" title={doc.file_name}>{doc.file_name}</span>
            </div>
            <div className="detail-cell">
              <span className="cell-label">File Size</span>
              <span className="cell-val">{formatFileSize(doc.file_size)}</span>
            </div>
            <div className="detail-cell">
              <span className="cell-label">Document Date</span>
              <span className="cell-val">{formatDate(doc.document_date)}</span>
            </div>
            <div className="detail-cell">
              <span className="cell-label">Expiry Date</span>
              <span className={`cell-val ${deadlineCat === "Overdue" ? "text-danger" : ""}`}>
                {doc.expiry_date ? formatDate(doc.expiry_date) : "No expiry date"}
              </span>
            </div>
            <div className="detail-cell">
              <span className="cell-label">Reminder</span>
              <span className="cell-val text-accent">
                {doc.remind_at ? formatDateTime(doc.remind_at) : "No reminder scheduled"}
              </span>
            </div>
            <div className="detail-cell">
              <span className="cell-label">Action Status</span>
              <span className="cell-val">{doc.action_status || "No Action"}</span>
            </div>
            <div className="detail-cell">
              <span className="cell-label">Created At</span>
              <span className="cell-val">{formatDateTime(doc.created_at)}</span>
            </div>
            <div className="detail-cell">
              <span className="cell-label">Last Updated</span>
              <span className="cell-val">{formatDateTime(doc.updated_at)}</span>
            </div>
          </div>
        </div>

        <div className="modal-footer detail-actions">
          {hasAction && (
            <button
              type="button"
              className={`btn-modal ${isCompleted ? "btn-secondary" : "btn-primary"}`}
              onClick={() => {
                onToggleStatus(doc, isCompleted ? "Pending" : "Completed");
                onClose();
              }}
            >
              {isCompleted ? "Mark Pending" : "✓ Mark Complete"}
            </button>
          )}

          <button
            type="button"
            className="btn-modal btn-primary"
            onClick={() => window.open(`${apiBase}/documents/${doc.id}/file`, "_blank")}
          >
            View File
          </button>

          <button
            type="button"
            className="btn-modal btn-secondary"
            onClick={() => {
              onClose();
              onEdit(doc);
            }}
          >
            Edit
          </button>

          <button
            type="button"
            className="btn-modal btn-danger"
            onClick={() => {
              onClose();
              onDelete(doc.id);
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

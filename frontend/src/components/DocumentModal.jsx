import React, { useState, useEffect } from "react";
import { toLocalDatetimeInputString } from "../utils/datetime";

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
  general: "General / Other",
};

export default function DocumentModal({
  isOpen,
  onClose,
  onSubmit,
  editingDoc,
  apiBase,
}) {
  const [form, setForm] = useState({
    title: "",
    category: "study",
    description: "",
    document_date: "",
    expiry_date: "",
    remind_at: "",
    action: "",
    action_status: "No Action",
    action_due_date: "",
    is_important: false,
    file: null,
  });

  const [suggesting, setSuggesting] = useState(false);
  const [suggestionNote, setSuggestionNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (editingDoc) {
      setForm({
        title: editingDoc.title || "",
        category: editingDoc.category || "general",
        description: editingDoc.description || "",
        document_date: toLocalDatetimeInputString(editingDoc.document_date),
        expiry_date: toLocalDatetimeInputString(editingDoc.expiry_date),
        remind_at: toLocalDatetimeInputString(editingDoc.remind_at),
        action: editingDoc.action || "",
        action_status: editingDoc.action_status || (editingDoc.action ? "Pending" : "No Action"),
        action_due_date: toLocalDatetimeInputString(editingDoc.action_due_date),
        is_important: Boolean(editingDoc.is_important),
        file: null,
      });
      setSuggestionNote("");
      setFormError("");
    } else {
      setForm({
        title: "",
        category: "study",
        description: "",
        document_date: "",
        expiry_date: "",
        remind_at: "",
        action: "",
        action_status: "No Action",
        action_due_date: "",
        is_important: false,
        file: null,
      });
      setSuggestionNote("");
      setFormError("");
    }
  }, [editingDoc, isOpen]);

  if (!isOpen) return null;

  async function handleSuggestAction() {
    if (!form.title.trim()) {
      setSuggestionNote("Enter a document title first so MEMORA can understand what action to suggest.");
      return;
    }
    try {
      setSuggesting(true);
      setSuggestionNote("");
      const res = await fetch(`${apiBase}/documents/suggest-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          category: form.category,
          file_name: form.file ? form.file.name : editingDoc?.file_name,
          description: form.description,
        }),
      });
      if (!res.ok) throw new Error("Could not fetch suggestion");
      const data = await res.json();
      if (data.suggested_action) {
        setForm((prev) => ({
          ...prev,
          action: data.suggested_action,
          action_status: prev.action_status === "No Action" ? "Pending" : prev.action_status,
        }));
        setSuggestionNote(`Suggested Action applied: "${data.reason}". You can edit it below.`);
      }
    } catch (err) {
      console.error(err);
      setSuggestionNote("Could not generate a suggestion right now.");
    } finally {
      setSuggesting(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError("");

    if (!editingDoc && !form.file) {
      setFormError("Please select a file to upload.");
      return;
    }

    try {
      setSubmitting(true);
      await onSubmit(form, editingDoc);
      onClose();
    } catch (err) {
      setFormError(err.message || "Failed to save document.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-form" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{editingDoc ? "Edit Document" : "Add New Document"}</h2>
          <button type="button" className="btn-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {formError && <div className="form-alert form-alert-error">{formError}</div>}

        <form onSubmit={handleSubmit} className="doc-form">
          <div className="form-grid">
            {/* Title */}
            <div className="form-field col-span-2">
              <label htmlFor="doc-title">Document Title *</label>
              <input
                id="doc-title"
                type="text"
                required
                placeholder="e.g. Car Insurance Policy, Semester 5 Marksheet"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>

            {/* Category */}
            <div className="form-field">
              <label htmlFor="doc-category">Category *</label>
              <select
                id="doc-category"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {categoryDisplayNames[cat] || cat}
                  </option>
                ))}
              </select>
            </div>

            {/* File Upload */}
            <div className="form-field">
              <label htmlFor="doc-file">
                {editingDoc ? "Replace File (optional)" : "Select File *"}
              </label>
              <input
                id="doc-file"
                type="file"
                required={!editingDoc}
                onChange={(e) => setForm({ ...form, file: e.target.files[0] || null })}
              />
              {editingDoc && !form.file && (
                <small className="field-hint">Current file: {editingDoc.file_name}</small>
              )}
            </div>

            {/* Action Field with Smart Suggestion */}
            <div className="form-field col-span-2 action-field-box">
              <div className="action-label-row">
                <label htmlFor="doc-action">Action / Next Task (Optional)</label>
                <button
                  type="button"
                  className="btn-suggest"
                  onClick={handleSuggestAction}
                  disabled={suggesting}
                >
                  {suggesting ? "Thinking..." : "💡 Suggest Action"}
                </button>
              </div>
              <input
                id="doc-action"
                type="text"
                placeholder="e.g. Renew car insurance before expiry, Submit semester form"
                value={form.action}
                onChange={(e) => {
                  const val = e.target.value;
                  setForm({
                    ...form,
                    action: val,
                    action_status: val.trim() && form.action_status === "No Action" ? "Pending" : form.action_status,
                  });
                }}
              />
              {suggestionNote && <div className="suggestion-pill">{suggestionNote}</div>}
            </div>

            {/* Action Status & Action Due Date */}
            {form.action && form.action.trim() && (
              <>
                <div className="form-field">
                  <label htmlFor="doc-action-status">Action Status</label>
                  <select
                    id="doc-action-status"
                    value={form.action_status}
                    onChange={(e) => setForm({ ...form, action_status: e.target.value })}
                  >
                    <option value="Pending">Pending</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Completed">Completed</option>
                    <option value="No Action">No Action</option>
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="doc-action-due">Action Due Date</label>
                  <input
                    id="doc-action-due"
                    type="datetime-local"
                    value={form.action_due_date}
                    onChange={(e) => setForm({ ...form, action_due_date: e.target.value })}
                  />
                </div>
              </>
            )}

            {/* Dates: Document Date, Expiry Date, Reminder */}
            <div className="form-field">
              <label htmlFor="doc-date">Document Date</label>
              <input
                id="doc-date"
                type="datetime-local"
                value={form.document_date}
                onChange={(e) => setForm({ ...form, document_date: e.target.value })}
              />
            </div>

            <div className="form-field">
              <label htmlFor="doc-expiry">Expiry Date</label>
              <input
                id="doc-expiry"
                type="datetime-local"
                value={form.expiry_date}
                onChange={(e) => setForm({ ...form, expiry_date: e.target.value })}
              />
            </div>

            <div className="form-field col-span-2">
              <label htmlFor="doc-remind">
                Reminder Time (Local Browser Time) ⏰
              </label>
              <input
                id="doc-remind"
                type="datetime-local"
                value={form.remind_at}
                onChange={(e) => setForm({ ...form, remind_at: e.target.value })}
              />
              <small className="field-hint">
                Triggers browser notification at your exact local scheduled time.
              </small>
            </div>

            {/* Description */}
            <div className="form-field col-span-2">
              <label htmlFor="doc-desc">Description</label>
              <textarea
                id="doc-desc"
                rows="2"
                placeholder="Key details, notes, reference numbers..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            {/* Important Checkbox */}
            <div className="form-field col-span-2 checkbox-field">
              <label className="checkbox-container">
                <input
                  type="checkbox"
                  checked={form.is_important}
                  onChange={(e) => setForm({ ...form, is_important: e.target.checked })}
                />
                <span className="checkbox-text">⭐ Mark as Important Document</span>
              </label>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-modal btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-modal btn-primary" disabled={submitting}>
              {submitting ? "Saving..." : editingDoc ? "Save Changes" : "Upload Document"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

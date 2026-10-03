import React, { useEffect, useState } from "react";
import { formatDate } from "../utils/datetime";

const CATEGORIES = ["all", "study", "work", "personal", "finance", "health", "project", "general"];

function getYoutubeVideoId(url) {
  if (!url) return null;
  try {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return match && match[2].length === 11 ? match[2] : null;
  } catch {
    return null;
  }
}

export default function YoutubeLinksModal({ isOpen, onClose, authFetch, apiBase }) {
  const [links, setLinks] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    url: "",
    category: "study",
    channel_name: "",
    notes: "",
  });

  useEffect(() => {
    if (isOpen) {
      loadLinks();
    }
  }, [isOpen, categoryFilter]);

  async function loadLinks() {
    setLoading(true);
    try {
      const url = `${apiBase}/youtube-links${categoryFilter !== "all" ? `?category=${categoryFilter}` : ""}`;
      const res = await (authFetch ? authFetch(url) : fetch(url));
      if (res.ok) {
        const data = await res.json();
        setLinks(data);
      }
    } catch (err) {
      console.error("Error loading YouTube links:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    try {
      const res = await (authFetch
        ? authFetch(`${apiBase}/youtube-links`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(formData),
          })
        : fetch(`${apiBase}/youtube-links`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(formData),
          }));

      if (res.ok) {
        setFormData({ title: "", url: "", category: "study", channel_name: "", notes: "" });
        setShowAddForm(false);
        await loadLinks();
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Remove this YouTube link?")) return;
    try {
      const res = await (authFetch
        ? authFetch(`${apiBase}/youtube-links/${id}`, { method: "DELETE" })
        : fetch(`${apiBase}/youtube-links/${id}`, { method: "DELETE" }));
      if (res.ok || res.status === 204) {
        setLinks((prev) => prev.filter((l) => l.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-youtube" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>📺 Saved YouTube Knowledge & Lectures</h2>
            <p className="bot-sub">Bookmark educational videos, lectures, and tutorials with user isolation</p>
          </div>
          <button type="button" className="btn-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Action & Filter Bar */}
        <div className="youtube-top-bar">
          <div className="youtube-filter-pills">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`tab-pill ${categoryFilter === cat ? "active" : ""}`}
                onClick={() => setCategoryFilter(cat)}
              >
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="btn-primary btn-sm"
            onClick={() => setShowAddForm(!showAddForm)}
          >
            {showAddForm ? "✕ Cancel" : "+ Save New Video"}
          </button>
        </div>

        {/* Add Form */}
        {showAddForm && (
          <form className="add-youtube-form" onSubmit={handleCreate}>
            <div className="form-grid">
              <div className="form-field">
                <label>Video Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. FastAPI Complete Production Masterclass"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>

              <div className="form-field">
                <label>YouTube URL *</label>
                <input
                  type="url"
                  required
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                />
              </div>

              <div className="form-field">
                <label>Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                >
                  <option value="study">Study / Academic</option>
                  <option value="work">Work / Career</option>
                  <option value="finance">Finance / Investing</option>
                  <option value="health">Health & Fitness</option>
                  <option value="project">Project / Tutorial</option>
                  <option value="personal">Personal</option>
                  <option value="general">General</option>
                </select>
              </div>

              <div className="form-field">
                <label>Channel / Creator (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. freeCodeCamp"
                  value={formData.channel_name}
                  onChange={(e) => setFormData({ ...formData, channel_name: e.target.value })}
                />
              </div>

              <div className="form-field full-width">
                <label>Key Takeaways / Notes</label>
                <input
                  type="text"
                  placeholder="Timestamps, summary notes, or why you saved this..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>
            </div>

            <button type="submit" className="btn-primary btn-sm" style={{ marginTop: 12 }}>
              Save to Library
            </button>
          </form>
        )}

        {/* Links Grid */}
        <div className="youtube-links-grid">
          {loading ? (
            <div className="empty-panel-compact">Loading your saved videos...</div>
          ) : links.length === 0 ? (
            <div className="empty-panel-compact">
              No YouTube links saved under "{categoryFilter}". Click "+ Save New Video" to bookmark lectures and guides!
            </div>
          ) : (
            links.map((link) => {
              const videoId = getYoutubeVideoId(link.url);
              const thumbUrl = videoId
                ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
                : null;

              return (
                <div key={link.id} className="youtube-card">
                  {thumbUrl ? (
                    <div
                      className="youtube-thumb-wrap"
                      onClick={() => window.open(link.url, "_blank")}
                      title="Open on YouTube"
                    >
                      <img src={thumbUrl} alt={link.title} className="youtube-thumb" />
                      <div className="play-icon-overlay">▶</div>
                    </div>
                  ) : (
                    <div
                      className="youtube-thumb-fallback"
                      onClick={() => window.open(link.url, "_blank")}
                    >
                      ▶ Open Video
                    </div>
                  )}

                  <div className="youtube-card-body">
                    <div className="youtube-card-cat">
                      <span className="cat-tag">{link.category}</span>
                      {link.channel_name && <span className="channel-tag">👤 {link.channel_name}</span>}
                    </div>

                    <h4 className="youtube-title" onClick={() => window.open(link.url, "_blank")}>
                      {link.title}
                    </h4>

                    {link.notes && <p className="youtube-notes">{link.notes}</p>}

                    <div className="youtube-card-footer">
                      <small className="date-added">Added {formatDate(link.created_at)}</small>
                      <div className="youtube-btn-row">
                        <button
                          type="button"
                          className="btn-card btn-sm"
                          onClick={() => window.open(link.url, "_blank")}
                        >
                          Watch ↗
                        </button>
                        <button
                          type="button"
                          className="btn-card btn-card-danger btn-sm"
                          onClick={() => handleDelete(link.id)}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useState } from "react";
import { formatDate } from "../utils/datetime";

const EVENT_TEMPLATES = [
  { type: "Exam", icon: "📝", title: "Semester Final Exam", defaultAction: "Verify admit card and exam schedule" },
  { type: "Scholarship", icon: "🎓", title: "Scholarship Application", defaultAction: "Submit marksheet and family income certificate" },
  { type: "Insurance Renewal", icon: "🛡️", title: "Car/Health Insurance Renewal", defaultAction: "Compare quotes and renew policy before lapse" },
  { type: "Passport Renewal", icon: "🛂", title: "Passport Renewal Process", defaultAction: "Schedule appointment and submit current passport" },
  { type: "License Renewal", icon: "🚗", title: "Driver License Renewal", defaultAction: "Apply for DL renewal online" },
  { type: "Tax Document", icon: "📊", title: "Annual Tax Filing", defaultAction: "Collect Form 16/tax slips and file returns" },
  { type: "Medical Report", icon: "🩺", title: "Routine Health Checkup", defaultAction: "Schedule follow-up review with physician" },
];

export default function LifeEventsModal({
  isOpen,
  onClose,
  onOpenUploadWithTemplate,
  apiBase,
}) {
  const [events, setEvents] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newEvent, setNewEvent] = useState({
    title: "",
    event_type: "Exam",
    target_date: "",
    description: "",
  });

  useEffect(() => {
    if (!isOpen) return;
    async function fetchEvents() {
      try {
        const res = await fetch(`${apiBase}/life-events`);
        if (res.ok) {
          const data = await res.json();
          setEvents(data);
        }
      } catch (err) {
        console.error(err);
      }
    }
    fetchEvents();
  }, [isOpen, apiBase]);

  async function loadEvents() {
    try {
      const res = await fetch(`${apiBase}/life-events`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleCreateEvent(e) {
    e.preventDefault();
    try {
      const res = await fetch(`${apiBase}/life-events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newEvent.title,
          event_type: newEvent.event_type,
          description: newEvent.description,
          target_date: newEvent.target_date ? `${newEvent.target_date}:00` : null,
          status: "Active",
        }),
      });
      if (res.ok) {
        setNewEvent({ title: "", event_type: "Exam", target_date: "", description: "" });
        setShowAdd(false);
        await loadEvents();
      }
    } catch (err) {
      console.error(err);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-events" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Smart Life Events Tracker</h2>
            <p className="bot-sub">Connect Documents, Actions, Deadlines, and Reminders to Life Milestones</p>
          </div>
          <button type="button" className="btn-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Action Bar */}
        <div className="events-action-bar">
          <button
            type="button"
            className="btn-primary btn-sm"
            onClick={() => setShowAdd(!showAdd)}
          >
            {showAdd ? "✕ Cancel" : "+ Create New Life Event"}
          </button>
        </div>

        {/* Add Event Form */}
        {showAdd && (
          <form className="add-event-form" onSubmit={handleCreateEvent}>
            <div className="form-grid">
              <div className="form-field">
                <label>Event Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 2026 Vehicle Insurance Renewal"
                  value={newEvent.title}
                  onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                />
              </div>
              <div className="form-field">
                <label>Event Type</label>
                <select
                  value={newEvent.event_type}
                  onChange={(e) => setNewEvent({ ...newEvent, event_type: e.target.value })}
                >
                  {EVENT_TEMPLATES.map((t) => (
                    <option key={t.type} value={t.type}>
                      {t.icon} {t.type}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Target Date</label>
                <input
                  type="datetime-local"
                  value={newEvent.target_date}
                  onChange={(e) => setNewEvent({ ...newEvent, target_date: e.target.value })}
                />
              </div>
              <div className="form-field">
                <label>Description / Notes</label>
                <input
                  type="text"
                  placeholder="Notes, policy number, deadlines..."
                  value={newEvent.description}
                  onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                />
              </div>
            </div>
            <button type="submit" className="btn-primary btn-sm" style={{ marginTop: 10 }}>
              Save Event
            </button>
          </form>
        )}

        {/* Event Templates */}
        <div className="events-template-section">
          <h3>Quick Life Admin Templates</h3>
          <p className="section-subtitle">Click a template to attach a document and action:</p>
          <div className="templates-grid">
            {EVENT_TEMPLATES.map((tmpl) => (
              <div
                key={tmpl.type}
                className="template-card"
                onClick={() => {
                  onClose();
                  onOpenUploadWithTemplate({
                    title: tmpl.title,
                    action: tmpl.defaultAction,
                  });
                }}
              >
                <div className="tmpl-icon">{tmpl.icon}</div>
                <div className="tmpl-title">{tmpl.type}</div>
                <div className="tmpl-action">{tmpl.defaultAction}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Active Tracked Events */}
        <div className="active-events-section">
          <h3>Your Tracked Life Events ({events.length})</h3>
          {events.length === 0 ? (
            <div className="empty-panel-compact">
              No custom life events registered yet. Use a quick template above or create one!
            </div>
          ) : (
            <div className="events-list">
              {events.map((ev) => (
                <div key={ev.id} className="event-row">
                  <div className="event-type-badge">{ev.event_type}</div>
                  <div className="event-info">
                    <h4>{ev.title}</h4>
                    {ev.description && <p>{ev.description}</p>}
                    {ev.target_date && <small>Target: {formatDate(ev.target_date)}</small>}
                  </div>
                  <span className="badge badge-status badge-progress">{ev.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import React, { useState } from "react";

const SUGGESTED_QUESTIONS = [
  "What documents are expiring soon?",
  "What do I need to do this week?",
  "Which important documents have reminders?",
  "Show my pending actions.",
  "Which documents belong to college?",
  "Do I have any overdue tasks?",
];

export default function AskMemoraModal({
  isOpen,
  onClose,
  onViewDoc,
  apiBase,
}) {
  const [query, setQuery] = useState("");
  const [chatLog, setChatLog] = useState([
    {
      sender: "assistant",
      text: "Hello! I'm your MEMORA Assistant. I can analyze your documents, trace deadlines, identify upcoming actions, and answer questions about your life admin. What would you like to check?",
      docs: [],
    },
  ]);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  async function handleSend(questionText) {
    const q = (questionText || query).trim();
    if (!q) return;

    const userMsg = { sender: "user", text: q };
    setChatLog((prev) => [...prev, userMsg]);
    setQuery("");
    setLoading(true);

    try {
      const res = await fetch(`${apiBase}/assistant/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });

      if (!res.ok) throw new Error("Could not get answer");
      const data = await res.json();

      setChatLog((prev) => [
        ...prev,
        {
          sender: "assistant",
          text: data.reply,
          docs: data.matching_documents || [],
        },
      ]);
    } catch (err) {
      console.error(err);
      setChatLog((prev) => [
        ...prev,
        {
          sender: "assistant",
          text: "I encountered an issue querying your documents. Please make sure the backend is running.",
          docs: [],
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-assistant" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="assistant-header-title">
            <span className="bot-avatar">🤖</span>
            <div>
              <h3>Ask MEMORA</h3>
              <p className="bot-sub">Instant intelligence for your documents & actions</p>
            </div>
          </div>
          <button type="button" className="btn-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Suggestion Chips */}
        <div className="assistant-chips-row">
          {SUGGESTED_QUESTIONS.map((chip, idx) => (
            <button
              key={idx}
              type="button"
              className="chip-btn"
              onClick={() => handleSend(chip)}
              disabled={loading}
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Chat Feed */}
        <div className="assistant-chat-feed">
          {chatLog.map((msg, i) => (
            <div key={i} className={`chat-bubble-row ${msg.sender === "user" ? "user-row" : "bot-row"}`}>
              {msg.sender === "assistant" && <div className="chat-avatar">M</div>}
              <div className={`chat-bubble ${msg.sender === "user" ? "user-bubble" : "bot-bubble"}`}>
                <div className="chat-text" style={{ whiteSpace: "pre-line" }}>
                  {msg.text}
                </div>

                {msg.docs && msg.docs.length > 0 && (
                  <div className="matching-docs-box">
                    <span className="matching-docs-title">Matching Documents:</span>
                    <div className="matching-docs-list">
                      {msg.docs.map((doc) => (
                        <div
                          key={doc.id}
                          className="matching-doc-chip"
                          onClick={() => {
                            onClose();
                            onViewDoc(doc);
                          }}
                          title="Click to view details"
                        >
                          📄 <strong>{doc.title}</strong>
                          {doc.action && <span className="chip-action"> • Action: {doc.action}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="chat-bubble-row bot-row">
              <div className="chat-avatar">M</div>
              <div className="chat-bubble bot-bubble">
                <span className="typing-dots">MEMORA is searching documents...</span>
              </div>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <form
          className="assistant-input-bar"
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
        >
          <input
            type="text"
            placeholder="Ask about renewals, deadlines, college, pending tasks..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={loading}
          />
          <button type="submit" className="btn-primary" disabled={loading || !query.trim()}>
            Ask
          </button>
        </form>
      </div>
    </div>
  );
}

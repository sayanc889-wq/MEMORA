import React, { useEffect, useState } from "react";

export default function MemoryGraphModal({
  isOpen,
  onClose,
  onViewDoc,
  apiBase,
}) {
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [selectedNode, setSelectedNode] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;
    async function loadGraph() {
      try {
        setLoading(true);
        const res = await fetch(`${apiBase}/graph/data`);
        if (!res.ok) throw new Error("Could not load graph");
        const data = await res.json();
        if (mounted) {
          setGraphData(data);
          setSelectedNode(data.nodes[0] || null);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadGraph();
    return () => {
      mounted = false;
    };
  }, [isOpen, apiBase]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-graph" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Memory Relationship Graph</h2>
            <p className="bot-sub">Visualize connections between Documents, Actions, Deadlines, and Reminders</p>
          </div>
          <button type="button" className="btn-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="graph-body-layout">
          {/* Visual Canvas / Graph Explorer */}
          <div className="graph-canvas-area">
            {loading ? (
              <div className="graph-loading">Analyzing memory connections...</div>
            ) : graphData.nodes.length === 0 ? (
              <div className="empty-panel">No documents connected yet. Add documents to generate a graph.</div>
            ) : (
              <div className="graph-nodes-container">
                <div className="graph-legend">
                  <span className="legend-item"><span className="legend-dot" style={{ background: "#8b5cf6" }}></span> Category</span>
                  <span className="legend-item"><span className="legend-dot" style={{ background: "#3b82f6" }}></span> Document</span>
                  <span className="legend-item"><span className="legend-dot" style={{ background: "#f59e0b" }}></span> Action</span>
                  <span className="legend-item"><span className="legend-dot" style={{ background: "#ef4444" }}></span> Deadline</span>
                  <span className="legend-item"><span className="legend-dot" style={{ background: "#06b6d4" }}></span> Reminder</span>
                </div>

                <div className="nodes-tree-view">
                  {/* Group nodes by categories */}
                  {graphData.nodes
                    .filter((n) => n.type === "category")
                    .map((catNode) => {
                      const childDocLinks = graphData.links.filter((l) => l.source === catNode.id);
                      return (
                        <div key={catNode.id} className="graph-branch">
                          <div
                            className={`graph-node node-category ${selectedNode?.id === catNode.id ? "node-selected" : ""}`}
                            onClick={() => setSelectedNode(catNode)}
                          >
                            📁 {catNode.label}
                          </div>

                          <div className="graph-children">
                            {childDocLinks.map((link) => {
                              const docNode = graphData.nodes.find((n) => n.id === link.target);
                              if (!docNode) return null;
                              const actionLinks = graphData.links.filter(
                                (l) => l.source === docNode.id && l.target.startsWith("act_")
                              );
                              const deadlineLinks = graphData.links.filter(
                                (l) => l.source === docNode.id && l.target.startsWith("exp_")
                              );
                              const reminderLinks = graphData.links.filter(
                                (l) => l.source === docNode.id && l.target.startsWith("rem_")
                              );

                              return (
                                <div key={docNode.id} className="doc-branch-item">
                                  <div
                                    className={`graph-node node-doc ${selectedNode?.id === docNode.id ? "node-selected" : ""}`}
                                    onClick={() => setSelectedNode(docNode)}
                                  >
                                    📄 {docNode.label}
                                  </div>

                                  <div className="doc-subnodes">
                                    {actionLinks.map((al) => {
                                      const actNode = graphData.nodes.find((n) => n.id === al.target);
                                      return (
                                        <div
                                          key={actNode.id}
                                          className={`graph-node node-action ${selectedNode?.id === actNode.id ? "node-selected" : ""}`}
                                          onClick={() => setSelectedNode(actNode)}
                                        >
                                          ⚡ {actNode.label}
                                        </div>
                                      );
                                    })}

                                    {deadlineLinks.map((dl) => {
                                      const dlNode = graphData.nodes.find((n) => n.id === dl.target);
                                      return (
                                        <div
                                          key={dlNode.id}
                                          className={`graph-node node-deadline ${selectedNode?.id === dlNode.id ? "node-selected" : ""}`}
                                          onClick={() => setSelectedNode(dlNode)}
                                        >
                                          📅 {dlNode.label}
                                        </div>
                                      );
                                    })}

                                    {reminderLinks.map((rl) => {
                                      const remNode = graphData.nodes.find((n) => n.id === rl.target);
                                      return (
                                        <div
                                          key={remNode.id}
                                          className={`graph-node node-reminder ${selectedNode?.id === remNode.id ? "node-selected" : ""}`}
                                          onClick={() => setSelectedNode(remNode)}
                                        >
                                          ⏰ {remNode.label}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>

          {/* Details Sidebar */}
          <div className="graph-sidebar">
            <h3>Node Inspector</h3>
            {selectedNode ? (
              <div className="node-inspect-card">
                <span className="badge badge-category">{selectedNode.type}</span>
                <h4 className="inspect-title">{selectedNode.label}</h4>
                {selectedNode.file_name && (
                  <p className="inspect-sub">File: {selectedNode.file_name}</p>
                )}
                {selectedNode.status && (
                  <p className="inspect-sub">Status: <strong>{selectedNode.status}</strong></p>
                )}
                {selectedNode.document_id && (
                  <button
                    type="button"
                    className="btn-primary btn-sm"
                    style={{ marginTop: 12 }}
                    onClick={() => {
                      onClose();
                      onViewDoc({ id: selectedNode.document_id, title: selectedNode.label });
                    }}
                  >
                    Open Document
                  </button>
                )}
              </div>
            ) : (
              <p className="text-muted">Select a node in the graph to inspect connections.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Memora Extension Popup Script

const DEFAULT_BACKEND = "http://127.0.0.1:8000";
let currentTabInfo = null;
let activeFilter = "all";
let backendUrl = DEFAULT_BACKEND;

document.addEventListener("DOMContentLoaded", async () => {
  await loadSettings();
  initTabs();
  initPresets();
  await checkBackendHealth();
  await loadCurrentPageInfo();
  initSearch();
  initAssistant();
  initSettings();
});

// Load settings from storage
async function loadSettings() {
  const data = await chrome.storage.local.get(["backendUrl"]);
  if (data.backendUrl) {
    backendUrl = data.backendUrl;
  }
}

// Check Backend Health
async function checkBackendHealth() {
  const statusEl = document.getElementById("backendStatus");
  const dot = statusEl.querySelector(".status-dot");
  const text = statusEl.querySelector(".status-text");

  try {
    const res = await fetch(`${backendUrl}/health`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) {
      dot.className = "status-dot online";
      text.textContent = backendUrl.includes("127.0.0.1") || backendUrl.includes("localhost") ? "Local" : "Cloud";
      return true;
    }
  } catch (e) {
    // Offline / unreachable
  }
  dot.className = "status-dot offline";
  text.textContent = "Offline";
  return false;
}

// Tab Switching
function initTabs() {
  const tabButtons = document.querySelectorAll(".nav-tab");
  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      tabButtons.forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

      btn.classList.add("active");
      const target = document.getElementById(btn.dataset.tab);
      if (target) target.classList.add("active");

      if (btn.dataset.tab === "searchTab") {
        renderLibrary();
      }
    });
  });
}

// Load current active browser tab info
async function loadCurrentPageInfo() {
  const previewTitle = document.getElementById("previewTitle");
  const sourceBadge = document.getElementById("sourceBadge");
  const resTitle = document.getElementById("resTitle");
  const resNotes = document.getElementById("resNotes");
  const resTags = document.getElementById("resTags");
  const youtubeBox = document.getElementById("youtubeBox");
  const timestampText = document.getElementById("timestampText");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    currentTabInfo = {
      title: tab.title || "",
      url: tab.url || "",
      timestampUrl: tab.url || "",
      isYouTube: (tab.url || "").includes("youtube.com/watch") || (tab.url || "").includes("youtu.be/"),
      youtubeTimestamp: null,
      selectedText: "",
      source_type: detectSourceType(tab.url || "")
    };

    // Try messaging content script for rich metadata & YouTube timestamp
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: "GET_PAGE_INFO" });
      if (response) {
        currentTabInfo = { ...currentTabInfo, ...response };
      }
    } catch (e) {
      // Content script may not run on internal/restricted pages
    }

    // Populate UI
    previewTitle.textContent = currentTabInfo.title || currentTabInfo.url;
    resTitle.value = currentTabInfo.title;

    // Badging
    sourceBadge.textContent = currentTabInfo.source_type.toUpperCase();
    sourceBadge.className = `source-badge ${currentTabInfo.source_type}`;

    // Selected text into notes
    if (currentTabInfo.selectedText) {
      resNotes.value = `"${currentTabInfo.selectedText}"`;
    }

    // YouTube specific
    if (currentTabInfo.isYouTube && currentTabInfo.youtubeTimestamp !== null) {
      youtubeBox.style.display = "block";
      const mins = Math.floor(currentTabInfo.youtubeTimestamp / 60);
      const secs = currentTabInfo.youtubeTimestamp % 60;
      timestampText.textContent = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
      resTags.value = "#youtube, #study";
    } else {
      youtubeBox.style.display = "none";
      resTags.value = currentTabInfo.source_type === "github" ? "#github, #project" : "#study";
    }

  } catch (err) {
    previewTitle.textContent = "Unable to inspect current tab";
  }
}

function detectSourceType(url) {
  const u = (url || "").toLowerCase();
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  if (u.includes("github.com")) return "github";
  if (u.endsWith(".pdf") || u.includes(".pdf?")) return "pdf";
  if (u.includes("coursera") || u.includes("edx") || u.includes("nptel") || u.includes("udemy")) return "course";
  return "web";
}

// Preset Reminders & Timing
function initPresets() {
  const chips = document.querySelectorAll(".preset-chips .chip");
  const remindInput = document.getElementById("remindAt");
  const clearBtn = document.getElementById("clearReminderBtn");

  chips.forEach(chip => {
    chip.addEventListener("click", () => {
      chips.forEach(c => c.classList.remove("selected"));
      chip.classList.add("selected");

      const now = new Date();
      if (chip.dataset.hours) {
        now.setHours(now.getHours() + parseInt(chip.dataset.hours));
      } else if (chip.dataset.days) {
        now.setDate(now.getDate() + parseInt(chip.dataset.days));
        now.setHours(10, 0, 0, 0); // 10 AM default for next day
      }

      // Format for datetime-local: YYYY-MM-DDTHH:MM
      const localIso = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
      remindInput.value = localIso;
    });
  });

  clearBtn.addEventListener("click", () => {
    remindInput.value = "";
    document.getElementById("resAction").value = "";
    chips.forEach(c => c.classList.remove("selected"));
  });

  // Save Form Submission
  const saveForm = document.getElementById("saveForm");
  saveForm.addEventListener("submit", handleSaveResource);
}

// Handle Save Resource
async function handleSaveResource(e) {
  e.preventDefault();

  const saveBtn = document.getElementById("saveBtn");
  const btnText = saveBtn.querySelector(".btn-text");
  const btnSpinner = saveBtn.querySelector(".btn-spinner");

  btnText.style.display = "none";
  btnSpinner.style.display = "inline";
  saveBtn.disabled = true;

  const title = document.getElementById("resTitle").value.trim();
  const category = document.getElementById("resCategory").value;
  const tags = document.getElementById("resTags").value.trim();
  const notes = document.getElementById("resNotes").value.trim();
  const remindAtVal = document.getElementById("remindAt").value;
  const action = document.getElementById("resAction").value.trim();
  const includeTimestamp = document.getElementById("includeTimestamp").checked;

  let finalUrl = currentTabInfo ? currentTabInfo.url : "";
  if (currentTabInfo && currentTabInfo.isYouTube && includeTimestamp && currentTabInfo.timestampUrl) {
    finalUrl = currentTabInfo.timestampUrl;
  }

  const resource = {
    id: "local_" + Date.now(),
    title,
    url: finalUrl,
    source_type: currentTabInfo ? currentTabInfo.source_type : "web",
    category,
    tags,
    notes,
    action,
    action_status: action ? "Pending" : "No Action",
    remind_at: remindAtVal ? new Date(remindAtVal).toISOString() : null,
    metadata_json: currentTabInfo && currentTabInfo.youtubeTimestamp !== null
      ? JSON.stringify({ youtube_timestamp: currentTabInfo.youtubeTimestamp, channel: currentTabInfo.channelName })
      : null,
    created_at: new Date().toISOString()
  };

  // 1. Save in local chrome.storage.local
  const data = await chrome.storage.local.get(["resources"]);
  const resources = data.resources || [];
  resources.unshift(resource);
  await chrome.storage.local.set({ resources });

  // 2. Set alarm if remind_at is configured
  if (resource.remind_at) {
    const remindTime = new Date(resource.remind_at).getTime();
    if (remindTime > Date.now()) {
      chrome.alarms.create(`memora_remind_${resource.id}`, { when: remindTime });
    }
  }

  // 3. Try syncing with Backend
  try {
    const res = await fetch(`${backendUrl}/web-resources`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: resource.title,
        url: resource.url,
        source_type: resource.source_type,
        category: resource.category,
        notes: resource.notes,
        tags: resource.tags,
        remind_at: resource.remind_at,
        action: resource.action,
        action_status: resource.action_status,
        metadata_json: resource.metadata_json
      })
    });
    if (res.ok) {
      const serverDoc = await res.json();
      resource.serverId = serverDoc.id;
      await chrome.storage.local.set({ resources });
    }
  } catch (err) {
    console.log("Saved offline, will sync when backend is available.");
  }

  // 4. Send toast to tab
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.tabs.sendMessage(tab.id, { action: "SHOW_TOAST", message: "Saved to Memora Study Hub! ⚡" });
    }
  } catch (e) {}

  btnSpinner.style.display = "none";
  btnText.textContent = "Saved! ✓";
  btnText.style.display = "inline";

  setTimeout(() => {
    btnText.textContent = "Save to Memora";
    saveBtn.disabled = false;

    // Switch to Search/Library tab to see it
    document.querySelector('[data-tab="searchTab"]').click();
  }, 700);
}

// Search & Library Implementation
function initSearch() {
  const searchInput = document.getElementById("searchInput");
  const clearBtn = document.getElementById("clearSearchBtn");
  const semanticToggle = document.getElementById("semanticToggle");
  const filterChips = document.querySelectorAll(".filter-chip");

  let debounceTimer = null;

  searchInput.addEventListener("input", () => {
    clearBtn.style.display = searchInput.value ? "block" : "none";
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      renderLibrary(searchInput.value.trim());
    }, 200);
  });

  clearBtn.addEventListener("click", () => {
    searchInput.value = "";
    clearBtn.style.display = "none";
    renderLibrary();
  });

  semanticToggle.addEventListener("change", () => {
    renderLibrary(searchInput.value.trim());
  });

  filterChips.forEach(chip => {
    chip.addEventListener("click", () => {
      filterChips.forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      activeFilter = chip.dataset.filter;
      renderLibrary(searchInput.value.trim());
    });
  });
}

// Render Library Cards
async function renderLibrary(query = "") {
  const listEl = document.getElementById("resultsList");
  const countEl = document.getElementById("resultsCount");
  const semanticToggle = document.getElementById("semanticToggle").checked;

  listEl.innerHTML = '<div class="empty-state"><p>Searching your library...</p></div>';

  let items = [];

  // Try Semantic Search via Backend if query exists and toggle is on
  if (query && semanticToggle) {
    try {
      const searchRes = await fetch(`${backendUrl}/web-resources/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query,
          limit: 30
        })
      });
      if (searchRes.ok) {
        const data = await searchRes.json();
        items = data.results.map(r => ({
          ...r.resource,
          matchReason: r.match_reason,
          matchedConcepts: r.matched_concepts
        }));
      }
    } catch (e) {
      console.log("Backend semantic search unavailable, using local search.");
    }
  }

  // Fallback / local storage retrieval if items empty or offline
  if (items.length === 0) {
    const data = await chrome.storage.local.get(["resources"]);
    let localResources = data.resources || [];

    // Also fetch latest from backend if no query
    if (!query) {
      try {
        const res = await fetch(`${backendUrl}/web-resources?limit=50`);
        if (res.ok) {
          const serverItems = await res.json();
          // Merge unique by URL
          const urlMap = new Map();
          serverItems.forEach(i => urlMap.set(i.url, i));
          localResources.forEach(i => { if (!urlMap.has(i.url)) urlMap.set(i.url, i); });
          localResources = Array.from(urlMap.values());
        }
      } catch (e) {}
    }

    if (query) {
      const qLower = query.toLowerCase();
      localResources = localResources.filter(r => {
        return (r.title || "").toLowerCase().includes(qLower) ||
               (r.notes || "").toLowerCase().includes(qLower) ||
               (r.tags || "").toLowerCase().includes(qLower) ||
               (r.category || "").toLowerCase().includes(qLower);
      });
    }

    items = localResources;
  }

  // Apply category/source filter
  if (activeFilter === "study") {
    items = items.filter(r => r.category === "study");
  } else if (activeFilter === "youtube") {
    items = items.filter(r => r.source_type === "youtube");
  } else if (activeFilter === "reminders") {
    items = items.filter(r => r.remind_at);
  }

  countEl.textContent = `${items.length} item${items.length === 1 ? "" : "s"}`;

  if (items.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <p>No matching resources found.</p>
        <span style="font-size: 11px; color: var(--text-muted); display: block; margin-top: 4px;">
          Try another search term or click "Save" to add one!
        </span>
      </div>
    `;
    return;
  }

  listEl.innerHTML = items.map(item => createResourceCardHTML(item)).join("");

  // Attach card click handlers
  listEl.querySelectorAll(".resource-card").forEach(card => {
    const url = card.dataset.url;
    const id = card.dataset.id;

    // Card title opens URL
    card.querySelector(".card-title").addEventListener("click", (e) => {
      e.stopPropagation();
      chrome.tabs.create({ url });
    });

    // Delete button
    card.querySelector(".btn-delete").addEventListener("click", async (e) => {
      e.stopPropagation();
      await deleteResource(id);
      renderLibrary(query);
    });

    // Copy link button
    card.querySelector(".btn-copy").addEventListener("click", (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(url);
      const btn = card.querySelector(".btn-copy");
      btn.textContent = "✓";
      setTimeout(() => btn.textContent = "📋", 1200);
    });
  });
}

function createResourceCardHTML(item) {
  const isYt = item.source_type === "youtube";
  const badgeClass = isYt ? "source-badge youtube" : "source-badge";
  const badgeText = isYt ? "YOUTUBE" : (item.source_type || "WEB").toUpperCase();

  let reminderHTML = "";
  if (item.remind_at) {
    const remDate = new Date(item.remind_at);
    reminderHTML = `<span class="reminder-badge" title="Reminder: ${remDate.toLocaleString()}">⏰ ${remDate.toLocaleDateString()}</span>`;
  }

  let matchReasonHTML = "";
  if (item.matchReason) {
    matchReasonHTML = `<span class="match-reason-pill">🎯 ${item.matchReason}</span>`;
  }

  return `
    <div class="resource-card" data-url="${escapeHtml(item.url)}" data-id="${item.id}">
      <div class="card-header">
        <span class="${badgeClass}">${badgeText}</span>
        <div class="card-actions">
          <button type="button" class="btn-icon btn-copy" title="Copy URL">📋</button>
          <button type="button" class="btn-icon btn-delete" title="Delete">🗑️</button>
        </div>
      </div>
      <div class="card-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
      ${item.notes ? `<div class="card-notes">${escapeHtml(item.notes)}</div>` : ""}
      <div class="card-footer">
        <div class="card-tags">
          <span class="category-pill">${escapeHtml(item.category || "study")}</span>
          ${matchReasonHTML}
        </div>
        ${reminderHTML}
      </div>
    </div>
  `;
}

// Delete a resource locally & on server
async function deleteResource(id) {
  const data = await chrome.storage.local.get(["resources"]);
  let resources = data.resources || [];
  const target = resources.find(r => String(r.id) === String(id));
  resources = resources.filter(r => String(r.id) !== String(id));
  await chrome.storage.local.set({ resources });

  // Clear alarm
  chrome.alarms.clear(`memora_remind_${id}`);

  // Delete from server if numeric ID or serverId
  const serverId = target && target.serverId ? target.serverId : (Number.isInteger(Number(id)) ? id : null);
  if (serverId) {
    try {
      await fetch(`${backendUrl}/web-resources/${serverId}`, { method: "DELETE" });
    } catch (e) {}
  }
}

// Assistant Chat Tab
function initAssistant() {
  const input = document.getElementById("assistantInput");
  const sendBtn = document.getElementById("assistantSendBtn");
  const messages = document.getElementById("chatMessages");

  const sendQuery = async () => {
    const text = input.value.trim();
    if (!text) return;

    // Append user message
    appendChatMessage("user", text);
    input.value = "";

    // Show AI thinking bubble
    const thinkingBubble = appendChatMessage("ai", "Thinking...");

    try {
      // 1. Check semantic search for resources
      const searchRes = await fetch(`${backendUrl}/web-resources/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: text, limit: 5 })
      });

      let reply = "";
      if (searchRes.ok) {
        const data = await searchRes.json();
        if (data.results.length > 0) {
          reply = `Found ${data.total_found} relevant resource(s):\n\n`;
          data.results.forEach((r, idx) => {
            reply += `${idx + 1}. **${r.resource.title}** (${r.resource.source_type})\n${r.resource.url}\n\n`;
          });
        }
      }

      // 2. If no direct web resource, query general assistant endpoint
      if (!reply) {
        const assistantRes = await fetch(`${backendUrl}/assistant/ask`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: text })
        });
        if (assistantRes.ok) {
          const aData = await assistantRes.json();
          reply = aData.reply;
        }
      }

      thinkingBubble.innerHTML = formatMarkdown(reply || "I couldn't find anything matching your query. Try saving more resources or asking about deadlines!");
    } catch (e) {
      thinkingBubble.textContent = "Backend assistant is offline. Check your connection in the Sync tab!";
    }
  };

  sendBtn.addEventListener("click", sendQuery);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendQuery();
  });
}

function appendChatMessage(sender, text) {
  const messages = document.getElementById("chatMessages");
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${sender}`;
  bubble.textContent = text;
  messages.appendChild(bubble);
  messages.scrollTop = messages.scrollHeight;
  return bubble;
}

function formatMarkdown(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
}

// Settings & Sync
function initSettings() {
  const urlInput = document.getElementById("serverUrlInput");
  const presetBtns = document.querySelectorAll(".btn-url-preset");
  const syncBtn = document.getElementById("syncNowBtn");
  const openDashBtn = document.getElementById("openDashboardBtn");
  const statusEl = document.getElementById("syncStatus");

  urlInput.value = backendUrl;

  urlInput.addEventListener("change", async () => {
    backendUrl = urlInput.value.trim().replace(/\/$/, "");
    await chrome.storage.local.set({ backendUrl });
    await checkBackendHealth();
  });

  presetBtns.forEach(btn => {
    btn.addEventListener("click", async () => {
      urlInput.value = btn.dataset.url;
      backendUrl = btn.dataset.url;
      await chrome.storage.local.set({ backendUrl });
      await checkBackendHealth();
    });
  });

  syncBtn.addEventListener("click", async () => {
    statusEl.textContent = "Syncing with backend...";
    const data = await chrome.storage.local.get(["resources"]);
    const resources = data.resources || [];

    try {
      const syncItems = resources.map(r => ({
        client_id: String(r.id),
        title: r.title,
        url: r.url,
        source_type: r.source_type || "web",
        category: r.category || "study",
        notes: r.notes,
        tags: r.tags,
        remind_at: r.remind_at,
        action: r.action,
        action_status: r.action_status || "No Action",
        metadata_json: r.metadata_json
      }));

      const res = await fetch(`${backendUrl}/web-resources/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: syncItems })
      });

      if (res.ok) {
        const resData = await res.json();
        statusEl.textContent = `✓ Synced ${resData.synced_count} resources with Memora DB!`;
      } else {
        statusEl.textContent = "Sync failed. Server responded with error.";
      }
    } catch (err) {
      statusEl.textContent = "Sync failed. Backend server is unreachable.";
    }
  });

  openDashBtn.addEventListener("click", () => {
    chrome.tabs.create({ url: "http://localhost:5173" });
  });
}

function escapeHtml(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

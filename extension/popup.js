// Memora Extension Popup Script

const DEFAULT_BACKEND = "http://127.0.0.1:8000";
let currentTabInfo = null;
let activeFilter = "all";
let backendUrl = DEFAULT_BACKEND;

let currentTodos = [];
let currentMilestoneTitle = "";

document.addEventListener("DOMContentLoaded", async () => {
  await loadSettings();
  initTabs();
  initPresets();
  initTodos();
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

// AI Study Todos Management
function initTodos() {
  const generateBtn = document.getElementById("generateTodosBtn");
  const addBtn = document.getElementById("addTodoBtn");
  const newTodoInput = document.getElementById("newTodoInput");

  if (generateBtn) {
    generateBtn.addEventListener("click", handleGenerateAITodos);
  }

  if (addBtn && newTodoInput) {
    addBtn.addEventListener("click", handleAddCustomTodo);
    newTodoInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddCustomTodo();
      }
    });
  }
}

async function handleGenerateAITodos() {
  const generateBtn = document.getElementById("generateTodosBtn");
  const btnText = generateBtn.querySelector(".ai-btn-text");
  const btnSpinner = generateBtn.querySelector(".ai-btn-spinner");

  btnText.style.display = "none";
  btnSpinner.style.display = "inline";
  generateBtn.disabled = true;

  const title = document.getElementById("resTitle").value.trim() || (currentTabInfo ? currentTabInfo.title : "Study Topic");
  const category = document.getElementById("resCategory").value;
  const tags = document.getElementById("resTags").value.trim();
  const notes = document.getElementById("resNotes").value.trim();
  const url = currentTabInfo ? currentTabInfo.url : "";

  try {
    const res = await fetch(`${backendUrl}/web-resources/generate-todos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, url, notes, tags, category }),
      signal: AbortSignal.timeout(5000)
    });

    if (res.ok) {
      const data = await res.json();
      currentTodos = data.todos || [];
      currentMilestoneTitle = data.milestone_title || "Study Milestone";
    } else {
      throw new Error("Backend response error");
    }
  } catch (err) {
    // Client-side fallback if backend is offline or slow
    const fallback = generateClientSideTodos(title, url, tags);
    currentTodos = fallback.todos;
    currentMilestoneTitle = fallback.milestone_title;
  } finally {
    btnSpinner.style.display = "none";
    btnText.style.display = "inline";
    generateBtn.disabled = false;
  }

  renderTodosList();
}

function generateClientSideTodos(title, url, tags) {
  const t = `${title || ""} ${tags || ""} ${url || ""}`.toLowerCase();
  let topic = "Study Topic";
  let milestone_title = "Study Milestone";
  let todos = [];

  if (t.includes("oops") || t.includes("oop") || t.includes("object oriented") || t.includes("class") || t.includes("inheritance") || t.includes("polymorphism") || t.includes("encapsulation")) {
    topic = "Object-Oriented Programming (OOPS)";
    milestone_title = "OOPS Mastery & Playlist Milestone";
    todos = [
      { id: "todo_1", text: "Understand Classes, Objects & state encapsulation", completed: false, category: "Core Concept" },
      { id: "todo_2", text: "Implement Encapsulation with access modifiers and getters/setters", completed: false, category: "Pillar 1" },
      { id: "todo_3", text: "Build Inheritance hierarchy and override base methods", completed: false, category: "Pillar 2" },
      { id: "todo_4", text: "Master Polymorphism (Compile-time overloading vs Runtime dynamic dispatch)", completed: false, category: "Pillar 3" },
      { id: "todo_5", text: "Design an Abstract Class / Interface contract", completed: false, category: "Pillar 4" },
      { id: "todo_6", text: "Solve 2 OOP design practice problems (e.g. Parking Lot or Bank Account)", completed: false, category: "Practice" },
      { id: "todo_7", text: "Summarize lecture notes and record milestone completion", completed: false, category: "Milestone" }
    ];
  } else if (t.includes("dsa") || t.includes("algorithm") || t.includes("data structure") || t.includes("tree") || t.includes("graph") || t.includes("dp")) {
    topic = "Data Structures & Algorithms";
    milestone_title = "DSA Problem Solving Milestone";
    todos = [
      { id: "todo_1", text: "Analyze Time & Space Complexity (Big-O analysis)", completed: false, category: "Complexity" },
      { id: "todo_2", text: "Trace algorithm step-by-step with pen and paper", completed: false, category: "Tracing" },
      { id: "todo_3", text: "Implement algorithm from scratch without built-in helpers", completed: false, category: "Coding" },
      { id: "todo_4", text: "Solve 2 related practice problems covering edge cases", completed: false, category: "Practice" },
      { id: "todo_5", text: "Log key pattern and template in study vault", completed: false, category: "Review" }
    ];
  } else {
    topic = title ? title.slice(0, 40) : "Study Topic";
    milestone_title = `Milestone: ${topic}`;
    todos = [
      { id: "todo_1", text: `Watch video & note key principles for "${topic}"`, completed: false, category: "Concept" },
      { id: "todo_2", text: "Write hands-on code or worked example from lecture", completed: false, category: "Hands-on" },
      { id: "todo_3", text: "Solve 2 practice exercises or self-test questions", completed: false, category: "Practice" },
      { id: "todo_4", text: "Summarize 3 flashcard takeaways for revision", completed: false, category: "Review" },
      { id: "todo_5", text: "Mark milestone completed in playlist tracker", completed: false, category: "Milestone" }
    ];
  }

  return { topic, milestone_title, todos };
}

function renderTodosList() {
  const container = document.getElementById("milestoneProgressContainer");
  const listEl = document.getElementById("todosList");
  const addRow = document.getElementById("addTodoRow");
  const milestoneNameEl = document.getElementById("milestoneName");
  const progressPercentEl = document.getElementById("progressPercent");
  const progressBarFillEl = document.getElementById("progressBarFill");
  const progressCountTextEl = document.getElementById("progressCountText");

  if (!currentTodos || currentTodos.length === 0) {
    if (container) container.style.display = "none";
    if (addRow) addRow.style.display = "none";
    if (listEl) listEl.innerHTML = "";
    return;
  }

  if (container) container.style.display = "block";
  if (addRow) addRow.style.display = "flex";

  const total = currentTodos.length;
  const completedCount = currentTodos.filter(t => t.completed).length;
  const percent = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  if (milestoneNameEl) milestoneNameEl.textContent = currentMilestoneTitle || "Study Milestone";
  if (progressPercentEl) progressPercentEl.textContent = `${percent}%`;
  if (progressBarFillEl) {
    progressBarFillEl.style.width = `${percent}%`;
    progressBarFillEl.className = percent === 100 ? "progress-bar-fill completed-all" : "progress-bar-fill";
  }
  if (progressCountTextEl) {
    progressCountTextEl.textContent = `${completedCount} of ${total} completed`;
  }

  listEl.innerHTML = currentTodos.map(todo => `
    <div class="todo-item ${todo.completed ? 'completed' : ''}" data-id="${todo.id}">
      <input type="checkbox" class="todo-checkbox" ${todo.completed ? 'checked' : ''}>
      <div class="todo-content">
        <span class="todo-text">${escapeHtml(todo.text)}</span>
        ${todo.category ? `<span class="todo-tag">${escapeHtml(todo.category)}</span>` : ''}
      </div>
      <button type="button" class="btn-remove-todo" title="Remove todo">✕</button>
    </div>
  `).join("");

  listEl.querySelectorAll(".todo-item").forEach(itemEl => {
    const todoId = itemEl.dataset.id;
    const checkbox = itemEl.querySelector(".todo-checkbox");
    const content = itemEl.querySelector(".todo-content");
    const removeBtn = itemEl.querySelector(".btn-remove-todo");

    const toggle = () => {
      const target = currentTodos.find(t => t.id === todoId);
      if (target) {
        target.completed = !target.completed;
        renderTodosList();
      }
    };

    checkbox.addEventListener("change", toggle);
    content.addEventListener("click", toggle);
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      currentTodos = currentTodos.filter(t => t.id !== todoId);
      renderTodosList();
    });
  });
}

function handleAddCustomTodo() {
  const input = document.getElementById("newTodoInput");
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  currentTodos.push({
    id: "todo_" + Date.now(),
    text,
    completed: false,
    category: "Custom"
  });
  input.value = "";
  renderTodosList();
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
      ? JSON.stringify({ youtube_timestamp: currentTabInfo.youtubeTimestamp, channel: currentTabInfo.channelName, playlist_id: currentTabInfo.playlistId, playlist_index: currentTabInfo.playlistIndex })
      : null,
    todos_json: currentTodos.length > 0 ? JSON.stringify(currentTodos) : null,
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
        metadata_json: resource.metadata_json,
        todos_json: resource.todos_json
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

  // Clear current todos state after save
  currentTodos = [];
  renderTodosList();

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
  } else if (activeFilter === "todos") {
    items = items.filter(r => {
      try {
        const t = typeof r.todos_json === "string" ? JSON.parse(r.todos_json) : r.todos_json;
        return Array.isArray(t) && t.length > 0;
      } catch (e) {
        return false;
      }
    });
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

    // Toggle card todos drawer
    const toggleTodosBtn = card.querySelector(".btn-card-todos-toggle");
    if (toggleTodosBtn) {
      toggleTodosBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const drawer = card.querySelector(`#cardTodosDrawer_${id}`);
        if (drawer) {
          drawer.style.display = drawer.style.display === "none" ? "flex" : "none";
        }
      });
    }

    // Toggle individual todo checkbox on card
    card.querySelectorAll(".card-todo-check").forEach(checkbox => {
      checkbox.addEventListener("change", async (e) => {
        e.stopPropagation();
        const todoId = checkbox.dataset.todoId;
        const resId = checkbox.dataset.resId;

        const data = await chrome.storage.local.get(["resources"]);
        let resources = data.resources || [];
        const targetRes = resources.find(r => String(r.id) === String(resId));

        if (targetRes && targetRes.todos_json) {
          let todos = [];
          try {
            todos = typeof targetRes.todos_json === "string" ? JSON.parse(targetRes.todos_json) : targetRes.todos_json;
          } catch (err) {}

          const targetTodo = todos.find(t => t.id === todoId);
          if (targetTodo) {
            targetTodo.completed = checkbox.checked;
            targetRes.todos_json = JSON.stringify(todos);
            await chrome.storage.local.set({ resources });

            // Sync with backend if serverId or numeric id
            const serverId = targetRes.serverId || (Number.isInteger(Number(resId)) ? resId : null);
            if (serverId) {
              try {
                await fetch(`${backendUrl}/web-resources/${serverId}/todos`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ todos })
                });
              } catch (err) {}
            }

            // Update parent label styling
            const label = checkbox.closest(".todo-item");
            if (label) {
              if (checkbox.checked) label.classList.add("completed");
              else label.classList.remove("completed");
            }

            // Update card pill
            const doneCount = todos.filter(t => t.completed).length;
            const percent = Math.round((doneCount / todos.length) * 100);
            const pill = card.querySelector(".card-todos-pill");
            if (pill) {
              pill.textContent = `🎯 ${doneCount}/${todos.length} (${percent}%)`;
              if (doneCount === todos.length) pill.classList.add("all-done");
              else pill.classList.remove("all-done");
            }
          }
        }
      });
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

  let todos = [];
  try {
    if (item.todos_json) {
      todos = typeof item.todos_json === "string" ? JSON.parse(item.todos_json) : item.todos_json;
    }
  } catch (e) {}

  let todosPillHTML = "";
  let todosDrawerHTML = "";
  if (Array.isArray(todos) && todos.length > 0) {
    const doneCount = todos.filter(t => t.completed).length;
    const isAllDone = doneCount === todos.length;
    const percent = Math.round((doneCount / todos.length) * 100);
    todosPillHTML = `
      <span class="card-todos-pill ${isAllDone ? 'all-done' : ''}" title="${doneCount} of ${todos.length} study todos completed">
        🎯 ${doneCount}/${todos.length} (${percent}%)
      </span>
      <button type="button" class="btn-card-todos-toggle" data-id="${item.id}" title="Toggle study todos checklist">
        📋 Todos ${isAllDone ? '✓' : ''}
      </button>
    `;
    todosDrawerHTML = `
      <div class="card-todos-drawer" id="cardTodosDrawer_${item.id}" style="display: none;">
        ${todos.map(t => `
          <label class="todo-item ${t.completed ? 'completed' : ''}" style="margin: 0;">
            <input type="checkbox" class="card-todo-check" data-res-id="${item.id}" data-todo-id="${t.id}" ${t.completed ? 'checked' : ''}>
            <span class="todo-content">
              <span class="todo-text">${escapeHtml(t.text)}</span>
              ${t.category ? `<span class="todo-tag">${escapeHtml(t.category)}</span>` : ''}
            </span>
          </label>
        `).join("")}
      </div>
    `;
  }

  return `
    <div class="resource-card" data-url="${escapeHtml(item.url)}" data-id="${item.id}">
      <div class="card-header">
        <span class="${badgeClass}">${badgeText}</span>
        <div class="card-actions">
          ${todosPillHTML}
          <button type="button" class="btn-icon btn-copy" title="Copy URL">📋</button>
          <button type="button" class="btn-icon btn-delete" title="Delete">🗑️</button>
        </div>
      </div>
      <div class="card-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
      ${item.notes ? `<div class="card-notes">${escapeHtml(item.notes)}</div>` : ""}
      ${todosDrawerHTML}
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

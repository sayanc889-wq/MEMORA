// Memora Extension - Background Service Worker

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000";

// Set up Context Menus on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "memora_save_page",
    title: "⚡ Save to Memora",
    contexts: ["page"]
  });

  chrome.contextMenus.create({
    id: "memora_save_selection",
    title: "📝 Save selection to Memora notes",
    contexts: ["selection"]
  });

  updateBadge();
});

// Handle Context Menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.url) return;

  const title = tab.title || "Web Resource";
  const url = tab.url;
  const notes = info.selectionText ? info.selectionText.trim() : "";
  const source_type = detectSourceType(url);

  const resource = {
    id: "local_" + Date.now(),
    title,
    url,
    source_type,
    category: "study",
    notes,
    tags: source_type === "youtube" ? "youtube,study" : "web,study",
    action_status: "No Action",
    created_at: new Date().toISOString()
  };

  await saveResourceLocallyAndSync(resource);
  showNotification(
    "Saved to Memora! ⚡",
    `"${title.slice(0, 50)}..." was saved to your study library.`
  );
});

// Handle alarms for review reminders
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith("memora_remind_")) return;

  const resourceId = alarm.name.replace("memora_remind_", "");
  const data = await chrome.storage.local.get(["resources"]);
  const resources = data.resources || [];
  const resource = resources.find(r => String(r.id) === resourceId);

  if (resource) {
    chrome.notifications.create(`notify_${resource.id}`, {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: `⏰ Memora Reminder: ${resource.title.slice(0, 45)}`,
      message: resource.action || resource.notes || "Time to review this saved study resource!",
      priority: 2,
      buttons: [{ title: "Open Resource Now" }]
    });
  }

  updateBadge();
});

// When user clicks the notification or action button
chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (notificationId.startsWith("notify_")) {
    const resourceId = notificationId.replace("notify_", "");
    const data = await chrome.storage.local.get(["resources"]);
    const resources = data.resources || [];
    const resource = resources.find(r => String(r.id) === resourceId);
    if (resource && resource.url) {
      chrome.tabs.create({ url: resource.url });
    }
  }
});

chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  if (notificationId.startsWith("notify_") && buttonIndex === 0) {
    const resourceId = notificationId.replace("notify_", "");
    const data = await chrome.storage.local.get(["resources"]);
    const resources = data.resources || [];
    const resource = resources.find(r => String(r.id) === resourceId);
    if (resource && resource.url) {
      chrome.tabs.create({ url: resource.url });
    }
  }
});

// Helper: Detect source type from URL
function detectSourceType(url) {
  const u = (url || "").toLowerCase();
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  if (u.includes("github.com")) return "github";
  if (u.endsWith(".pdf") || u.includes(".pdf?")) return "pdf";
  if (u.includes("coursera") || u.includes("edx") || u.includes("nptel") || u.includes("udemy")) return "course";
  return "web";
}

// Helper: Save locally and attempt backend sync
async function saveResourceLocallyAndSync(resource) {
  const data = await chrome.storage.local.get(["resources", "backendUrl"]);
  const resources = data.resources || [];
  resources.unshift(resource);
  await chrome.storage.local.set({ resources });

  const backendUrl = data.backendUrl || DEFAULT_BACKEND_URL;
  try {
    const res = await fetch(`${backendUrl}/web-resources`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: resource.title,
        url: resource.url,
        source_type: resource.source_type,
        category: resource.category || "study",
        notes: resource.notes,
        tags: resource.tags,
        remind_at: resource.remind_at,
        action: resource.action,
        action_status: resource.action_status || "No Action",
        metadata_json: resource.metadata_json
      })
    });
    if (res.ok) {
      const serverDoc = await res.json();
      resource.serverId = serverDoc.id;
      await chrome.storage.local.set({ resources });
    }
  } catch (err) {
    console.log("Offline mode: saved locally, will sync when backend is available.", err);
  }

  updateBadge();
}

// Helper: Update extension badge with due reminders count
async function updateBadge() {
  try {
    const data = await chrome.storage.local.get(["resources"]);
    const resources = data.resources || [];
    const now = new Date();
    const dueCount = resources.filter(r => r.remind_at && new Date(r.remind_at) <= now).length;

    if (dueCount > 0) {
      chrome.action.setBadgeText({ text: String(dueCount) });
      chrome.action.setBadgeBackgroundColor({ color: "#8b5cf6" });
    } else {
      chrome.action.setBadgeText({ text: "" });
    }
  } catch (e) {
    // Ignore context error
  }
}

function showNotification(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: title,
    message: message,
    priority: 1
  });
}

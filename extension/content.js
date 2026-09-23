// Memora Content Script - Extracts page metadata, selected text & YouTube timestamps

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "GET_PAGE_INFO") {
    const pageInfo = extractPageMetadata();
    sendResponse(pageInfo);
  } else if (request.action === "SHOW_TOAST") {
    showMemoraToast(request.message);
    sendResponse({ success: true });
  }
  return true;
});

function extractPageMetadata() {
  const url = window.location.href;
  let title = document.title || "";
  let selectedText = window.getSelection() ? window.getSelection().toString().trim() : "";
  let metaDescription = "";
  let youtubeTimestamp = null;
  let timestampUrl = url;
  let channelName = "";

  // Get meta description
  const metaDescTag = document.querySelector('meta[name="description"]') ||
                      document.querySelector('meta[property="og:description"]');
  if (metaDescTag) {
    metaDescription = metaDescTag.getAttribute("content") || "";
  }

  // YouTube detection
  const isYouTube = url.includes("youtube.com/watch") || url.includes("youtu.be/");
  if (isYouTube) {
    const video = document.querySelector("video");
    if (video && !isNaN(video.currentTime)) {
      const seconds = Math.floor(video.currentTime);
      youtubeTimestamp = seconds;

      // Construct timestamp URL
      const urlObj = new URL(url);
      urlObj.searchParams.set("t", `${seconds}s`);
      timestampUrl = urlObj.toString();
    }

    // Try to get channel name
    const channelEl = document.querySelector("ytd-channel-name a") ||
                      document.querySelector("#channel-name a") ||
                      document.querySelector(".ytd-channel-name");
    if (channelEl) {
      channelName = channelEl.textContent.trim();
    }

    // Clean up YouTube title
    title = title.replace(/\s*-\s*YouTube$/, "");

    // Playlist detection
    let playlistId = "";
    let playlistIndex = null;
    let playlistTitle = "";
    try {
      const parsedUrl = new URL(url);
      playlistId = parsedUrl.searchParams.get("list") || "";
      const idx = parsedUrl.searchParams.get("index");
      if (idx) playlistIndex = parseInt(idx, 10);

      const playlistHeader = document.querySelector("#header-description h3") ||
                             document.querySelector("ytd-playlist-panel-renderer #header-title");
      if (playlistHeader) {
        playlistTitle = playlistHeader.textContent.trim();
      }
    } catch (e) {}

    return {
      title,
      url,
      timestampUrl,
      selectedText,
      metaDescription,
      isYouTube,
      youtubeTimestamp,
      channelName,
      playlistId,
      playlistIndex,
      playlistTitle,
      isGitHub,
      repoName,
      favicon: getFavicon()
    };
  }

  // GitHub detection
  const isGitHub = url.includes("github.com/");
  let repoName = "";
  if (isGitHub) {
    const pathParts = window.location.pathname.split("/").filter(Boolean);
    if (pathParts.length >= 2) {
      repoName = `${pathParts[0]}/${pathParts[1]}`;
    }
  }

  return {
    title,
    url,
    timestampUrl,
    selectedText,
    metaDescription,
    isYouTube: false,
    youtubeTimestamp: null,
    channelName: "",
    playlistId: "",
    playlistIndex: null,
    playlistTitle: "",
    isGitHub,
    repoName,
    favicon: getFavicon()
  };
}

function getFavicon() {
  const link = document.querySelector("link[rel*='icon']");
  return link ? link.href : `${window.location.origin}/favicon.ico`;
}

function showMemoraToast(message) {
  const existing = document.getElementById("memora-capture-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "memora-capture-toast";
  toast.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px;">
      <span style="font-size: 16px;">⚡</span>
      <span style="font-weight: 600; font-size: 13px; color: #f8fafc; font-family: system-ui, -apple-system, sans-serif;">
        ${message || "Saved to Memora!"}
      </span>
    </div>
  `;

  Object.assign(toast.style, {
    position: "fixed",
    bottom: "24px",
    right: "24px",
    zIndex: "999999",
    background: "rgba(15, 12, 30, 0.95)",
    color: "#ffffff",
    padding: "12px 18px",
    borderRadius: "10px",
    boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(139, 92, 246, 0.4)",
    backdropFilter: "blur(12px)",
    display: "flex",
    alignItems: "center",
    transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
    transform: "translateY(20px)",
    opacity: "0",
    pointerEvents: "none"
  });

  document.body.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.style.transform = "translateY(0)";
    toast.style.opacity = "1";
  });

  // Fade out
  setTimeout(() => {
    toast.style.transform = "translateY(10px)";
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

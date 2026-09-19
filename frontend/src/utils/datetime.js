/**
 * Datetime and utility helpers for MEMORA.
 *
 * Adheres strictly to local browser time to eliminate UTC shift bugs.
 */

export function parseDateSafe(dateInput) {
  if (!dateInput) return null;
  if (dateInput instanceof Date) {
    return Number.isNaN(dateInput.getTime()) ? null : dateInput;
  }
  let str = String(dateInput).trim();
  if (str.includes(" ") && !str.includes("T")) {
    str = str.replace(" ", "T");
  }
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toLocalDatetimeInputString(dateInput) {
  if (!dateInput) return "";

  // If already in 'YYYY-MM-DDTHH:mm' or 'YYYY-MM-DD HH:mm:ss' format, extract the prefix
  if (typeof dateInput === "string") {
    const clean = dateInput.replace(" ", "T");
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(clean)) {
      return clean.slice(0, 16);
    }
  }

  const d = parseDateSafe(dateInput);
  if (!d) return "";

  const pad = (n) => String(n).padStart(2, "0");
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function formatDate(dateInput) {
  if (!dateInput) return "No date";
  const d = parseDateSafe(dateInput);
  if (!d) return "No date";

  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(dateInput) {
  if (!dateInput) return "No date";
  const d = parseDateSafe(dateInput);
  if (!d) return "No date";

  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return "0 KB";
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Returns categorized action timing:
 * 'Overdue' | 'Due Today' | 'Due Soon' | 'Upcoming' | 'No due date'
 */
export function getActionDeadlineCategory(doc) {
  const targetDateStr = doc.action_due_date || doc.expiry_date;
  if (!targetDateStr) return "No due date";

  const target = parseDateSafe(targetDateStr);
  if (!target) return "No due date";

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const todayEnd = todayStart + 24 * 60 * 60 * 1000 - 1;
  const targetTime = target.getTime();

  if (targetTime < todayStart) {
    return "Overdue";
  }
  if (targetTime >= todayStart && targetTime <= todayEnd) {
    return "Due Today";
  }
  const sevenDaysLater = todayStart + 7 * 24 * 60 * 60 * 1000;
  if (targetTime <= sevenDaysLater) {
    return "Due Soon";
  }
  return "Upcoming";
}

/**
 * Returns unified action items across all documents.
 * 
 * Rules:
 * - If a document has an explicit action (doc.action is not empty), it is an action item.
 * - If a document has NO explicit action, but its expiry_date is in the past (overdue) and not completed,
 *   a fallback "Review expired document" action item is created so it appears in Overdue and All.
 * - If a document has action_status === "Completed" (case-insensitive), it is marked as completed
 *   and will NOT be counted or shown as Overdue.
 */
export function getEffectiveActionItems(documents) {
  const items = [];
  if (!Array.isArray(documents)) return items;

  for (const doc of documents) {
    const isCompleted = (doc.action_status || "").toUpperCase() === "COMPLETED";
    const hasAction = Boolean(doc.action && doc.action.trim());
    const category = getActionDeadlineCategory(doc);

    if (hasAction) {
      items.push({
        doc,
        actionText: doc.action.trim(),
        category,
        isCompleted,
        isGenerated: false,
      });
    } else if (!isCompleted && category === "Overdue") {
      items.push({
        doc,
        actionText: "Review expired document",
        category: "Overdue",
        isCompleted: false,
        isGenerated: true,
      });
    }
  }
  return items;
}

/**
 * Computes deterministic priority for Feature 8: "What Should I Do Next?"
 * Returns highest priority action item with explicit explanatory reasons.
 */
export function computeNextBestAction(documents) {
  const effectiveItems = getEffectiveActionItems(documents);
  const activeItems = effectiveItems.filter((item) => !item.isCompleted);

  if (activeItems.length === 0) {
    // If no active action, check if any important doc has an expiry coming up
    const expiringImportant = documents.find(
      (d) => d.is_important && d.expiry_date && (parseDateSafe(d.expiry_date)?.getTime() || 0) > Date.now()
    );
    if (expiringImportant) {
      return {
        doc: expiringImportant,
        title: `Review ${expiringImportant.title}`,
        action: `Review and prepare renewal for ${expiringImportant.title}`,
        reasons: [
          "Document is marked as important ⭐",
          `Expires on ${formatDate(expiringImportant.expiry_date)}`,
        ],
        priorityLevel: "Medium",
        isGenerated: true,
      };
    }
    return null;
  }

  const now = Date.now();

  const scored = activeItems.map(({ doc, actionText, isGenerated }) => {
    let score = 0;
    const reasons = [];
    const targetDateStr = doc.action_due_date || doc.expiry_date;

    if (targetDateStr) {
      const targetDate = parseDateSafe(targetDateStr);
      const targetTime = targetDate ? targetDate.getTime() : null;
      const diffHours = targetTime !== null ? (targetTime - now) / (1000 * 60 * 60) : 0;

      if (targetTime !== null && diffHours < 0) {
        score += 1000;
        const daysPast = Math.max(1, Math.abs(Math.floor(diffHours / 24)));
        reasons.push(
          isGenerated
            ? `Document expired on ${formatDate(targetDateStr)} (${daysPast} day(s) overdue)`
            : `Action is overdue by ${daysPast} day(s)`
        );
      } else if (targetTime !== null && diffHours <= 24) {
        score += 800;
        reasons.push("Action is due today");
      } else if (targetTime !== null && diffHours <= 72) {
        score += 600;
        reasons.push(`Action is due in ${Math.ceil(diffHours / 24)} days`);
      } else if (targetTime !== null && diffHours <= 168) {
        score += 400;
        reasons.push("Due within the next 7 days");
      } else if (targetTime !== null) {
        score += 100;
        reasons.push(`Upcoming deadline on ${formatDate(targetDateStr)}`);
      } else {
        score += 50;
        reasons.push("No explicit deadline configured");
      }
    } else {
      score += 50;
      reasons.push("No explicit deadline configured");
    }

    if (doc.is_important) {
      score += 300;
      reasons.push("Document marked as important ⭐");
    }

    if (doc.remind_at) {
      const remDate = parseDateSafe(doc.remind_at);
      const remTime = remDate ? remDate.getTime() : null;
      const remDiff = remTime !== null ? (remTime - now) / (1000 * 60) : -1;
      if (remDiff > 0 && remDiff <= 24 * 60) {
        score += 200;
        reasons.push("Reminder scheduled within next 24 hours ⏰");
      }
    }

    if (doc.action_status === "In Progress") {
      score += 150;
      reasons.push("Already marked in progress");
    }

    return {
      doc,
      score,
      reasons,
      action: actionText,
      action_status: doc.action_status || "Pending",
      priorityLevel:
        score >= 800 ? "Urgent" : score >= 500 ? "High" : score >= 300 ? "Medium" : "Normal",
      isGenerated,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0];
}


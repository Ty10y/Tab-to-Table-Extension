const listEl = document.getElementById("list");
const msgEl = document.getElementById("msg");
const importBtn = document.getElementById("importBtn");
const importView = document.getElementById("importView");
const importText = document.getElementById("importText");
const cancelBtn = document.getElementById("cancelBtn");
const confirmBtn = document.getElementById("confirmBtn");

// Chrome tab group color name -> approximate hex for the dot
const COLOR_HEX = {
  grey: "#5f6368", blue: "#4285f4", red: "#ea4335", yellow: "#fbbc04",
  green: "#34a853", pink: "#ff69b4", purple: "#a142f4", cyan: "#24c1e0",
  orange: "#fa903e"
};

function esc(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildHtml(tabs) {
  const rows = tabs.map(t =>
    `<tr><td>${esc(t.title)}</td><td><a href="${esc(t.url)}">${esc(t.url)}</a></td></tr>`
  ).join("");
  return `<table border="1" cellspacing="0" cellpadding="4">` +
    `<thead><tr><th>Tab name</th><th>URL</th></tr></thead>` +
    `<tbody>${rows}</tbody></table>`;
}

function buildMarkdown(tabs) {
  const clean = s => String(s).replaceAll("|", "\\|").replace(/\r?\n/g, " ");
  const rows = tabs.map(t => `| ${clean(t.title)} | ${clean(t.url)} |`).join("\n");
  return `| Tab name | URL |\n| --- | --- |\n${rows}`;
}

async function copyGroup(group) {
  const tabs = await chrome.tabs.query({ groupId: group.id });
  if (!tabs.length) {
    msgEl.textContent = "That group has no tabs.";
    msgEl.className = "msg err";
    return;
  }
  const html = buildHtml(tabs);
  const markdown = buildMarkdown(tabs);
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([markdown], { type: "text/plain" })
      })
    ]);
    msgEl.textContent = `Copied ${tabs.length} tab${tabs.length > 1 ? "s" : ""}.`;
    msgEl.className = "msg ok";
  } catch (e) {
    // Fallback: plain markdown only
    try {
      await navigator.clipboard.writeText(markdown);
      msgEl.textContent = `Copied ${tabs.length} tabs (Markdown only).`;
      msgEl.className = "msg ok";
    } catch (e2) {
      msgEl.textContent = "Copy failed: " + e2.message;
      msgEl.className = "msg err";
    }
  }
}

async function init() {
  listEl.innerHTML = "";
  const [win] = await chrome.windows.getCurrent ? [await chrome.windows.getCurrent()] : [null];
  const groups = await chrome.tabGroups.query(
    win ? { windowId: win.id } : {}
  );

  if (!groups.length) {
    msgEl.textContent = "No tab groups in this window.";
    return;
  }

  for (const g of groups) {
    const tabs = await chrome.tabs.query({ groupId: g.id });
    const btn = document.createElement("button");
    btn.className = "group";

    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = COLOR_HEX[g.color] || "#5f6368";

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = g.title || "(untitled group)";

    const count = document.createElement("span");
    count.className = "count";
    count.textContent = tabs.length + (tabs.length === 1 ? " tab" : " tabs");

    btn.append(dot, name, count);
    btn.addEventListener("click", () => copyGroup(g));
    listEl.appendChild(btn);
  }
}

// --- Import feature ---

function showImportView() {
  listEl.style.display = "none";
  importView.style.display = "flex";
  msgEl.textContent = "";
  importBtn.textContent = "Back";
  importText.value = "";
  importText.focus();
}

function showListView() {
  listEl.style.display = "";
  importView.style.display = "none";
  importBtn.textContent = "Import";
}

importBtn.addEventListener("click", () => {
  if (importView.style.display === "flex") {
    showListView();
  } else {
    showImportView();
  }
});

cancelBtn.addEventListener("click", showListView);

// Matches http(s) links, trims common trailing punctuation picked up
// from pasted table cells (e.g. a trailing "," "." ")" or "|").
const URL_RE = /https?:\/\/[^\s"'<>|]+/g;

function extractUniqueUrls(text) {
  const matches = text.match(URL_RE) || [];
  const cleaned = matches.map(u => u.replace(/[).,;]+$/, ""));
  return [...new Set(cleaned)];
}

async function importUrls() {
  const urls = extractUniqueUrls(importText.value);
  if (!urls.length) {
    msgEl.textContent = "No links found in that text.";
    msgEl.className = "msg err";
    return;
  }

  confirmBtn.disabled = true;
  msgEl.textContent = `Creating ${urls.length} tab${urls.length > 1 ? "s" : ""}...`;
  msgEl.className = "msg";

  try {
    const win = await chrome.windows.getCurrent();
    const tabIds = [];
    for (const url of urls) {
      const tab = await chrome.tabs.create({ url, active: false, windowId: win.id });
      tabIds.push(tab.id);
    }
    const groupId = await chrome.tabs.group({ tabIds, createProperties: { windowId: win.id } });
    await chrome.tabGroups.update(groupId, { title: "New Group" });

    msgEl.textContent = `Added ${urls.length} link${urls.length > 1 ? "s" : ""} to "New Group".`;
    msgEl.className = "msg ok";
    showListView();
    init();
  } catch (e) {
    msgEl.textContent = "Import failed: " + e.message;
    msgEl.className = "msg err";
  } finally {
    confirmBtn.disabled = false;
  }
}

confirmBtn.addEventListener("click", importUrls);

init();

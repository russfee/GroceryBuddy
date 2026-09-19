const overviewTab = document.querySelector("#overviewTab");
const editorTab = document.querySelector("#editorTab");
const authGate = document.querySelector("#authGate");
const authForm = document.querySelector("#authForm");
const authPassword = document.querySelector("#authPassword");
const authButton = document.querySelector("#authButton");
const authMessage = document.querySelector("#authMessage");
const overviewView = document.querySelector("#overviewView");
const editorView = document.querySelector("#editorView");
const tabs = document.querySelector("#tabs");
const editor = document.querySelector("#editor");
const statusEl = document.querySelector("#status");
const syncStatus = document.querySelector("#syncStatus");
const wordCount = document.querySelector("#wordCount");
const refreshButton = document.querySelector("#refreshButton");
const saveButton = document.querySelector("#saveButton");
const weeklyMeta = document.querySelector("#weeklyMeta");
const weeklyExtras = document.querySelector("#weeklyExtras");
const extrasCount = document.querySelector("#extrasCount");
const staplesList = document.querySelector("#staplesList");
const staplesCount = document.querySelector("#staplesCount");
const mealPlanCard = document.querySelector("#mealPlanCard");
const mealPlanList = document.querySelector("#mealPlanList");
const doNotBuyList = document.querySelector("#doNotBuyList");
const quickAddForm = document.querySelector("#quickAddForm");
const quickAddInput = document.querySelector("#quickAddInput");
const quickAddButton = document.querySelector("#quickAddButton");
const overviewNotice = document.querySelector("#overviewNotice");
const weekDate = document.querySelector("#weekDate");
const weekTitle = document.querySelector("#weekTitle");
const newWeekButton = document.querySelector("#newWeekButton");
const finishWeekButton = document.querySelector("#finishWeekButton");
const weekResult = document.querySelector("#weekResult");
const reminderList = document.querySelector("#reminderList");
const reminderLists = document.querySelector("#reminderLists");
const loadListsButton = document.querySelector("#loadListsButton");
const importRemindersButton = document.querySelector("#importRemindersButton");
const reminderPreview = document.querySelector("#reminderPreview");

const FILE_LABELS = {
  "CommonList.md": "Staples",
  "WeeklyAddOns.md": "This week",
  "MealPlan.md": "Meal plan",
  "Preferences.md": "Preferences",
  "ItemAliases.md": "Aliases",
  "DoNotBuy.md": "Do not buy"
};

let files = [];
let activeName = "WeeklyAddOns.md";
let dirty = false;
let appStatus = null;
let apiPassword = sessionStorage.getItem("groceryBuddyPassword") || "";

weekDate.value = new Date().toISOString().slice(0, 10);

overviewTab.addEventListener("click", () => switchView("overview"));
editorTab.addEventListener("click", () => switchView("editor"));
authForm.addEventListener("submit", authenticate);
refreshButton.addEventListener("click", loadFiles);
saveButton.addEventListener("click", saveActiveFile);
quickAddForm.addEventListener("submit", addQuickItem);
editor.addEventListener("input", () => {
  dirty = true;
  updateStatus("Unsaved changes");
  updateLineCount();
});

newWeekButton.addEventListener("click", createWeek);
finishWeekButton.addEventListener("click", completePlacedOrder);
loadListsButton.addEventListener("click", loadReminderLists);
importRemindersButton.addEventListener("click", importReminders);
reminderLists.addEventListener("change", () => {
  if (reminderLists.value) reminderList.value = reminderLists.value;
});

await loadFiles();

async function switchView(view) {
  if (view === "overview" && dirty) await saveActiveFile();
  const showOverview = view === "overview";
  overviewView.hidden = !showOverview;
  editorView.hidden = showOverview;
  overviewTab.classList.toggle("active", showOverview);
  editorTab.classList.toggle("active", !showOverview);
  overviewTab.setAttribute("aria-selected", String(showOverview));
  editorTab.setAttribute("aria-selected", String(!showOverview));
  if (showOverview) renderOverview();
}

async function loadFiles({ authAttempt = false } = {}) {
  setRefreshBusy(true);
  clearOverviewNotice();
  try {
    await loadStatus();
    const response = await apiFetch("/api/files");
    const data = await response.json();
    if (response.status === 401) {
      clearApiPassword();
      showAuth(authAttempt ? "That password didn’t work. Try again." : "Enter your password to load the grocery lists.");
      updateStatus("Sign in required");
      syncStatus.textContent = "Sign in required";
      return false;
    }
    if (!response.ok) throw new Error(data.error || "Could not load grocery files");
    files = data.files;
    if (!files.some((file) => file.name === activeName)) {
      activeName = files[0]?.name;
    }
    renderTabs();
    renderEditor();
    renderOverview();
    hideAuth();
    updateStatus("Ready");
    syncStatus.textContent = `Updated ${new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date())}`;
    return true;
  } catch (error) {
    updateStatus(error.message);
    if (authAttempt) showAuth(error.message);
    else showOverviewNotice(error.message, true);
    syncStatus.textContent = "Could not refresh";
    return false;
  } finally {
    setRefreshBusy(false);
  }
}

async function authenticate(event) {
  event.preventDefault();
  const password = authPassword.value;
  if (!password) return;

  apiPassword = password;
  sessionStorage.setItem("groceryBuddyPassword", apiPassword);
  authButton.disabled = true;
  authButton.textContent = "Opening…";
  authMessage.textContent = "";

  const loaded = await loadFiles({ authAttempt: true });
  if (loaded) authPassword.value = "";
  else {
    authPassword.focus();
    authPassword.select();
  }

  authButton.disabled = false;
  authButton.textContent = "Open my list";
}

function showAuth(message) {
  authMessage.textContent = message;
  authGate.hidden = false;
  requestAnimationFrame(() => authPassword.focus());
}

function hideAuth() {
  authGate.hidden = true;
  authMessage.textContent = "";
}

function clearApiPassword() {
  apiPassword = "";
  sessionStorage.removeItem("groceryBuddyPassword");
}

async function loadStatus() {
  const response = await fetch("/api/status");
  appStatus = await response.json();
  const mode = appStatus.mode === "github"
    ? `GitHub · ${appStatus.branch}`
    : "Local files";
  document.querySelector("#filePath").textContent = mode;

  const remindersAvailable = Boolean(appStatus.reminders);
  loadListsButton.disabled = !remindersAvailable;
  importRemindersButton.disabled = !remindersAvailable;
  if (!remindersAvailable) reminderPreview.textContent = "Available when GroceryBuddy is running locally on your Mac.";
}

function renderOverview() {
  const extras = parseWeeklySections(fileContent("WeeklyAddOns.md"));
  const staples = parseSimpleList(fileContent("CommonList.md"));
  const mealPlan = parseSimpleList(fileContent("MealPlan.md"));
  const exclusions = parseSimpleList(fileContent("DoNotBuy.md"));

  extrasCount.textContent = String(extras.length);
  staplesCount.textContent = String(staples.length);
  renderExtras(extras);
  renderList(staplesList, staples, "No regular staples yet.");
  renderList(mealPlanList, mealPlan, "No meal notes for this week.");
  renderList(doNotBuyList, exclusions, "No exclusions listed.");
  mealPlanCard.hidden = mealPlan.length === 0;

  weeklyMeta.replaceChildren(
    createMetaPill(extras.length, extras.length === 1 ? "extra" : "extras"),
    createMetaPill(staples.length, "staples"),
    createMetaPill(exclusions.length, exclusions.length === 1 ? "exclusion" : "exclusions")
  );
}

function renderExtras(items) {
  weeklyExtras.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("li");
    empty.className = "emptyState";
    empty.textContent = "Nothing extra has been added yet. Use the field above when something comes to mind.";
    weeklyExtras.append(empty);
    return;
  }

  for (const item of items) {
    const listItem = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = item.value;
    const source = document.createElement("small");
    source.className = "itemSource";
    source.textContent = readableSection(item.section);
    listItem.append(name, source);
    weeklyExtras.append(listItem);
  }
}

function renderList(container, items, emptyText) {
  container.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("li");
    empty.className = "emptyState";
    empty.textContent = emptyText;
    container.append(empty);
    return;
  }
  for (const item of items) {
    const listItem = document.createElement("li");
    listItem.textContent = item;
    container.append(listItem);
  }
}

function createMetaPill(number, label) {
  const pill = document.createElement("span");
  pill.className = "metaPill";
  const value = document.createElement("strong");
  value.textContent = String(number);
  pill.append(value, ` ${label}`);
  return pill;
}

function parseWeeklySections(content) {
  const items = [];
  let section = "This week";
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || /^#{1,6}\s/.test(line)) continue;
    if (!line.startsWith("-") && line.endsWith(":")) {
      section = line.slice(0, -1).trim();
      continue;
    }
    const match = line.match(/^[-*]\s+(.+)$/);
    if (match?.[1]?.trim()) items.push({ section, value: match[1].trim() });
  }
  return items;
}

function parseSimpleList(content) {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^#{1,6}\s/.test(line) && line !== "-")
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter(Boolean);
}

function readableSection(section) {
  const normalized = section.toLowerCase();
  if (normalized.includes("siri")) return "Added by Siri";
  if (normalized.includes("reminder")) return "From Reminders";
  if (normalized.includes("specific")) return "Specific request";
  return section;
}

async function addQuickItem(event) {
  event.preventDefault();
  const item = quickAddInput.value.replace(/\s+/g, " ").trim();
  if (!item) {
    quickAddInput.focus();
    return;
  }

  const addOns = files.find((file) => file.name === "WeeklyAddOns.md");
  if (!addOns) {
    showOverviewNotice("WeeklyAddOns.md is unavailable.", true);
    return;
  }

  quickAddButton.disabled = true;
  quickAddButton.textContent = "Adding…";
  clearOverviewNotice();
  try {
    addOns.content = appendToNeedThisWeek(addOns.content, item);
    const data = await saveFile(addOns, "Added");
    if (activeName === addOns.name) renderEditor();
    renderOverview();
    quickAddInput.value = "";
    showOverviewNotice(syncStatusText(data.sync, `Added “${item}”`));
  } catch (error) {
    showOverviewNotice(error.message, true);
  } finally {
    quickAddButton.disabled = false;
    quickAddButton.textContent = "Add item";
  }
}

function appendToNeedThisWeek(content, item) {
  const lines = content.split("\n");
  let headingIndex = lines.findIndex((line) => line.trim().toLowerCase() === "need this week:");
  if (headingIndex < 0) {
    lines.push("", "Need this week:", `- ${item}`);
    return `${lines.join("\n").trimEnd()}\n`;
  }

  let firstContentIndex = headingIndex + 1;
  while (firstContentIndex < lines.length && !lines[firstContentIndex].trim()) firstContentIndex += 1;
  if (lines[firstContentIndex]?.trim() === "-") {
    lines[firstContentIndex] = `- ${item}`;
  } else {
    lines.splice(headingIndex + 1, 0, `- ${item}`);
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

function renderTabs() {
  tabs.replaceChildren();
  for (const file of files) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = file.name === activeName ? "tab active" : "tab";
    button.textContent = FILE_LABELS[file.name] || file.name.replace(".md", "");
    button.addEventListener("click", async () => {
      if (dirty) await saveActiveFile();
      activeName = file.name;
      renderTabs();
      renderEditor();
      updateStatus("Ready");
    });
    tabs.append(button);
  }
}

function renderEditor() {
  const active = files.find((file) => file.name === activeName);
  editor.value = active?.content || "";
  dirty = false;
  updateLineCount();
}

async function saveActiveFile() {
  const active = files.find((file) => file.name === activeName);
  if (!active) return;
  active.content = editor.value;
  saveButton.disabled = true;
  saveButton.textContent = "Saving…";
  try {
    const data = await saveFile(active, "Saved");
    dirty = false;
    updateStatus(syncStatusText(data.sync, "Saved"));
    renderOverview();
  } catch (error) {
    updateStatus(error.message);
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "Save changes";
  }
}

async function saveFile(file, fallback) {
  const response = await apiFetch("/api/file", {
    method: "POST",
    body: JSON.stringify({ name: file.name, content: file.content })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `${fallback} failed`);
  return data;
}

async function createWeek() {
  if (dirty) await saveActiveFile();
  weekResult.textContent = "";
  const response = await apiFetch("/api/week", {
    method: "POST",
    body: JSON.stringify({ date: weekDate.value, title: weekTitle.value })
  });
  const data = await response.json();
  weekResult.textContent = response.ok ? `Created ${data.file}. ${syncStatusText(data.sync, "")}`.trim() : data.error;
  weekResult.className = response.ok ? "panelResult" : "panelResult notice";
}

async function completePlacedOrder() {
  if (dirty) await saveActiveFile();
  weekResult.textContent = "";
  const ok = window.confirm("Has the grocery order been successfully placed? This will archive the week and clear captured items.");
  if (!ok) return;

  const response = await apiFetch("/api/order-placed", {
    method: "POST",
    body: JSON.stringify({ date: weekDate.value, title: weekTitle.value, confirmed: true })
  });
  const data = await response.json();
  if (!response.ok) {
    weekResult.textContent = data.error || "Order completion failed";
    weekResult.className = "panelResult notice";
    return;
  }

  weekResult.textContent = `Order recorded. Archived ${data.file}. ${data.cleared ? "Cleared captures." : "No captures to clear."}`;
  weekResult.className = "panelResult";
  await loadFiles();
  activeName = "WeeklyAddOns.md";
  renderTabs();
  renderEditor();
}

async function loadReminderLists() {
  reminderPreview.textContent = "";
  reminderLists.replaceChildren();
  try {
    const response = await apiFetch("/api/reminders/lists");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    for (const name of data.lists) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      reminderLists.append(option);
    }
    reminderPreview.textContent = `${data.lists.length} lists`;
    reminderPreview.className = "panelResult";
  } catch (error) {
    reminderPreview.textContent = error.message;
    reminderPreview.className = "panelResult notice";
  }
}

async function importReminders() {
  if (dirty) await saveActiveFile();
  reminderPreview.textContent = "";
  try {
    const response = await apiFetch(`/api/reminders?list=${encodeURIComponent(reminderList.value)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    const lines = data.reminders.map((item) => `- ${item.name}${item.body ? ` (${item.body})` : ""}`);
    const addOns = files.find((file) => file.name === "WeeklyAddOns.md");
    const insertion = ["", `Reminders from ${data.list}:`, ...lines, ""].join("\n");
    addOns.content = `${addOns.content.trimEnd()}\n${insertion}`;
    const saveData = await saveFile(addOns, "Import");
    reminderPreview.textContent = lines.length ? lines.join("\n") : "No incomplete reminders";
    reminderPreview.className = "panelResult";
    activeName = "WeeklyAddOns.md";
    renderTabs();
    renderEditor();
    renderOverview();
    updateStatus(syncStatusText(saveData.sync, "Imported"));
  } catch (error) {
    reminderPreview.textContent = error.message;
    reminderPreview.className = "panelResult notice";
  }
}

function fileContent(name) {
  return files.find((file) => file.name === name)?.content || "";
}

function setRefreshBusy(busy) {
  refreshButton.disabled = busy;
  refreshButton.lastChild.textContent = busy ? " Loading…" : " Refresh";
}

function showOverviewNotice(text, isError = false) {
  overviewNotice.textContent = text;
  overviewNotice.className = isError ? "overviewNotice notice" : "overviewNotice";
}

function clearOverviewNotice() {
  showOverviewNotice("");
}

function updateStatus(text) {
  statusEl.textContent = text;
}

function updateLineCount() {
  const lines = editor.value ? editor.value.split("\n").length : 0;
  wordCount.textContent = `${lines} lines`;
}

function syncStatusText(sync, fallback) {
  if (!sync) return fallback;
  if (sync.status === "pushed") return sync.commit ? `${fallback} and synced (${sync.commit.slice(0, 7)})` : `${fallback} and synced`;
  if (sync.status === "unchanged") return `${fallback} (already current)`;
  if (sync.status === "disabled") return `${fallback} (auto-sync off)`;
  if (sync.status === "failed") return `${fallback}; sync failed: ${sync.error}`;
  return fallback;
}

async function apiFetch(url, options = {}) {
  const headers = {
    "content-type": "application/json",
    ...(options.headers || {})
  };
  if (apiPassword) headers["x-grocerybuddy-password"] = apiPassword;

  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) clearApiPassword();
  return response;
}

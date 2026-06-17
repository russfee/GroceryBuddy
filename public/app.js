const tabs = document.querySelector("#tabs");
const editor = document.querySelector("#editor");
const statusEl = document.querySelector("#status");
const wordCount = document.querySelector("#wordCount");
const refreshButton = document.querySelector("#refreshButton");
const saveButton = document.querySelector("#saveButton");
const weekDate = document.querySelector("#weekDate");
const weekTitle = document.querySelector("#weekTitle");
const newWeekButton = document.querySelector("#newWeekButton");
const weekResult = document.querySelector("#weekResult");
const reminderList = document.querySelector("#reminderList");
const reminderLists = document.querySelector("#reminderLists");
const loadListsButton = document.querySelector("#loadListsButton");
const importRemindersButton = document.querySelector("#importRemindersButton");
const reminderPreview = document.querySelector("#reminderPreview");

let files = [];
let activeName = "CommonList.md";
let dirty = false;
let appStatus = null;
let apiPassword = sessionStorage.getItem("groceryBuddyPassword") || "";

weekDate.value = new Date().toISOString().slice(0, 10);

refreshButton.addEventListener("click", loadFiles);
saveButton.addEventListener("click", saveActiveFile);
editor.addEventListener("input", () => {
  dirty = true;
  updateStatus("Unsaved");
  updateLineCount();
});

newWeekButton.addEventListener("click", createWeek);
loadListsButton.addEventListener("click", loadReminderLists);
importRemindersButton.addEventListener("click", importReminders);
reminderLists.addEventListener("change", () => {
  if (reminderLists.value) reminderList.value = reminderLists.value;
});

await loadFiles();

async function loadFiles() {
  await loadStatus();
  const response = await apiFetch("/api/files");
  const data = await response.json();
  if (!response.ok) {
    updateStatus(data.error || "Could not load files");
    return;
  }
  files = data.files;
  if (!files.some((file) => file.name === activeName)) {
    activeName = files[0]?.name;
  }
  renderTabs();
  renderEditor();
  updateStatus("Ready");
}

async function loadStatus() {
  const response = await fetch("/api/status");
  appStatus = await response.json();
  const mode = appStatus.mode === "github"
    ? `GitHub: ${appStatus.repo}@${appStatus.branch}`
    : "Local files";
  document.querySelector("#filePath").textContent = `RussRodeo / GroceryBuddy - ${mode}`;
}

function renderTabs() {
  tabs.replaceChildren();
  for (const file of files) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = file.name === activeName ? "tab active" : "tab";
    button.textContent = file.name.replace(".md", "");
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
  const response = await apiFetch("/api/file", {
    method: "POST",
    body: JSON.stringify({ name: active.name, content: active.content })
  });
  if (!response.ok) {
    const data = await response.json();
    updateStatus(data.error || "Save failed");
    return;
  }
  dirty = false;
  updateStatus("Saved");
}

async function createWeek() {
  if (dirty) await saveActiveFile();
  weekResult.textContent = "";
  const response = await apiFetch("/api/week", {
    method: "POST",
    body: JSON.stringify({ date: weekDate.value, title: weekTitle.value })
  });
  const data = await response.json();
  weekResult.textContent = response.ok ? `Created ${data.file}` : data.error;
  weekResult.className = response.ok ? "" : "notice";
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
  } catch (error) {
    reminderPreview.textContent = error.message;
    reminderPreview.className = "notice";
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
    const insertion = [``, `Reminders from ${data.list}:`, ...lines, ``].join("\n");
    addOns.content = `${addOns.content.trimEnd()}\n${insertion}`;
    if (activeName === "WeeklyAddOns.md") editor.value = addOns.content;
    await apiFetch("/api/file", {
      method: "POST",
      body: JSON.stringify({ name: addOns.name, content: addOns.content })
    });
    reminderPreview.textContent = lines.length ? lines.join("\n") : "No incomplete reminders";
    activeName = "WeeklyAddOns.md";
    renderTabs();
    renderEditor();
    updateStatus("Imported");
  } catch (error) {
    reminderPreview.textContent = error.message;
    reminderPreview.className = "notice";
  }
}

function updateStatus(text) {
  statusEl.textContent = text;
}

function updateLineCount() {
  const lines = editor.value ? editor.value.split("\n").length : 0;
  wordCount.textContent = `${lines} lines`;
}

async function apiFetch(url, options = {}) {
  const headers = {
    "content-type": "application/json",
    ...(options.headers || {})
  };
  if (apiPassword) headers["x-grocerybuddy-password"] = apiPassword;

  let response = await fetch(url, { ...options, headers });
  if (response.status !== 401) return response;

  const password = window.prompt("GroceryBuddy password");
  if (!password) return response;

  apiPassword = password;
  sessionStorage.setItem("groceryBuddyPassword", apiPassword);
  response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      "x-grocerybuddy-password": apiPassword
    }
  });

  if (response.status === 401) {
    sessionStorage.removeItem("groceryBuddyPassword");
    apiPassword = "";
  }

  return response;
}

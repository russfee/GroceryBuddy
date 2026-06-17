import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const PORT = Number(process.env.PORT || 4322);

const MANAGED_FILES = [
  "CommonList.md",
  "WeeklyAddOns.md",
  "Preferences.md",
  "DoNotBuy.md",
  "MealPlan.md"
];

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

await ensureScaffold();

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/api/files" && req.method === "GET") {
      return sendJson(res, await readManagedFiles());
    }

    if (url.pathname === "/api/file" && req.method === "POST") {
      const body = await readJson(req);
      if (!MANAGED_FILES.includes(body.name)) {
        return sendJson(res, { error: "Unknown file" }, 400);
      }
      await writeFile(path.join(ROOT, body.name), String(body.content ?? ""), "utf8");
      return sendJson(res, { ok: true });
    }

    if (url.pathname === "/api/week" && req.method === "POST") {
      const body = await readJson(req);
      const fileName = safeWeekName(body.date);
      const filePath = path.join(ROOT, "weeks", fileName);
      const files = await readManagedFiles();
      const content = buildWeekContent(body.title, body.date, files);
      await writeFile(filePath, content, { encoding: "utf8", flag: "wx" });
      return sendJson(res, { ok: true, file: `weeks/${fileName}` });
    }

    if (url.pathname === "/api/reminders/lists" && req.method === "GET") {
      return sendJson(res, { lists: await readReminderLists() });
    }

    if (url.pathname === "/api/reminders" && req.method === "GET") {
      const listName = url.searchParams.get("list") || "Groceries";
      return sendJson(res, { list: listName, reminders: await readReminders(listName) });
    }

    return serveStatic(url.pathname, res);
  } catch (error) {
    return sendJson(res, { error: error.message }, 500);
  }
}).listen(PORT, () => {
  console.log(`GroceryBuddy running at http://localhost:${PORT}`);
});

async function ensureScaffold() {
  await mkdir(PUBLIC, { recursive: true });
  await mkdir(path.join(ROOT, "weeks"), { recursive: true });

  const defaults = {
    "WeeklyAddOns.md": "# Weekly Add Ons\n\nNeed this week:\n- \n\nSpecific requests:\n- \n",
    "Preferences.md": "# Preferences\n\nFruit: prefer fresh hand fruit and good sale value.\nYogurt: plain Greek only, no vanilla.\nCereal: Vector, Rice Krispies, and Cheerios are okay; avoid very sugary options.\nMeat: prefer value packs when the discount is meaningful.\nBread: multigrain sandwich bread; white submarine buns.\n",
    "DoNotBuy.md": "# Do Not Buy\n\n- \n",
    "MealPlan.md": "# Meal Plan\n\n"
  };

  for (const [name, content] of Object.entries(defaults)) {
    const filePath = path.join(ROOT, name);
    if (!existsSync(filePath)) {
      await writeFile(filePath, content, "utf8");
    }
  }
}

async function readManagedFiles() {
  const entries = [];
  for (const name of MANAGED_FILES) {
    const filePath = path.join(ROOT, name);
    entries.push({
      name,
      content: existsSync(filePath) ? await readFile(filePath, "utf8") : ""
    });
  }
  return { files: entries };
}

function buildWeekContent(title, date, fileData) {
  const byName = Object.fromEntries(fileData.files.map((file) => [file.name, stripTopHeading(file.content)]));
  return [
    `# ${title || "Grocery Week"}`,
    "",
    `Date: ${date || new Date().toISOString().slice(0, 10)}`,
    "",
    "## Weekly Add Ons",
    byName["WeeklyAddOns.md"] || "",
    "",
    "## Meal Plan",
    byName["MealPlan.md"] || "",
    "",
    "## Common List",
    byName["CommonList.md"] || "",
    "",
    "## Preferences",
    byName["Preferences.md"] || "",
    "",
    "## Do Not Buy",
    byName["DoNotBuy.md"] || "",
    ""
  ].join("\n");
}

function stripTopHeading(content) {
  return String(content || "").replace(/^# .*\r?\n+/, "").trim();
}

function safeWeekName(date) {
  const value = String(date || new Date().toISOString().slice(0, 10));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Use a YYYY-MM-DD date");
  }
  return `${value}.md`;
}

async function serveStatic(pathname, res) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const normalized = path.normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC, normalized);
  if (!filePath.startsWith(PUBLIC)) {
    return sendText(res, "Not found", 404);
  }
  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { "content-type": CONTENT_TYPES[ext] || "application/octet-stream" });
    res.end(data);
  } catch {
    sendText(res, "Not found", 404);
  }
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function sendText(res, text, status = 200) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(text);
}

function readReminderLists() {
  return runJxa(`
function run() {
  const Reminders = Application("Reminders");
  return JSON.stringify(Reminders.lists().map((list) => list.name()));
}
`).then(JSON.parse);
}

function readReminders(listName) {
  return runJxa(`
function run(argv) {
  const listName = argv[0] || "Groceries";
  const Reminders = Application("Reminders");
  const list = Reminders.lists.byName(listName);
  const reminders = list.reminders().filter((item) => !item.completed()).map((item) => ({
    name: item.name(),
    body: item.body() || ""
  }));
  return JSON.stringify(reminders);
}
`, [listName]).then(JSON.parse);
}

function runJxa(script, args = []) {
  return new Promise((resolve, reject) => {
    execFile("osascript", ["-l", "JavaScript", "-e", script, ...args], { timeout: 15000 }, (error, stdout, stderr) => {
      if (error) {
        const detail = stderr.trim();
        reject(new Error(detail || "Reminders access is not available yet. Grant automation permission for Reminders, then try again."));
        return;
      }
      resolve(stdout.trim() || "[]");
    });
  });
}

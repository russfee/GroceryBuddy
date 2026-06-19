import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..");
export const PUBLIC = path.join(ROOT, "public");

export const MANAGED_FILES = [
  "CommonList.md",
  "WeeklyAddOns.md",
  "ItemAliases.md",
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

const DEFAULTS = {
  "WeeklyAddOns.md": "# Weekly Add Ons\n\nNeed this week:\n- \n\nSpecific requests:\n- \n",
  "ItemAliases.md": "# Item Aliases\n\nMilk => 2% milk, 4L\nYoghurt => plain Greek yogurt, large tub, no vanilla\nYogurt => plain Greek yogurt, large tub, no vanilla\nButter => regular butter, compare sale price\nPaper towel => paper towel, compare unit price and avoid tiny packs\nPaper towels => paper towel, compare unit price and avoid tiny packs\nNut butter => peanut butter unless another nut is specified\nNacho chips => tortilla chips or nacho chips, buy sale/value option\n",
  "Preferences.md": "# Preferences\n\nFruit: prefer fresh hand fruit and good sale value.\nYogurt: plain Greek only, no vanilla.\nCereal: Vector, Rice Krispies, and Cheerios are okay; avoid very sugary options.\nMeat: prefer value packs when the discount is meaningful.\nBread: multigrain sandwich bread; white submarine buns.\n",
  "DoNotBuy.md": "# Do Not Buy\n\n- \n",
  "MealPlan.md": "# Meal Plan\n\n"
};

export async function ensureScaffold() {
  if (storageMode() === "github") return;

  await mkdir(PUBLIC, { recursive: true });
  await mkdir(path.join(ROOT, "weeks"), { recursive: true });

  for (const [name, content] of Object.entries(DEFAULTS)) {
    const filePath = path.join(ROOT, name);
    if (!existsSync(filePath)) {
      await writeFile(filePath, content, "utf8");
    }
  }
}

export async function handleApiRequest(req, res, pathname) {
  try {
    const url = new URL(req.url || pathname, "http://grocerybuddy.local");
    const route = pathname || url.pathname;

    if (route === "/api/status" && req.method === "GET") {
      return sendJson(res, status());
    }

    if (!isAuthorized(req)) {
      return sendJson(res, { error: "GroceryBuddy password required" }, 401);
    }

    if (route === "/api/files" && req.method === "GET") {
      return sendJson(res, await readManagedFiles());
    }

    if (route === "/api/file" && req.method === "POST") {
      const body = await readJson(req);
      if (!MANAGED_FILES.includes(body.name)) {
        return sendJson(res, { error: "Unknown file" }, 400);
      }
      const sync = await writeManagedFile(body.name, String(body.content ?? ""));
      return sendJson(res, { ok: true, sync });
    }

    if (route === "/api/week" && req.method === "POST") {
      const body = await readJson(req);
      const fileName = safeWeekName(body.date);
      const files = await readManagedFiles();
      const content = buildWeekContent(body.title, body.date, files);
      const sync = await createWeekFile(fileName, content);
      return sendJson(res, { ok: true, file: `weeks/${fileName}`, sync });
    }

    if (route === "/api/reminders/lists" && req.method === "GET") {
      if (storageMode() === "github") {
        return sendJson(res, { error: "Apple Reminders import only works from the local Mac app." }, 400);
      }
      return sendJson(res, { lists: await readReminderLists() });
    }

    if (route === "/api/reminders" && req.method === "GET") {
      if (storageMode() === "github") {
        return sendJson(res, { error: "Apple Reminders import only works from the local Mac app." }, 400);
      }
      const listName = url.searchParams.get("list") || "Groceries";
      const limit = Number(url.searchParams.get("limit") || 80);
      return sendJson(res, { list: listName, reminders: await readReminders(listName, limit) });
    }

    return sendJson(res, { error: "Not found" }, 404);
  } catch (error) {
    return sendJson(res, { error: error.message }, 500);
  }
}

export async function serveStatic(pathname, res) {
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

export async function readManagedFiles() {
  const store = createStore();
  const entries = [];
  for (const name of MANAGED_FILES) {
    entries.push({
      name,
      content: await store.read(name)
    });
  }
  return { files: entries, storage: status() };
}

async function writeManagedFile(name, content) {
  return createStore().write(name, content, `Update ${name}`);
}

async function createWeekFile(fileName, content) {
  return createStore().create(`weeks/${fileName}`, content, `Create grocery week ${fileName.replace(".md", "")}`);
}

function createStore() {
  return storageMode() === "github" ? githubStore() : localStore();
}

function localStore() {
  return {
    async read(name) {
      const filePath = path.join(ROOT, name);
      return existsSync(filePath) ? readFile(filePath, "utf8") : "";
    },
    async write(name, content) {
      await writeFile(path.join(ROOT, name), content, "utf8");
      return publishLocalChange(name, `Update ${name}`);
    },
    async create(name, content) {
      await mkdir(path.dirname(path.join(ROOT, name)), { recursive: true });
      await writeFile(path.join(ROOT, name), content, { encoding: "utf8", flag: "wx" });
      return publishLocalChange(name, `Create ${name}`);
    }
  };
}

function githubStore() {
  const config = githubConfig();
  return {
    async read(name) {
      const file = await getGithubContent(config, name, true);
      return file?.content || "";
    },
    async write(name, content, message) {
      const existing = await getGithubContent(config, name, true);
      const data = await putGithubContent(config, name, content, message, existing?.sha);
      return { mode: "github", status: "pushed", commit: data.commit?.sha || null };
    },
    async create(name, content, message) {
      const existing = await getGithubContent(config, name, true);
      if (existing) {
        throw new Error(`${name} already exists`);
      }
      const data = await putGithubContent(config, name, content, message);
      return { mode: "github", status: "pushed", commit: data.commit?.sha || null };
    }
  };
}

async function publishLocalChange(relativePath, message) {
  if (process.env.GROCERYBUDDY_AUTO_PUSH === "false") {
    return { mode: "local-git", status: "disabled" };
  }

  try {
    const status = await runGit(["status", "--porcelain", "--", relativePath]);
    if (!status.stdout.trim()) {
      return { mode: "local-git", status: "unchanged" };
    }

    await runGit(["add", "--", relativePath]);

    const cached = await runGit(["diff", "--cached", "--quiet", "--", relativePath], { allowFailure: true });
    if (cached.code === 0) {
      return { mode: "local-git", status: "unchanged" };
    }
    if (cached.code !== 1) {
      throw new Error(cached.stderr || "Could not inspect staged changes");
    }

    await runGit(["commit", "-m", message, "--", relativePath]);
    await runGit(["pull", "--rebase", "--autostash"]);
    await runGit(["push"]);

    const head = await runGit(["rev-parse", "--short", "HEAD"]);
    return { mode: "local-git", status: "pushed", commit: head.stdout.trim() };
  } catch (error) {
    return { mode: "local-git", status: "failed", error: error.message };
  }
}

function runGit(args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd: ROOT, timeout: 30000 }, (error, stdout, stderr) => {
      const result = {
        code: typeof error?.code === "number" ? error.code : 0,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      };

      if (error && !options.allowFailure) {
        reject(new Error(result.stderr || error.message));
        return;
      }

      resolve(result);
    });
  });
}

function githubConfig() {
  const token = process.env.GROCERYBUDDY_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  const repo = process.env.GROCERYBUDDY_GITHUB_REPO ||
    process.env.GITHUB_REPOSITORY ||
    repoFromVercel();
  const branch = process.env.GROCERYBUDDY_GITHUB_BRANCH ||
    process.env.VERCEL_GIT_COMMIT_REF ||
    "main";

  if (!token) throw new Error("Missing GROCERYBUDDY_GITHUB_TOKEN");
  if (!repo) throw new Error("Missing GROCERYBUDDY_GITHUB_REPO, for example russfee/GroceryBuddy");

  return { token, repo, branch };
}

function repoFromVercel() {
  if (process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG) {
    return `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}`;
  }
  return "";
}

async function getGithubContent(config, filePath, allowMissing = false) {
  const encodedPath = encodePath(filePath);
  const response = await githubFetch(config, `contents/${encodedPath}?ref=${encodeURIComponent(config.branch)}`);
  if (response.status === 404 && allowMissing) return null;
  const data = await readGithubJson(response);
  if (!response.ok) throw new Error(data.message || `GitHub read failed for ${filePath}`);
  return {
    sha: data.sha,
    content: Buffer.from(data.content || "", "base64").toString("utf8")
  };
}

async function putGithubContent(config, filePath, content, message, sha) {
  const encodedPath = encodePath(filePath);
  const body = {
    message,
    branch: config.branch,
    content: Buffer.from(content).toString("base64")
  };
  if (sha) body.sha = sha;

  const response = await githubFetch(config, `contents/${encodedPath}`, {
    method: "PUT",
    body: JSON.stringify(body)
  });
  const data = await readGithubJson(response);
  if (!response.ok) throw new Error(data.message || `GitHub write failed for ${filePath}`);
  return data;
}

function githubFetch(config, endpoint, options = {}) {
  return fetch(`https://api.github.com/repos/${config.repo}/${endpoint}`, {
    ...options,
    headers: {
      "accept": "application/vnd.github+json",
      "authorization": `Bearer ${config.token}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
      ...(options.headers || {})
    }
  });
}

async function readGithubJson(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

function encodePath(filePath) {
  return filePath.split("/").map(encodeURIComponent).join("/");
}

function status() {
  const mode = storageMode();
  return {
    mode,
    repo: mode === "github" ? (process.env.GROCERYBUDDY_GITHUB_REPO || process.env.GITHUB_REPOSITORY || repoFromVercel()) : null,
    branch: mode === "github" ? (process.env.GROCERYBUDDY_GITHUB_BRANCH || process.env.VERCEL_GIT_COMMIT_REF || "main") : null,
    protected: Boolean(process.env.GROCERYBUDDY_PASSWORD),
    reminders: mode === "local",
    autoPublish: mode === "local" && process.env.GROCERYBUDDY_AUTO_PUSH !== "false"
  };
}

function storageMode() {
  return process.env.GROCERYBUDDY_STORAGE === "github" ||
    Boolean(process.env.GROCERYBUDDY_GITHUB_TOKEN || process.env.GITHUB_TOKEN)
    ? "github"
    : "local";
}

function isAuthorized(req) {
  const password = process.env.GROCERYBUDDY_PASSWORD;
  if (!password) return true;
  return req.headers["x-grocerybuddy-password"] === password;
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
    "## Item Aliases",
    byName["ItemAliases.md"] || "",
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

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function sendJson(res, data, statusCode = 200) {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function sendText(res, text, statusCode = 200) {
  res.writeHead(statusCode, { "content-type": "text/plain; charset=utf-8" });
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

async function readReminders(listName, limit = 80) {
  const total = Number(await runAppleScript(`
on run argv
  set listName to item 1 of argv
  tell application "Reminders" to count reminders of list listName
end run
`, [listName]));

  const batchSize = 40;
  const reminders = [];

  for (let start = 1; start <= total && reminders.length < limit; start += batchSize) {
    const end = Math.min(start + batchSize - 1, total);
    const batch = await readReminderBatch(listName, start, end);

    for (const reminder of batch) {
      if (reminder.completed) return reminders;
      reminders.push({ name: reminder.name, body: "" });
      if (reminders.length >= limit) break;
    }
  }

  return reminders;
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

async function readReminderBatch(listName, start, end) {
  const output = await runAppleScript(`
on run argv
  set listName to item 1 of argv
  set startIndex to (item 2 of argv) as integer
  set endIndex to (item 3 of argv) as integer
  set marker to "|||GROCERYBUDDY_COMPLETED|||"

  tell application "Reminders"
    set reminderNames to name of reminders startIndex thru endIndex of list listName
    set reminderStates to completed of reminders startIndex thru endIndex of list listName
  end tell

  set AppleScript's text item delimiters to linefeed
  set nameText to reminderNames as text
  set AppleScript's text item delimiters to ","
  set completedText to reminderStates as text
  set AppleScript's text item delimiters to ""

  return nameText & linefeed & marker & linefeed & completedText
end run
`, [listName, String(start), String(end)]);

  const [namesText = "", statesText = ""] = output.split("\n|||GROCERYBUDDY_COMPLETED|||\n");
  const names = namesText ? namesText.split("\n") : [];
  const states = statesText ? statesText.split(",").map((value) => value.trim() === "true") : [];

  return names.map((name, index) => ({
    name,
    completed: Boolean(states[index])
  }));
}

function runAppleScript(script, args = []) {
  return new Promise((resolve, reject) => {
    execFile("osascript", ["-e", script, ...args], { timeout: 30000 }, (error, stdout, stderr) => {
      if (error) {
        const detail = stderr.trim();
        reject(new Error(detail || "Reminders access is not available yet. Grant automation permission for Reminders, then try again."));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

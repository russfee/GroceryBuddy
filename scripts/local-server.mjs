import { createServer } from "node:http";
import { ensureScaffold, handleApiRequest, serveStatic } from "../lib/app.mjs";

const PORT = Number(process.env.PORT || 4322);

await ensureScaffold();

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname.startsWith("/api/")) {
    return handleApiRequest(req, res, url.pathname);
  }

  return serveStatic(url.pathname, res);
}).listen(PORT, () => {
  console.log(`GroceryBuddy running at http://localhost:${PORT}`);
});

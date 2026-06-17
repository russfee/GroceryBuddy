import { handleApiRequest } from "../lib/app.mjs";

export default function handler(req, res) {
  return handleApiRequest(req, res, "/api/week");
}

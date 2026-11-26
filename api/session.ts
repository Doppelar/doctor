import type { VercelRequest, VercelResponse } from "@vercel/node";
import { expectedToken, isAuthed } from "../lib/server.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.json({ authed: isAuthed(req), configured: Boolean(expectedToken()) });
}

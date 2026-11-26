import type { VercelRequest, VercelResponse } from "@vercel/node";
import { methodNotAllowed, setAuthCookie } from "../lib/server.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res);
  setAuthCookie(res, null);
  res.json({ authed: false });
}

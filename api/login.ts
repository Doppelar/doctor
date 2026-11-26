import type { VercelRequest, VercelResponse } from "@vercel/node";
import { checkPassword, methodNotAllowed, setAuthCookie } from "../lib/server.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return methodNotAllowed(res);
  const token = checkPassword(typeof req.body?.password === "string" ? req.body.password : "");
  if (!token) return res.status(401).json({ message: "パスワードが違います" });
  setAuthCookie(res, token);
  res.json({ authed: true });
}

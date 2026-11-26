import type { VercelRequest, VercelResponse } from "@vercel/node";
import { guard, insertPayments, methodNotAllowed, parseInput } from "../../lib/server.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guard(req, res)) return;
  if (req.method !== "POST") return methodNotAllowed(res);
  const input = parseInput(req.body);
  if (!input) return res.status(400).json({ message: "入力内容を確認してください（医師名・会社・年度・金額は必須）" });
  await insertPayments([input]);
  res.status(201).json({ ok: true });
}

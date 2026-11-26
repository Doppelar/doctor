import type { VercelRequest, VercelResponse } from "@vercel/node";
import { guard, insertPayments, methodNotAllowed } from "../../lib/server.js";
import { parsePaymentsCsv } from "../../src/shared/payments.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guard(req, res)) return;
  if (req.method !== "POST") return methodNotAllowed(res);
  const { rows, errors } = parsePaymentsCsv(String(req.body?.csv ?? ""));
  if (errors.length) return res.status(400).json({ message: "読み込めない行があります", errors });
  await insertPayments(rows);
  res.json({ imported: rows.length });
}

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { guard, loadEvents, loadPayments } from "../lib/server.js";
import { buildRelations } from "../src/shared/relations.js";

// 医師×製薬会社の関係（講演会での演者・座長、登録した支払い）
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guard(req, res)) return;
  const [events, payments] = await Promise.all([loadEvents(), loadPayments()]);
  res.json(buildRelations(events, payments));
}

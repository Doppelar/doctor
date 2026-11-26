import type { VercelRequest, VercelResponse } from "@vercel/node";
import { guard, loadEvents, loadPayments, yearParam } from "../lib/server.js";
import { availableYears, buildRelations, filterByYear } from "../src/shared/relations.js";

// 医師×製薬会社の関係（講演会での演者・座長、登録した支払い）。?year=2025 で年度を絞る
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guard(req, res)) return;
  const [events, payments] = await Promise.all([loadEvents(), loadPayments()]);
  const year = yearParam(req);
  const scoped = filterByYear(events, payments, year);
  res.json({ ...buildRelations(scoped.events, scoped.payments), years: availableYears(events, payments), year });
}

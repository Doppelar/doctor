import type { VercelRequest, VercelResponse } from "@vercel/node";
import { guard, loadEvents, loadPayments, yearParam } from "../../lib/server.js";
import { collectAppearances, summarizeDoctors } from "../../src/shared/payments.js";
import { filterByYear } from "../../src/shared/relations.js";

// 医師一覧：講演会カレンダーの演者・座長と、登録済みの支払いをまとめる。?year=2025 で年度を絞る
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guard(req, res)) return;
  const [events, payments] = await Promise.all([loadEvents(), loadPayments()]);
  const scoped = filterByYear(events, payments, yearParam(req));
  res.json(summarizeDoctors(collectAppearances(scoped.events), scoped.payments));
}

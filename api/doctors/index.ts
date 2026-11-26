import type { VercelRequest, VercelResponse } from "@vercel/node";
import { guard, loadEvents, loadPayments } from "../../lib/server.js";
import { collectAppearances, summarizeDoctors } from "../../src/shared/payments.js";

// 医師一覧：講演会カレンダーの演者・座長と、登録済みの支払いをまとめる
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guard(req, res)) return;
  const [events, payments] = await Promise.all([loadEvents(), loadPayments()]);
  res.json(summarizeDoctors(collectAppearances(events), payments));
}

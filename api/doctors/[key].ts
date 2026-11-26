import type { VercelRequest, VercelResponse } from "@vercel/node";
import { guard, loadEvents, loadPayments } from "../../lib/server.js";
import { collectAppearances, normalizeDoctorName } from "../../src/shared/payments.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guard(req, res)) return;
  const key = normalizeDoctorName(String(req.query.key ?? ""));
  const [events, payments] = await Promise.all([loadEvents(), loadPayments(key)]);
  const appearances = collectAppearances(events).get(key)?.appearances ?? [];
  res.json({
    key,
    name: appearances.length ? key : payments[0]?.doctorName ?? key,
    payments,
    appearances: [...appearances].sort((a, b) => b.date.localeCompare(a.date)),
  });
}

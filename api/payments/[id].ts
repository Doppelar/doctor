import type { VercelRequest, VercelResponse } from "@vercel/node";
import { guard, methodNotAllowed, sql } from "../../lib/server.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!guard(req, res)) return;
  if (req.method !== "DELETE") return methodNotAllowed(res);
  const id = Number(req.query.id);
  if (!Number.isInteger(id)) return res.status(400).json({ message: "IDが不正です" });
  await sql`delete from payments where id = ${id}`;
  res.status(204).end();
}

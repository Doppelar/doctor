// API 共通：データベース接続とパスワード認証。
import { neon } from "@neondatabase/serverless";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { normalizeDoctorName, type Payment, type PaymentInput } from "../src/shared/payments.js";

export const sql = neon(process.env.DATABASE_URL!);

const COOKIE = "pay_auth";
const MAX_AGE_SEC = 60 * 60 * 24 * 30;

const tokenFor = (password: string) => createHmac("sha256", password).update("payments-v1").digest("hex");

export function expectedToken(): string | null {
  const password = process.env.PAYMENTS_PASSWORD;
  return password ? tokenFor(password) : null;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function isAuthed(req: VercelRequest): boolean {
  const token = expectedToken();
  const got = req.cookies?.[COOKIE];
  return Boolean(token && got && safeEqual(got, token));
}

export function checkPassword(password: string): string | null {
  const token = expectedToken();
  return token && safeEqual(tokenFor(password), token) ? token : null;
}

export function setAuthCookie(res: VercelResponse, token: string | null) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE}=${token ?? ""}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=${token ? MAX_AGE_SEC : 0}`,
  );
}

/** 認証済みなら true。そうでなければ 401 を返して false。 */
export function guard(req: VercelRequest, res: VercelResponse): boolean {
  res.setHeader("Cache-Control", "no-store");
  if (isAuthed(req)) return true;
  res.status(401).json({ message: "パスワードが必要です" });
  return false;
}

export function methodNotAllowed(res: VercelResponse) {
  res.status(405).json({ message: "Method Not Allowed" });
}

export type EventRow = { id: number; date: string; title: string; category: string } & Record<string, unknown>;

/** 講演会カレンダーの演者・座長（読み取りのみ）。 */
export async function loadEvents(): Promise<EventRow[]> {
  const people = [1, 2, 3, 4, 5]
    .flatMap((i) => [
      `speaker_name_${i} as "speakerName${i}"`,
      `speaker_affiliation_${i} as "speakerAffiliation${i}"`,
      `moderator_name_${i} as "moderatorName${i}"`,
      `moderator_affiliation_${i} as "moderatorAffiliation${i}"`,
    ])
    .join(", ");
  return (await sql.query(`select id, date, title, category, ${people} from events`)) as EventRow[];
}

const PAYMENT_COLUMNS = `id, doctor_key as "doctorKey", doctor_name as "doctorName", institution, company,
  fiscal_year as "fiscalYear", category, count, amount, source_url as "sourceUrl", note`;

export async function loadPayments(doctorKey?: string): Promise<Payment[]> {
  const rows = doctorKey
    ? await sql.query(`select ${PAYMENT_COLUMNS} from payments where doctor_key = $1 order by fiscal_year desc, company`, [doctorKey])
    : await sql.query(`select ${PAYMENT_COLUMNS} from payments`);
  return rows as Payment[];
}

export async function insertPayments(inputs: readonly PaymentInput[]) {
  if (inputs.length === 0) return;
  await sql.transaction(
    inputs.map(
      (p) => sql`insert into payments (doctor_key, doctor_name, institution, company, fiscal_year, category, count, amount, source_url, note)
        values (${normalizeDoctorName(p.doctorName)}, ${p.doctorName.trim()}, ${p.institution?.trim() || null}, ${p.company.trim()},
          ${p.fiscalYear}, ${p.category.trim() || "講師謝金"}, ${p.count ?? null}, ${p.amount}, ${p.sourceUrl?.trim() || null}, ${p.note?.trim() || null})`,
    ),
  );
}

/** フォームからの1件分を確かめる。おかしければ null。 */
export function parseInput(body: any): PaymentInput | null {
  if (!body || typeof body !== "object") return null;
  const fiscalYear = Number(body.fiscalYear);
  const amount = Number(body.amount);
  const count = body.count === "" || body.count == null ? null : Number(body.count);
  if (typeof body.doctorName !== "string" || !body.doctorName.trim()) return null;
  if (typeof body.company !== "string" || !body.company.trim()) return null;
  if (!Number.isInteger(fiscalYear) || fiscalYear < 2000 || fiscalYear > 2100) return null;
  if (!Number.isInteger(amount) || amount < 0) return null;
  if (count !== null && (!Number.isInteger(count) || count < 0)) return null;
  return {
    doctorName: body.doctorName,
    institution: body.institution ?? null,
    company: body.company,
    fiscalYear,
    category: String(body.category ?? "講師謝金"),
    count,
    amount,
    sourceUrl: body.sourceUrl ?? null,
    note: body.note ?? null,
  };
}

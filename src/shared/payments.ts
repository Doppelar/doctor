// 製薬会社から医師への支払い（謝礼金など）の型と、外部依存のない処理。
export type Payment = {
  id: number;
  doctorKey: string;
  doctorName: string;
  institution: string | null;
  company: string;
  fiscalYear: number;
  category: string;
  count: number | null;
  amount: number;
  sourceUrl: string | null;
  note: string | null;
};

export const PAYMENT_CATEGORIES = ["講師謝金", "原稿執筆料・監修料", "コンサルティング等業務委託費", "その他"] as const;

export type PaymentInput = {
  doctorName: string;
  institution?: string | null;
  company: string;
  fiscalYear: number;
  category: string;
  count?: number | null;
  amount: number;
  sourceUrl?: string | null;
  note?: string | null;
};

/** 「松本 守生 先生」→「松本守生」。空白・敬称・前後の記号を取り除く。 */
/** 同じ人でも書き方が分かれやすい異体字（髙→高 など）。名前の照合だけに使う。 */
const VARIANTS: Record<string, string> = {
  "髙": "高", // 髙 → 高
  "﨑": "崎", // 﨑 → 崎
  "塚": "塚", // 塚（互換） → 塚
  "德": "徳", // 德 → 徳
  "\u{20BB7}": "吉", // 𠮷 → 吉
  "黑": "黒", // 黑 → 黒
};
const VARIANT_RE = new RegExp(`[${Object.keys(VARIANTS).join("")}]`, "gu");

export function normalizeDoctorName(name: string): string {
  return name
    .normalize("NFKC")
    .replace(VARIANT_RE, (c) => VARIANTS[c] ?? c)
    .replace(/[（(].*$/, "")
    .replace(/\s+/g, "")
    .replace(/^[│|・,、]+|[│|・,、]+$/g, "")
    .replace(/(先生|医師|教授|准教授|講師|Dr\.?|MD)$/i, "");
}

/** 日本人医師の名前らしいか（漢字・かなで2〜10文字）。所属や肩書が入った誤登録を除くため。 */
export function looksLikeJapaneseName(key: string): boolean {
  return /^[぀-ヿ㐀-鿿豈-﫿々ヶ]{2,10}$/.test(key) &&
    !/(大学|病院|センター|教授|講師|内科|部長|科長|医局|研究所|クリニック|さん)/.test(key);
}

export type CalendarAppearance = {
  eventId: number;
  date: string;
  title: string;
  category: string;
  role: "演者" | "座長";
  affiliation: string;
};

type EventLike = { id: number; date: string; title: string; category: string } & Record<string, unknown>;

/** カレンダーの演者・座長を、医師ごとの登場記録にまとめる（同じ講演会での重複は1回に）。 */
export function collectAppearances(events: readonly EventLike[]): Map<string, { name: string; appearances: CalendarAppearance[] }> {
  const doctors = new Map<string, { name: string; appearances: CalendarAppearance[] }>();
  for (const event of events) {
    const seen = new Set<string>();
    for (let i = 1; i <= 5; i++) {
      for (const role of ["演者", "座長"] as const) {
        const prefix = role === "演者" ? "speaker" : "moderator";
        const raw = event[`${prefix}Name${i}`];
        if (typeof raw !== "string") continue;
        for (const part of raw.split(/[/／、,]/)) {
          const key = normalizeDoctorName(part);
          if (!looksLikeJapaneseName(key) || seen.has(`${key}:${role}`)) continue;
          seen.add(`${key}:${role}`);
          const entry = doctors.get(key) ?? { name: key, appearances: [] };
          entry.appearances.push({
            eventId: event.id,
            date: event.date,
            title: event.title,
            category: event.category,
            role,
            affiliation: String(event[`${prefix}Affiliation${i}`] ?? "").replace(/^（|）$/g, "").trim(),
          });
          doctors.set(key, entry);
        }
      }
    }
  }
  return doctors;
}

/** "1,234,000円" や "¥1,234,000" を数値に。読めなければ null。 */
export function parseYen(value: string): number | null {
  const digits = value.normalize("NFKC").replace(/[¥￥円,\s]/g, "");
  return /^\d+$/.test(digits) ? Number(digits) : null;
}

/** 1行を CSV のルールで分割する（"..." 内のカンマと "" に対応）。 */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === "," || ch === "\t") { cells.push(cell); cell = ""; }
    else cell += ch;
  }
  cells.push(cell);
  return cells.map((c) => c.trim());
}

export const CSV_COLUMNS = ["医師名", "所属", "会社", "年度", "区分", "件数", "金額", "出典URL", "備考"] as const;

/**
 * 貼り付けた CSV（またはタブ区切り）を読み込む。
 * 1行目が見出し（CSV_COLUMNS の名前）ならその順番に従い、なければ CSV_COLUMNS の順とみなす。
 */
export function parsePaymentsCsv(text: string): { rows: PaymentInput[]; errors: string[] } {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { rows: [], errors: ["データがありません"] };
  const first = splitCsvLine(lines[0]);
  const hasHeader = first.some((c) => (CSV_COLUMNS as readonly string[]).includes(c));
  const order = hasHeader ? first : [...CSV_COLUMNS];
  const col = (cells: string[], name: string) => cells[order.indexOf(name)] ?? "";
  const rows: PaymentInput[] = [];
  const errors: string[] = [];
  lines.slice(hasHeader ? 1 : 0).forEach((line, i) => {
    const lineNo = i + (hasHeader ? 2 : 1);
    const cells = splitCsvLine(line);
    const doctorName = col(cells, "医師名");
    const company = col(cells, "会社");
    const fiscalYear = Number(col(cells, "年度").normalize("NFKC").replace(/年度?$/, ""));
    const amount = parseYen(col(cells, "金額"));
    const countText = col(cells, "件数").normalize("NFKC").replace(/件$/, "");
    if (!doctorName || !company) return errors.push(`${lineNo}行目：医師名と会社は必須です`);
    if (!Number.isInteger(fiscalYear) || fiscalYear < 2000 || fiscalYear > 2100) return errors.push(`${lineNo}行目：年度が読めません`);
    if (amount === null) return errors.push(`${lineNo}行目：金額が読めません`);
    rows.push({
      doctorName,
      institution: col(cells, "所属") || null,
      company,
      fiscalYear,
      category: col(cells, "区分") || "講師謝金",
      count: /^\d+$/.test(countText) ? Number(countText) : null,
      amount,
      sourceUrl: col(cells, "出典URL") || null,
      note: col(cells, "備考") || null,
    });
  });
  return { rows, errors };
}

export type DoctorSummary = {
  key: string;
  name: string;
  affiliation: string;
  lectureCount: number;
  lastLecture: string | null;
  total: number;
  byYear: Record<string, number>;
  companies: string[];
};

/** カレンダーの登場記録と支払いを、医師ごとの一覧にまとめる。 */
export function summarizeDoctors(
  appearances: Map<string, { name: string; appearances: CalendarAppearance[] }>,
  rows: readonly Payment[],
): DoctorSummary[] {
  const doctors = new Map<string, DoctorSummary>();
  for (const [key, { name, appearances: list }] of appearances) {
    const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date));
    doctors.set(key, {
      key,
      name,
      affiliation: sorted.find((a) => a.affiliation)?.affiliation ?? "",
      lectureCount: list.length,
      lastLecture: sorted[0]?.date ?? null,
      total: 0,
      byYear: {},
      companies: [],
    });
  }
  for (const p of rows) {
    const d = doctors.get(p.doctorKey) ?? {
      key: p.doctorKey, name: p.doctorName, affiliation: p.institution ?? "",
      lectureCount: 0, lastLecture: null, total: 0, byYear: {}, companies: [],
    };
    d.total += p.amount;
    d.byYear[p.fiscalYear] = (d.byYear[p.fiscalYear] ?? 0) + p.amount;
    if (!d.companies.includes(p.company)) d.companies.push(p.company);
    if (!d.affiliation && p.institution) d.affiliation = p.institution;
    doctors.set(p.doctorKey, d);
  }
  return [...doctors.values()];
}

// 医師と製薬会社の関係（講演会での演者・座長、登録した支払い）をまとめる。外部依存なし。
import { collectAppearances, type Payment } from "./payments.js";

/** 講演会カレンダーのカテゴリ名 → 会社名（製品名のカテゴリは販売会社にまとめる）。 */
const CATEGORY_COMPANY: Record<string, string> = {
  ヤンセンファーマ: "ヤンセンファーマ（J&J）",
  中外: "中外製薬",
  サノフィ: "サノフィ",
  "エプキンリ(エリア)": "アッヴィ／ジェンマブ",
  "エプキンリ(全国)": "アッヴィ／ジェンマブ",
  エプキンリ: "アッヴィ／ジェンマブ",
  アッビィ: "アッヴィ／ジェンマブ",
  ブリストル: "ブリストル・マイヤーズ スクイブ",
  GSK: "グラクソ・スミスクライン",
  シンバイオ: "シンバイオ製薬",
  ギリアド: "ギリアド・サイエンシズ",
  武田薬品: "武田薬品",
  エーザイ: "エーザイ",
  ノバルティス: "ノバルティス",
  テブダック: "テブダック",
  小野薬品: "小野薬品",
  日本新薬: "日本新薬",
  ファイザー: "ファイザー",
  CSL: "CSLベーリング",
};

/** 「その他」のときに、タイトルから会社を推定するための手がかり。 */
const TITLE_HINTS: Array<[RegExp, string]> = [
  [/Novartis|ノバルティス/i, "ノバルティス"],
  [/CSL|ハイゼントラ/i, "CSLベーリング"],
  [/ハイキュービア|Takeda|武田/i, "武田薬品"],
  [/キリン/, "協和キリン"],
  [/Janssen|Johnson\s*&\s*Johnson|J&J/i, "ヤンセンファーマ（J&J）"],
  [/Sanofi|サノフィ|サークリサ|sarCLIsa/i, "サノフィ"],
  [/AbbVie|アッヴィ|エプキンリ/i, "アッヴィ／ジェンマブ"],
  [/Chugai|中外/i, "中外製薬"],
  [/BMS|Bristol|ブリストル/i, "ブリストル・マイヤーズ スクイブ"],
  [/Pfizer|ファイザー/i, "ファイザー"],
];

/** 会社に結びつかないカテゴリ（学会・社外講師勉強会）は null。 */
export function companyOf(category: string, title: string): string | null {
  if (CATEGORY_COMPANY[category]) return CATEGORY_COMPANY[category];
  if (category === "その他") return TITLE_HINTS.find(([re]) => re.test(title))?.[1] ?? null;
  return null;
}

export type RelationEdge = {
  doctor: string;
  company: string;
  lectures: number; // 演者・座長として登場した講演会の数
  asSpeaker: number;
  asModerator: number;
  amount: number; // 登録した支払いの合計（円）
  feeAmount: number; // うち講師謝金の金額（件数のわかるもの）
  feeCount: number; // その件数
  lastDate: string | null;
};

export type Relations = {
  doctors: Array<{ key: string; name: string; affiliation: string; lectures: number; amount: number; companies: number }>;
  companies: Array<{ name: string; lectures: number; doctors: number; amount: number }>;
  edges: RelationEdge[];
};

type EventLike = { id: number; date: string; title: string; category: string } & Record<string, unknown>;

/** 講演会と支払いから、医師×会社の関係をまとめる。 */
export function buildRelations(events: readonly EventLike[], payments: readonly Payment[]): Relations {
  const byId = new Map(events.map((e) => [e.id, e]));
  const appearances = collectAppearances(events);
  const edges = new Map<string, RelationEdge>();
  const edge = (doctor: string, company: string) => {
    const k = `${doctor}\u0000${company}`;
    let e = edges.get(k);
    if (!e) edges.set(k, (e = { doctor, company, lectures: 0, asSpeaker: 0, asModerator: 0, amount: 0, feeAmount: 0, feeCount: 0, lastDate: null }));
    return e;
  };

  const info = new Map<string, { name: string; affiliation: string }>();
  for (const [key, { name, appearances: list }] of appearances) {
    const latest = [...list].sort((a, b) => b.date.localeCompare(a.date));
    info.set(key, { name, affiliation: latest.find((a) => a.affiliation)?.affiliation ?? "" });
    // 同じ講演会で演者と座長を兼ねても、講演会の数は1と数える
    const counted = new Set<string>();
    for (const a of list) {
      const ev = byId.get(a.eventId);
      const company = ev && companyOf(ev.category, ev.title);
      if (!company) continue;
      const e = edge(key, company);
      if (a.role === "演者") e.asSpeaker++;
      else e.asModerator++;
      if (!counted.has(`${a.eventId}:${company}`)) {
        counted.add(`${a.eventId}:${company}`);
        e.lectures++;
      }
      if (!e.lastDate || a.date > e.lastDate) e.lastDate = a.date;
    }
  }
  for (const p of payments) {
    const e = edge(p.doctorKey, p.company);
    e.amount += p.amount;
    if (p.category === "講師謝金" && p.count && p.count > 0) {
      e.feeAmount += p.amount;
      e.feeCount += p.count;
    }
    if (!info.has(p.doctorKey)) info.set(p.doctorKey, { name: p.doctorName, affiliation: p.institution ?? "" });
  }

  const list = [...edges.values()];
  const doctors = [...new Set(list.map((e) => e.doctor))].map((key) => {
    const mine = list.filter((e) => e.doctor === key);
    return {
      key,
      ...(info.get(key) ?? { name: key, affiliation: "" }),
      lectures: mine.reduce((s, e) => s + e.lectures, 0),
      amount: mine.reduce((s, e) => s + e.amount, 0),
      companies: mine.length,
    };
  });
  const companies = [...new Set(list.map((e) => e.company))].map((name) => {
    const mine = list.filter((e) => e.company === name);
    return {
      name,
      lectures: mine.reduce((s, e) => s + e.lectures, 0),
      doctors: mine.length,
      amount: mine.reduce((s, e) => s + e.amount, 0),
    };
  });
  return {
    doctors: doctors.sort((a, b) => b.lectures - a.lectures || b.amount - a.amount),
    companies: companies.sort((a, b) => b.lectures - a.lectures),
    edges: list,
  };
}

/** 目安金額の単価（1回あたり、円）。 */
export type FeeRates = { speaker: number; moderator: number };

/** 登場回数 × 単価の目安金額。 */
export function estimateFee(e: Pick<RelationEdge, "asSpeaker" | "asModerator">, rates: FeeRates): number {
  return e.asSpeaker * rates.speaker + e.asModerator * rates.moderator;
}

/** 医師ごと（または会社ごと）に、目安金額と登録済みの支払いを合計する。 */
export function sumFees(edges: readonly RelationEdge[], rates: FeeRates, keyOf: (e: RelationEdge) => string, units: Map<string, number> = new Map()) {
  const out = new Map<string, { estimate: number; registered: number }>();
  for (const e of edges) {
    const k = keyOf(e);
    const v = out.get(k) ?? { estimate: 0, registered: 0 };
    v.estimate += estimateFeeFor(e, rates, units.get(e.doctor) ?? null);
    v.registered += e.amount;
    out.set(k, v);
  }
  return out;
}

/** 講師謝金の実績から出す1回あたりの単価（件数のわかる登録がなければ null）。 */
export function unitPrice(edges: readonly Pick<RelationEdge, "feeAmount" | "feeCount">[]): number | null {
  const count = edges.reduce((s, e) => s + e.feeCount, 0);
  return count > 0 ? edges.reduce((s, e) => s + e.feeAmount, 0) / count : null;
}

/**
 * 医師ごとの単価を使った目安金額。実績の単価があれば演者1回をその単価、座長は既定の比率（座長÷演者）で計算する。
 * 実績がなければ既定の単価を使う。
 */
export function estimateFeeFor(e: Pick<RelationEdge, "asSpeaker" | "asModerator">, rates: FeeRates, doctorUnit: number | null): number {
  if (doctorUnit == null) return estimateFee(e, rates);
  const ratio = rates.speaker > 0 ? rates.moderator / rates.speaker : 0.5;
  return e.asSpeaker * doctorUnit + e.asModerator * doctorUnit * ratio;
}

/** 医師ごとの実績単価（講師謝金の金額÷件数）。 */
export function doctorUnitPrices(edges: readonly RelationEdge[]): Map<string, number> {
  const byDoctor = new Map<string, RelationEdge[]>();
  for (const e of edges) byDoctor.set(e.doctor, [...(byDoctor.get(e.doctor) ?? []), e]);
  const out = new Map<string, number>();
  for (const [doctor, list] of byDoctor) {
    const u = unitPrice(list);
    if (u != null) out.set(doctor, u);
  }
  return out;
}

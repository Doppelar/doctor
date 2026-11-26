import { describe, expect, it } from "vitest";
import {
  collectAppearances,
  looksLikeJapaneseName,
  normalizeDoctorName,
  parsePaymentsCsv,
  parseYen,
  summarizeDoctors,
  type Payment,
} from "./payments";

describe("医師名の正規化", () => {
  it("空白・敬称・余計な記号を取り除く", () => {
    expect(normalizeDoctorName("松本 守生 先生")).toBe("松本守生");
    expect(normalizeDoctorName("今井陽一先生（")).toBe("今井陽一");
    expect(normalizeDoctorName("平松靖史先生│")).toBe("平松靖史");
  });

  it("日本人の名前らしいものだけを残す", () => {
    expect(looksLikeJapaneseName("松本守生")).toBe(true);
    expect(looksLikeJapaneseName("山梨大学医学部附属病院血液・腫瘍内科教授")).toBe(false);
    expect(looksLikeJapaneseName("JasonWestin")).toBe(false);
  });
});

describe("金額と CSV の読み込み", () => {
  it("円・カンマ付きの金額を数値にする", () => {
    expect(parseYen("¥1,234,000円")).toBe(1234000);
    expect(parseYen("abc")).toBeNull();
  });

  it("見出し付き CSV を読み、必須項目が欠けた行はエラーにする", () => {
    const r = parsePaymentsCsv('医師名,会社,年度,区分,件数,金額\n松本 守生 先生,A製薬,2024,講師謝金,3,"1,200,000"\n,B,2024,,,1');
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ amount: 1200000, count: 3, fiscalYear: 2024 });
    expect(r.errors).toEqual(["3行目：医師名と会社は必須です"]);
  });

  it("見出しのないタブ区切りは決まった列順で読む", () => {
    const r = parsePaymentsCsv("鈴木一史\t東北大\tC社\t2023年度\t原稿執筆料・監修料\t1件\t50000");
    expect(r.rows[0]).toMatchObject({ fiscalYear: 2023, amount: 50000, count: 1, institution: "東北大" });
  });
});

describe("医師ごとのまとめ", () => {
  const events = [
    { id: 1, date: "2026-11-25", title: "T", category: "X", speakerName1: "松本 守生 先生", moderatorName1: "松本 守生 先生", speakerName2: "松本守生先生", speakerAffiliation1: "（渋川）" },
  ];

  it("同じ講演会の同じ役割は1回と数え、所属の括弧を外す", () => {
    const m = collectAppearances(events);
    expect(m.get("松本守生")!.appearances).toHaveLength(2);
    expect(m.get("松本守生")!.appearances[0].affiliation).toBe("渋川");
  });

  it("支払いを年度別に合計し、カレンダーにいない医師も一覧に加える", () => {
    const pay = (over: Partial<Payment>): Payment => ({
      id: 1, doctorKey: "松本守生", doctorName: "松本守生", institution: null, company: "A",
      fiscalYear: 2024, category: "講師謝金", count: null, amount: 100, sourceUrl: null, note: null, ...over,
    });
    const list = summarizeDoctors(collectAppearances(events), [
      pay({}), pay({ amount: 50, company: "B" }), pay({ fiscalYear: 2023, amount: 10 }),
      pay({ doctorKey: "山田花子", doctorName: "山田 花子", institution: "X病院" }),
    ]);
    const matsumoto = list.find((d) => d.key === "松本守生")!;
    expect(matsumoto).toMatchObject({ total: 160, byYear: { 2024: 150, 2023: 10 }, companies: ["A", "B"], lectureCount: 2 });
    expect(list.find((d) => d.key === "山田花子")).toMatchObject({ name: "山田 花子", affiliation: "X病院", lectureCount: 0 });
  });
});

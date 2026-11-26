import { describe, expect, it } from "vitest";
import { buildRelations, companyOf } from "./relations";
import type { Payment } from "./payments";

describe("カテゴリから会社を決める", () => {
  it("製品名のカテゴリは販売会社にまとめる", () => {
    expect(companyOf("エプキンリ(エリア)", "")).toBe("アッヴィ／ジェンマブ");
    expect(companyOf("アッビィ", "")).toBe("アッヴィ／ジェンマブ");
    expect(companyOf("中外", "")).toBe("中外製薬");
  });

  it("「その他」はタイトルから推定し、わからなければ null", () => {
    expect(companyOf("その他", "Novartis Hematology Web Seminar")).toBe("ノバルティス");
    expect(companyOf("その他", "ハイキュービア全国web講演会")).toBe("武田薬品");
    expect(companyOf("その他", "高齢者の多発性骨髄腫")).toBeNull();
  });

  it("学会・社外講師勉強会は会社に結びつけない", () => {
    expect(companyOf("学会", "Janssen ランチョンセミナー")).toBeNull();
    expect(companyOf("社外講師勉強会", "外部講師")).toBeNull();
  });
});

describe("医師×会社の関係", () => {
  const events = [
    { id: 1, date: "2026-01-10", title: "A", category: "ヤンセンファーマ", speakerName1: "松本 守生 先生", moderatorName1: "松本守生先生" },
    { id: 2, date: "2026-03-01", title: "B", category: "ヤンセンファーマ", moderatorName1: "松本守生", speakerName1: "鈴木 一史" },
    { id: 3, date: "2026-02-01", title: "C", category: "サノフィ", speakerName1: "松本守生" },
    { id: 4, date: "2026-02-02", title: "D", category: "学会", speakerName1: "松本守生" },
  ];
  const pay: Payment = {
    id: 1, doctorKey: "松本守生", doctorName: "松本守生", institution: null, company: "サノフィ",
    fiscalYear: 2025, category: "講師謝金", count: 1, amount: 100000, sourceUrl: null, note: null,
  };

  it("演者と座長を兼ねた講演会は1回と数え、役割ごとの回数も残す", () => {
    const r = buildRelations(events, []);
    const e = r.edges.find((x) => x.doctor === "松本守生" && x.company === "ヤンセンファーマ（J&J）")!;
    expect(e).toMatchObject({ lectures: 2, asSpeaker: 1, asModerator: 2, lastDate: "2026-03-01" });
  });

  it("学会は会社との関係に入れない", () => {
    const r = buildRelations(events, []);
    expect(r.edges.filter((x) => x.doctor === "松本守生")).toHaveLength(2);
  });

  it("支払いの金額を同じ関係に足し、医師・会社ごとに合計する", () => {
    const r = buildRelations(events, [pay]);
    expect(r.edges.find((x) => x.company === "サノフィ")).toMatchObject({ lectures: 1, amount: 100000 });
    expect(r.doctors[0]).toMatchObject({ key: "松本守生", lectures: 3, amount: 100000, companies: 2 });
    expect(r.companies.find((c) => c.name === "ヤンセンファーマ（J&J）")).toMatchObject({ lectures: 3, doctors: 2 });
  });
});

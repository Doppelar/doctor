// メーカー比較：選んだ会社どうしで、医師がどちら寄りか（好意度）を見る。
import { useMemo, useState } from "react";
import { compareCompanies, leanCounts, type RelationEdge } from "./shared/relations";
import { man, yen } from "./fees";
import { useEdgeFee, useRelations } from "./relations-view";
import { Button, Card } from "./ui";

/** 比較する会社の色（選んだ順に参照パレットの1〜4番）。 */
const COMPARE_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"];
const DEFAULT_COMPARE = ["ヤンセンファーマ（J&J）", "サノフィ"];

export function CompanyCompare({ onOpenDoctor }: { onOpenDoctor: (key: string) => void }) {
  const { data, isLoading } = useRelations();
  const fee = useEdgeFee(data);
  const [chosen, setChosen] = useState<string[]>(DEFAULT_COMPARE);
  const [metric, setMetric] = useState<"amount" | "count">("amount");
  const [minTotal, setMinTotal] = useState(2);
  const [allOnly, setAllOnly] = useState(false);

  const companies = (data?.companies ?? []).map((c) => c.name);
  const active = chosen.filter((c) => companies.includes(c));
  const names = useMemo(() => new Map((data?.doctors ?? []).map((d) => [d.key, d])), [data]);

  const rows = useMemo(() => {
    if (!data) return [];
    const valueOf = (e: RelationEdge) => (metric === "count" ? e.lectures : Math.max(fee(e), e.amount));
    const lectures = new Map<string, number>();
    for (const e of data.edges) if (active.includes(e.company)) lectures.set(e.doctor, (lectures.get(e.doctor) ?? 0) + e.lectures);
    return compareCompanies(data.edges, active, valueOf).filter(
      (r) => (lectures.get(r.doctor) ?? 0) >= minTotal && (!allOnly || r.values.every((v) => v > 0)),
    );
  }, [data, active.join("|"), metric, fee, minTotal, allOnly]);

  const two = active.length === 2;
  const lean = two ? leanCounts(rows) : null;
  const toggle = (c: string) =>
    setChosen((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : cur.length >= 4 ? cur : [...cur, c]));
  const fmt = (v: number) => (metric === "count" ? `${v}回` : `${man(v)}円`);

  if (isLoading || !data) return <p className="text-sm text-slate-500">読み込み中…</p>;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <p className="text-sm font-medium">比べる会社（2〜4社。押して選ぶ・外す）</p>
        <div className="flex flex-wrap gap-1.5">
          {companies.map((c) => {
            const i = active.indexOf(c);
            return (
              <Button
                key={c}
                variant="outline"
                size="sm"
                aria-pressed={i >= 0}
                onClick={() => toggle(c)}
                className={i >= 0 ? "border-2 font-semibold" : "text-slate-600"}
                style={i >= 0 ? { borderColor: COMPARE_COLORS[i] } : undefined}
              >
                {i >= 0 && <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COMPARE_COLORS[i] }} />}
                {c}
              </Button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <div className="flex gap-1 rounded-md bg-slate-200/70 p-1" role="tablist">
            {([["amount", "金額（目安）"], ["count", "回数"]] as const).map(([v, l]) => (
              <Button key={v} variant="ghost" size="sm" role="tab" aria-selected={metric === v}
                className={metric === v ? "bg-white shadow-sm hover:bg-white" : ""} onClick={() => setMetric(v)}>
                {l}
              </Button>
            ))}
          </div>
          <label className="flex items-center gap-2">
            選んだ会社での登場が
            <select value={minTotal} onChange={(e) => setMinTotal(Number(e.target.value))} className="h-9 rounded-md border border-slate-300 bg-white px-2">
              {[1, 2, 3, 5].map((n) => <option key={n} value={n}>{n}回以上</option>)}
            </select>
            の医師
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={allOnly} onChange={(e) => setAllOnly(e.target.checked)} />
            選んだ会社すべてと関係のある医師だけ
          </label>
        </div>
      </div>

      {active.length < 2 ? (
        <p className="text-sm text-slate-500">会社を2社以上選んでください。</p>
      ) : (
        <>
          {lean && (
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <LeanBox color={COMPARE_COLORS[0]} label={`${active[0]}寄り（70%以上）`} n={lean.first} />
              <LeanBox color="#cbd5e1" label="中間" n={lean.middle} />
              <LeanBox color={COMPARE_COLORS[1]} label={`${active[1]}寄り（70%以上）`} n={lean.second} />
            </div>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700" aria-label="凡例">
            {active.map((c, i) => (
              <span key={c} className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded-sm" style={{ background: COMPARE_COLORS[i] }} />
                {c}
              </span>
            ))}
          </div>
          <Card className="p-4">
            {two && (
              <div className="mb-1 grid grid-cols-[6.5rem_1fr_6rem] gap-2 text-[11px] text-slate-500 sm:grid-cols-[8rem_1fr_8rem]">
                <span />
                <span className="flex justify-between"><span>← {active[0]}</span><span>50%</span><span>{active[1]} →</span></span>
                <span />
              </div>
            )}
            <div className="space-y-1.5">
              {rows.map((r) => {
                const d = names.get(r.doctor);
                const name = d?.name ?? r.doctor;
                return (
                  <div key={r.doctor} className="grid grid-cols-[6.5rem_1fr_6rem] items-center gap-2 text-xs sm:grid-cols-[8rem_1fr_8rem]">
                    <button type="button" className="truncate text-left font-medium text-slate-800 hover:underline" onClick={() => onOpenDoctor(r.doctor)} title={d?.affiliation}>
                      {name}
                    </button>
                    <div
                      className="relative flex h-5 overflow-hidden rounded-[4px] bg-slate-100"
                      role="img"
                      aria-label={`${name}：${active.map((c, i) => `${c} ${Math.round(r.shares[i] * 100)}%`).join("、")}`}
                      title={active.map((c, i) => `${c} ${Math.round(r.shares[i] * 100)}%（${metric === "count" ? `${r.values[i]}回` : yen(r.values[i])}）`).join("\n")}
                    >
                      {r.shares.map((sh, i) =>
                        sh > 0 ? (
                          <div key={i} className="flex h-full items-center justify-center border-r-2 border-white text-[10px] font-medium text-white last:border-r-0"
                            style={{ width: `${sh * 100}%`, background: COMPARE_COLORS[i] }}>
                            {sh >= 0.15 && `${Math.round(sh * 100)}%`}
                          </div>
                        ) : null,
                      )}
                      {two && <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-slate-900/40" />}
                    </div>
                    <span className="truncate text-right tabular-nums text-slate-600">{r.values.map(fmt).join(" / ")}</span>
                  </div>
                );
              })}
            </div>
            {rows.length === 0 && <p className="text-sm text-slate-500">この条件に当てはまる医師はいません。</p>}
          </Card>
          <p className="text-xs text-slate-500">
            割合は、選んだ会社の合計を100%としたものです（選んでいない会社との関係は含みません）。金額は目安（登場回数×単価。支払いを登録した組み合わせは登録額との大きい方）。棒にマウスを重ねると内訳が出ます。
          </p>
        </>
      )}
    </div>
  );
}

function LeanBox({ color, label, n }: { color: string; label: string; n: number }) {
  return (
    <div className="rounded-lg border-2 bg-white p-2" style={{ borderColor: color }}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{n}人</div>
    </div>
  );
}

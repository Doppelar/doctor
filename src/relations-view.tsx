// 関係性マップ（ネットワーク図）と、医師×会社の表。
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from "d3-force";
import { doctorUnitPrices, estimateFeeFor, type Relations, type RelationEdge } from "./shared/relations";
import { man, useFeeRates, yen as yenFull } from "./fees";
import { Button, Card } from "./ui";


/** 医師の実績単価を使った、関係1本ごとの目安金額。 */
export function useEdgeFee(data: Relations | undefined) {
  const rates = useFeeRates();
  const units = useMemo(() => doctorUnitPrices(data?.edges ?? []), [data]);
  return (e: RelationEdge) => estimateFeeFor(e, rates, units.get(e.doctor) ?? null);
}

export function useRelations(enabled = true) {
  return useQuery({
    queryKey: ["relations"],
    queryFn: async () => {
      const res = await fetch("/api/relations", { credentials: "same-origin" });
      if (!res.ok) throw new Error("関係のデータを読み込めませんでした");
      return (await res.json()) as Relations;
    },
    enabled,
  });
}

/** 最少登場回数と会社で絞った関係。 */
function useFiltered(data: Relations | undefined, minLectures: number, company: string) {
  return useMemo(() => {
    if (!data) return null;
    const doctors = data.doctors.filter((d) => d.lectures >= minLectures || d.amount > 0);
    const keep = new Set(doctors.map((d) => d.key));
    const edges = data.edges.filter((e) => keep.has(e.doctor) && (!company || e.company === company));
    const linked = new Set(edges.map((e) => e.doctor));
    return {
      doctors: doctors.filter((d) => linked.has(d.key)),
      companies: data.companies.filter((c) => edges.some((e) => e.company === c.name)),
      edges,
    };
  }, [data, minLectures, company]);
}

function Controls({ data, minLectures, setMinLectures, company, setCompany }: {
  data: Relations; minLectures: number; setMinLectures: (n: number) => void; company: string; setCompany: (c: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <label className="flex items-center gap-2">
        医師の合計登場回数
        <select value={minLectures} onChange={(e) => setMinLectures(Number(e.target.value))} className="h-9 rounded-md border border-slate-300 bg-white px-2">
          {[1, 2, 3, 4, 5, 8].map((n) => <option key={n} value={n}>{n}回以上</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2">
        会社
        <select value={company} onChange={(e) => setCompany(e.target.value)} className="h-9 rounded-md border border-slate-300 bg-white px-2">
          <option value="">すべて</option>
          {data.companies.map((c) => <option key={c.name} value={c.name}>{c.name}（{c.lectures}）</option>)}
        </select>
      </label>
    </div>
  );
}

type Node = SimulationNodeDatum & { id: string; kind: "doctor" | "company"; label: string; weight: number };

/** ネットワーク図。会社（濃い丸）と医師（青い丸）を、講演会での登場回数の太さの線で結ぶ。 */
export function RelationMap({ onOpenDoctor }: { onOpenDoctor: (key: string) => void }) {
  const { data, isLoading, error } = useRelations();
  const [minLectures, setMinLectures] = useState(4);
  const [company, setCompany] = useState("");
  const [focus, setFocus] = useState<string | null>(null);
  const fee = useEdgeFee(data);
  const filtered = useFiltered(data, minLectures, company);

  const W = 1000;
  const H = 720;
  // 会社名は輪の外側に向けて置く
  const labelOffset = (n: Node, r: number) => {
    const dx = (n.x ?? 0) - W / 2;
    const dy = (n.y ?? 0) - H / 2;
    const len = Math.hypot(dx, dy) || 1;
    const x = (dx / len) * (r + 8);
    const y = (dy / len) * (r + 10);
    return { x, y, anchor: (Math.abs(dx) < 60 ? "middle" : dx > 0 ? "start" : "end") as "middle" | "start" | "end" };
  };
  const layout = useMemo(() => {
    if (!filtered) return null;
    const nodes: Node[] = [
      ...filtered.companies.map((c) => ({ id: `c:${c.name}`, kind: "company" as const, label: c.name, weight: c.lectures })),
      ...filtered.doctors.map((d) => ({ id: `d:${d.key}`, kind: "doctor" as const, label: d.name, weight: d.lectures })),
    ];
    const links = filtered.edges.map((e) => ({ source: `d:${e.doctor}`, target: `c:${e.company}`, e }));
    const radius = (n: Node) => (n.kind === "company" ? 8 + Math.sqrt(n.weight) * 1.8 : 3 + Math.sqrt(n.weight) * 1.5);
    // 会社は外側の輪に固定し、医師はつながりのある会社の方へ引き寄せる
    const companies = nodes.filter((n) => n.kind === "company");
    companies.forEach((n, i) => {
      const a = (i / companies.length) * Math.PI * 2 - Math.PI / 2;
      n.fx = W / 2 + Math.cos(a) * W * 0.33;
      n.fy = H / 2 + Math.sin(a) * H * 0.4;
    });
    const sim = forceSimulation(nodes)
      .force("link", forceLink<Node, (typeof links)[number]>(links).id((n) => n.id).distance(40).strength((l) => 0.08 + Math.min(l.e.lectures, 6) * 0.05))
      .force("charge", forceManyBody<Node>().strength(-45))
      .force("collide", forceCollide<Node>().radius((n) => radius(n) + 5))
      .force("x", forceX(W / 2).strength(0.02))
      .force("y", forceY(H / 2).strength(0.02))
      .stop();
    sim.tick(500);
    for (const n of nodes) {
      n.x = Math.max(150, Math.min(W - 150, n.x ?? 0));
      n.y = Math.max(40, Math.min(H - 40, n.y ?? 0));
    }
    const pos = new Map(nodes.map((n) => [n.id, n]));
    return { nodes, links: links.map((l) => ({ ...l, a: pos.get(`d:${l.e.doctor}`)!, b: pos.get(`c:${l.e.company}`)! })), radius };
  }, [filtered]);

  if (isLoading) return <p className="text-sm text-slate-500">読み込み中…</p>;
  if (error || !data || !filtered || !layout) return <p className="text-sm text-red-600">関係のデータを読み込めませんでした</p>;

  const neighbors = new Set<string>();
  if (focus) for (const l of layout.links) if (`d:${l.e.doctor}` === focus || `c:${l.e.company}` === focus) neighbors.add(`d:${l.e.doctor}`).add(`c:${l.e.company}`);
  const dim = (id: string) => focus !== null && !neighbors.has(id);
  const maxW = Math.max(...filtered.edges.map((e) => e.lectures), 1);
  const labelDoctor = (n: Node) => n.weight >= Math.max(minLectures + 3, 7) || neighbors.has(n.id);
  const focused = focus ? layout.nodes.find((n) => n.id === focus) : null;
  const focusEdges = focus ? layout.links.filter((l) => `d:${l.e.doctor}` === focus || `c:${l.e.company}` === focus).map((l) => l.e) : [];

  return (
    <div className="space-y-3">
      <Controls data={data} minLectures={minLectures} setMinLectures={setMinLectures} company={company} setCompany={(c) => { setCompany(c); setFocus(null); }} />
      <p className="text-xs text-slate-500">
        濃い丸が会社、青い丸が医師。線の太さは、その会社の講演会に演者・座長として登場した回数です（{filtered.doctors.length}人・{filtered.companies.length}社）。丸を押すと、つながりだけを強調します。
      </p>
      <div className="grid gap-3 lg:grid-cols-[1fr_18rem]">
        <Card className="overflow-hidden">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full select-none" role="img" aria-label="医師と製薬会社の関係性マップ" onClick={() => setFocus(null)}>
            <g>
              {layout.links.map((l, i) => {
                const on = focus !== null && (neighbors.has(`d:${l.e.doctor}`) && neighbors.has(`c:${l.e.company}`)) && (focus === `d:${l.e.doctor}` || focus === `c:${l.e.company}`);
                return (
                  <line key={i} x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y}
                    stroke={on ? "#0369a1" : "#cbd5e1"} strokeOpacity={focus && !on ? 0.15 : on ? 0.9 : 0.6}
                    strokeWidth={0.8 + (l.e.lectures / maxW) * 5} />
                );
              })}
            </g>
            <g>
              {layout.nodes.map((n) => {
                const r = layout.radius(n);
                const company = n.kind === "company";
                return (
                  <g key={n.id} transform={`translate(${n.x},${n.y})`} opacity={dim(n.id) ? 0.2 : 1} className="cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); setFocus(focus === n.id ? null : n.id); }}>
                    <title>{`${n.label}：${n.weight}回`}</title>
                    <circle r={r} fill={company ? "#1e293b" : "#0284c7"} stroke="#fff" strokeWidth={company ? 2 : 1} />
                    {(company || labelDoctor(n)) && (
                      <text
                        x={company ? labelOffset(n, r).x : 0}
                        y={company ? labelOffset(n, r).y : -r - 4}
                        textAnchor={company ? labelOffset(n, r).anchor : "middle"}
                        dominantBaseline={company ? "middle" : undefined}
                        fontSize={company ? 13 : 11}
                        fontWeight={company ? 700 : 500} fill={company ? "#0f172a" : "#334155"}
                        stroke="#fff" strokeWidth={3} paintOrder="stroke">
                        {n.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        </Card>
        <Card className="p-4 text-sm">
          {focused ? (
            <FocusPanel node={focused} edges={focusEdges} onOpenDoctor={onOpenDoctor} />
          ) : (
            <div className="space-y-2">
              <h3 className="font-semibold">会社ごとの登場回数</h3>
              <ul className="space-y-1">
                {filtered.companies.map((c) => (
                  <li key={c.name} className="flex justify-between gap-2">
                    <button type="button" className="truncate text-left text-sky-700 hover:underline" onClick={() => setFocus(`c:${c.name}`)}>{c.name}</button>
                    <span className="shrink-0 tabular-nums text-slate-500">{filtered.edges.filter((e) => e.company === c.name).reduce((s, e) => s + e.lectures, 0)}回・{filtered.edges.filter((e) => e.company === c.name).length}人・目安{man(filtered.edges.filter((e) => e.company === c.name).reduce((s, e) => s + fee(e), 0))}円</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function FocusPanel({ node, edges, onOpenDoctor }: { node: Node; edges: RelationEdge[]; onOpenDoctor: (key: string) => void }) {
  const fee = useEdgeFee(useRelations().data);
  const total = edges.reduce((s, e) => s + fee(e), 0);
  const registered = edges.reduce((s, e) => s + e.amount, 0);
  const isDoctor = node.kind === "doctor";
  const rows = [...edges].sort((a, b) => b.lectures - a.lectures || b.amount - a.amount);
  return (
    <div className="space-y-2">
      <h3 className="font-semibold">{node.label}</h3>
      <p className="text-xs text-slate-600">目安金額 合計 <b className="text-slate-900">{yenFull(total)}</b>{registered > 0 && <>・登録額 <b className="text-slate-900">{yenFull(registered)}</b></>}</p>
      {isDoctor && (
        <Button variant="outline" size="sm" onClick={() => onOpenDoctor(node.id.slice(2))}>詳しく見る</Button>
      )}
      <ul className="space-y-1">
        {rows.map((e) => (
          <li key={`${e.doctor}-${e.company}`} className="flex justify-between gap-2">
            {isDoctor ? (
              <span className="truncate">{e.company}</span>
            ) : (
              <button type="button" className="truncate text-left text-sky-700 hover:underline" onClick={() => onOpenDoctor(e.doctor)}>{e.doctor}</button>
            )}
            <span className="shrink-0 tabular-nums text-slate-500">
              {e.lectures}回・目安{man(fee(e))}円{e.amount ? `・登録${man(e.amount)}円` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 医師×会社の表。セルは登場回数（色が濃いほど多い）。 */
export function RelationMatrix({ onOpenDoctor }: { onOpenDoctor: (key: string) => void }) {
  const { data, isLoading } = useRelations();
  const fee = useEdgeFee(data);
  const [show, setShow] = useState<"count" | "amount">("amount");
  const [minLectures, setMinLectures] = useState(3);
  const [company, setCompany] = useState("");
  const filtered = useFiltered(data, minLectures, company);
  if (isLoading || !data || !filtered) return <p className="text-sm text-slate-500">読み込み中…</p>;

  const cell = new Map(filtered.edges.map((e) => [`${e.doctor}\u0000${e.company}`, e]));
  const valueOf = (e: RelationEdge) => (show === "count" ? e.lectures : Math.max(fee(e), e.amount));
  const max = Math.max(...filtered.edges.map(valueOf), 1);
  const rowTotal = (key: string) => filtered.edges.filter((e) => e.doctor === key).reduce((s, e) => s + valueOf(e), 0);
  const rows = [...filtered.doctors].sort((a, b) => rowTotal(b.key) - rowTotal(a.key));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Controls data={data} minLectures={minLectures} setMinLectures={setMinLectures} company={company} setCompany={setCompany} />
        <div className="flex gap-1 rounded-md bg-slate-200/70 p-1 text-sm" role="tablist">
          {([["amount", "金額（目安）"], ["count", "回数"]] as const).map(([v, l]) => (
            <Button key={v} variant="ghost" size="sm" role="tab" aria-selected={show === v} className={show === v ? "bg-white shadow-sm hover:bg-white" : ""} onClick={() => setShow(v)}>{l}</Button>
          ))}
        </div>
      </div>
      <Card className="overflow-auto">
        <table className="text-xs">
          <thead className="sticky top-0 bg-white">
            <tr>
              <th className="sticky left-0 bg-white px-3 py-2 text-left">医師</th>
              <th className="px-2 py-2 text-right">計</th>
              {filtered.companies.map((c) => (
                <th key={c.name} className="h-36 px-1 align-bottom">
                  <span className="inline-block whitespace-nowrap [writing-mode:vertical-rl]">{c.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.key} className="border-t border-slate-100">
                <td className="sticky left-0 bg-white px-3 py-1">
                  <button type="button" className="whitespace-nowrap text-left font-medium text-sky-800 hover:underline" onClick={() => onOpenDoctor(d.key)}>{d.name}</button>
                </td>
                <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">{show === "count" ? d.lectures : man(rowTotal(d.key))}</td>
                {filtered.companies.map((c) => {
                  const e = cell.get(`${d.key}\u0000${c.name}`);
                  return (
                    <td key={c.name} className="h-7 min-w-9 p-0.5 text-center tabular-nums" title={e ? `${d.name} × ${c.name}：${e.lectures}回（演者${e.asSpeaker}・座長${e.asModerator}）・目安${yenFull(fee(e))}${e.amount ? `・登録${yenFull(e.amount)}` : ""}` : undefined}>
                      {e && (
                        <span className="flex h-full items-center justify-center rounded"
                          style={{ background: `rgba(2,132,199,${0.12 + 0.75 * (valueOf(e) / max)})`, color: valueOf(e) / max > 0.5 ? "#fff" : "#0c4a6e" }}>
                          <span className="px-0.5">{show === "count" ? e.lectures : man(valueOf(e))}{e.amount ? "¥" : ""}</span>
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-slate-500">回数は、その会社の講演会に演者・座長として登場した回数。金額は目安（回数×単価、万円）で、支払いを登録した組み合わせは目安と登録額の大きい方を出し「¥」を付けます。セルにマウスを重ねると内訳が出ます。</p>
    </div>
  );
}

/** 会社の色（参照パレットの分類色、上位7社に固定順で割り当て、残りは「その他」）。 */
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6"];
const OTHER = "#a3a39c";

/** 医師ごとの金額に占める会社の割合（100%積み上げ横棒）。 */
export function CompanyShareChart({ onOpenDoctor }: { onOpenDoctor: (key: string) => void }) {
  const { data, isLoading } = useRelations();
  const fee = useEdgeFee(data);
  const [minLectures, setMinLectures] = useState(4);
  const [company, setCompany] = useState("");
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);
  const filtered = useFiltered(data, minLectures, "");

  const valueOf = (e: RelationEdge) => Math.max(fee(e), e.amount);
  const view = useMemo(() => {
    if (!filtered) return null;
    // 色は会社に固定：全体の金額の多い順に上位7社
    const totals = new Map<string, number>();
    for (const e of filtered.edges) totals.set(e.company, (totals.get(e.company) ?? 0) + valueOf(e));
    const ranked = [...totals].sort((a, b) => b[1] - a[1]).map(([name]) => name);
    const named = ranked.slice(0, SERIES.length);
    const colorOf = (c: string) => SERIES[named.indexOf(c)] ?? OTHER;
    const rows = filtered.doctors.map((d) => {
      const mine = filtered.edges.filter((e) => e.doctor === d.key);
      const total = mine.reduce((s, e) => s + valueOf(e), 0);
      const parts = new Map<string, number>();
      for (const e of mine) {
        const k = named.includes(e.company) ? e.company : "その他";
        parts.set(k, (parts.get(k) ?? 0) + valueOf(e));
      }
      const segments = [...named, "その他"]
        .filter((k) => parts.get(k))
        .map((k) => ({ company: k, value: parts.get(k)!, share: parts.get(k)! / total, color: k === "その他" ? OTHER : colorOf(k) }));
      const focusShare = company ? (mine.filter((e) => e.company === company).reduce((s, e) => s + valueOf(e), 0) / (total || 1)) : 0;
      return { d, total, segments, focusShare };
    }).filter((r) => r.total > 0);
    rows.sort((a, b) => (company ? b.focusShare - a.focusShare : 0) || b.total - a.total);
    return { rows: rows.slice(0, 40), named, others: ranked.slice(SERIES.length), colorOf };
  }, [filtered, fee, company]);

  if (isLoading || !data || !view) return <p className="text-sm text-slate-500">読み込み中…</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          医師の合計登場回数
          <select value={minLectures} onChange={(e) => setMinLectures(Number(e.target.value))} className="h-9 rounded-md border border-slate-300 bg-white px-2">
            {[1, 2, 3, 4, 5, 8].map((n) => <option key={n} value={n}>{n}回以上</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2">
          並べ方
          <select value={company} onChange={(e) => setCompany(e.target.value)} className="h-9 rounded-md border border-slate-300 bg-white px-2">
            <option value="">金額の多い順</option>
            {[...view.named, ...view.others].map((c) => <option key={c} value={c}>{c} の割合が高い順</option>)}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700" aria-label="凡例">
        {view.named.map((c) => (
          <span key={c} className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: view.colorOf(c) }} />{c}
          </span>
        ))}
        {view.others.length > 0 && (
          <span className="flex items-center gap-1" title={view.others.join("、")}>
            <span className="inline-block h-3 w-3 rounded-sm" style={{ background: OTHER }} />その他（{view.others.length}社）
          </span>
        )}
      </div>

      <Card className="relative p-4" >
        <div className="space-y-1.5" onMouseLeave={() => setHover(null)}>
          {view.rows.map(({ d, total, segments, focusShare }) => (
            <div key={d.key} className="grid grid-cols-[6.5rem_1fr_4.5rem] items-center gap-2 text-xs sm:grid-cols-[8rem_1fr_5rem]">
              <button type="button" className="truncate text-left font-medium text-slate-800 hover:underline" onClick={() => onOpenDoctor(d.key)} title={d.affiliation}>
                {d.name}
              </button>
              <div className="flex h-5 overflow-hidden rounded-[4px] bg-slate-100" role="img" aria-label={`${d.name}：${segments.map((s) => `${s.company} ${Math.round(s.share * 100)}%`).join("、")}`}>
                {segments.map((s) => (
                  <div
                    key={s.company}
                    className="flex h-full items-center justify-center border-r-2 border-white text-[10px] font-medium text-white last:border-r-0"
                    style={{ width: `${s.share * 100}%`, background: s.color, opacity: company && s.company !== company ? 0.35 : 1 }}
                    onMouseMove={(ev) => {
                      const box = (ev.currentTarget.closest(".relative") as HTMLElement).getBoundingClientRect();
                      setHover({ x: ev.clientX - box.left, y: ev.clientY - box.top, text: `${d.name} × ${s.company}：${Math.round(s.share * 100)}%（目安 ${yenFull(s.value)}）` });
                    }}
                  >
                    {s.share >= 0.15 && `${Math.round(s.share * 100)}%`}
                  </div>
                ))}
              </div>
              <span className="text-right tabular-nums text-slate-600">
                {company ? `${Math.round(focusShare * 100)}%` : `${man(total)}円`}
              </span>
            </div>
          ))}
        </div>
        {hover && (
          <div className="pointer-events-none absolute z-10 rounded-md bg-slate-900/90 px-2 py-1 text-xs text-white shadow" style={{ left: Math.min(hover.x + 12, 600), top: hover.y + 14 }}>
            {hover.text}
          </div>
        )}
      </Card>
      <p className="text-xs text-slate-500">
        各医師の金額（目安：登場回数×単価。支払いを登録した組み合わせは登録額との大きい方）を100%として、会社ごとの割合を示します。上位40人まで。表の数値は「医師×会社の表」タブにあります。
      </p>
    </div>
  );
}

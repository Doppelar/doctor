// 関係性マップ（ネットワーク図）と、医師×会社の表。
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from "d3-force";
import type { Relations, RelationEdge } from "./shared/relations";
import { Button, Card } from "./ui";

const yen = (n: number) => `${n.toLocaleString("ja-JP")}円`;

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
  const filtered = useFiltered(data, minLectures, company);

  const W = 1000;
  const H = 720;
  const layout = useMemo(() => {
    if (!filtered) return null;
    const nodes: Node[] = [
      ...filtered.companies.map((c) => ({ id: `c:${c.name}`, kind: "company" as const, label: c.name, weight: c.lectures })),
      ...filtered.doctors.map((d) => ({ id: `d:${d.key}`, kind: "doctor" as const, label: d.name, weight: d.lectures })),
    ];
    const links = filtered.edges.map((e) => ({ source: `d:${e.doctor}`, target: `c:${e.company}`, e }));
    const radius = (n: Node) => (n.kind === "company" ? 10 + Math.sqrt(n.weight) * 2.2 : 3 + Math.sqrt(n.weight) * 1.6);
    const sim = forceSimulation(nodes)
      .force("link", forceLink<Node, (typeof links)[number]>(links).id((n) => n.id).distance(70).strength(0.6))
      .force("charge", forceManyBody<Node>().strength((n) => (n.kind === "company" ? -900 : -40)))
      .force("collide", forceCollide<Node>().radius((n) => radius(n) + 3))
      .force("x", forceX(W / 2).strength(0.05))
      .force("y", forceY(H / 2).strength(0.07))
      .stop();
    sim.tick(400);
    for (const n of nodes) {
      n.x = Math.max(30, Math.min(W - 30, n.x ?? 0));
      n.y = Math.max(20, Math.min(H - 20, n.y ?? 0));
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
                      <text y={company ? r + 13 : -r - 4} textAnchor="middle" fontSize={company ? 13 : 11}
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
                    <span className="shrink-0 tabular-nums text-slate-500">{filtered.edges.filter((e) => e.company === c.name).reduce((s, e) => s + e.lectures, 0)}回・{filtered.edges.filter((e) => e.company === c.name).length}人</span>
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
  const isDoctor = node.kind === "doctor";
  const rows = [...edges].sort((a, b) => b.lectures - a.lectures || b.amount - a.amount);
  return (
    <div className="space-y-2">
      <h3 className="font-semibold">{node.label}</h3>
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
              {e.lectures}回{e.amount ? `・${yen(e.amount)}` : ""}
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
  const [minLectures, setMinLectures] = useState(3);
  const [company, setCompany] = useState("");
  const filtered = useFiltered(data, minLectures, company);
  if (isLoading || !data || !filtered) return <p className="text-sm text-slate-500">読み込み中…</p>;

  const cell = new Map(filtered.edges.map((e) => [`${e.doctor}\u0000${e.company}`, e]));
  const max = Math.max(...filtered.edges.map((e) => e.lectures), 1);
  return (
    <div className="space-y-3">
      <Controls data={data} minLectures={minLectures} setMinLectures={setMinLectures} company={company} setCompany={setCompany} />
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
            {filtered.doctors.map((d) => (
              <tr key={d.key} className="border-t border-slate-100">
                <td className="sticky left-0 bg-white px-3 py-1">
                  <button type="button" className="whitespace-nowrap text-left font-medium text-sky-800 hover:underline" onClick={() => onOpenDoctor(d.key)}>{d.name}</button>
                </td>
                <td className="px-2 py-1 text-right tabular-nums">{d.lectures}</td>
                {filtered.companies.map((c) => {
                  const e = cell.get(`${d.key}\u0000${c.name}`);
                  return (
                    <td key={c.name} className="h-7 w-9 p-0.5 text-center tabular-nums" title={e ? `${d.name} × ${c.name}：${e.lectures}回${e.amount ? `・${yen(e.amount)}` : ""}` : undefined}>
                      {e && (
                        <span className="flex h-full items-center justify-center rounded"
                          style={{ background: `rgba(2,132,199,${0.12 + 0.75 * (e.lectures / max)})`, color: e.lectures / max > 0.5 ? "#fff" : "#0c4a6e" }}>
                          {e.lectures}{e.amount ? "¥" : ""}
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
      <p className="text-xs text-slate-500">数字は、その会社の講演会に演者・座長として登場した回数。「¥」は支払いの登録があることを示します（金額はセルにマウスを重ねると出ます）。</p>
    </div>
  );
}

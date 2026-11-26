import { useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, LogOut, Trash2, Upload } from "lucide-react";
import { Button, Card, Input, Modal } from "./ui";
import { RelationMap, RelationMatrix, useRelations } from "./relations-view";
import { CSV_COLUMNS, PAYMENT_CATEGORIES, type CalendarAppearance, type DoctorSummary, type Payment } from "./shared/payments";

type DoctorDetail = { key: string; name: string; payments: Payment[]; appearances: CalendarAppearance[] };

const yen = (n: number) => `${n.toLocaleString("ja-JP")}円`;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin", headers: { "Content-Type": "application/json" }, ...init });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.message || "失敗しました"), { status: res.status, body });
  return body as T;
}

export default function App() {
  const session = useQuery({
    queryKey: ["session"],
    queryFn: () => api<{ authed: boolean; configured: boolean }>("/api/session"),
  });
  if (session.isLoading) return <Shell><p className="text-sm text-slate-500">読み込み中…</p></Shell>;
  if (!session.data?.authed) return <Shell><Login configured={session.data?.configured ?? false} /></Shell>;
  return <Shell authed><Main /></Shell>;
}

const TABS = [
  ["list", "医師一覧"],
  ["map", "関係性マップ"],
  ["matrix", "医師×会社の表"],
] as const;

function Main() {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("list");
  const [openKey, setOpenKey] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg bg-slate-200/70 p-1" role="tablist">
        {TABS.map(([value, label]) => (
          <Button key={value} role="tab" aria-selected={tab === value} variant="ghost" size="sm"
            className={tab === value ? "flex-1 bg-white text-slate-900 shadow-sm hover:bg-white" : "flex-1"}
            onClick={() => setTab(value)}>
            {label}
          </Button>
        ))}
      </div>
      {tab === "list" && <Doctors onOpen={setOpenKey} />}
      {tab === "map" && <RelationMap onOpenDoctor={setOpenKey} />}
      {tab === "matrix" && <RelationMatrix onOpenDoctor={setOpenKey} />}
      <DoctorDialog doctorKey={openKey} onClose={() => setOpenKey(null)} />
    </div>
  );
}

function Shell({ children, authed }: { children: ReactNode; authed?: boolean }) {
  const qc = useQueryClient();
  const logout = useMutation({
    mutationFn: () => api("/api/logout", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session"] }),
  });
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">血液内科医への製薬会社の支払い（自分用）</h1>
            <p className="text-sm text-slate-500">講演会カレンダーの演者・座長と、各社の公開データ（講師謝金など）を医師ごとにまとめます。</p>
          </div>
          {authed && (
            <Button variant="outline" size="sm" onClick={() => logout.mutate()}>
              <LogOut className="h-4 w-4" />ログアウト
            </Button>
          )}
        </header>
        {children}
      </div>
    </div>
  );
}

function Login({ configured }: { configured: boolean }) {
  const qc = useQueryClient();
  const [password, setPassword] = useState("");
  const login = useMutation({
    mutationFn: () => api("/api/login", { method: "POST", body: JSON.stringify({ password }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session"] }),
  });
  return (
    <Card className="mx-auto max-w-sm p-6">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><Lock className="h-5 w-5" />パスワード</h2>
      {!configured ? (
        <p className="text-sm text-red-600">サーバーにパスワードが設定されていません。</p>
      ) : (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); login.mutate(); }}>
          <Input type="password" autoComplete="current-password" aria-label="パスワード" value={password} onChange={(e) => setPassword(e.target.value)} />
          {login.isError && <p className="text-sm text-red-600">{login.error.message}</p>}
          <Button type="submit" className="w-full" disabled={!password || login.isPending}>開く</Button>
        </form>
      )}
    </Card>
  );
}

function Doctors({ onOpen }: { onOpen: (key: string) => void }) {
  const [query, setQuery] = useState("");
  const [onlyPaid, setOnlyPaid] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const { data = [], isLoading } = useQuery({ queryKey: ["doctors"], queryFn: () => api<DoctorSummary[]>("/api/doctors") });

  const years = useMemo(() => [...new Set(data.flatMap((d) => Object.keys(d.byYear)))].sort().reverse().slice(0, 3), [data]);
  const rows = useMemo(() => {
    const q = query.replace(/\s/g, "");
    return data
      .filter((d) => (!onlyPaid || d.total > 0) && (!q || d.name.includes(q) || d.affiliation.includes(q) || d.companies.some((c) => c.includes(q))))
      .sort((a, b) => b.total - a.total || b.lectureCount - a.lectureCount);
  }, [data, query, onlyPaid]);
  const paidCount = data.filter((d) => d.total > 0).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="医師名・所属・会社で検索" aria-label="検索" value={query} onChange={(e) => setQuery(e.target.value)} className="max-w-xs" />
        <Button variant={onlyPaid ? "primary" : "outline"} size="sm" onClick={() => setOnlyPaid((v) => !v)}>
          支払い登録ありのみ（{paidCount}人）
        </Button>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => setImportOpen(true)}>
          <Upload className="h-4 w-4" />データを貼り付けて登録
        </Button>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2">医師</th>
              <th className="px-4 py-2">所属（カレンダーより）</th>
              <th className="px-4 py-2 text-right">講演・座長</th>
              {years.map((y) => <th key={y} className="px-4 py-2 text-right">{y}年度</th>)}
              <th className="px-4 py-2 text-right">登録合計</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td className="px-4 py-6 text-slate-500" colSpan={4 + years.length}>読み込み中…</td></tr>}
            {rows.map((d) => (
              <tr key={d.key} className="cursor-pointer border-t border-slate-100 hover:bg-sky-50" onClick={() => onOpen(d.key)}>
                <td className="whitespace-nowrap px-4 py-2 font-medium">{d.name}</td>
                <td className="max-w-xs truncate px-4 py-2 text-slate-600" title={d.affiliation}>{d.affiliation}</td>
                <td className="px-4 py-2 text-right tabular-nums">{d.lectureCount || "—"}</td>
                {years.map((y) => <td key={y} className="px-4 py-2 text-right tabular-nums">{d.byYear[y] ? yen(d.byYear[y]) : "—"}</td>)}
                <td className="px-4 py-2 text-right font-medium tabular-nums">{d.total ? yen(d.total) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-slate-500">金額は登録したデータの合計です。各社の公開データをすべて登録していない場合、実際の金額より少なくなります。</p>

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}

function DoctorDialog({ doctorKey, onClose }: { doctorKey: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["doctor", doctorKey],
    queryFn: () => api<DoctorDetail>(`/api/doctors/${encodeURIComponent(doctorKey!)}`),
    enabled: Boolean(doctorKey),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["doctor", doctorKey] });
    qc.invalidateQueries({ queryKey: ["doctors"] });
  };
  const remove = useMutation({ mutationFn: (id: number) => api(`/api/payments/${id}`, { method: "DELETE" }), onSuccess: refresh });
  const total = data?.payments.reduce((s, p) => s + p.amount, 0) ?? 0;
  const relations = useRelations(Boolean(doctorKey));
  const byCompany = (relations.data?.edges ?? []).filter((e) => e.doctor === doctorKey).sort((a, b) => b.lectures - a.lectures || b.amount - a.amount);

  return (
    <Modal open={Boolean(doctorKey)} onClose={onClose} title={data?.name ?? doctorKey} wide>
      {data && (
        <div className="space-y-6">
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-700">製薬会社との関係（{byCompany.length}社）</h3>
            {byCompany.length === 0 ? (
              <p className="text-sm text-slate-500">{relations.isLoading ? "読み込み中…" : "会社の講演会への登場や支払いの登録はありません。"}</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {byCompany.map((e) => (
                  <li key={e.company} className="flex flex-wrap justify-between gap-x-3">
                    <span className="font-medium">{e.company}</span>
                    <span className="tabular-nums text-slate-600">
                      講演会 {e.lectures}回（演者 {e.asSpeaker}・座長 {e.asModerator}）{e.lastDate && `・最新 ${e.lastDate}`}{e.amount ? `・支払い ${yen(e.amount)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-700">支払い（登録合計 {yen(total)}）</h3>
            {data.payments.length === 0 ? (
              <p className="text-sm text-slate-500">まだ登録がありません。</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-slate-500">
                    <tr><th className="py-1 pr-3">年度</th><th className="py-1 pr-3">会社</th><th className="py-1 pr-3">区分</th><th className="py-1 pr-3 text-right">件数</th><th className="py-1 pr-3 text-right">金額</th><th /></tr>
                  </thead>
                  <tbody>
                    {data.payments.map((p) => (
                      <tr key={p.id} className="border-t border-slate-100">
                        <td className="py-1 pr-3 tabular-nums">{p.fiscalYear}</td>
                        <td className="py-1 pr-3">
                          {p.sourceUrl ? <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-sky-700 underline">{p.company}</a> : p.company}
                        </td>
                        <td className="py-1 pr-3">{p.category}{p.note && <span className="block text-xs text-slate-500">{p.note}</span>}</td>
                        <td className="py-1 pr-3 text-right tabular-nums">{p.count ?? "—"}</td>
                        <td className="py-1 pr-3 text-right tabular-nums">{yen(p.amount)}</td>
                        <td className="py-1 text-right">
                          <Button variant="ghost" size="icon" className="text-red-500" aria-label="削除"
                            onClick={() => window.confirm("この支払いを削除しますか？") && remove.mutate(p.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <AddPaymentForm doctorName={data.name} onAdded={refresh} />
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-700">講演会カレンダーでの登場（{data.appearances.length}回）</h3>
            <ul className="space-y-1 text-sm">
              {data.appearances.map((a) => (
                <li key={`${a.eventId}-${a.role}`} className="flex gap-2">
                  <span className="shrink-0 tabular-nums text-slate-500">{a.date}</span>
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 text-xs leading-5 text-slate-600">{a.role}</span>
                  <span className="shrink-0 text-xs leading-5 text-slate-500">{a.category}</span>
                  <span>{a.title}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </Modal>
  );
}

function AddPaymentForm({ doctorName, onAdded }: { doctorName: string; onAdded: () => void }) {
  const empty = { company: "", fiscalYear: String(new Date().getFullYear() - 1), category: PAYMENT_CATEGORIES[0] as string, count: "", amount: "", sourceUrl: "" };
  const [form, setForm] = useState(empty);
  const add = useMutation({
    mutationFn: () => api("/api/payments", { method: "POST", body: JSON.stringify({ ...form, doctorName, amount: Number(form.amount.replace(/[,円¥]/g, "")) }) }),
    onSuccess: () => { setForm(empty); onAdded(); },
  });
  const set = (k: keyof typeof empty) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  return (
    <form className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-6" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
      <Input placeholder="会社" aria-label="会社" value={form.company} onChange={set("company")} className="col-span-2" />
      <Input placeholder="年度" aria-label="年度" inputMode="numeric" value={form.fiscalYear} onChange={set("fiscalYear")} />
      <select aria-label="区分" value={form.category} onChange={set("category")} className="rounded-md border border-slate-300 bg-white px-2 text-sm">
        {PAYMENT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
      </select>
      <Input placeholder="件数" aria-label="件数" inputMode="numeric" value={form.count} onChange={set("count")} />
      <Input placeholder="金額（円）" aria-label="金額" inputMode="numeric" value={form.amount} onChange={set("amount")} />
      <Input placeholder="出典URL（任意）" aria-label="出典URL" value={form.sourceUrl} onChange={set("sourceUrl")} className="col-span-2 sm:col-span-5" />
      <Button type="submit" size="md" disabled={!form.company || !form.amount || add.isPending}>追加</Button>
      {add.isError && <p className="col-span-full text-sm text-red-600">{add.error.message}</p>}
    </form>
  );
}

function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const imp = useMutation({
    mutationFn: () => api<{ imported: number }>("/api/payments/import", { method: "POST", body: JSON.stringify({ csv }) }),
    onSuccess: (r) => { setResult(`${r.imported}件を登録しました`); setCsv(""); qc.invalidateQueries({ queryKey: ["doctors"] }); },
    onError: (e: any) => setResult([e.message, ...(e.body?.errors ?? [])].join("\n")),
  });
  const close = () => { onClose(); setResult(null); };
  return (
    <Modal open={open} onClose={close} title="データを貼り付けて登録">
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Excel やスプレッドシートからコピーして貼り付けてください（CSV・タブ区切りどちらでも可）。1行目に見出しがあればその順番で読みます。見出しがなければ次の順とみなします：
        </p>
        <code className="block rounded bg-slate-100 px-2 py-1 text-xs">{CSV_COLUMNS.join(", ")}</code>
        <textarea
          rows={10}
          aria-label="貼り付けるデータ"
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          className="w-full rounded-md border border-slate-300 p-2 font-mono text-xs"
          placeholder={'医師名,所属,会社,年度,区分,件数,金額,出典URL,備考\n松本 守生,渋川医療センター,A製薬,2024,講師謝金,3,"300,000",https://...,'}
        />
        {result && <pre className="whitespace-pre-wrap text-sm text-slate-700">{result}</pre>}
        <div className="flex justify-end"><Button onClick={() => imp.mutate()} disabled={!csv.trim() || imp.isPending}>登録する</Button></div>
      </div>
    </Modal>
  );
}

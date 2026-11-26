// 目安金額の単価（演者・座長 1回あたり）。ブラウザに保存する。
import { createContext, useContext, useState, type ReactNode } from "react";
import type { FeeRates } from "./shared/relations";
import { Input } from "./ui";

const KEY = "doctor.feeRates";
/** 仮の単価。自分の知っている相場に書き換えて使う前提。 */
const DEFAULT_RATES: FeeRates = { speaker: 100000, moderator: 50000 };

const Ctx = createContext<{ rates: FeeRates; setRates: (r: FeeRates) => void }>({ rates: DEFAULT_RATES, setRates: () => {} });

function load(): FeeRates {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (v && Number.isFinite(v.speaker) && Number.isFinite(v.moderator)) return v;
  } catch {
    // 読めなければ仮の単価
  }
  return DEFAULT_RATES;
}

export function FeeRatesProvider({ children }: { children: ReactNode }) {
  const [rates, set] = useState<FeeRates>(load);
  const setRates = (r: FeeRates) => {
    set(r);
    localStorage.setItem(KEY, JSON.stringify(r));
  };
  return <Ctx.Provider value={{ rates, setRates }}>{children}</Ctx.Provider>;
}

export const useFeeRates = () => useContext(Ctx).rates;

export const yen = (n: number) => `${Math.round(n).toLocaleString("ja-JP")}円`;
/** 万円単位の短い表示（表やマップ用）。 */
export const man = (n: number) => (n >= 10000 ? `${(Math.round(n / 1000) / 10).toLocaleString("ja-JP")}万` : `${Math.round(n).toLocaleString("ja-JP")}`);

/** 単価の設定欄。 */
export function FeeRatesBar() {
  const { rates, setRates } = useContext(Ctx);
  const isDefault = rates.speaker === DEFAULT_RATES.speaker && rates.moderator === DEFAULT_RATES.moderator;
  const field = (k: keyof FeeRates, label: string) => (
    <label className="flex items-center gap-1">
      {label}
      <Input
        inputMode="numeric"
        aria-label={`${label}の単価`}
        value={String(rates[k])}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/[,円\s]/g, ""));
          if (Number.isFinite(n) && n >= 0) setRates({ ...rates, [k]: n });
        }}
        className="h-8 w-28 text-right tabular-nums"
      />
      円／回
    </label>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <span className="font-medium">目安金額の単価</span>
      {field("speaker", "演者")}
      {field("moderator", "座長")}
      <span className="text-xs">
        目安金額＝講演会カレンダーの登場回数×単価。{isDefault && "今は仮の単価です。知っている相場に書き換えてください（このブラウザに保存されます）。"}
        各社の公開データを登録した支払いは「登録額」として別に出します。
      </span>
    </div>
  );
}

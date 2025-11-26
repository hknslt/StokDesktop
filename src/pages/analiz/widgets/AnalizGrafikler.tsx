import {
    ResponsiveContainer, ComposedChart, Area, Bar, XAxis, YAxis,
    CartesianGrid, Tooltip, Legend, ReferenceLine, AreaChart, BarChart
} from "recharts";
import { GrafikVerisi, PALETTE, Grup, fmtTL, fmtNum } from "../utils/AnalizUtils";

type Props = {
    data: GrafikVerisi[];
    grup: Grup;
    kombine: boolean;
    currentLabel: string;
    refText: string;
};

export default function AnalizGrafikler({ data, grup, kombine, currentLabel, refText }: Props) {
    
    const tooltipFormatter = (value: unknown, _name: string, payload: any) => {
        if (payload?.dataKey === "adet") return [fmtNum(Number(value)), "Sipariş"];
        if (payload?.dataKey === "ciro") return [fmtTL(Number(value)), "Ciro"];
        return [String(value ?? ""), ""];
    };

    if (kombine) {
        return (
            <div className="card" style={{ height: 380 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data} margin={{ top: 12, right: 20, bottom: 4, left: 8 }}>
                        <defs>
                            <linearGradient id="ciroGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={PALETTE.lineFrom} />
                                <stop offset="100%" stopColor={PALETTE.lineTo} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid vertical={false} stroke={PALETTE.grid} />
                        <XAxis dataKey="label" tick={{ fill: PALETTE.muted }} />
                        <YAxis yAxisId="L" tick={{ fill: PALETTE.muted }} width={38} />
                        <YAxis yAxisId="R" orientation="right" tick={{ fill: PALETTE.muted }} tickFormatter={(v: number) => fmtTL(v).replace("₺", "")} width={54} />
                        <Tooltip
                            contentStyle={{ background: "rgba(20,22,28,.92)", border: "1px solid var(--panel-bdr,#2a2f3a)", borderRadius: 10 }}
                            labelStyle={{ color: PALETTE.muted }}
                            formatter={tooltipFormatter}
                            labelFormatter={(l: string) => `Dönem: ${l}`}
                        />
                        <Legend formatter={(val: string) => <span style={{ color: PALETTE.muted }}>{val}</span>} />
                        <ReferenceLine x={currentLabel} stroke={PALETTE.grid} label={{ value: refText, fill: PALETTE.muted, position: "top" }} />
                        <Bar yAxisId="L" dataKey="adet" name="Sipariş" fill={PALETTE.bar} radius={[6, 6, 0, 0]} barSize={grup === "gun" ? 10 : 18} />
                        <Area yAxisId="R" type="monotone" dataKey="ciro" name="Ciro" stroke={PALETTE.line} fill="url(#ciroGrad)" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 5 }} />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        );
    }

    // Ayrı Grafikler Modu
    return (
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr 1fr" }}>
            {/* SOL: Ciro */}
            <div className="card" style={{ height: 300 }}>
                <h4 style={{ margin: "10px 0 0 10px", color: "var(--muted)" }}>Ciro Dağılımı</h4>
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="ciroSep" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={PALETTE.line} stopOpacity={0.3} />
                                <stop offset="95%" stopColor={PALETTE.line} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid vertical={false} stroke={PALETTE.grid} />
                        <XAxis dataKey="label" tick={{ fill: PALETTE.muted }} />
                        <YAxis tick={{ fill: PALETTE.muted }} tickFormatter={(v) => fmtTL(v).replace("₺", "")} width={45} />
                        <Tooltip
                            contentStyle={{ background: "rgba(20,22,28,.92)", border: "1px solid var(--panel-bdr)", borderRadius: 10 }}
                            formatter={(val: any) => [fmtTL(val), "Ciro"]}
                            labelStyle={{ color: PALETTE.muted }}
                        />
                        <Area type="monotone" dataKey="ciro" stroke={PALETTE.line} fillOpacity={1} fill="url(#ciroSep)" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {/* SAĞ: Sipariş Adedi */}
            <div className="card" style={{ height: 300 }}>
                <h4 style={{ margin: "10px 0 0 10px", color: "var(--muted)" }}>Sipariş Adedi</h4>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke={PALETTE.grid} />
                        <XAxis dataKey="label" tick={{ fill: PALETTE.muted }} />
                        <YAxis tick={{ fill: PALETTE.muted }} width={30} />
                        <Tooltip
                            contentStyle={{ background: "rgba(20,22,28,.92)", border: "1px solid var(--panel-bdr)", borderRadius: 10 }}
                            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                            formatter={(val: any) => [val, "Adet"]}
                            labelStyle={{ color: PALETTE.muted }}
                        />
                        <Bar dataKey="adet" fill={PALETTE.bar} radius={[4, 4, 0, 0]} barSize={grup === "gun" ? 12 : 24} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
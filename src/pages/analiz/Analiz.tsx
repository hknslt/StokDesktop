// src/pages/analiz/Analiz.tsx
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { veritabani } from "../../firebase";
import {
    ResponsiveContainer, ComposedChart, Area, Bar, XAxis, YAxis,
    CartesianGrid, Tooltip, Legend, ReferenceLine
} from "recharts";

type SiparisDurumu = "beklemede" | "uretimde" | "sevkiyat" | "tamamlandi" | "reddedildi";
type UrunSatiri = { urunAdi?: string; adet?: number; birimFiyat?: number; renk?: string };
type SiparisRow = {
    docId: string;
    durum: SiparisDurumu;
    tarih?: any;
    islemeTarihi?: any;
    brutTutar?: number;
    netTutar?: number;
    kdvTutar?: number;
    urunler?: UrunSatiri[];
};

type Grup = "gun" | "hafta" | "ay" | "yil";

/* ---- yardımcılar ---- */
const fmtNum = (n: number) => Number(n || 0).toLocaleString("tr-TR");
const fmtTL = (n: number) =>
    new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 })
        .format(Number(n || 0));

const getJSDate = (ts: any) => {
    try { return ts?.toDate?.() ?? (ts instanceof Date ? ts : null); } catch { return null; }
};
const pad = (n: number) => String(n).padStart(2, "0");
const addDays = (d: Date, i: number) => { const x = new Date(d); x.setDate(x.getDate() + i); return x; };
const addHours = (d: Date, i: number) => { const x = new Date(d); x.setHours(x.getHours() + i, 0, 0, 0); return x; };
const addMonths = (d: Date, i: number) => new Date(d.getFullYear(), d.getMonth() + i, 1);
const floorHour = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), 0, 0, 0);
const floorDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const firstOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

/* renk paleti */
const PALETTE = {
    line: "#7aa2f7",
    lineFrom: "rgba(122,162,247,.35)",
    lineTo: "rgba(122,162,247,.05)",
    bar: "#8bd5ff",
    grid: "rgba(128,128,128,.25)",
    muted: "var(--muted, #a6adbb)",
};

/* ---- yeni kovalama mantığı (rolling pencereler) ----
   gun   : son 24 saat, saatlik (HH:00)
   hafta : son 7 gün, günlük (MM-DD)
   ay    : son 30 gün, günlük (MM-DD)
   yil   : son 12 ay, aylık (YYYY-MM)
*/
function makeBuckets(grup: Grup) {
    const now = new Date();
    if (grup === "gun") {
        const end = floorHour(now);
        const start = addHours(end, -23);
        const arr: { key: string; label: string; date: Date }[] = [];
        for (let i = 0; i < 24; i++) {
            const d = addHours(start, i);
            const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:00`;
            const label = `${pad(d.getHours())}:00`;
            arr.push({ key, label, date: d });
        }
        return arr;
    }
    if (grup === "hafta") {
        const end = floorDay(now);
        const start = addDays(end, -6);
        const arr: { key: string; label: string; date: Date }[] = [];
        for (let i = 0; i < 7; i++) {
            const d = addDays(start, i);
            const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
            const label = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
            arr.push({ key, label, date: d });
        }
        return arr;
    }
    if (grup === "ay") {
        const end = floorDay(now);
        const start = addDays(end, -29);
        const arr: { key: string; label: string; date: Date }[] = [];
        for (let i = 0; i < 30; i++) {
            const d = addDays(start, i);
            const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
            const label = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
            arr.push({ key, label, date: d });
        }
        return arr;
    }
    // yil: son 12 ay
    const m0 = firstOfMonth(now);
    const start = addMonths(m0, -11);
    const arr: { key: string; label: string; date: Date }[] = [];
    for (let i = 0; i < 12; i++) {
        const d = addMonths(start, i);
        const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
        arr.push({ key, label: key, date: d });
    }
    return arr;
}

/* Firestore tarihlerini kovalara eşlemek için anahtar üret */
function keyOfDate(d: Date, grup: Grup): string {
    if (grup === "gun") {
        const x = floorHour(d);
        return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())} ${pad(x.getHours())}:00`;
    }
    if (grup === "hafta" || grup === "ay") {
        const x = floorDay(d);
        return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
    }
    // yil
    const x = firstOfMonth(d);
    return `${x.getFullYear()}-${pad(x.getMonth() + 1)}`;
}

/* ---- ANA ---- */
export default function Analiz() {
    const [siparisler, setSiparisler] = useState<SiparisRow[]>([]);
    const [grup, setGrup] = useState<Grup>("gun");
    const [kombine, setKombine] = useState(true); // tek/ayrı grafik

    useEffect(() => {
        const qy = query(collection(veritabani, "siparisler"), orderBy("islemeTarihi", "desc"));
        return onSnapshot(qy, (snap) => {
            const rows: SiparisRow[] = snap.docs.map((d) => {
                const x = d.data() as any;
                return {
                    docId: d.id,
                    durum: (x.durum || "beklemede") as SiparisDurumu,
                    tarih: x.tarih,
                    islemeTarihi: x.islemeTarihi,
                    brutTutar: Number(x.brutTutar ?? 0),
                    netTutar: Number(x.netTutar ?? 0),
                    kdvTutar: Number(x.kdvTutar ?? 0),
                    urunler: Array.isArray(x.urunler) ? x.urunler : []
                };
            });
            setSiparisler(rows);
        });
    }, []);

    // sadece TAMAMLANAN siparişler
    const tamamlanan = useMemo(
        () => siparisler.filter((r) => r.durum === "tamamlandi"),
        [siparisler]
    );

    const buckets = useMemo(() => makeBuckets(grup), [grup]);

    const { seri, toplamCiro, toplamSiparis, currentLabel, refText } = useMemo(() => {
        const map = new Map<string, { key: string; label: string; ciro: number; adet: number }>();
        for (const b of buckets) map.set(b.key, { key: b.key, label: b.label, ciro: 0, adet: 0 });

        for (const r of tamamlanan) {
            const d = getJSDate(r.islemeTarihi) || getJSDate(r.tarih);
            if (!d) continue;
            const k = keyOfDate(d, grup);
            const row = map.get(k);
            if (!row) continue;        // pencere dışında
            row.adet += 1;
            row.ciro += Number(r.brutTutar ?? 0);
        }

        const arr = Array.from(map.values());
        const toplamCiro = arr.reduce((t, x) => t + x.ciro, 0);
        const toplamSiparis = arr.reduce((t, x) => t + x.adet, 0);

        const currentLabel = buckets[buckets.length - 1]?.label; // son kova
        const refText =
            grup === "gun" ? "Şu anki saat" :
                grup === "hafta" ? "Bugün" :
                    grup === "ay" ? "Bugün" : "Bu ay";

        return { seri: arr, toplamCiro, toplamSiparis, currentLabel, refText };
    }, [tamamlanan, buckets, grup]);

    // en çok satanlar (değişmedi)
    const topUrunler = useMemo(() => {
        const m = new Map<string, { urunAdi: string; adet: number; ciro: number }>();
        for (const r of tamamlanan) {
            for (const u of (r.urunler || [])) {
                const ad = (u.urunAdi || "").trim() || "(İsimsiz)";
                const adet = Number(u.adet || 0);
                const ciro = adet * Number(u.birimFiyat || 0);
                const prev = m.get(ad) || { urunAdi: ad, adet: 0, ciro: 0 };
                m.set(ad, { urunAdi: ad, adet: prev.adet + adet, ciro: prev.ciro + ciro });
            }
        }
        const arr = Array.from(m.values()).sort((a, b) => b.adet - a.adet).slice(0, 15);
        const toplamAdet = arr.reduce((t, x) => t + x.adet, 0) || 1;
        return arr.map(x => ({ ...x, pay: x.adet / toplamAdet }));
    }, [tamamlanan]);

    const tooltipFormatter = (value: unknown, _name: string, payload: any) => {
        if (payload?.dataKey === "adet") return [fmtNum(Number(value)), "Sipariş"];
        if (payload?.dataKey === "ciro") return [fmtTL(Number(value)), "Ciro"];
        return [String(value ?? ""), ""];
    };

    return (
        <div style={{ display: "grid", gap: 16 }}>
            {/* üst bar */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <h2 style={{ margin: 0 }}>Analiz</h2>

                <div className="seg" style={{ display: "inline-flex", border: "1px solid var(--panel-bdr)", borderRadius: 12, overflow: "hidden" }}>
                    {([
                        { k: "gun", t: "Günlük" },
                        { k: "hafta", t: "Haftalık" },
                        { k: "ay", t: "Aylık" },
                        { k: "yil", t: "Yıllık" },
                    ] as { k: Grup; t: string }[]).map(x => (
                        <button
                            key={x.k}
                            className="theme-btn"
                            onClick={() => setGrup(x.k)}
                            style={{
                                border: "none",
                                borderRight: "1px solid var(--panel-bdr)",
                                background: grup === x.k ? "color-mix(in oklab, var(--ana) 18%, transparent)" : "transparent"
                            }}
                        >{x.t}</button>
                    ))}
                </div>

                <button className="theme-btn" onClick={() => setKombine(v => !v)}>
                    {kombine ? "🔀 Ayrı Grafikler" : "🔗 Kombine Grafik"}
                </button>

                <div style={{ marginLeft: "auto", display: "flex", gap: 12 }}>
                    <div className="card" style={{ padding: "6px 10px" }}>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>Toplam Ciro</div>
                        <div style={{ fontWeight: 800 }}>{fmtTL(toplamCiro)}</div>
                    </div>
                    <div className="card" style={{ padding: "6px 10px" }}>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>Toplam Sipariş</div>
                        <div style={{ fontWeight: 800 }}>{fmtNum(toplamSiparis)}</div>
                    </div>
                </div>
            </div>

            {/* grafikler */}
            {kombine ? (
                <div className="card" style={{ height: 380 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={seri} margin={{ top: 12, right: 20, bottom: 4, left: 8 }}>
                            <defs>
                                <linearGradient id="ciroGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={PALETTE.lineFrom} />
                                    <stop offset="100%" stopColor={PALETTE.lineTo} />
                                </linearGradient>
                            </defs>

                            <CartesianGrid vertical={false} stroke={PALETTE.grid} />
                            <XAxis dataKey="label" tick={{ fill: PALETTE.muted }} />
                            <YAxis yAxisId="L" tick={{ fill: PALETTE.muted }} width={38} />
                            <YAxis
                                yAxisId="R"
                                orientation="right"
                                tick={{ fill: PALETTE.muted }}
                                tickFormatter={(v: number) => fmtTL(v).replace("₺", "")}
                                width={54}
                            />
                            <Tooltip
                                contentStyle={{ background: "rgba(20,22,28,.92)", border: "1px solid var(--panel-bdr,#2a2f3a)", borderRadius: 10 }}
                                labelStyle={{ color: PALETTE.muted }}
                                formatter={tooltipFormatter}
                                labelFormatter={(l: string) => `Dönem: ${l}`}
                            />
                            <Legend formatter={(val: string) => <span style={{ color: PALETTE.muted }}>{val}</span>} />

                            <ReferenceLine x={currentLabel} stroke={PALETTE.grid} label={{ value: refText, fill: PALETTE.muted, position: "top" }} />

                            <Bar yAxisId="L" dataKey="adet" name="Sipariş" fill={PALETTE.bar} radius={[6, 6, 0, 0]} barSize={grup === "gun" ? 10 : 18} />
                            <Area yAxisId="R" type="monotone" dataKey="ciro" name="Ciro" stroke="#7aa2f7" fill="url(#ciroGrad)" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 5 }} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            ) : (
                <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr 1fr" }}>
                    <div className="card" style={{ height: 320 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={seri} margin={{ top: 12, right: 20, bottom: 4, left: 8 }}>
                                <defs>
                                    <linearGradient id="ciroGrad2" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor={PALETTE.lineFrom} />
                                        <stop offset="100%" stopColor={PALETTE.lineTo} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid vertical={false} stroke={PALETTE.grid} />
                                <XAxis dataKey="label" tick={{ fill: PALETTE.muted }} />
                                <YAxis tick={{ fill: PALETTE.muted }} tickFormatter={(v: number) => fmtTL(v).replace("₺", "")} width={54} />
                                <Tooltip
                                    contentStyle={{ background: "rgba(20,22,28,.92)", border: "1px solid var(--panel-bdr,#2a2f3a)", borderRadius: 10 }}
                                    labelStyle={{ color: PALETTE.muted }}
                                    formatter={(v: unknown) => fmtTL(Number(v))}
                                    labelFormatter={(l: string) => `Dönem: ${l}`}
                                />
                                <Legend formatter={(val: string) => <span style={{ color: PALETTE.muted }}>{val}</span>} />
                                <ReferenceLine x={currentLabel} stroke={PALETTE.grid} label={{ value: refText, fill: PALETTE.muted, position: "top" }} />
                                <Area type="monotone" dataKey="ciro" name="Ciro" stroke="#7aa2f7" fill="url(#ciroGrad2)" strokeWidth={2} dot={{ r: 2 }} activeDot={{ r: 5 }} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="card" style={{ height: 320 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={seri} margin={{ top: 12, right: 20, bottom: 4, left: 8 }}>
                                <CartesianGrid vertical={false} stroke={PALETTE.grid} />
                                <XAxis dataKey="label" tick={{ fill: PALETTE.muted }} />
                                <YAxis tick={{ fill: PALETTE.muted }} width={38} />
                                <Tooltip
                                    contentStyle={{ background: "rgba(20,22,28,.92)", border: "1px solid var(--panel-bdr,#2a2f3a)", borderRadius: 10 }}
                                    labelStyle={{ color: PALETTE.muted }}
                                    formatter={(v: unknown) => fmtNum(Number(v))}
                                    labelFormatter={(l: string) => `Dönem: ${l}`}
                                />
                                <Legend formatter={(val: string) => <span style={{ color: PALETTE.muted }}>{val}</span>} />
                                <ReferenceLine x={currentLabel} stroke={PALETTE.grid} label={{ value: refText, fill: PALETTE.muted, position: "top" }} />
                                <Bar dataKey="adet" name="Sipariş" fill={PALETTE.bar} radius={[6, 6, 0, 0]} barSize={grup === "gun" ? 10 : 18} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* En Çok Satan Ürünler (değişmedi) */}
            <div className="card">
                <h3 style={{ marginTop: 0 }}>En Çok Satan Ürünler</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1.4fr 120px 120px 1fr 64px", gap: 8, fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>
                    <div>Ürün</div><div>Adet</div><div>Ciro</div><div>Pay</div><div>%</div>
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                    {topUrunler.map((u) => {
                        const pct = Math.max(0, Math.min(100, Math.round((u as any).pay * 100)));
                        return (
                            <div key={u.urunAdi} className="row" style={{
                                display: "grid",
                                gridTemplateColumns: "1.4fr 120px 120px 1fr 64px",
                                gap: 8, alignItems: "center",
                                border: "1px solid var(--panel-bdr)", borderRadius: 10, padding: "8px 10px"
                            }}>
                                <div><b>{u.urunAdi || "—"}</b></div>
                                <div><b>{fmtNum(u.adet)}</b></div>
                                <div>{fmtTL(u.ciro)}</div>
                                <div className="progress"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
                                <div style={{ textAlign: "right" }}>{pct}%</div>
                            </div>
                        );
                    })}
                    {!topUrunler.length && <div>Veri yok.</div>}
                </div>
            </div>

            <div style={{ fontSize: 12, color: "var(--muted)" }}>
                Görüntülenen aralık: {grup === "gun" ? "Son 24 saat"
                    : grup === "hafta" ? "Son 7 gün"
                        : grup === "ay" ? "Son 30 gün"
                            : "Son 12 ay"}.
            </div>
        </div>
    );
}

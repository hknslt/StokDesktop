import { Grup, fmtTL, fmtNum } from "../utils/AnalizUtils";

type Props = {
    grup: Grup;
    setGrup: (g: Grup) => void;
    kombine: boolean;
    setKombine: (v: boolean) => void; 
    toplamCiro: number;
    toplamSiparis: number;
};

export default function AnalizTopbar({ grup, setGrup, kombine, setKombine, toplamCiro, toplamSiparis }: Props) {
    const groups: { k: Grup; t: string }[] = [
        { k: "gun", t: "Günlük" },
        { k: "hafta", t: "Haftalık" },
        { k: "ay", t: "Aylık" },
        { k: "yil", t: "Yıllık" },
    ];

    return (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>Analiz</h2>
            
            {/* Grup Filtreleri */}
            <div className="seg" style={{ display: "inline-flex", border: "1px solid var(--panel-bdr)", borderRadius: 12, overflow: "hidden" }}>
                {groups.map(x => (
                    <button
                        key={x.k}
                        className="theme-btn"
                        onClick={() => setGrup(x.k)}
                        style={{
                            border: "none",
                            borderRight: "1px solid var(--panel-bdr)",
                            background: grup === x.k ? "color-mix(in oklab, var(--ana) 18%, transparent)" : "transparent"
                        }}
                    >
                        {x.t}
                    </button>
                ))}
            </div>

            {/* Grafik Modu Butonu */}
            <button className="theme-btn" onClick={() => setKombine(!kombine)}>
                {kombine ? "🔀 Ayrı Grafikler" : "🔗 Kombine Grafik"}
            </button>

            {/* Özet Kartları */}
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
    );
}
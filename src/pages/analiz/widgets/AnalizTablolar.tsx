import { AktifListe, fmtNum, fmtTL } from "../utils/AnalizUtils";

type Props = {
    aktifListe: AktifListe;
    setAktifListe: (l: AktifListe) => void;
    topUrunler: { urunAdi: string; adet: number; ciro: number; pay: number }[];
    topGruplar: { grupAdi: string; adet: number; pay: number }[];
    guncelSiparisGruplari: { grupAdi: string; adet: number; pay: number }[];
};

export default function AnalizTablolar({ aktifListe, setAktifListe, topUrunler, topGruplar, guncelSiparisGruplari }: Props) {
    
    const renderProgressBar = (pct: number) => (
        <div className="progress">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
    );

    return (
        <>
            {/* Butonlar */}
            <div className="card" style={{ padding: "8px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {[
                    { k: 'satanUrunler', t: 'En Çok Satan Ürünler' },
                    { k: 'stokGrup', t: 'Stok Dağılımı (Grup)' },
                    { k: 'siparisGrup', t: 'Güncel Sipariş İhtiyacı (Grup)' }
                ].map(btn => (
                    <button
                        key={btn.k}
                        className="theme-btn"
                        style={{ flex: 1, minWidth: '200px', borderColor: aktifListe === btn.k ? 'var(--ana)' : 'var(--panel-bdr)' }}
                        onClick={() => setAktifListe(btn.k as AktifListe)}
                    >
                        {btn.t}
                    </button>
                ))}
            </div>

            {/* İçerik */}
            <div>
                {aktifListe === 'satanUrunler' && (
                    <div className="card">
                        <h3 style={{ marginTop: 0 }}>En Çok Satan Ürünler</h3>
                        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 120px 120px 1fr 64px", gap: 8, fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>
                            <div>Ürün</div><div>Adet</div><div>Ciro</div><div>Pay</div><div>%</div>
                        </div>
                        <div style={{ display: "grid", gap: 10 }}>
                            {topUrunler.map((u) => {
                                const pct = Math.max(0, Math.min(100, Math.round(u.pay * 100)));
                                return (
                                    <div key={u.urunAdi} className="row" style={{ display: "grid", gridTemplateColumns: "1.4fr 120px 120px 1fr 64px", gap: 8, alignItems: "center", border: "1px solid var(--panel-bdr)", borderRadius: 10, padding: "8px 10px" }}>
                                        <div><b>{u.urunAdi || "—"}</b></div>
                                        <div><b>{fmtNum(u.adet)}</b></div>
                                        <div>{fmtTL(u.ciro)}</div>
                                        {renderProgressBar(pct)}
                                        <div style={{ textAlign: "right" }}>{pct}%</div>
                                    </div>
                                );
                            })}
                            {!topUrunler.length && <div>Veri yok.</div>}
                        </div>
                    </div>
                )}

                {aktifListe === 'stokGrup' && (
                    <div className="card">
                        <h3 style={{ marginTop: 0 }}>Stok Dağılımı (Grup)</h3>
                        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 120px 1fr 64px", gap: 8, fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>
                            <div>Grup</div><div>Stok Adedi</div><div>Pay</div><div>%</div>
                        </div>
                        <div style={{ display: "grid", gap: 10 }}>
                            {topGruplar.map((g) => {
                                const pct = Math.max(0, Math.min(100, Math.round(g.pay * 100)));
                                return (
                                    <div key={g.grupAdi} className="row" style={{ display: "grid", gridTemplateColumns: "1.4fr 120px 1fr 64px", gap: 8, alignItems: "center", border: "1px solid var(--panel-bdr)", borderRadius: 10, padding: "8px 10px" }}>
                                        <div><b>{g.grupAdi}</b></div>
                                        <div><b>{fmtNum(g.adet)}</b></div>
                                        {renderProgressBar(pct)}
                                        <div style={{ textAlign: "right" }}>{pct}%</div>
                                    </div>
                                );
                            })}
                            {!topGruplar.length && <div>Veri yok.</div>}
                        </div>
                    </div>
                )}

                {aktifListe === 'siparisGrup' && (
                    <div className="card">
                        <h3 style={{ marginTop: 0 }}>Güncel Sipariş İhtiyacı (Grup Bazlı)</h3>
                        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 120px 1fr 64px", gap: 8, fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>
                            <div>Grup</div><div>İstenen Adet</div><div>Pay</div><div>%</div>
                        </div>
                        <div style={{ display: "grid", gap: 10 }}>
                            {guncelSiparisGruplari.map((g) => {
                                const pct = Math.max(0, Math.min(100, Math.round(g.pay * 100)));
                                return (
                                    <div key={g.grupAdi} className="row" style={{ display: "grid", gridTemplateColumns: "1.4fr 120px 1fr 64px", gap: 8, alignItems: "center", border: "1px solid var(--panel-bdr)", borderRadius: 10, padding: "8px 10px" }}>
                                        <div><b>{g.grupAdi}</b></div>
                                        <div><b>{fmtNum(g.adet)}</b></div>
                                        {renderProgressBar(pct)}
                                        <div style={{ textAlign: "right" }}>{pct}%</div>
                                    </div>
                                );
                            })}
                            {!guncelSiparisGruplari.length && <div>Aktif siparişlerde ürün ihtiyacı yok.</div>}
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
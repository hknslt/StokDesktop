// src/sayfalar/ayarlar/GruplarTab.tsx
import { useEffect, useMemo, useState } from "react";
import {
    addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query, serverTimestamp, where
} from "firebase/firestore";
import { veritabani } from "../../firebase";

type GrupDoc = { id: string; ad: string; adLower: string; createdAt?: any };

export default function GruplarTab() {
    const [grupAd, setGrupAd] = useState("");
    const [grupAra, setGrupAra] = useState("");
    const [gruplar, setGruplar] = useState<GrupDoc[]>([]);
    const [durum, setDurum] = useState<string | null>(null);
    const [yuk, setYuk] = useState(false);

    useEffect(() => {
        const qy = query(collection(veritabani, "gruplar"), orderBy("adLower", "asc"));
        const off = onSnapshot(qy, (snap) => {
            const list: GrupDoc[] = snap.docs.map(d => {
                const x = d.data() as any;
                return { id: d.id, ad: String(x.ad || ""), adLower: String(x.adLower || "").toLocaleLowerCase("tr"), createdAt: x.createdAt };
            }).filter(r => r.ad);
            setGruplar(list);
        });
        return () => off();
    }, []);

    const _norm = (s: string) => s.trim().toLocaleLowerCase("tr");

    async function grupEkle() {
        const ad = grupAd.trim();
        if (!ad) { setDurum("Grup adı boş olamaz."); return; }

        const adLower = _norm(ad);
        try {
            setYuk(true); setDurum(null);
            const qy = query(collection(veritabani, "gruplar"), where("adLower", "==", adLower));
            const sn = await getDocs(qy);
            if (!sn.empty) { setDurum(`'${ad}' zaten kayıtlı.`); return; }

            await addDoc(collection(veritabani, "gruplar"), { ad, adLower, createdAt: serverTimestamp() });
            setGrupAd(""); setDurum(`'${ad}' eklendi.`);
        } catch (e: any) {
            setDurum(e?.message || "Grup eklenemedi.");
        } finally {
            setYuk(false);
        }
    }

    async function grupSil(id: string, ad: string) {
        try {
            await deleteDoc(doc(veritabani, "gruplar", id));
            setDurum(`'${ad}' silindi.`);
        } catch (e: any) {
            setDurum(e?.message || "Grup silinemedi.");
        }
    }

    const filtreli = useMemo(() => {
        const q = _norm(grupAra);
        if (!q) return gruplar;
        return gruplar.filter(r => r.adLower.includes(q));
    }, [grupAra, gruplar]);

    return (
        <div style={{ display: "grid", gap: 12, maxWidth: 720 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                <input
                    className="input"
                    placeholder="Grup adı"
                    value={grupAd}
                    onChange={(e) => setGrupAd(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") grupEkle(); }}
                />
                <button onClick={grupEkle} disabled={yuk || !grupAd.trim()}>
                    {yuk ? "Ekleniyor…" : "Ekle"}
                </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
                <input
                    className="input"
                    placeholder="Ara (grup)"
                    value={grupAra}
                    onChange={(e) => setGrupAra(e.target.value)}
                />

                <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 80px", gap: 8, fontSize: 13, color: "var(--muted)" }}>
                        <div>Grup</div>
                        <div>Oluşturma</div>
                        <div>Aksiyon</div>
                    </div>

                    {filtreli.map((r) => (
                        <div key={r.id}
                            className="hoverable"
                            style={{
                                display: "grid", gridTemplateColumns: "1fr 140px 80px", gap: 8, alignItems: "center",
                                border: "1px solid var(--panel-bdr)", borderRadius: 10, padding: "8px 10px"
                            }}>
                            <div style={{ fontWeight: 600 }}>{r.ad}</div>
                            <div style={{ fontSize: 12, opacity: .8 }}>
                                {r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString() : "—"}
                            </div>
                            <div>
                                <button className="theme-btn" onClick={() => grupSil(r.id, r.ad)}>Sil</button>
                            </div>
                        </div>
                    ))}

                    {!filtreli.length && <div style={{ color: "var(--muted)" }}>Kayıtlı grup yok.</div>}
                </div>
            </div>

            {durum && <div style={{ opacity: .9 }}>{durum}</div>}
        </div>
    );
}
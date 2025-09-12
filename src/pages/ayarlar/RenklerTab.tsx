import { useEffect, useMemo, useState } from "react";
import {
  addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, orderBy, query, serverTimestamp, where
} from "firebase/firestore";
import { veritabani } from "../../firebase";

type RenkDoc = { id: string; ad: string; adLower: string; createdAt?: any };

export default function RenklerTab() {
  const [renkAd, setRenkAd] = useState("");
  const [renkAra, setRenkAra] = useState("");
  const [renkler, setRenkler] = useState<RenkDoc[]>([]);
  const [durum, setDurum] = useState<string | null>(null);
  const [yuk, setYuk] = useState(false);

  useEffect(() => {
    const qy = query(collection(veritabani, "renkler"), orderBy("adLower", "asc"));
    const off = onSnapshot(qy, (snap) => {
      const list: RenkDoc[] = snap.docs.map(d => {
        const x = d.data() as any;
        return { id: d.id, ad: String(x.ad || ""), adLower: String(x.adLower || "").toLocaleLowerCase("tr"), createdAt: x.createdAt };
      }).filter(r => r.ad);
      setRenkler(list);
    });
    return () => off();
  }, []);

  const _norm = (s: string) => s.trim().toLocaleLowerCase("tr");

  async function renkEkle() {
    const ad = renkAd.trim();
    if (!ad) { setDurum("Renk adı boş olamaz."); return; }

    const adLower = _norm(ad);
    try {
      setYuk(true); setDurum(null);
      const qy = query(collection(veritabani, "renkler"), where("adLower", "==", adLower));
      const sn = await getDocs(qy);
      if (!sn.empty) { setDurum(`'${ad}' zaten kayıtlı.`); return; }

      await addDoc(collection(veritabani, "renkler"), { ad, adLower, createdAt: serverTimestamp() });
      setRenkAd(""); setDurum(`'${ad}' eklendi.`);
    } catch (e: any) {
      setDurum(e?.message || "Renk eklenemedi.");
    } finally {
      setYuk(false);
    }
  }

  async function renkSil(id: string, ad: string) {
    try {
      await deleteDoc(doc(veritabani, "renkler", id));
      setDurum(`'${ad}' silindi.`);
    } catch (e: any) {
      setDurum(e?.message || "Renk silinemedi.");
    }
  }

  const filtreli = useMemo(() => {
    const q = _norm(renkAra);
    if (!q) return renkler;
    return renkler.filter(r => r.adLower.includes(q));
  }, [renkAra, renkler]);

  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 720 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
        <input
          className="input"
          placeholder="Renk adı (örn. Kahve)"
          value={renkAd}
          onChange={(e) => setRenkAd(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") renkEkle(); }}
        />
        <button onClick={renkEkle} disabled={yuk || !renkAd.trim()}>
          {yuk ? "Ekleniyor…" : "Ekle"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
        <input
          className="input"
          placeholder="Ara (renk)"
          value={renkAra}
          onChange={(e) => setRenkAra(e.target.value)}
        />

        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 80px", gap: 8, fontSize: 13, color: "var(--muted)" }}>
            <div>Renk</div>
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
                <button className="theme-btn" onClick={() => renkSil(r.id, r.ad)}>Sil</button>
              </div>
            </div>
          ))}

          {!filtreli.length && <div style={{ color: "var(--muted)" }}>Kayıtlı renk yok.</div>}
        </div>
      </div>

      {durum && <div style={{ opacity: .9 }}>{durum}</div>}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import {
  collection, doc, onSnapshot, orderBy, query, updateDoc, deleteDoc
} from "firebase/firestore";
import { veritabani } from "../../firebase";
import { Link } from "react-router-dom";

type Musteri = {
  id: number;
  firmaAdi: string;
  yetkili?: string;
  telefon?: string;
  adres?: string;
  guncel: boolean;
  createdAt?: any;
};
type Row = Musteri & { docId: string };

export default function MusteriListesi() {
  const [rows, setRows] = useState<Row[]>([]);
  const [ara, setAra] = useState("");
  const [durum, setDurum] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [siralaArtan, setSiralaArtan] = useState(true); // A→Z / Z→A

  useEffect(() => {
    const qy = query(collection(veritabani, "musteriler"), orderBy("id", "asc"));
    return onSnapshot(qy, (snap) => {
      const list: Row[] = snap.docs.map((d) => {
        const x = d.data() as any;
        return {
          docId: d.id,
          id: Number(x.id ?? Number(d.id)),
          firmaAdi: String(x.firmaAdi ?? ""),
          yetkili: x.yetkili || "",
          telefon: x.telefon || "",
          adres: x.adres || "",
          guncel: Boolean(x.guncel ?? true),
          createdAt: x.createdAt,
        };
      });
      setRows(list);
    });
  }, []);

  // Filtre + Sıralama (firma adına göre)
  const gorunen = useMemo(() => {
    const q = ara.trim().toLowerCase();
    let base = !q
      ? rows
      : rows.filter((r) =>
          [r.firmaAdi, r.yetkili, r.telefon, r.adres]
            .filter(Boolean)
            .map((s) => String(s).toLowerCase())
            .some((s) => s.includes(q))
        );

    const dir = siralaArtan ? 1 : -1;
    const sorted = [...base].sort((a, b) =>
      (a.firmaAdi || "").localeCompare(b.firmaAdi || "", "tr", { sensitivity: "base" }) * dir
    );
    return sorted;
  }, [rows, ara, siralaArtan]);

  async function toggle(docId: string, newVal: boolean) {
    setBusyId(docId);
    setDurum(null);
    const prev = rows.find(r => r.docId === docId)?.guncel ?? true;
    setRows((rs) => rs.map(r => r.docId === docId ? { ...r, guncel: newVal } : r));
    try {
      await updateDoc(doc(veritabani, "musteriler", docId), { guncel: newVal });
    } catch (e: any) {
      console.error("Müşteri durum güncelleme hatası:", e);
      setDurum(e?.code === "permission-denied"
        ? "Yetki yok: Bu işlemi sadece admin/pazarlamacı yapabilir."
        : (e?.message || "Durum değiştirilemedi."));
      setRows((rs) => rs.map(r => r.docId === docId ? { ...r, guncel: prev } : r));
    } finally {
      setBusyId(null);
    }
  }

  async function sil(docId: string) {
    if (!confirm("Bu müşteriyi silmek istediğine emin misin?")) return;
    setBusyId(docId);
    setDurum(null);
    try {
      await deleteDoc(doc(veritabani, "musteriler", docId));
    } catch (e: any) {
      console.error("Müşteri silme hatası:", e);
      setDurum(e?.message || "Silinemedi.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Müşteriler</h2>

        <input
          className="input"
          placeholder="Ara (firma, yetkili, telefon…)"
          value={ara}
          onChange={(e) => setAra(e.target.value)}
          style={{ maxWidth: 320 }}
        />

        <button
          className="theme-btn"
          type="button"
          onClick={() => setSiralaArtan(s => !s)}
          title="Firma adına göre sırala"
        >
          {siralaArtan ? "A→Z" : "Z→A"}
        </button>

        <div style={{ marginLeft: "auto" }}>
          <Link to="/musteri/yeni"><button>Yeni Müşteri</button></Link>
        </div>
      </div>

      {durum && (
        <div className="card" style={{ borderColor: "var(--kirmizi)" }}>
          {durum}
        </div>
      )}

      <div className="card">
        {/* Başlıklar: ID yok */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 1fr 1fr 160px 160px",
            gap: 8,
            fontSize: 13,
            color: "var(--muted)",
            marginBottom: 8,
          }}
        >
          <div>Firma Adı</div>
          <div>Yetkili</div>
          <div>Telefon</div>
          <div>Durum</div>
          <div>İşlemler</div>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          {gorunen.map((r) => (
            <div
              key={r.docId}
              // title KALDIRILDI: adres artık tooltip olarak görünmeyecek
              style={{
                display: "grid",
                gridTemplateColumns: "1.4fr 1fr 1fr 160px 160px",
                gap: 8,
                alignItems: "center",
                border: "1px solid var(--panel-bdr)",
                borderRadius: 10,
                padding: "8px 10px",
              }}
            >
              <div><b>{r.firmaAdi}</b></div>
              <div>{r.yetkili || "—"}</div>
              <div>{r.telefon || "—"}</div>

              {/* Durum pill */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => toggle(r.docId, !r.guncel)}
                  disabled={busyId === r.docId}
                  title="Aktif/Pasif"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: "1px solid var(--panel-bdr)",
                    background: r.guncel
                      ? "color-mix(in oklab, var(--yesil) 18%, transparent)"
                      : "transparent",
                    cursor: busyId === r.docId ? "not-allowed" : "pointer",
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: r.guncel ? "var(--yesil)" : "var(--muted)",
                    }}
                  />
                  <span style={{ fontSize: 13 }}>{r.guncel ? "Aktif" : "Pasif"}</span>
                </button>
                {busyId === r.docId && (
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>Kaydediliyor…</span>
                )}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <Link to={`/musteri/${r.docId}`}>
                  <button className="theme-btn">Detay</button>
                </Link>
                <button
                  className="theme-btn"
                  style={{ background: "var(--kirmizi)", color: "white" }}
                  onClick={() => sil(r.docId)}
                  disabled={busyId === r.docId}
                >
                  Sil
                </button>
              </div>
            </div>
          ))}

          {!gorunen.length && <div>Liste boş.</div>}
        </div>
      </div>
    </div>
  );
}

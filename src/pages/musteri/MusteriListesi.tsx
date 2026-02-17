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
  const [busyId, setBusyId] = useState<string | null>(null);
  const [siralaArtan, setSiralaArtan] = useState(true); // A→Z / Z→A

  // ==========================================
  // --- ÖZEL MODAL (ALERT/CONFIRM) YAPISI ---
  // ==========================================
  const [modal, setModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    isConfirm: boolean;
    onConfirm?: () => void;
    onClose?: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    isConfirm: false,
  });

  const showAlert = (message: string, title = "Bilgi", onClose?: () => void) => {
    setModal({ isOpen: true, title, message, isConfirm: false, onClose });
  };

  const showConfirm = (message: string, onConfirm: () => void, title = "Onay Gerekli") => {
    setModal({ isOpen: true, title, message, isConfirm: true, onConfirm });
  };

  const closeModal = () => {
    setModal(prev => ({ ...prev, isOpen: false }));
  };
  // ==========================================

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
    const prev = rows.find(r => r.docId === docId)?.guncel ?? true;

    // Optimistic UI Update (Ekrandaki görüntüyü anında değiştir, hata olursa geri al)
    setRows((rs) => rs.map(r => r.docId === docId ? { ...r, guncel: newVal } : r));

    try {
      await updateDoc(doc(veritabani, "musteriler", docId), { guncel: newVal });
    } catch (e: any) {
      console.error("Müşteri durum güncelleme hatası:", e);
      // Hata durumunda UI'ı eski haline çevir
      setRows((rs) => rs.map(r => r.docId === docId ? { ...r, guncel: prev } : r));

      const msg = e?.code === "permission-denied"
        ? "Yetki yok: Bu işlemi sadece admin/pazarlamacı yapabilir."
        : (e?.message || "Durum değiştirilemedi.");

      showAlert(msg, "Hata");
    } finally {
      setBusyId(null);
    }
  }

  function sil(r: Row) {
    showConfirm(
      `'${r.firmaAdi}' isimli müşteriyi silmek istediğinize emin misiniz?`,
      async () => {
        setBusyId(r.docId);
        try {
          await deleteDoc(doc(veritabani, "musteriler", r.docId));
        } catch (e: any) {
          console.error("Müşteri silme hatası:", e);
          showAlert(e?.message || "Müşteri silinemedi.", "Hata");
        } finally {
          setBusyId(null);
        }
      }, "Müşteri Sil");
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
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>İşleniyor…</span>
                )}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <Link to={`/musteri/${r.docId}`}>
                  <button className="theme-btn">Detay</button>
                </Link>
                <button
                  className="theme-btn"
                  style={{ background: "var(--kirmizi)", color: "white" }}
                  onClick={() => sil(r)}
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

      {/* ========================================== */}
      {/* ÖZEL MODAL UI KISMI                        */}
      {/* ========================================== */}
      {modal.isOpen && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.6)",
          display: "flex", justifyContent: "center", alignItems: "center",
          zIndex: 99999
        }}>
          <div className="card" style={{
            backgroundColor: "white",
            color: "#333",
            width: "90%", maxWidth: 400,
            padding: "24px", borderRadius: "12px",
            boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
            display: "flex", flexDirection: "column", gap: "16px",
            position: "relative"
          }}>
            <h3 style={{ margin: 0, color: "black", fontSize: "18px" }}>{modal.title}</h3>

            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5, fontSize: "14px" }}>
              {modal.message}
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 10 }}>
              {modal.isConfirm && (
                <button
                  className="theme-btn"
                  onClick={closeModal}
                  style={{ background: "#6c757d", color: "white", padding: "8px 16px", border: "none", borderRadius: "6px", cursor: "pointer" }}
                >
                  İptal
                </button>
              )}
              <button
                className="theme-btn"
                onClick={() => {
                  if (modal.isConfirm && modal.onConfirm) {
                    modal.onConfirm();
                  } else if (!modal.isConfirm && modal.onClose) {
                    modal.onClose();
                  }
                  closeModal();
                }}
                style={{
                  background: modal.isConfirm ? "#dc3545" : "#28a745",
                  color: "white",
                  padding: "8px 16px",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontWeight: "bold"
                }}
              >
                {modal.isConfirm ? "Onayla" : "Tamam"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
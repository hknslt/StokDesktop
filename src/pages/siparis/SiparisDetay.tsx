// src/sayfalar/siparis/SiparisDetay.tsx
import { useEffect, useState } from "react";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { veritabani } from "../../firebase";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  guncelleDurum,
  SiparisDurumu,
  reddetVeIade,
  urunStokDurumHaritasi,
  StokDetay,
  sevkiyattanGeriCek,
} from "../../services/SiparisService";
import { siparisPdfYazdirWeb } from "../../pdf/siparisPdf";

const ETIKET: Record<SiparisDurumu, string> = {
  beklemede: "Beklemede",
  uretimde: "Üretimde",
  sevkiyat: "Sevkiyat",
  tamamlandi: "Tamamlandı",
  reddedildi: "Reddedildi",
};

export default function SiparisDetay() {
  const { id } = useParams();
  const nav = useNavigate();
  const [yuk, setYuk] = useState(true);
  const [r, setR] = useState<any | null>(null);
  const [guncelMusteri, setGuncelMusteri] = useState<any>(null);

  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [stokDetaylari, setStokDetaylari] = useState<Map<string, StokDetay>>(new Map());

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
    (async () => {
      if (!id) return;
      setYuk(true);
      const snap = await getDoc(doc(veritabani, "siparisler", id!));

      if (snap.exists()) {
        const data = snap.data() as any;
        const siparis = { ...data, docId: id! };
        setR(siparis);
        let aktifMusteriData = siparis.musteri;
        const musteriIdStr = siparis.musteri?.id;

        if (musteriIdStr) {
          try {
            const q = query(
              collection(veritabani, "musteriler"),
              where("idNum", "==", Number(musteriIdStr))
            );
            const mSnap = await getDocs(q);

            if (!mSnap.empty) {
              aktifMusteriData = mSnap.docs[0].data();
            }
          } catch (err) {
            console.error("Güncel müşteri bilgisi çekilemedi, eskisi kullanılacak.", err);
          }
        }

        // State'i güncelle
        setGuncelMusteri(aktifMusteriData);
        // --------------------------------------------------

        if ((siparis.durum === "beklemede" || siparis.durum === "uretimde") && data.urunler?.length) {
          const stokMap = await urunStokDurumHaritasi(siparis.urunler);
          setStokDetaylari(stokMap);
        }
      } else {
        setR(null);
      }

      setYuk(false);
    })();
  }, [id]);

  async function reddet() {
    if (!r) return;

    // İşlem kritik olduğu için emin misiniz onayı ekledik
    showConfirm("Bu siparişi reddetmek istediğinize emin misiniz?", async () => {
      setBusy(true);
      try {
        if (r.durum === "sevkiyat") {
          const iadeYapildi = await reddetVeIade(r.docId);
          // showAlert'a "Tamam" dendiğinde nav("/siparisler") çalışır
          showAlert(
            iadeYapildi ? "Sipariş reddedildi ve stok iade edildi." : "Sipariş reddedildi.",
            "Başarılı",
            () => nav("/siparisler")
          );
        } else {
          await guncelleDurum(r.docId, "reddedildi", { islemeTarihiniAyarla: true });
          showAlert("Sipariş reddedildi.", "Başarılı", () => nav("/siparisler"));
        }
      } finally {
        setBusy(false);
      }
    }, "Siparişi Reddet");
  }

  async function tamamla() {
    if (!r) return;

    showConfirm("Siparişi tamamlandı olarak işaretlemek istediğinize emin misiniz?", async () => {
      setBusy(true);
      try {
        await guncelleDurum(r.docId, "tamamlandi", { islemeTarihiniAyarla: true });
        showAlert("Sipariş başarıyla tamamlandı.", "Başarılı", () => nav("/siparisler"));
      } finally {
        setBusy(false);
      }
    }, "Siparişi Tamamla");
  }

  async function pdfOlustur() {
    if (!r) return;
    try {
      setPdfBusy(true);
      const siparisVerisi = { ...r, musteri: guncelMusteri };
      await siparisPdfYazdirWeb(siparisVerisi);
    } catch (e) {
      console.error(e);
      showAlert("PDF oluşturulamadı.", "Hata");
    } finally {
      setPdfBusy(false);
    }
  }

  async function handleGeriCek() {
    if (!r) return;

    const mesaj = "Bu siparişi sevkiyattan geri çekmek istediğinizden emin misiniz?\n\nÜrünler stoğa geri eklenecek ve sipariş 'Beklemede' durumuna alınacaktır.";

    showConfirm(mesaj, async () => {
      setBusy(true);
      try {
        const ok = await sevkiyattanGeriCek(r.docId);
        if (ok) {
          showAlert("Sipariş başarıyla geri çekildi ve stoklar iade edildi.", "Başarılı", () => window.location.reload());
        } else {
          showAlert("İşlem sırasında bir hata oluştu.", "Hata");
        }
      } catch (error) {
        console.error("Geri çekme hatası:", error);
        showAlert("İşlem sırasında bir hata oluştu.", "Hata");
      } finally {
        setBusy(false);
      }
    }, "Sevkiyattan Geri Çek");
  }

  if (yuk) return <div className="card">Yükleniyor…</div>;
  if (!r) return <div className="card">Bulunamadı.</div>;

  const net = Number(r.netTutar || 0),
    kdv = Number(r.kdvTutar || 0),
    brut = Number(r.brutTutar || 0);

  const isSiparisAktif = r.durum === "beklemede" || r.durum === "uretimde";

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Başlık ve Butonlar Alanı */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Sipariş Detayı</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="theme-btn" onClick={() => nav(-1)}>
            Geri
          </button>
          {(r.durum === "beklemede" || r.durum === "uretimde") && (
            <Link to={`/siparis/duzenle/${id}`} className="theme-btn">
              Düzenle
            </Link>
          )}
          <button onClick={pdfOlustur} disabled={pdfBusy}>
            {pdfBusy ? "PDF…" : "PDF"}
          </button>

          {(r.durum === "beklemede" || r.durum === "uretimde") && (
            <Link to={`/siparis/kismi-sevkiyat/${id}`}>
              <button
                disabled={busy}
                style={{ background: "var(--yesil)", color: "white" }}
                title="Siparişi onayla, stokları kontrol et ve sevkiyat yap"
              >
                Sevkiyat Onayı
              </button>
            </Link>
          )}

          {r.durum !== "reddedildi" && r.durum !== "tamamlandi" && (
            <button className="theme-btn" disabled={busy} onClick={reddet}>
              Reddet
            </button>
          )}

          {r.durum === "sevkiyat" && (
            <button
              className="theme-btn"
              style={{ backgroundColor: 'var(--sari, #ffc107)', color: 'black' }}
              disabled={busy}
              onClick={handleGeriCek}
            >
              {busy ? "…" : "Sevkiyattan Çek"}
            </button>
          )}
          {r.durum === "sevkiyat" && (
            <button disabled={busy} onClick={tamamla}>
              Tamamla
            </button>
          )}
        </div>
      </div>

      <div className="card" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <div style={{ marginBottom: 8 }}>
            <span className={`tag status-${r.durum}`}>{ETIKET[r.durum as SiparisDurumu] ?? r.durum}</span>
          </div>

          <div>
            <b>Müşteri:</b> {guncelMusteri?.firmaAdi} {guncelMusteri?.yetkili ? `• ${guncelMusteri?.yetkili}` : ""}
          </div>
          <div>
            <b>Tel:</b> {guncelMusteri?.telefon || "-"}
          </div>
          <div>
            <b>Adres:</b> {guncelMusteri?.adres || "-"}
          </div>

          <div>
            <b>Tarih:</b> {r.tarih?.toDate?.().toLocaleDateString?.() || "-"}
          </div>
          <div>
            <b>İşlem Tarihi:</b> {r.islemeTarihi?.toDate?.().toLocaleDateString?.() || "-"}
          </div>
          {r.aciklama && (
            <div>
              <b>Açıklama:</b> {r.aciklama}
            </div>
          )}
        </div>

        <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 120px 110px 110px",
              gap: 8,
              color: "var(--muted)",
              fontSize: 13,
            }}
          >
            <div>Ürün</div>
            <div>{isSiparisAktif ? 'Adet / Stok' : 'Adet'}</div>
            <div> Birim Fiyat(Net)</div>
            <div>Toplam Fiyat(Net)</div>
          </div>

          {(r.urunler || []).map((s: any, i: number) => {
            const renklendirmeAktif = r.durum === "beklemede" || r.durum === "uretimde";
            const detay = stokDetaylari.get(s.id);

            const satirStili: React.CSSProperties = {
              display: "grid",
              gridTemplateColumns: "1fr 120px 110px 110px",
              gap: 8,
              border: "1px solid",
              borderRadius: 10,
              padding: "6px 8px",
              transition: "border-color 0.3s, background-color 0.3s",
              backgroundColor: !renklendirmeAktif ? "transparent"
                : detay?.durum === 'YETERLI' ? "var(--yesil-bg, #e8f5e9)"
                  : detay?.durum === 'KRITIK' ? "var(--sari-bg, #fffde7)"
                    : detay?.durum === 'YETERSİZ' ? "var(--kirmizi-bg, #ffebee)"
                      : "transparent",
              borderColor: !renklendirmeAktif ? "var(--panel-bdr, #ddd)"
                : detay?.durum === 'YETERLI' ? "var(--yesil, #4caf50)"
                  : detay?.durum === 'KRITIK' ? "var(--sari, #ffc107)"
                    : detay?.durum === 'YETERSİZ' ? "var(--kirmizi, #f44336)"
                      : "var(--panel-bdr, #ddd)",
              borderWidth: renklendirmeAktif && detay ? 2 : 1,
            };

            return (
              <div key={i} style={satirStili}>
                <div><b>{s.urunAdi}</b>{s.renk ? <span style={{ opacity: 0.8 }}> • {s.renk}</span> : null}</div>
                <div>
                  {isSiparisAktif ? (
                    <>
                      {s.adet} /{" "}
                      <b style={{ color: detay?.durum === 'YETERSİZ' ? 'var(--kirmizi)' : 'inherit' }}>
                        {detay?.mevcutStok ?? "…"}
                      </b>
                    </>
                  ) : (
                    s.adet
                  )}
                </div>
                <div>{Number(s.birimFiyat || 0).toLocaleString()}</div>
                <div>{(Number(s.adet || 0) * Number(s.birimFiyat || 0)).toLocaleString()}</div>
              </div>
            );
          })}

          <div style={{ justifySelf: "end", display: "grid", gap: 6 }}>
            <div>
              Net: <b>{net.toLocaleString()}</b>
            </div>
            <div>
              KDV: <b>{kdv.toLocaleString()}</b>
            </div>
            <div>
              Brüt: <b>{brut.toLocaleString()}</b>
            </div>
          </div>
        </div>
      </div>

      <div>
        <Link to="/siparisler" className="theme-btn">
          ← Listeye dön
        </Link>
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
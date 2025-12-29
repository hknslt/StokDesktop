// src/sayfalar/siparis/SiparisDetay.tsx
import { useEffect, useState } from "react";
import { veritabani } from "../../firebase";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  guncelleDurum,
  // sevkiyataGecir, // GÜNCELLENDİ: Silindi
  SiparisDurumu,
  reddetVeIade,
  urunStokDurumHaritasi,
  StokDetay,
  sevkiyattanGeriCek,
} from "../../services/SiparisService";
import { siparisPdfYazdirWeb } from "../../pdf/siparisPdf";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";

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
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [stokDetaylari, setStokDetaylari] = useState<Map<string, StokDetay>>(new Map());
  const [guncelMusteri, setGuncelMusteri] = useState<any>(null);

  useEffect(() => {
    (async () => {
      if (!id) return;
      setYuk(true);
      const snap = await getDoc(doc(veritabani, "siparisler", id!));

      if (snap.exists()) {
        const data = snap.data() as any;
        const siparis = { ...data, docId: id! };
        setR(siparis);

        if (siparis.musteriId) {
          // Veritabanında ID alanı sayı ise Number(), string ise String() kullan. 
          // Senin sistemde muhtemelen number tutuyorsun (sonrakiMusteriId fonksiyonundan dolayı)
          const q = query(collection(veritabani, "musteriler"), where("id", "==", Number(siparis.musteriId)));
          const mSnap = await getDocs(q);
          if (!mSnap.empty) {
            setGuncelMusteri(mSnap.docs[0].data());
          } else {
            setGuncelMusteri(siparis.musteri); // Bulamazsa eskisi kalsın
          }
        } else {
          setGuncelMusteri(siparis.musteri); // ID yoksa (manuel müşteri) eskisi kalsın
        }

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

  // GÜNCELLENDİ: onayla() fonksiyonu artık kullanılmadığı için silindi.
  // async function onayla() { ... }

  // ... (reddet, tamamla, pdfOlustur, handleGeriCek fonksiyonları aynı kalıyor)
  async function reddet() {
    if (!r) return;
    setBusy(true);
    try {
      if (r.durum === "sevkiyat") {
        const iadeYapildi = await reddetVeIade(r.docId);
        alert(iadeYapildi ? "Sipariş reddedildi ve stok iade edildi." : "Sipariş reddedildi.");
      } else {
        await guncelleDurum(r.docId, "reddedildi", { islemeTarihiniAyarla: true });
      }
      nav("/siparisler");
    } finally {
      setBusy(false);
    }
  }

  async function tamamla() {
    if (!r) return;
    setBusy(true);
    try {
      await guncelleDurum(r.docId, "tamamlandi", { islemeTarihiniAyarla: true });
      nav("/siparisler");
    } finally {
      setBusy(false);
    }
  }

  async function pdfOlustur() {
    if (!r) return;
    try {
      setPdfBusy(true);
      await siparisPdfYazdirWeb(r);
    } catch (e) {
      console.error(e);
      alert("PDF oluşturulamadı.");
    } finally {
      setPdfBusy(false);
    }
  }
  async function handleGeriCek() {
    if (!r) return;
    const onay = window.confirm(
      "Bu siparişi sevkiyattan geri çekmek istediğinizden emin misiniz?\n\nÜrünler stoğa geri eklenecek ve sipariş 'Beklemede' durumuna alınacaktır."
    );
    if (!onay) return;

    setBusy(true);
    try {
      const ok = await sevkiyattanGeriCek(r.docId);
      if (ok) {
        alert("Sipariş başarıyla geri çekildi ve stoklar iade edildi.");
        window.location.reload();
      } else {
        alert("İşlem sırasında bir hata oluştu.");
      }
    } catch (error) {
      console.error("Geri çekme hatası:", error);
      alert("İşlem sırasında bir hata oluştu.");
    } finally {
      setBusy(false);
    }
  }

  if (yuk) return <div className="card">Yükleniyor…</div>;
  if (!r) return <div className="card">Bulunamadı.</div>;

  const net = Number(r.netTutar || 0),
    kdv = Number(r.kdvTutar || 0),
    brut = Number(r.brutTutar || 0);

  const isSiparisAktif = r.durum === "beklemede" || r.durum === "uretimde";

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* GÜNCELLENDİ: Başlık ve Butonlar Alanı */}
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

      {/* ... (Sayfanın geri kalanı (Müşteri bilgileri, Ürün listesi) aynı) ... */}
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
              gridTemplateColumns: "1fr 120px 110px 110px", // Sütun genişliği güncellendi (SiparisDetay'da zaten 120px idi)
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
              gridTemplateColumns: "1fr 120px 110px 110px", // Sütun genişliği güncellendi
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
    </div>
  );
}
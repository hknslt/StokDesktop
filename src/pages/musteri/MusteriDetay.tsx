import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { veritabani } from "../../firebase";
import { Link, useNavigate, useParams } from "react-router-dom";

type Musteri = {
  id: number;
  firmaAdi: string;
  yetkili?: string;
  telefon?: string;
  adres?: string;
  guncel: boolean;
  createdAt?: any;
};

type SiparisDurumu = "beklemede" | "uretimde" | "sevkiyat" | "tamamlandi" | "reddedildi";

type SiparisRow = {
  docId: string;
  durum: SiparisDurumu;
  tarih?: any;
  islemeTarihi?: any;
  brutTutar?: number;
};

const DURUM_ETIKET: Record<SiparisDurumu, string> = {
  beklemede: "Beklemede",
  uretimde: "Üretimde",
  sevkiyat: "Sevkiyat",
  tamamlandi: "Tamamlandı",
  reddedildi: "Reddedildi",
};

export default function MusteriDetay() {
  const { docId } = useParams(); 
  const nav = useNavigate();

  const [yuk, setYuk] = useState(true);
  const [durum, setDurum] = useState<string | null>(null);

  const [musteri, setMusteri] = useState<Musteri | null>(null);
  const [siparisler, setSiparisler] = useState<SiparisRow[]>([]);

  // 1) Müşteri dokümanını getir
  useEffect(() => {
    let iptal = false;
    (async () => {
      try {
        if (!docId) return;
        const snap = await getDoc(doc(veritabani, "musteriler", docId));
        if (!snap.exists()) {
          if (!iptal) { setMusteri(null); setDurum("Müşteri bulunamadı."); }
          return;
        }
        const x = snap.data() as any;
        const d: Musteri = {
          id: Number(x.id ?? Number(snap.id)),
          firmaAdi: String(x.firmaAdi ?? ""),
          yetkili: x.yetkili || "",
          telefon: x.telefon || "",
          adres: x.adres || "",
          guncel: Boolean(x.guncel ?? true),
          createdAt: x.createdAt,
        };
        if (!iptal) setMusteri(d);
      } catch (e: any) {
        if (!iptal) setDurum(e?.message || "Müşteri yüklenemedi.");
      } finally {
        if (!iptal) setYuk(false);
      }
    })();
    return () => { iptal = true; };
  }, [docId]);

  // 2) Müşterinin siparişlerini dinle (musteri.id eşleşmesi ile)
  useEffect(() => {
    if (!musteri?.id) { setSiparisler([]); return; }
    const qy = query(
      collection(veritabani, "siparisler"),
      where("musteri.id", "==", String(musteri.id)),
      orderBy("tarih", "desc") 
    );
    return onSnapshot(qy, (snap) => {
      const arr: SiparisRow[] = snap.docs.map(d => {
        const x = d.data() as any;
        return {
          docId: d.id,
          durum: (x.durum || "beklemede") as SiparisDurumu,
          tarih: x.tarih,
          islemeTarihi: x.islemeTarihi,
          brutTutar: Number(x.brutTutar ?? 0),
        };
      });
      setSiparisler(arr);
    }, (err) => {
      console.error("Sipariş dinleme hatası:", err);
      setDurum(err?.message || "Müşteri siparişleri dinlenemedi.");
    });
  }, [musteri?.id]);

  // 3) Özet metrikler
  const toplamSiparis = siparisler.length;
  const toplamBrut = useMemo(
    () => siparisler.reduce((t, s) => t + Number(s.brutTutar || 0), 0),
    [siparisler]
  );

  if (yuk) return <div className="card">Yükleniyor…</div>;
  if (!musteri) return <div className="card">{durum || "Müşteri bulunamadı."}</div>;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Üst bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Müşteri Detayı</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="theme-btn" onClick={() => nav(-1)}>Geri</button>
          <Link to={`/musteri/${docId}/duzenle`}><button>Düzenle</button></Link>
        </div>

      </div>

      {/* Özet & Bilgiler */}
      <div className="card" style={{ display: "grid", gridTemplateColumns: "minmax(260px,1fr) 1fr", gap: 16 }}>
        {/* Sol: Kimlik & iletişim */}
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0 }}>{musteri.firmaAdi}</h3>
            <span
              className="tag"
              style={{
                borderRadius: 999,
                padding: "4px 8px",
                border: "1px solid var(--panel-bdr)",
                background: musteri.guncel
                  ? "color-mix(in oklab, var(--yesil) 18%, transparent)"
                  : "transparent",
                fontSize: 12
              }}
              title={musteri.guncel ? "Aktif" : "Pasif"}
            >
              {musteri.guncel ? "Aktif" : "Pasif"}
            </span>
          </div>

          <div style={{ display: "grid", gap: 6, fontSize: 14 }}>
            <div><b>Yetkili:</b> {musteri.yetkili || "—"}</div>
            <div><b>Telefon:</b> {musteri.telefon || "—"}</div>
            <div><b>Adres:</b> {musteri.adres || "—"}</div>
          </div>
        </div>

        {/* Sağ: Metrikler */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="card" style={{ padding: 12 }}>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Toplam Sipariş</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{toplamSiparis.toLocaleString()}</div>
          </div>
          <div className="card" style={{ padding: 12 }}>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Toplam Brüt</div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>{Number(toplamBrut).toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* Siparişler */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Geçmiş Siparişler</h3>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.4fr 160px 150px 120px 120px",
            gap: 8,
            fontSize: 13,
            color: "var(--muted)",
            marginBottom: 8
          }}
        >
          <div>Müşteri</div>
          <div>Durum</div>
          <div>Tarih</div>
          <div>İşlem Tarihi</div>
          <div>Brüt</div>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          {siparisler.map((s) => (
            <div
              key={s.docId}
              className="row hoverable"
              style={{
                display: "grid",
                gridTemplateColumns: "1.4fr 160px 150px 120px 120px",
                gap: 8,
                alignItems: "center",
                border: "1px solid var(--panel-bdr)",
                borderRadius: 10,
                padding: "8px 10px",
              }}
            >
              <div>
                <Link to={`/siparis/${s.docId}`}><b>{musteri.firmaAdi}</b></Link>
              </div>

              <div>
                <span className={`tag status-${s.durum}`}>{DURUM_ETIKET[s.durum] || s.durum}</span>
              </div>

              <div>{s.tarih?.toDate?.().toLocaleDateString?.() || "-"}</div>
              <div>{s.islemeTarihi?.toDate?.().toLocaleDateString?.() || "-"}</div>
              <div>{Number(s.brutTutar || 0).toLocaleString()}</div>
            </div>
          ))}

          {!siparisler.length && <div>Bu müşteriye ait sipariş bulunamadı.</div>}
        </div>
      </div>

      {durum && <div style={{ opacity: .9 }}>{durum}</div>}
    </div>
  );
}

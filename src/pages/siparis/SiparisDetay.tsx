// src/pages/siparis/SiparisDetay.tsx
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { veritabani } from "../../firebase";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  guncelleDurum,
  sevkiyataGecir,
  SiparisDurumu,
  reddetVeIade,
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
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (!id) return;
      const snap = await getDoc(doc(veritabani, "siparisler", id));
      setR(snap.exists() ? { ...(snap.data() as any), docId: id } : null);
      setYuk(false);
    })();
  }, [id]);

  async function onayla() {
    if (!r) return;
    setBusy(true);
    try {
      const ok = await sevkiyataGecir(r);
      alert(ok ? "Onaylandı • Sevkiyata alındı." : "Stok yetersiz • Üretime yönlendirildi.");
      nav("/siparisler");
    } finally {
      setBusy(false);
    }
  }

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

  if (yuk) return <div className="card">Yükleniyor…</div>;
  if (!r) return <div className="card">Bulunamadı.</div>;

  const net = Number(r.netTutar || 0),
    kdv = Number(r.kdvTutar || 0),
    brut = Number(r.brutTutar || 0);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Sipariş Detayı</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="theme-btn" onClick={() => nav(-1)}>
            Geri
          </button>
          <button onClick={pdfOlustur} disabled={pdfBusy}>
            {pdfBusy ? "PDF…" : "PDF"}
          </button>
          {/* Onayla sadece BEKLEMEDE */}
          {r.durum === "beklemede" && (
            <button disabled={busy} onClick={onayla}>
              {busy ? "…" : "Onayla"}
            </button>
          )}
          {/* Reddet: tamamlandi / reddedildi HARİÇ */}
          {r.durum !== "reddedildi" && r.durum !== "tamamlandi" && (
            <button className="theme-btn" disabled={busy} onClick={reddet}>
              Reddet
            </button>
          )}
          {/* Tamamla sadece SEVKIYAT */}
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
            <b>Müşteri:</b> {r.musteri?.firmaAdi} {r.musteri?.yetkili ? `• ${r.musteri?.yetkili}` : ""}
          </div>
          <div>
            <b>Tel:</b> {r.musteri?.telefon || "-"}
          </div>
          <div>
            <b>Adres:</b> {r.musteri?.adres || "-"}
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
              gridTemplateColumns: "1fr 90px 110px 110px",
              gap: 8,
              color: "var(--muted)",
              fontSize: 13,
            }}
          >
            <div>Ürün</div>
            <div>Adet</div>
            <div>Net Birim</div>
            <div>Net Satır</div>
          </div>
          {(r.urunler || []).map((s: any, i: number) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 90px 110px 110px",
                gap: 8,
                border: "1px solid var(--panel-bdr)",
                borderRadius: 10,
                padding: "6px 8px",
              }}
            >
              <div>
                <b>{s.urunAdi}</b>
                {s.renk ? <span style={{ opacity: 0.8 }}> • {s.renk}</span> : null}
              </div>
              <div>{s.adet}</div>
              <div>{Number(s.birimFiyat || 0).toLocaleString()}</div>
              <div>{(Number(s.adet || 0) * Number(s.birimFiyat || 0)).toLocaleString()}</div>
            </div>
          ))}
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

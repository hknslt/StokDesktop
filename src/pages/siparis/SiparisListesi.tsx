// src/pages/siparis/SiparisListesi.tsx
import { useEffect, useMemo, useState } from "react";
import {
  hepsiDinle,
  guncelleDurum,
  uretimeOnayla,
  SiparisDurumu,
  stokYeterlilikHaritasi,
  reddetVeIade,
  silSiparis,
} from "../../services/SiparisService";
import { Link, useNavigate } from "react-router-dom";
import { teklifPdfYazdirWeb } from "../../pdf/teklifPdf";
import { collection, onSnapshot } from "firebase/firestore";
import { veritabani } from "../../firebase";

/* ---------- sabitler ---------- */
const DURUMLAR: SiparisDurumu[] = ["beklemede", "uretimde", "sevkiyat", "tamamlandi", "reddedildi"];
const ETIKET: Record<SiparisDurumu, string> = {
  beklemede: "Beklemede", uretimde: "Üretimde", sevkiyat: "Sevkiyat", tamamlandi: "Tamamlandı", reddedildi: "Reddedildi"
};

/* Timestamp | Date | number -> Date */
function toDateOrNull(v: any): Date | null {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate();
  if (v instanceof Date) return v;
  if (typeof v === "number") return new Date(v);
  return null;
}

const fmtTL = (n: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 })
    .format(Number(n || 0));


export default function SiparisListesi() {
  const nav = useNavigate();

  // --- Veri ---
  const [rows, setRows] = useState<any[]>([]);
  const [stokOk, setStokOk] = useState<Map<string, boolean | undefined>>(new Map());

  // Müşteri verilerini "ID" anahtarı ile saklayacağımız harita
  const [musteriMap, setMusteriMap] = useState<Record<string, any>>({});

  // --- Filtreler ---
  const [ara, setAra] = useState("");
  const [seciliDurumlar, setSeciliDurumlar] = useState<Set<SiparisDurumu>>(
    () => new Set(["beklemede", "uretimde", "sevkiyat"])
  );
  const [dateField, setDateField] = useState<"tarih" | "islemeTarihi">("islemeTarihi");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  /* 1. CANLI SİPARİŞ DİNLEME */
  useEffect(() => hepsiDinle(async (r) => {
    setRows(r);
    setStokOk(await stokYeterlilikHaritasi(r));
  }), []);

  /* 2. CANLI MÜŞTERİ DİNLEME */
  useEffect(() => {
    const qy = collection(veritabani, "musteriler");
    const unsub = onSnapshot(qy, (snap) => {
      const harita: Record<string, any> = {};
      snap.docs.forEach((d) => {
        const data = d.data();

        // EŞLEŞTİRME MANTIĞI:
        // Veritabanında 'idNum' (sayı) veya 'id' (string) olabilir.
        // Garanti olsun diye her ikisini de string anahtar olarak ekliyoruz.
        if (data.idNum !== undefined) {
          harita[String(data.idNum)] = data;
        }
        if (data.id) {
          harita[String(data.id)] = data;
        }
      });
      setMusteriMap(harita);
    });
    return () => unsub();
  }, []);

  /* ---- Filtreleme + Sıralama + Arama ---- */
  const { liste, toplamBrut } = useMemo(() => {
    const hasStatusFilter = seciliDurumlar.size > 0;

    // 1. Durum filtresi
    let base = rows.filter((x) => !hasStatusFilter || seciliDurumlar.has(x.durum));

    // 2. Tarih filtresi
    const start = from ? new Date(from + "T00:00:00") : null;
    const end = to ? new Date(to + "T23:59:59.999") : null;
    if (start || end) {
      base = base.filter((x) => {
        const d = toDateOrNull(x[dateField]);
        if (!d) return false;
        if (start && d < start) return false;
        if (end && d > end) return false;
        return true;
      });
    }

    // 3. Arama (GÜNCEL İSİM ÜZERİNDEN)
    const q = ara.trim().toLowerCase();
    if (q) {
      base = base.filter((x) => {
        const idKey = String(x.musteri?.id || "");
        const guncelMusteri = musteriMap[idKey] || x.musteri || {};

        const hedef = [
          guncelMusteri.firmaAdi,
          guncelMusteri.yetkili,
          guncelMusteri.telefon,
          guncelMusteri.adres,
          ...(x.urunler?.map((u: any) => u.urunAdi) || [])
        ].filter(Boolean).map((s: string) => s.toLowerCase());

        return hedef.some((s: string) => s.includes(q));
      });
    }

    // 4. Sıralama
    const sirali = [...base].sort((a, b) => {
      const da = toDateOrNull(a[dateField])?.getTime() ?? 0;
      const db = toDateOrNull(b[dateField])?.getTime() ?? 0;
      return db - da;
    });

    const toplam = sirali.reduce((t, r) => t + Number(r.brutTutar ?? 0), 0);
    return { liste: sirali, toplamBrut: toplam };

  }, [rows, seciliDurumlar, dateField, from, to, ara, musteriMap]);

  /* ---- Aksiyonlar ---- */

  async function uretimOnayi(r: any) {
    setBusy(r.docId);
    try {
      await uretimeOnayla(r.docId);
      alert("Üretim onayı verildi. Sipariş üretimde.");
    } finally { setBusy(null); }
  }

  async function reddet(r: any) {
    const idKey = String(r.musteri?.id || "");
    const rawMusteri = musteriMap[idKey] || r.musteri;
    const musteriAd = rawMusteri?.firmaAdi || rawMusteri?.yetkili || "müşteri";

    const mesaj = r.durum === "sevkiyat"
      ? `“${musteriAd}” siparişini reddetmek üzeresiniz.\n\nBu sipariş sevkiyatta: düşülen stoklar iade edilecek.\n\nOnaylıyor musunuz?`
      : `“${musteriAd}” siparişini reddetmek üzeresiniz.\n\nOnaylıyor musunuz?`;

    if (!window.confirm(mesaj)) return;

    setBusy(r.docId);
    try {
      if (r.durum === "sevkiyat") {
        const iadeYapildi = await reddetVeIade(r.docId);
        alert(iadeYapildi ? "Sipariş reddedildi ve stok iade edildi." : "Sipariş reddedildi.");
      } else {
        await guncelleDurum(r.docId, "reddedildi", { islemeTarihiniAyarla: true });
        alert("Sipariş reddedildi.");
      }
    } finally { setBusy(null); }
  }

  async function tamamla(r: any) {
    setBusy(r.docId);
    try {
      await guncelleDurum(r.docId, "tamamlandi", { islemeTarihiniAyarla: true });
    } finally { setBusy(null); }
  }

  async function silOnayi(r: any) {
    const idKey = String(r.musteri?.id || "");
    const rawMusteri = musteriMap[idKey] || r.musteri;
    const musteriAd = rawMusteri?.firmaAdi || rawMusteri?.yetkili || "-";

    const mesaj = `“${musteriAd}” müşterisine ait bu siparişi kalıcı olarak silmek istediğinizden emin misiniz?\n\nBu işlem geri alınamaz!`;

    if (!window.confirm(mesaj)) return;

    setBusy(r.docId);
    try {
      await silSiparis(r.docId);
    } catch (error) {
      alert("Sipariş silinirken bir hata oluştu. Lütfen tekrar deneyin.");
      console.error(error);
    } finally {
      setBusy(null);
    }
  }

  /* ---- Durum Butonları ---- */
  function toggleDurum(d: SiparisDurumu) {
    setSeciliDurumlar(prev => {
      const next = new Set(prev);
      next.has(d) ? next.delete(d) : next.add(d);
      return next;
    });
  }

  // Buton grupları
  function durumAktif() { setSeciliDurumlar(new Set(["beklemede", "uretimde", "sevkiyat"])); }
  function durumGecmis() { setSeciliDurumlar(new Set(["tamamlandi", "reddedildi"])); }
  function durumHepsi() { setSeciliDurumlar(new Set(DURUMLAR)); }

  function filtreSifirla() {
    setSeciliDurumlar(new Set());
    setDateField("islemeTarihi");
    setFrom(""); setTo(""); setAra("");
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Üst başlık + hızlı özet */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Siparişler</h2>
        <div style={{ fontSize: 13, opacity: .8 }}>
          {liste.length.toLocaleString()} kayıt • Brüt: <b>{fmtTL(toplamBrut)}</b>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <Link to="/siparis/uretim-ihtiyac">
            <button className="theme-btn"
              style={{ background: "var(--yesil)", color: "white" }}>
              Üretim İhtiyaç Listesi
            </button>
          </Link>
          <Link to="/siparis/yeni"><button>+ Yeni Sipariş</button></Link>
        </div>
      </div>

      {/* Filtre barı */}
      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <select className="input" value={dateField} onChange={(e) => setDateField(e.target.value as any)} title="Filtrelenecek tarih alanı">
            <option value="islemeTarihi">İşlem Tarihi</option>
            <option value="tarih">Sipariş Tarihi</option>
          </select>
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span style={{ opacity: .7 }}>—</span>
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          <input className="input" placeholder="Ara (müşteri/ürün…)" value={ara} onChange={(e) => setAra(e.target.value)} style={{ width: 260 }} />

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginLeft: "auto" }}>
            <button className="theme-btn" type="button" onClick={durumAktif} title="Bekleyen, Üretim, Sevkiyat">Aktif Siparişler</button>
            <button className="theme-btn" type="button" onClick={durumGecmis} title="Tamamlandı, Reddedildi">Geçmiş</button>
            <button className="theme-btn" type="button" onClick={durumHepsi}>Tümü</button>
            <button className="theme-btn" type="button" onClick={filtreSifirla}>Sıfırla</button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {DURUMLAR.map((d) => {
            const aktif = seciliDurumlar.has(d);
            const buttonClassName = `filter-chip status-${d} ${aktif ? "aktif" : ""}`;
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleDurum(d)}
                className={buttonClassName.trim()}
                title={ETIKET[d]}
              >
                {ETIKET[d]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Liste */}
      <div className="card">
        <div style={{
          display: "grid", gridTemplateColumns: "24px 1.4fr 140px 150px 150px 120px 1fr",
          gap: 8, fontSize: 13, color: "var(--muted)", marginBottom: 8
        }}>
          <div></div><div>Müşteri</div><div>Durum</div><div>Tarih</div><div>İşlem Tarihi</div><div>Brüt</div><div>İşlemler</div>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          {liste.map((r: any) => {

            // --- CANLI VERİ EŞLEŞTİRME ---
            const idKey = String(r.musteri?.id || "");

            // Haritada varsa onu kullan, yoksa siparişin içindeki eski veriyi kullan
            const guncelMusteri = musteriMap[idKey] || r.musteri;

            const musteriAd = guncelMusteri?.firmaAdi || guncelMusteri?.yetkili || "-";
            // -----------------------------

            const stok = stokOk.get(r.docId);
            const kapali = r.durum === "tamamlandi" || r.durum === "reddedildi" || r.durum === "sevkiyat";

            const dotColor = kapali ? "var(--muted)" : (stok === false ? "var(--kirmizi)" : "var(--yesil)");
            const dotOpacity = kapali ? 0.6 : (stok === undefined ? 0.3 : 1);

            const dotTitle =
              r.durum === "tamamlandi" ? "Tamamlandı" :
                r.durum === "reddedildi" ? "Reddedildi" :
                  r.durum === "sevkiyat" ? "Sevkiyatta" :
                    (stok === false ? "Stok yetersiz" : (stok === true ? "Stok uygun" : "Stok kontrol ediliyor..."));

            return (
              <div key={r.docId}
                className="row hoverable"
                style={{
                  display: "grid",
                  gridTemplateColumns: "24px 1.4fr 140px 150px 150px 120px 1fr",
                  gap: 8, alignItems: "center",
                  border: "1px solid var(--panel-bdr)", borderRadius: 10, padding: "8px 10px"
                }}>
                <div title={dotTitle}>
                  <div style={{ width: 10, height: 10, borderRadius: 999, background: dotColor, opacity: dotOpacity }} />
                </div>

                <div style={{ cursor: "pointer" }} onClick={() => nav(`/siparis/${r.docId}`)}>
                  <b>{musteriAd}</b>
                </div>

                <div>
                  <span className={`tag status-${r.durum}`}>{ETIKET[r.durum as SiparisDurumu] ?? r.durum}</span>
                </div>
                <div>{r.tarih?.toDate?.().toLocaleDateString?.() || "-"}</div>
                <div>{r.islemeTarihi?.toDate?.().toLocaleDateString?.() || "-"}</div>
                <div>{fmtTL(Number(r.brutTutar ?? 0))}</div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Link to={`/siparis/${r.docId}`}><button className="theme-btn">Detay</button></Link>
                  <button className="theme-btn" onClick={() => teklifPdfYazdirWeb(r)}>Teklif PDF</button>

                  {r.durum === "beklemede" && (
                    stok === true ? (
                      <Link to={`/siparis/kismi-sevkiyat/${r.docId}`}>
                        <button
                          disabled={busy === r.docId}
                          style={{ background: "var(--yesil)", color: "white" }}
                          title="Siparişi onayla, stokları kontrol et ve kısmi sevkiyat yap"
                        >
                          Sevkiyat Onayı
                        </button>
                      </Link>
                    ) : (
                      <button disabled={busy === r.docId} onClick={() => uretimOnayi(r)}>
                        {busy === r.docId ? "…" : "Üretim Onayı"}
                      </button>
                    )
                  )}

                  {r.durum === "uretimde" && (
                    <Link to={`/siparis/kismi-sevkiyat/${r.docId}`}>
                      <button
                        disabled={busy === r.docId}
                        style={{ background: "var(--yesil)", color: "white" }}
                        title="Stokları kontrol et ve kısmi sevkiyat yap"
                      >
                        Sevkiyat Onayı
                      </button>
                    </Link>
                  )}

                  {r.durum !== "tamamlandi" && r.durum !== "reddedildi" && (
                    <button className="theme-btn" disabled={busy === r.docId} onClick={() => reddet(r)}>Reddet</button>
                  )}
                  {r.durum === "sevkiyat" && (
                    <button disabled={busy === r.docId} onClick={() => tamamla(r)}>Tamamla</button>
                  )}
                  {(r.durum === "tamamlandi" || r.durum === "reddedildi") && (
                    <button
                      className="theme-btn"
                      disabled={busy === r.docId}
                      onClick={() => silOnayi(r)}
                      style={{ background: "var(--kirmizi)", color: "white" }}
                      title="Siparişi kalıcı olarak sil"
                    >
                      {busy === r.docId ? "…" : "Sil"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {!liste.length && <div>Kayıt bulunamadı.</div>}
        </div>
      </div>
    </div>
  );
}
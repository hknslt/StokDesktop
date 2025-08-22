import { useEffect, useMemo, useState } from "react";
import {
  hepsiDinle,
  guncelleDurum,
  sevkiyataGecir,
  SiparisDurumu,
  stokYeterlilikHaritasi,
  reddetVeIade,
} from "../../services/SiparisService";
import { Link, useNavigate } from "react-router-dom";

/* ---------- sabitler ---------- */
const DURUMLAR: SiparisDurumu[] = ["beklemede","uretimde","sevkiyat","tamamlandi","reddedildi"];
const ETIKET: Record<SiparisDurumu,string> = {
  beklemede:"Beklemede", uretimde:"Üretimde", sevkiyat:"Sevkiyat", tamamlandi:"Tamamlandı", reddedildi:"Reddedildi"
};

/* Timestamp | Date | number -> Date */
function toDateOrNull(v: any): Date | null {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate();
  if (v instanceof Date) return v;
  if (typeof v === "number") return new Date(v);
  return null;
}

export default function SiparisListesi() {
  const nav = useNavigate();

  // veri
  const [rows, setRows] = useState<any[]>([]);
  const [stokOk, setStokOk] = useState<Map<string, boolean | undefined>>(new Map());

  // filtreler
  const [ara, setAra] = useState("");
  const [seciliDurumlar, setSeciliDurumlar] = useState<Set<SiparisDurumu>>(
    () => new Set(DURUMLAR) // varsayılan: tüm durumlar açık
  );
  const [dateField, setDateField] = useState<"tarih"|"islemeTarihi">("islemeTarihi");
  const [from, setFrom] = useState(""); // YYYY-MM-DD
  const [to, setTo]     = useState(""); // YYYY-MM-DD

  // buton/basit durum
  const [busy, setBusy] = useState<string|null>(null);

  /* ---- canlı veri ---- */
  useEffect(() => hepsiDinle(async (r) => {
    setRows(r);
    setStokOk(await stokYeterlilikHaritasi(r));
  }), []);

  /* ---- filtre + sıralama + özet ---- */
  const { liste, toplamBrut } = useMemo(() => {
    // 1) durum filtresi
    const hasStatusFilter = seciliDurumlar.size > 0;
    let base = rows.filter((x) => !hasStatusFilter || seciliDurumlar.has(x.durum));

    // 2) tarih filtresi (seçilen alan)
    const start = from ? new Date(from + "T00:00:00") : null;
    const end   = to   ? new Date(to   + "T23:59:59.999") : null;
    if (start || end) {
      base = base.filter((x) => {
        const d = toDateOrNull(x[dateField]);
        if (!d) return false; // aralık seçiliyken alan yoksa gizle
        if (start && d < start) return false;
        if (end && d > end) return false;
        return true;
      });
    }

    // 3) arama (müşteri + ürün adları)
    const q = ara.trim().toLowerCase();
    if (q) {
      base = base.filter((x) => {
        const m = x.musteri ?? {};
        const hedef = [
          m.firmaAdi, m.yetkili, m.telefon, m.adres,
          ...(x.urunler?.map((u:any)=>u.urunAdi)||[])
        ].filter(Boolean).map((s:string)=>s.toLowerCase());
        return hedef.some((s:string)=>s.includes(q));
      });
    }

    // 4) sıralama: seçilen tarih alanına göre yeni → eski
    const sirali = [...base].sort((a,b) => {
      const da = toDateOrNull(a[dateField])?.getTime() ?? 0;
      const db = toDateOrNull(b[dateField])?.getTime() ?? 0;
      return db - da;
    });

    // 5) brüt toplam
    const toplam = sirali.reduce((t, r) => t + Number(r.brutTutar ?? 0), 0);

    return { liste: sirali, toplamBrut: toplam };
  }, [rows, seciliDurumlar, dateField, from, to, ara]);

  /* ---- aksiyonlar ---- */
  async function onayla(r:any) {
    setBusy(r.docId);
    try {
      const ok = await sevkiyataGecir(r);
      alert(ok ? "Onaylandı • Sevkiyata alındı." : "Stok yetersiz • Üretime yönlendirildi.");
    } finally { setBusy(null); }
  }
  async function reddet(r:any) {
    setBusy(r.docId);
    try {
      if (r.durum === "sevkiyat") {
        const iadeYapildi = await reddetVeIade(r.docId);
        alert(iadeYapildi ? "Sipariş reddedildi ve stok iade edildi." : "Sipariş reddedildi.");
      } else {
        await guncelleDurum(r.docId,"reddedildi",{islemeTarihiniAyarla:true});
      }
    } finally { setBusy(null); }
  }
  async function tamamla(r:any) {
    setBusy(r.docId);
    try { await guncelleDurum(r.docId,"tamamlandi",{islemeTarihiniAyarla:true}); }
    finally { setBusy(null); }
  }

  /* ---- durum chipleri ---- */
  function toggleDurum(d: SiparisDurumu) {
    setSeciliDurumlar(prev => {
      const next = new Set(prev);
      next.has(d) ? next.delete(d) : next.add(d);
      return next;
    });
  }
  function durumHepsi()   { setSeciliDurumlar(new Set(DURUMLAR)); }
  function durumGecmis()  { setSeciliDurumlar(new Set(["tamamlandi","reddedildi"])); }
  function durumYok()     { setSeciliDurumlar(new Set()); }
  function filtreSifirla() {
    setSeciliDurumlar(new Set(DURUMLAR));
    setDateField("islemeTarihi");
    setFrom(""); setTo(""); setAra("");
  }

  return (
    <div style={{ display:"grid", gap:16 }}>
      {/* Üst başlık + hızlı özet */}
      <div style={{ display:"flex", gap:12, alignItems:"center", flexWrap:"wrap" }}>
        <h2 style={{ margin:0 }}>Siparişler</h2>
        <div style={{ fontSize:13, opacity:.8 }}>
          {liste.length.toLocaleString()} kayıt • Brüt: <b>{toplamBrut.toLocaleString()}</b>
        </div>
        <div style={{ marginLeft:"auto" }}>
          <Link to="/siparis/yeni"><button>+ Yeni Sipariş</button></Link>
        </div>
      </div>

      {/* Filtre barı */}
      <div className="card" style={{ display:"grid", gap:10 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
          {/* Tarih alanı seçimi */}
          <select className="input" value={dateField} onChange={(e)=>setDateField(e.target.value as any)} title="Filtrelenecek tarih alanı">
            <option value="islemeTarihi">İşlem Tarihi</option>
            <option value="tarih">Sipariş Tarihi</option>
          </select>

          {/* 2 tarih arası */}
          <input className="input" type="date" value={from} onChange={(e)=>setFrom(e.target.value)} />
          <span style={{ opacity:.7 }}>—</span>
          <input className="input" type="date" value={to} onChange={(e)=>setTo(e.target.value)} />

          {/* Arama */}
          <input className="input" placeholder="Ara (müşteri/ürün…)" value={ara} onChange={(e)=>setAra(e.target.value)} style={{ width:260 }} />

          {/* Hızlı butonlar */}
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginLeft:"auto" }}>
            <button className="theme-btn" type="button" onClick={durumGecmis} title="Sadece tamamlandı+reddedildi">Tam./Red.</button>
            <button className="theme-btn" type="button" onClick={durumHepsi}>Tümü</button>
            <button className="theme-btn" type="button" onClick={durumYok} title="Durum filtresi kapalı">Durum Yok</button>
            <button className="theme-btn" type="button" onClick={filtreSifirla}>Sıfırla</button>
          </div>
        </div>

        {/* Durum chipleri */}
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {DURUMLAR.map((d) => {
            const aktif = seciliDurumlar.has(d);
            return (
              <button
                key={d}
                type="button"
                onClick={()=>toggleDurum(d)}
                className="tag"
                style={{
                  borderRadius:999,
                  padding:"6px 10px",
                  border:"1px solid var(--panel-bdr)",
                  background: aktif ? "color-mix(in oklab, var(--ana) 12%, transparent)" : "transparent",
                  cursor:"pointer"
                }}
                title={ETIKET[d]}
              >
                <span className={`tag status-${d}`}>{ETIKET[d]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Liste */}
      <div className="card">
        <div style={{
          display:"grid", gridTemplateColumns:"24px 1.4fr 140px 150px 150px 120px 240px",
          gap:8, fontSize:13, color:"var(--muted)", marginBottom:8
        }}>
          <div></div><div>Müşteri</div><div>Durum</div><div>Tarih</div><div>İşlem Tarihi</div><div>Brüt</div><div>İşlemler</div>
        </div>

        <div style={{ display:"grid", gap:8 }}>
          {liste.map((r:any)=> {
            const stok = stokOk.get(r.docId);
            const musteriAd = r.musteri?.firmaAdi || r.musteri?.yetkili || "-";

            // Tamamlandı / Reddedildi: stok noktası gri
            const kapali = r.durum === "tamamlandi" || r.durum === "reddedildi";
            const dotColor = kapali ? "var(--muted)" : (stok === false ? "var(--kirmizi)" : "var(--yesil)");
            const dotOpacity = kapali ? 0.6 : (stok === undefined ? 0.3 : 1);
            const dotTitle = kapali ? (r.durum === "tamamlandi" ? "Tamamlandı" : "Reddedildi")
                                    : (stok === false ? "Stok yetersiz" : "Stok uygun");

            return (
              <div key={r.docId}
                   className="row hoverable"
                   style={{
                     display:"grid",
                     gridTemplateColumns:"24px 1.4fr 140px 150px 150px 120px 240px",
                     gap:8, alignItems:"center",
                     border:"1px solid var(--panel-bdr)", borderRadius:10, padding:"8px 10px"
                   }}>
                <div title={dotTitle}>
                  <div style={{ width:10, height:10, borderRadius:999, background:dotColor, opacity:dotOpacity }}/>
                </div>

                <div style={{ cursor:"pointer" }} onClick={()=>nav(`/siparis/${r.docId}`)}>
                  <b>{musteriAd}</b>
                </div>

                <div>
                  <span className={`tag status-${r.durum}`}>{ETIKET[r.durum as SiparisDurumu] ?? r.durum}</span>
                </div>

                <div>{r.tarih?.toDate?.().toLocaleDateString?.() || "-"}</div>
                <div>{r.islemeTarihi?.toDate?.().toLocaleDateString?.() || "-"}</div>
                <div>{Number(r.brutTutar ?? 0).toLocaleString()}</div>

                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  <Link to={`/siparis/${r.docId}`}><button className="theme-btn">Detay</button></Link>

                  {/* Onayla sadece BEKLEMEDE */}
                  {r.durum==="beklemede" && (
                    <button disabled={busy===r.docId} onClick={()=>onayla(r)}>
                      {busy===r.docId?"…":"Onayla"}
                    </button>
                  )}

                  {/* Reddet: tamamlandi / reddedildi HARİÇ */}
                  {r.durum!=="tamamlandi" && r.durum!=="reddedildi" && (
                    <button className="theme-btn" disabled={busy===r.docId} onClick={()=>reddet(r)}>Reddet</button>
                  )}

                  {/* Tamamla sadece SEVKIYAT */}
                  {r.durum==="sevkiyat" && (
                    <button disabled={busy===r.docId} onClick={()=>tamamla(r)}>Tamamla</button>
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

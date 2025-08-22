// src/pages/siparis/SiparisListesi.tsx
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

const DURUMLAR: SiparisDurumu[] = ["beklemede","uretimde","sevkiyat","tamamlandi","reddedildi"];
const ETIKET: Record<SiparisDurumu,string> = {
  beklemede:"Beklemede", uretimde:"Üretimde", sevkiyat:"Sevkiyat", tamamlandi:"Tamamlandı", reddedildi:"Reddedildi"
};

export default function SiparisListesi() {
  const nav = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  const [ara, setAra] = useState("");
  const [durumF, setDurumF] = useState<""|SiparisDurumu>("");
  const [busy, setBusy] = useState<string|null>(null);
  const [stokOk, setStokOk] = useState<Map<string, boolean | undefined>>(new Map());

  useEffect(() => hepsiDinle(async (r) => {
    setRows(r);
    setStokOk(await stokYeterlilikHaritasi(r));
  }), []);

  const filtreli = useMemo(() => {
    let list = rows;
    if (durumF) list = list.filter((x:any) => x.durum===durumF);
    const q = ara.trim().toLowerCase();
    if (!q) return list;
    return list.filter((x:any) => {
      const m = x.musteri ?? {};
      const hedef = [
        m.firmaAdi, m.yetkili, m.telefon, m.adres,
        ...(x.urunler?.map((u:any)=>u.urunAdi)||[])
      ].filter(Boolean).map((s:string)=>s.toLowerCase());
      return hedef.some((s:string)=>s.includes(q));
    });
  }, [rows, durumF, ara]);

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

  return (
    <div style={{ display:"grid", gap:16 }}>
      <div style={{ display:"flex", gap:12, alignItems:"center", flexWrap:"wrap" }}>
        <h2 style={{ margin:0 }}>Siparişler</h2>
        <select className="input" value={durumF} onChange={e=>setDurumF(e.target.value as any)}>
          <option value="">Tümü</option>
          {DURUMLAR.map(d=><option key={d} value={d}>{ETIKET[d]}</option>)}
        </select>
        <input className="input" placeholder="Ara (müşteri/ürün…)" value={ara} onChange={e=>setAra(e.target.value)} style={{maxWidth:320}}/>
        <div style={{ marginLeft:"auto" }}>
          <Link to="/siparis/yeni"><button>+ Yeni Sipariş</button></Link>
        </div>
      </div>

      <div className="card">
        <div style={{
          display:"grid", gridTemplateColumns:"24px 1.4fr 140px 150px 150px 120px 240px",
          gap:8, fontSize:13, color:"var(--muted)", marginBottom:8
        }}>
          <div></div><div>Müşteri</div><div>Durum</div><div>Tarih</div><div>İşlem Tarihi</div><div>Brüt</div><div>İşlemler</div>
        </div>

        <div style={{ display:"grid", gap:8 }}>
          {filtreli.map((r:any)=> {
            const stok = stokOk.get(r.docId);
            const musteriAd = r.musteri?.firmaAdi || r.musteri?.yetkili || "-";

            // ✅ Tamamlandı/Red olduysa gri göster — stok bilgisi artık anlamlı değil
            const kapali = r.durum === "tamamlandi" || r.durum === "reddedildi";
            const dotColor = kapali
              ? "var(--muted)"
              : (stok === false ? "var(--kirmizi)" : "var(--yesil)");
            const dotOpacity = kapali ? 0.6 : (stok === undefined ? 0.3 : 1);
            const dotTitle = kapali
              ? (r.durum === "tamamlandi" ? "Tamamlandı" : "Reddedildi")
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
                  <div style={{
                    width:10,height:10,borderRadius:999,
                    background: dotColor,
                    opacity: dotOpacity
                  }}/>
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

                  {/* Reddet: tamamlandi / reddedildi HARİÇ her zaman */}
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
          {!filtreli.length && <div>Liste boş.</div>}
        </div>
      </div>
    </div>
  );
}

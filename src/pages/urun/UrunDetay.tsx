import { useEffect, useState } from "react";
import { veritabani } from "../../firebase";
import { Link, useNavigate, useParams } from "react-router-dom";
import { collection, query, where, getDocs } from "firebase/firestore";

type Urun = {
  id: number;
  urunAdi: string;
  urunKodu: string;
  adet: number;
  renk?: string;
  aciklama?: string;
  kapakResimYolu?: string | null;
  resimYollari?: string[];
  createdAt?: any;
};

export default function UrunDetay() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<Urun | null>(null);
  const [yuk, setYuk] = useState(true);

  useEffect(() => {
    let iptal = false;
    (async () => {
      try {
        if (!id) return;
        // docId'yi çekmek için sorgu yap.
        // Bu yöntem daha doğru.
        const q = query(collection(veritabani, "urunler"), where("id", "==", Number(id)));
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
          setData(null);
          setYuk(false);
          return;
        }

        const snap = querySnapshot.docs[0];
        const x = snap.data() as any;
        const d: Urun = {
          id: Number(x.id ?? Number(snap.id)),
          // Diğer alanlar aynı kalır...
          urunAdi: String(x.urunAdi ?? ""),
          urunKodu: String(x.urunKodu ?? ""),
          adet: Number(x.adet ?? 0),
          renk: x.renk ?? undefined,
          aciklama: x.aciklama ?? undefined,
          kapakResimYolu: x.kapakResimYolu ?? undefined,
          resimYollari: Array.isArray(x.resimYollari) ? x.resimYollari : undefined,
          createdAt: x.createdAt,
        };
        if (!iptal) setData(d);
      } finally {
        if (!iptal) setYuk(false);
      }
    })();
    return () => { iptal = true; };
  }, [id]);

  function geri() {
    // Electron/Vite içinde bazen history yok; güvenli fallback:
    if (window.history.length > 2) navigate(-1);
    else navigate("/stok", { replace: true });
  }

  if (yuk) return <div className="card">Yükleniyor…</div>;
  if (!data) return <div className="card">Ürün bulunamadı.</div>;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Ürün Detayı</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="theme-btn" onClick={geri}>Geri</button>
          <Link to={`/urun/${data.id}/duzenle`}><button>Düzenle</button></Link>
        </div>
      </div>

      <div className="card" style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16 }}>
        <div>
          {data.kapakResimYolu ? (
            <img src={data.kapakResimYolu} alt="" style={{ width: "100%", height: 220, objectFit: "cover", borderRadius: 12 }} />
          ) : (
            <div style={{
              width: "100%", height: 220, borderRadius: 12, display: "grid", placeItems: "center",
              border: "1px dashed var(--panel-bdr)", opacity: .7
            }}>Kapak Yok</div>
          )}
          {data.resimYollari?.length ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              {data.resimYollari.map((u, i) => (
                <img key={i} src={u} alt="" style={{ width: 96, height: 72, objectFit: "cover", borderRadius: 8 }} />
              ))}
            </div>
          ) : null}
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <div><b>Kod:</b> {data.urunKodu}</div>
          <div><b>Ad:</b> {data.urunAdi}</div>
          <div><b>Renk:</b> {data.renk || "-"}</div>
          <div><b>Adet:</b> {data.adet}</div>
          <div><b>Açıklama:</b><br />{data.aciklama || "-"}</div>
        </div>
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { collection, doc, getDocs, limit, orderBy, query, serverTimestamp, setDoc } from "firebase/firestore";
import { veritabani } from "../../firebase";
import { useNavigate, Link } from "react-router-dom";

function pad6(n: number) {
  return String(n).padStart(6, "0");
}

export default function MusteriOlustur() {
  const nav = useNavigate();

  const [firmaAdi, setFirmaAdi] = useState("");
  const [yetkili, setYetkili] = useState("");
  const [telefon, setTelefon] = useState("");
  const [adres, setAdres] = useState("");
  const [guncel, setGuncel] = useState(true);

  const [yuk, setYuk] = useState(false);
  const [durum, setDurum] = useState<string | null>(null);

  const disabled = useMemo(() => yuk || !firmaAdi.trim(), [yuk, firmaAdi]);

  async function getNextId(): Promise<{ idNum: number; idStr: string }> {
    const qy = query(collection(veritabani, "musteriler"), orderBy("idNum", "desc"), limit(1));
    const snap = await getDocs(qy);
    const lastNum = snap.empty ? 0 : Number((snap.docs[0].data() as any).idNum || 0);
    const next = (isNaN(lastNum) ? 0 : lastNum) + 1;
    return { idNum: next, idStr: pad6(next) };
  }

  async function kaydet() {
    if (disabled) return;
    try {
      setYuk(true);
      setDurum(null);

      const { idNum, idStr } = await getNextId();
      const docId = idStr;

      await setDoc(doc(veritabani, "musteriler", docId), {
        id: idStr,
        idNum,
        firmaAdi: firmaAdi.trim(),
        yetkili: yetkili.trim() || null,
        telefon: telefon.trim() || null, 
        adres: adres.trim() || null,
        guncel: !!guncel,
        createdAt: serverTimestamp(),
      });

      nav("/musteriler");
    } catch (e: any) {
      setDurum(e?.message || "Kaydedilemedi.");
    } finally {
      setYuk(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Yeni Müşteri</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <Link to="/musteriler"><button className="theme-btn">İptal</button></Link>
          <button onClick={kaydet} disabled={disabled}>{yuk ? "Kaydediliyor…" : "Kaydet"}</button>
        </div>
      </div>

      {durum && <div className="card" style={{ borderColor: "var(--kirmizi)" }}>{durum}</div>}

      <div className="card" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <input className="input" placeholder="Firma Adı *" value={firmaAdi} onChange={e => setFirmaAdi(e.target.value)} />
        <input className="input" placeholder="Yetkili" value={yetkili} onChange={e => setYetkili(e.target.value)} />
        <input className="input" placeholder="Telefon" value={telefon} onChange={e => setTelefon(e.target.value)} />
        <input className="input" placeholder="Adres" value={adres} onChange={e => setAdres(e.target.value)} />
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={guncel} onChange={e => setGuncel(e.target.checked)} />
          Aktif
        </label>
      </div>
    </div>
  );
}

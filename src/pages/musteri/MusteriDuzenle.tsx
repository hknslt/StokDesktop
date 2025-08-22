import { useEffect, useState } from "react";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { useNavigate, useParams, Link } from "react-router-dom";
import { veritabani } from "../../firebase";

type Form = {
  firmaAdi: string;
  yetkili?: string;
  telefon?: string;
  adres?: string;
  guncel: boolean;
};

export default function MusteriDuzenle() {
  const { docId } = useParams();
  const nav = useNavigate();

  const [yuk, setYuk] = useState(true);
  const [kaydetYuk, setKaydetYuk] = useState(false);
  const [durum, setDurum] = useState<string | null>(null);
  const [form, setForm] = useState<Form>({
    firmaAdi: "",
    yetkili: "",
    telefon: "",
    adres: "",
    guncel: true,
  });

  useEffect(() => {
    let iptal = false;
    (async () => {
      try {
        if (!docId) return;
        const snap = await getDoc(doc(veritabani, "musteriler", docId));
        if (!snap.exists()) {
          if (!iptal) setDurum("Müşteri bulunamadı.");
          return;
        }
        const x = snap.data() as any;
        if (!iptal) {
          setForm({
            firmaAdi: String(x.firmaAdi ?? ""),
            yetkili: x.yetkili || "",
            telefon: x.telefon || "",
            adres: x.adres || "",
            guncel: Boolean(x.guncel ?? true),
          });
        }
      } catch (e: any) {
        if (!iptal) setDurum(e?.message || "Müşteri yüklenemedi.");
      } finally {
        if (!iptal) setYuk(false);
      }
    })();
    return () => { iptal = true; };
  }, [docId]);

  async function kaydet() {
    if (!docId) return;
    if (!form.firmaAdi.trim()) { setDurum("Firma adı zorunludur."); return; }
    try {
      setKaydetYuk(true);
      setDurum(null);
      await updateDoc(doc(veritabani, "musteriler", docId), {
        firmaAdi: form.firmaAdi.trim(),
        yetkili: form.yetkili?.trim() || null,
        telefon: form.telefon?.trim() || null,
        adres: form.adres?.trim() || null,
        guncel: !!form.guncel,
        updatedAt: serverTimestamp(),
      });
      setDurum("Müşteri güncellendi.");
      nav(`/musteri/${docId}`);
    } catch (e: any) {
      setDurum(
        e?.code === "permission-denied"
          ? "Yetki yok: Bu işlemi sadece admin/pazarlamacı yapabilir."
          : (e?.message || "Güncellenemedi.")
      );
    } finally {
      setKaydetYuk(false);
    }
  }

  if (yuk) return <div className="card">Yükleniyor…</div>;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Müşteri Düzenle</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <Link to={`/musteri/${docId}`}><button className="theme-btn">İptal</button></Link>
          <button onClick={kaydet} disabled={kaydetYuk || !form.firmaAdi.trim()}>
            {kaydetYuk ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>
      </div>

      <div className="card" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <input
          className="input"
          placeholder="Firma Adı *"
          value={form.firmaAdi}
          onChange={(e) => setForm({ ...form, firmaAdi: e.target.value })}
        />
        <input
          className="input"
          placeholder="Yetkili"
          value={form.yetkili || ""}
          onChange={(e) => setForm({ ...form, yetkili: e.target.value })}
        />
        <input
          className="input"
          placeholder="Telefon"
          value={form.telefon || ""}
          onChange={(e) => setForm({ ...form, telefon: e.target.value })}
        />
        <input
          className="input"
          placeholder="Adres"
          value={form.adres || ""}
          onChange={(e) => setForm({ ...form, adres: e.target.value })}
        />

        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
          <input
            type="checkbox"
            checked={!!form.guncel}
            onChange={(e) => setForm({ ...form, guncel: e.target.checked })}
          />
          <span>Aktif</span>
        </label>
      </div>

      {durum && <div className="card" style={{ borderColor: "var(--panel-bdr)" }}>{durum}</div>}
    </div>
  );
}

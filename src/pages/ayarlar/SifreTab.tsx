import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { sendPasswordResetEmail } from "firebase/auth";
import { veritabani, yetki } from "../../firebase";

type UserDoc = { firstName?: string; lastName?: string };

export default function SifreTab() {
  const u = yetki.currentUser;
  const [adSoyad, setAdSoyad] = useState("");

  const [yuk, setYuk] = useState(false);
  const [durum, setDurum] = useState<string | null>(null);

  useEffect(() => {
    if (!u?.uid) return;
    const off = onSnapshot(doc(veritabani, "users", u.uid), (snap) => {
      const d = (snap.exists() ? (snap.data() as UserDoc) : {}) || {};
      const ad = d.firstName?.trim() || "";
      const soy = d.lastName?.trim() || "";
      const full = [ad, soy].filter(Boolean).join(" ");
      setAdSoyad(full || "Kullanıcı");
    });
    return () => off();
  }, [u?.uid]);

  async function sifreSifirla() {
    if (!u?.email) { setDurum("Hesapta e-posta bulunamadı."); return; }
    try {
      setYuk(true);
      setDurum(null);
      await sendPasswordResetEmail(yetki, u.email);
      setDurum(`Şifre sıfırlama bağlantısı ${u.email} adresine gönderildi.`);
    } catch (e: any) {
      setDurum(e?.message || "Şifre sıfırlama e-postası gönderilemedi.");
    } finally {
      setYuk(false);
    }
  }

  if (!u) return <div className="card">Giriş yapılmadı.</div>;

  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 520 }}>
      <div className="input" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 12, opacity: .8 }}>Hesap</div>
          <div style={{ fontWeight: 700 }}>{adSoyad}</div>
          <div style={{ fontSize: 12, opacity: .8 }}>{u.email || "—"}</div>
        </div>
        <div className="tag">Firebase Auth</div>
      </div>

      <div style={{ fontSize: 13, opacity: .9 }}>
        Şifreni sıfırlamak için kayıtlı e-posta adresine bir bağlantı göndereceğiz.
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={sifreSifirla} disabled={yuk || !u.email}>
          {yuk ? "Gönderiliyor…" : "Sıfırlama E-postasını Gönder"}
        </button>
      </div>

      {durum && <div style={{ opacity: .9 }}>{durum}</div>}
    </div>
  );
}

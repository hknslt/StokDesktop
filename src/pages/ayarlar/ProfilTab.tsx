import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { veritabani, yetki } from "../../firebase";

type UserDoc = {
  firstName?: string;
  lastName?: string;
  username?: string;
  email?: string;
};

export default function ProfilTab() {
  const u = yetki.currentUser;

  const [userDoc, setUserDoc] = useState<UserDoc | null>(null);
  const [yuk, setYuk] = useState(true);
  const [kaydetYuk, setKaydetYuk] = useState(false);
  const [durum, setDurum] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");

  useEffect(() => {
    if (!u?.uid) return;
    setYuk(true);
    const off = onSnapshot(doc(veritabani, "users", u.uid), (snap) => {
      const d = (snap.exists() ? (snap.data() as UserDoc) : {}) || {};
      setUserDoc(d);
      setFirstName(d.firstName || "");
      setLastName(d.lastName || "");
      setUsername(d.username || "");
      setYuk(false);
    });
    return () => off();
  }, [u?.uid]);

  async function profilKaydet() {
    if (!u?.uid) return;
    try {
      setKaydetYuk(true);
      setDurum(null);
      await setDoc(
        doc(veritabani, "users", u.uid),
        {
          firstName: firstName.trim() || null,
          lastName: lastName.trim() || null,
          username: username.trim() || null,
        },
        { merge: true }
      );
      setDurum("Profil bilgileri güncellendi.");
    } catch (e: any) {
      setDurum(e?.message || "Profil güncellenemedi.");
    } finally {
      setKaydetYuk(false);
    }
  }

  if (!u) return <div className="card">Giriş yapılmadı.</div>;
  if (yuk) return <div style={{ padding: 12, color: "var(--muted)" }}>Yükleniyor…</div>;

  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 680 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12 }}>
        <div>
          <label style={{ fontSize: 12, opacity: .8 }}>Ad</label>
          <input className="input" placeholder="Ad" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 12, opacity: .8 }}>Soyad</label>
          <input className="input" placeholder="Soyad" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>
      </div>

      <div>
        <label style={{ fontSize: 12, opacity: .8 }}>Kullanıcı Adı</label>
        <input className="input" placeholder="kullanici_adi" value={username} onChange={(e) => setUsername(e.target.value)} />
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ fontSize: 12, opacity: .8 }}>E-posta</div>
        <div className="input" style={{ opacity: .8 }}>{u.email || "—"}</div>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          className="theme-btn"
          onClick={() => {
            setFirstName(userDoc?.firstName || "");
            setLastName(userDoc?.lastName || "");
            setUsername(userDoc?.username || "");
            setDurum("Değişiklikler geri alındı.");
          }}
        >
          Geri Al
        </button>
        <button onClick={profilKaydet} disabled={kaydetYuk}>
          {kaydetYuk ? "Kaydediliyor…" : "Kaydet"}
        </button>
      </div>

      {durum && <div style={{ opacity: .9 }}>{durum}</div>}
    </div>
  );
}

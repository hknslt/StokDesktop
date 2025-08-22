  // src/sayfalar/KullaniciYonetimi.tsx
  import { useEffect, useMemo, useState } from "react";
  import {
    collection, onSnapshot, orderBy, query,
    doc, setDoc, serverTimestamp, where, getDocs, deleteDoc,
  } from "firebase/firestore";
  import { sendPasswordResetEmail } from "firebase/auth";
  import { getFunctions, httpsCallable } from "firebase/functions";
  import { app, veritabani, yetki } from "../firebase";

  type Rol = "admin" | "pazarlamaci" | "uretim" | "sevkiyat";

  type Kullanici = {
    uid: string;
    email: string;
    firstName?: string;
    lastName?: string;
    username?: string;
    role?: Rol;
    createdAt?: any;
  };

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const usernameRegex = /^[a-zA-Z0-9._-]{3,24}$/;

  // Spark: admin, REST signUp ile kullanıcıyı oluşturur (mevcut oturumu bozmaz)
  async function adminCreateEmailUser(email: string, password: string) {
    const key = import.meta.env.VITE_FIREBASE_API_KEY;
    if (!key) throw new Error("API anahtarı yok (.env VITE_FIREBASE_API_KEY).");
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${key}`,
      { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }) }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || "signUp failed");
    return { uid: data.localId as string };
  }

  // (Opsiyonel) Blaze + Cloud Functions varsa Auth hesabını da silmeye çalışır
  async function tryDeleteAuth(uid: string) {
    try {
      const fn = httpsCallable(getFunctions(app), "adminDeleteUser");
      await fn({ uid });
      return true;
    } catch {
      return false; // functions yoksa veya Blaze değilse sessizce geç
    }
  }

  export default function KullaniciYonetimi({ rol }: { rol: Rol }) {
    const [liste, setListe] = useState<Kullanici[]>([]);
    // Form
    const [mail, setMail] = useState("");
    const [ad, setAd] = useState("");
    const [soyad, setSoyad] = useState("");
    const [kullaniciAdi, setKullaniciAdi] = useState("");
    const [geciciSifre, setGeciciSifre] = useState("");
    const [yeniRol, setYeniRol] = useState<Rol>("pazarlamaci");
    const [resetMailGonder, setResetMailGonder] = useState(true);

    const [yuk, setYuk] = useState(false);
    const [durum, setDurum] = useState<string | null>(null);

    // Liste
    useEffect(() => {
      const q = query(collection(veritabani, "users"), orderBy("createdAt", "desc"));
      return onSnapshot(q, (snap) => {
        setListe(snap.docs.map(d => ({ uid: d.id, ...(d.data() as any) })) as Kullanici[]);
      });
    }, []);

    const formGecerli = useMemo(() => {
      if (rol !== "admin") return false;
      return (
        emailRegex.test(mail.trim()) &&
        usernameRegex.test(kullaniciAdi.trim()) &&
        geciciSifre.length >= 6
      );
    }, [rol, mail, kullaniciAdi, geciciSifre]);

    const ekle = async () => {
      if (rol !== "admin") return setDurum("Sadece admin kullanıcı ekleyebilir.");
      try {
        setYuk(true); setDurum(null);

        // username benzersiz mi?
        const uname = kullaniciAdi.trim();
        const unameLower = uname.toLowerCase();
        const dupe = await getDocs(
          query(collection(veritabani, "users"), where("usernameLower", "==", unameLower))
        );
        if (!usernameRegex.test(uname))
          return setDurum("Kullanıcı adı 3–24, (harf/rakam . _ -) olmalı.");
        if (!dupe.empty) return setDurum("Bu kullanıcı adı zaten alınmış.");

        // 1) Auth'ta oluştur
        const { uid } = await adminCreateEmailUser(mail.trim(), geciciSifre);

        // 2) Firestore users/{uid}
        await setDoc(doc(veritabani, "users", uid), {
          email: mail.trim(),
          firstName: ad.trim(),
          lastName: soyad.trim(),
          username: uname,
          usernameLower: unameLower,
          role: yeniRol,
          createdAt: serverTimestamp(),
        }, { merge: true });

        // 3) (opsiyonel) reset maili
        if (resetMailGonder) {
          try {
            await sendPasswordResetEmail(yetki, mail.trim());
            setDurum("Kullanıcı oluşturuldu. Parola sıfırlama e-postası gönderildi(Spam Kontrolü Yapınız).");
          } catch {
            setDurum("Kullanıcı oluşturuldu. Parola e-postası gönderilemedi; geçici şifreyle giriş yapabilir.");
          }
        } else {
          setDurum("Kullanıcı oluşturuldu.");
        }

        // formu temizle
        setMail(""); setAd(""); setSoyad("");
        setKullaniciAdi(""); setGeciciSifre("");
        setYeniRol("pazarlamaci");
      } catch (e: any) {
        const m = String(e?.message || "");
        if (m.includes("EMAIL_EXISTS")) setDurum("Bu e-posta zaten kayıtlı.");
        else if (m.includes("WEAK_PASSWORD")) setDurum("Şifre en az 6 karakter olmalı.");
        else setDurum(m || "Kullanıcı eklenemedi.");
      } finally { setYuk(false); }
    };

    // Silme: önce Auth'u (varsa function), sonra Firestore belgesini sil
    const sil = async (k: Kullanici) => {
      if (rol !== "admin") return setDurum("Sadece admin silebilir.");
      const onay = window.confirm(`${k.email} kullanıcısını silmek istiyor musun?`);
      if (!onay) return;
      try {
        setDurum(null);
        const authSilindi = await tryDeleteAuth(k.uid); // Blaze yoksa false döner
        await deleteDoc(doc(veritabani, "users", k.uid));
        setDurum(authSilindi
          ? "Kullanıcı tamamen silindi."
          : "Silindi. (Auth hesabı kalmış olabilir; uygulamaya giremez.)");
      } catch (e: any) {
        setDurum(e?.message ?? "Silme başarısız.");
      }
    };

    return (
      <div style={{ display: "grid", gap: 16 }}>
        <h2 style={{ margin: 0 }}>Kullanıcılar</h2>

        {/* Ekleme kartı */}
        <div className="card" style={{ opacity: rol === "admin" ? 1 : .6 }}>
          <h3 style={{ marginTop: 0 }}>
            Yeni Kullanıcı Ekle {rol !== "admin" && <small>(yalnızca admin)</small>}
          </h3>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 12 }}>
            <input className="input" placeholder="E-posta" value={mail} onChange={e=>setMail(e.target.value)} />
            <input className="input" placeholder="Geçici şifre (min 6)" type="password"
                  value={geciciSifre} onChange={e=>setGeciciSifre(e.target.value)} />
            <input className="input" placeholder="Ad" value={ad} onChange={e=>setAd(e.target.value)} />
            <input className="input" placeholder="Soyad" value={soyad} onChange={e=>setSoyad(e.target.value)} />
            <input className="input" placeholder="Kullanıcı adı (ör. mustafa.salt)"
                  value={kullaniciAdi} onChange={e=>setKullaniciAdi(e.target.value)} />
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select className="input" value={yeniRol} onChange={e=>setYeniRol(e.target.value as Rol)}>
                <option value="pazarlamaci">pazarlamaci</option>
                <option value="admin">admin</option>
                <option value="uretim">uretim</option>
                <option value="sevkiyat">sevkiyat</option>
              </select>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--muted)" }}>
                <input
                  type="checkbox"
                  checked={resetMailGonder}
                  onChange={e=>setResetMailGonder(e.target.checked)}
                />
                Parola sıfırlama e-postası gönder
              </label>
              <button onClick={ekle} disabled={!formGecerli || yuk} style={{ minWidth: 120 }}>
                {yuk ? "Ekleniyor…" : "Ekle"}
              </button>
            </div>
          </div>

          {durum && <div style={{ marginTop: 8, opacity: .9 }}>{durum}</div>}
        </div>

        {/* Liste kartı */}
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Mevcut Kullanıcılar</h3>
          <div style={{ display: "grid", gap: 8 }}>
            {liste.map(k => (
              <div key={k.uid}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr 1fr 160px",
                    gap: 8, padding: "8px 10px",
                    border: "1px solid var(--panel-bdr)", borderRadius: 10
                  }}>
                <div><b>{k.firstName} {k.lastName}</b></div>
                <div>{k.email}</div>
                <div>k.adı: <b>{k.username ?? "-"}</b></div>
                <div>rol: <b>{k.role ?? "-"}</b></div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button
                    style={{ background: "transparent", color: "var(--txt)", border: "1px solid var(--panel-bdr)" }}
                    onClick={() => sil(k)}
                    title="Soft delete; Blaze + Functions varsa Auth'tan da siler"
                  >
                    Sil
                  </button>
                </div>
              </div>
            ))}
            {!liste.length && <div>Henüz kullanıcı yok.</div>}
          </div>
        </div>
      </div>
    );
  }

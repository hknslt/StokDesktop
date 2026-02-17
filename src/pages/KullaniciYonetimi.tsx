// src/sayfalar/KullaniciYonetimi.tsx
import { useEffect, useMemo, useState } from "react";
import {
  collection, onSnapshot, orderBy, query,
  doc, setDoc, serverTimestamp, where, getDocs, deleteDoc,
} from "firebase/firestore";
import { sendPasswordResetEmail } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { app, veritabani, yetki } from "../firebase";
import {
  PRIVITY_MAILS,
  PRIVITY_UIDS,
  PRIVITY_USERNAMES
} from "../config/privity.ts";

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

// FUNCTIONS bölgesi (functions/index.ts'taki REGION ile AYNI)
const REGION = "europe-west1";
const functions = getFunctions(app, REGION);
const cfCreateUser = httpsCallable(functions, "adminCreateUser");
const cfDeleteUser = httpsCallable(functions, "adminDeleteUser");

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

  // ==========================================
  // --- ÖZEL MODAL (ALERT/CONFIRM) YAPISI ---
  // ==========================================
  const [modal, setModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    isConfirm: boolean;
    onConfirm?: () => void;
    onClose?: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    isConfirm: false,
  });

  const showAlert = (message: string, title = "Bilgi", onClose?: () => void) => {
    setModal({ isOpen: true, title, message, isConfirm: false, onClose });
  };

  const showConfirm = (message: string, onConfirm: () => void, title = "Onay Gerekli") => {
    setModal({ isOpen: true, title, message, isConfirm: true, onConfirm });
  };

  const closeModal = () => {
    setModal(prev => ({ ...prev, isOpen: false }));
  };
  // ==========================================

  // Liste
  useEffect(() => {
    const q = query(collection(veritabani, "users"), orderBy("createdAt", "desc"));
    return onSnapshot(q, (snap) => {
      const tum = snap.docs.map(d => ({ uid: d.id, ...(d.data() as any) })) as Kullanici[];
      const gorunen = tum.filter(k => {
        const mailStr = (k.email || "").toLowerCase();
        const unameStr = (k.username || "").toLowerCase();
        if (PRIVITY_MAILS.has(mailStr)) return false;
        if (PRIVITY_UIDS.has(k.uid)) return false;
        if (PRIVITY_USERNAMES.has(unameStr)) return false;
        return true;
      });
      setListe(gorunen);
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

  // --- EKLE (callable) ---
  const ekle = async () => {
    if (rol !== "admin") {
      showAlert("Sadece admin kullanıcı ekleyebilir.", "Yetki Hatası");
      return;
    }
    try {
      setYuk(true);

      // username benzersiz mi?
      const uname = kullaniciAdi.trim();
      const unameLower = uname.toLowerCase();

      if (!usernameRegex.test(uname)) {
        showAlert("Kullanıcı adı 3–24 karakter uzunluğunda olmalı ve sadece harf, rakam, nokta, alt çizgi, tire içerebilir.", "Uyarı");
        setYuk(false);
        return;
      }

      const dupe = await getDocs(
        query(collection(veritabani, "users"), where("usernameLower", "==", unameLower))
      );

      if (!dupe.empty) {
        showAlert("Bu kullanıcı adı zaten alınmış.", "Uyarı");
        setYuk(false);
        return;
      }

      // 1) Cloud Function: Auth + claims + users/{uid}
      const res = await cfCreateUser({
        email: mail.trim(),
        password: geciciSifre,
        firstName: ad.trim(),
        lastName: soyad.trim(),
        role: yeniRol,
      } as any);
      const uid = (res.data as any)?.uid as string;

      // 2) username alanlarını merge et
      await setDoc(doc(veritabani, "users", uid), {
        username: uname,
        usernameLower: unameLower,
        createdAt: serverTimestamp(),
      }, { merge: true });

      // 3) Reset mail (opsiyonel)
      if (resetMailGonder) {
        try {
          await sendPasswordResetEmail(yetki, mail.trim());
          showAlert("Kullanıcı oluşturuldu. Parola sıfırlama e-postası gönderildi (Spam klasörünü kontrol edin).", "Başarılı");
        } catch {
          showAlert("Kullanıcı oluşturuldu ancak parola e-postası gönderilemedi; geçici şifreyle giriş yapabilir.", "Bilgi");
        }
      } else {
        showAlert("Kullanıcı başarıyla oluşturuldu.", "Başarılı");
      }

      // formu temizle
      setMail(""); setAd(""); setSoyad("");
      setKullaniciAdi(""); setGeciciSifre("");
      setYeniRol("pazarlamaci");
    } catch (e: any) {
      console.error("[EKLE] hata:", e);
      const m = String(e?.message || e?.code || "");
      if (m.includes("EMAIL_EXISTS")) {
        showAlert("Bu e-posta adresi zaten kayıtlı.", "Hata");
      } else if (m.includes("WEAK_PASSWORD")) {
        showAlert("Şifre en az 6 karakter olmalı.", "Hata");
      } else {
        showAlert(m || "Kullanıcı eklenirken bir hata oluştu.", "Hata");
      }
    } finally {
      setYuk(false);
    }
  };

  // --- SİL (önce Auth callable, sonra Firestore) ---
  const sil = async (k: Kullanici) => {
    if (rol !== "admin") {
      showAlert("Sadece admin kullanıcı silebilir.", "Yetki Hatası");
      return;
    }

    showConfirm(`${k.email} kullanıcısını kalıcı olarak silmek istiyor musunuz?`, async () => {
      setYuk(true);
      try {
        // 1) Auth sil
        try {
          const r = await cfDeleteUser({ uid: k.uid } as any);
          console.log("[SIL][cf] result:", r?.data);
        } catch (e: any) {
          console.error("[SIL][cf] error:", e);
          console.warn(`Auth silme hatası: ${e?.code || e?.message || "cf-failed"}. Firestore yine silinecek.`);
        }

        // 2) Firestore sil
        await deleteDoc(doc(veritabani, "users", k.uid));

        showAlert("Kullanıcı başarıyla silindi.", "Başarılı");
      } catch (e: any) {
        console.error("[SIL] final error:", e);
        showAlert(e?.message ?? "Silme işlemi başarısız oldu.", "Hata");
      } finally {
        setYuk(false);
      }
    }, "Kullanıcı Sil");
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h2 style={{ margin: 0 }}>Kullanıcılar</h2>

      {/* Ekleme kartı */}
      <div className="card" style={{ opacity: rol === "admin" ? 1 : .6 }}>
        <h3 style={{ marginTop: 0 }}>
          Yeni Kullanıcı Ekle {rol !== "admin" && <small>(Yalnızca Admin)</small>}
        </h3>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 12 }}>
          <input className="input" placeholder="E-posta" value={mail} onChange={e => setMail(e.target.value)} disabled={yuk || rol !== "admin"} />
          <input className="input" placeholder="Geçici şifre (min 6)" type="password"
            value={geciciSifre} onChange={e => setGeciciSifre(e.target.value)} disabled={yuk || rol !== "admin"} />
          <input className="input" placeholder="Ad" value={ad} onChange={e => setAd(e.target.value)} disabled={yuk || rol !== "admin"} />
          <input className="input" placeholder="Soyad" value={soyad} onChange={e => setSoyad(e.target.value)} disabled={yuk || rol !== "admin"} />
          <input className="input" placeholder="Kullanıcı adı"
            value={kullaniciAdi} onChange={e => setKullaniciAdi(e.target.value)} disabled={yuk || rol !== "admin"} />

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select className="input" value={yeniRol} onChange={e => setYeniRol(e.target.value as Rol)} disabled={yuk || rol !== "admin"}>
              <option value="pazarlamaci">pazarlamaci</option>
              <option value="admin">admin</option>
              <option value="uretim">uretim</option>
              <option value="sevkiyat">sevkiyat</option>
            </select>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--muted)" }}>
              <input
                type="checkbox"
                checked={resetMailGonder}
                onChange={e => setResetMailGonder(e.target.checked)}
                disabled={yuk || rol !== "admin"}
              />
              Parola sıfırlama e-postası gönder
            </label>
            <button onClick={ekle} disabled={!formGecerli || yuk || rol !== "admin"} style={{ minWidth: 120 }}>
              {yuk ? "İşleniyor…" : "Ekle"}
            </button>
          </div>
        </div>
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
                border: "1px solid var(--panel-bdr)", borderRadius: 10,
                alignItems: "center"
              }}>
              <div><b>{k.firstName} {k.lastName}</b></div>
              <div>{k.email}</div>
              <div>k.adı: <b>{k.username ?? "-"}</b></div>
              <div>rol: <b>{k.role ?? "-"}</b></div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  style={{ background: "transparent", color: "var(--txt)", border: "1px solid var(--panel-bdr)" }}
                  onClick={() => sil(k)}
                  title="Önce Auth, sonra Firestore siler"
                  disabled={yuk || rol !== "admin"}
                >
                  Sil
                </button>
              </div>
            </div>
          ))}
          {!liste.length && <div>Henüz kullanıcı yok.</div>}
        </div>
      </div>

      {/* ========================================== */}
      {/* ÖZEL MODAL UI KISMI                        */}
      {/* ========================================== */}
      {modal.isOpen && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.6)",
          display: "flex", justifyContent: "center", alignItems: "center",
          zIndex: 99999
        }}>
          <div className="card" style={{
            backgroundColor: "white",
            color: "#333",
            width: "90%", maxWidth: 400,
            padding: "24px", borderRadius: "12px",
            boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
            display: "flex", flexDirection: "column", gap: "16px",
            position: "relative"
          }}>
            <h3 style={{ margin: 0, color: "black", fontSize: "18px" }}>{modal.title}</h3>

            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5, fontSize: "14px" }}>
              {modal.message}
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 10 }}>
              {modal.isConfirm && (
                <button
                  className="theme-btn"
                  onClick={closeModal}
                  style={{ background: "#6c757d", color: "white", padding: "8px 16px", border: "none", borderRadius: "6px", cursor: "pointer" }}
                >
                  İptal
                </button>
              )}
              <button
                className="theme-btn"
                onClick={() => {
                  if (modal.isConfirm && modal.onConfirm) {
                    modal.onConfirm();
                  } else if (!modal.isConfirm && modal.onClose) {
                    modal.onClose();
                  }
                  closeModal();
                }}
                style={{
                  background: modal.isConfirm ? "#dc3545" : "#28a745",
                  color: "white",
                  padding: "8px 16px",
                  border: "none",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontWeight: "bold"
                }}
              >
                {modal.isConfirm ? "Onayla" : "Tamam"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
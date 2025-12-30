import { useEffect, useMemo, useRef, useState } from "react";
import {
  signInWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  sendPasswordResetEmail,
} from "firebase/auth";
import { yetki } from "../firebase";
import { useTheme } from "../theme/ThemeProvider";
import logo from "../assets/capri_logo.png";
import "./giris.css";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hataMesaji(e: any): string {
  const code = e?.code || e?.message || "";
  if (typeof code !== "string") return "Giriş başarısız.";
  if (code.includes("auth/invalid-email")) return "E-posta adresi geçersiz.";
  if (code.includes("auth/user-not-found")) return "Böyle bir kullanıcı yok.";
  if (code.includes("auth/wrong-password") || code.includes("auth/invalid-credential"))
    return "E-posta veya şifre hatalı.";
  if (code.includes("auth/too-many-requests")) return "Çok fazla deneme. Biraz bekleyin.";
  if (code.includes("auth/network-request-failed")) return "Ağ hatası. İnternetinizi kontrol edin.";
  return e?.message || "Giriş başarısız.";
}

export default function GirisSayfasi() {
  useEffect(() => {
    document.body.setAttribute("data-view", "login");
    return () => document.body.removeAttribute("data-view");
  }, []);

  const { theme, toggle } = useTheme();

  const [mail, setMail] = useState("");
  const [sifre, setSifre] = useState("");
  const [beniHatirla, setBeniHatirla] = useState(true);
  const [sifreGoster, setSifreGoster] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const sifreRef = useRef<HTMLInputElement>(null);

  const [shake, setShake] = useState(false); 

  useEffect(() => {
    if (hata) {
      setShake(true);
      const t = setTimeout(() => setShake(false), 600);
      return () => clearTimeout(t);
    }
  }, [hata]);

  const disabled = useMemo(
    () => !mail || !sifre || !emailRegex.test(mail) || yukleniyor,
    [mail, sifre, yukleniyor]
  );

  const girisYap = async () => {
    try {
      setYukleniyor(true);
      setHata(null);
      await setPersistence(
        yetki,
        beniHatirla ? browserLocalPersistence : browserSessionPersistence
      );
      await signInWithEmailAndPassword(yetki, mail.trim(), sifre);
    } catch (e: any) {
      setHata(hataMesaji(e));
    } finally {
      setYukleniyor(false);
    }
  };

  const sifremiUnuttum = async () => {
    if (!emailRegex.test(mail)) {
      setHata("Şifre sıfırlama için geçerli bir e-posta yazın.");
      return;
    }
    try {
      setYukleniyor(true);
      setHata(null);
      await sendPasswordResetEmail(yetki, mail.trim());
      setHata("Şifre sıfırlama e-postası gönderilmeye çalışıldı.");
    } catch {
      setHata("E-posta gönderilemedi. Daha sonra tekrar deneyin.");
    } finally {
      setYukleniyor(false);
    }
  };

  const enterIle = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !disabled) girisYap();
  };

  return (
    <div className="giris-kap">
      {/* arka plan canlı bloblar */}
      <div className="bg-dekor" aria-hidden>
        <span className="blob b1" />
        <span className="blob b2" />
        <span className="blob b3" />
        <span className="blob b4" />
      </div>

      <div className={`giris-kart ${shake ? "shake" : ""}`}>
        <div className="kart-ust">
          <button className="theme-btn" onClick={toggle}>
            {theme === "dark" ? "☀️ Açık" : "🌙 Koyu"}
          </button>
        </div>

        <div className="logo-hero parilti">
          <img src={logo} alt="Logo" />
        </div>

        <p className="giris-aciklama" style={{ textAlign: "center", marginTop: 0 }}>
          Hesabınıza giriş yapın
        </p>

        <div className={`girdi-alan ${mail && emailRegex.test(mail) ? "ok" : ""}`}>
          <label>E-posta</label>
          <input
            autoFocus
            type="email"
            placeholder="E-posta Giriniz"
            value={mail}
            onChange={(e) => setMail(e.target.value)}
            onKeyDown={enterIle}
          />
        </div>

        <div className="girdi-alan">
          <label>Şifre</label>
          <div className="sifre-kutu">
            <input
              ref={sifreRef}
              type={sifreGoster ? "text" : "password"}
              placeholder="••••••••"
              value={sifre}
              onChange={(e) => setSifre(e.target.value)}
              onKeyDown={enterIle}
            />
            <button
              className="metin-btn ghost"
              type="button"
              onClick={() => {
                setSifreGoster((v) => !v);
                setTimeout(() => sifreRef.current?.focus(), 0);
              }}
              aria-label="Şifreyi göster/gizle"
            >
              {sifreGoster ? "Gizle" : "Göster"}
            </button>
          </div>
        </div>

        <div className="satir">
          <label className="cek-kutu">
            <input
              type="checkbox"
              checked={beniHatirla}
              onChange={(e) => setBeniHatirla(e.target.checked)}
            />
            <span>Beni hatırla</span>
          </label>

          <button type="button" className="metin-btn linklike" onClick={sifremiUnuttum}>
            Şifremi unuttum
          </button>
        </div>

        {hata && <div className="hata">{hata}</div>}

        <button className="giris-btn ripple" disabled={disabled} onClick={girisYap}>
          {yukleniyor ? (
            <span className="btn-ic">
              <span className="spinner" />
              <span>Giriş yapılıyor…</span>
            </span>
          ) : (
            "Giriş Yap"
          )}
        </button>

        <div className="alt-not">© {new Date().getFullYear()}</div>
      </div>
    </div>
  );
}

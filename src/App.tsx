import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import {
  HashRouter,
  Routes,
  Route,
  Navigate,
  NavLink,
  useLocation,
  useNavigate, // <<< eklendi
} from "react-router-dom";
import { yetki, veritabani } from "./firebase";
import ThemeProvider, { useTheme } from "./theme/ThemeProvider";

import GirisSayfasi from "./pages/GirisSayfasi";
import KullaniciYonetimi from "./pages/KullaniciYonetimi";

import UrunDuzenle from "./pages/urun/UrunDuzenle";
import StokSayfasi from "./pages/urun/StokSayfasi";
import UrunDetay from "./pages/urun/UrunDetay";
import MusteriListesi from "./pages/musteri/MusteriListesi";
import MusteriOlustur from "./pages/musteri/MusteriOlustur";

import SiparisListesi from "./pages/siparis/SiparisListesi";
import SiparisOlustur from "./pages/siparis/SiparisOlustur";
import SiparisDetay from "./pages/siparis/SiparisDetay";

import logo from "./assets/capri_logo.png";
import FiyatListesiSayfasi from "./pages/FiyatListesiSayfasi";
import MusteriDetay from "./pages/musteri/MusteriDetay";
import MusteriDuzenle from "./pages/musteri/MusteriDuzenle";
import StokDuzenle from "./pages/urun/StokDuzenle";
import Analiz from "./pages/analiz/Analiz";
import Loglar from "./pages/logs/Loglar";
import AyarlarSayfasi from "./pages/ayarlar/AyarlarSayfasi";
import SiparisDuzenle from "./pages/siparis/SiparisDuzenle";
import UretimIhtiyacListesi from "./pages/siparis/UretimIhtiyacListesi";
import KismiSevkiyat from "./pages/siparis/KismiSevkiyat";

type Rol = "admin" | "pazarlamaci" | "uretim" | "sevkiyat";
type UserDoc = { email: string; firstName?: string; lastName?: string; role?: Rol };

const ALLOWED: Rol[] = ["admin", "pazarlamaci"];

function Yukleniyor() {
  return (
    <div style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", color: "var(--muted)" }}>
      Yükleniyor…
    </div>
  );
}

function ErisimYok() {
  return (
    <div style={{ padding: 24 }}>
      <h2>Erişim reddedildi</h2>
      <p>Sadece <b>admin</b> ve <b>pazarlamaci</b> kullanabilir.</p>
      <button onClick={() => signOut(yetki)}>Çıkış yap</button>
    </div>
  );
}

/* Sayfa başlığını route’dan türet */
function usePageTitle() {
  const { pathname } = useLocation();
  if (pathname.startsWith("/stok")) return "Stok";
  if (pathname.startsWith("/siparis/yeni")) return "Yeni Sipariş";
  if (pathname.startsWith("/siparis/")) return "Sipariş Detayı";
  if (pathname.startsWith("/siparisler")) return "Siparişler";
  if (pathname.startsWith("/fiyat-listeleri")) return "Fiyat Listeleri";
  if (pathname.startsWith("/musteri/yeni")) return "Yeni Müşteri";
  if (pathname.startsWith("/musteriler")) return "Müşteriler";
  if (pathname.startsWith("/musteri/")) return "Müşteri Detay"
  if (pathname.startsWith("/urun/") && pathname.endsWith("/duzenle")) return "Ürün Düzenle";
  if (pathname.startsWith("/urun/")) return "Ürün Detayı";
  if (pathname.startsWith("/kullanicilar")) return "Kullanıcılar";
  if (pathname.startsWith("/loglar")) return "Loglar"
  if (pathname.startsWith("/ayarlar")) return "Ayarlar"
  return "Panel";
}

function PanelYerlesim(
  { userEmail, adSoyad, role, children }: { userEmail: string; adSoyad: string; role: Rol; children: React.ReactNode }
) {
  const { theme, toggle } = useTheme();
  const pageTitle = usePageTitle();

  // <<< REFRESH için eklendi
  const navigate = useNavigate();
  const location = useLocation();
  const [yenileniyor, setYenileniyor] = useState(false);

  // Soft refresh: route’u yeniden mount ettir (useEffect’ler tekrar çalışır)
  const softRefresh = () => {
    if (yenileniyor) return;
    setYenileniyor(true);
    const { pathname, search, hash } = location;
    const sep = search ? "&" : "?";
    navigate(`${pathname}${search}${sep}_r=${Date.now()}${hash || ""}`, { replace: true });
    setTimeout(() => setYenileniyor(false), 400);
  };

  // Hard refresh: sayfayı tamamen yenile
  const hardRefresh = () => {
    window.location.reload();
  };
  // >>>>

  useEffect(() => {
    document.body.setAttribute("data-view", "panel");
    return () => document.body.removeAttribute("data-view");
  }, []);

  const projectId = (veritabani.app.options as any)?.projectId as string | undefined;
  const envProjectId = (import.meta as any).env?.VITE_FIREBASE_PROJECT_ID;

  return (
    <div className="layout">
      <aside className="sidebar">
        {/* Logo */}
        <div className="brand brand-logo-only">
          <img src={logo} alt="Capri" className="brand-logo" />
        </div>

        {/* Kullanıcı kartı */}
        <div className="usercard">
          <div className="usercard-name">{adSoyad || "Kullanıcı"}</div>
          <div className="usercard-sub">
            <span className="mono">{userEmail || "—"}</span>
            <span className="dot">•</span>
            <span className="role">{role}</span>
          </div>
        </div>

        {/* .env uyarısı (varsa) */}
        {envProjectId && projectId && envProjectId !== projectId && (
          <div className="env-warning">
            .env projectId <b>{envProjectId}</b> ≠ aktif <b>{projectId}</b>
          </div>
        )}

        <nav className="nav">
          <NavLink to="/stok" end><span className="icon">📦</span> Stok</NavLink>
          <NavLink to="/siparisler"><span className="icon">🧾</span> Siparişler</NavLink>
          <NavLink to="/fiyat-listeleri"><span className="icon">💲</span> Fiyat Listeleri</NavLink>
          <NavLink to="/musteriler"><span className="icon">👤</span> Müşteriler</NavLink>
          <NavLink to="/analiz"> <span className="icon">📊</span>Analiz</NavLink>
          <NavLink to="/kullanicilar"><span className="icon">👥</span> Kullanıcılar</NavLink>
          <NavLink to="/loglar"><span className="icon">🧾</span>Loglar</NavLink>
          <NavLink to="/ayarlar"><span className="icon">⚙️</span> Ayarlar</NavLink>
        </nav>

        <div className="sidebar-actions">
          <button className="theme-btn" onClick={toggle}>
            {theme === "dark" ? "☀️ Açık" : "🌙 Koyu"}
          </button>
          <button onClick={() => signOut(yetki)}>Çıkış</button>
        </div>
      </aside>

      <main className="main">
        {/* TOPBAR: başlık + refresh butonları */}
        <div
          className="topbar pretty"
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}
        >
          <div className="topbar-title">{pageTitle}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="theme-btn"
              onClick={softRefresh}
              title="Yenile (sayfayı yeniden yüklemeden)"
              disabled={yenileniyor}
            >
              {yenileniyor ? "Yenileniyor…" : "↻ Yenile"}
            </button>
            <button
              onClick={hardRefresh}
              title="Tam yenile (sayfayı baştan yükler)"
            >
              ♻ Tam Yenile
            </button>
          </div>
        </div>

        <div className="content">{children}</div>
      </main>
    </div>
  );
}

function UygulamaIc() {
  const [authReady, setAuthReady] = useState(false);
  const [docReady, setDocReady] = useState(false);
  const [uid, setUid] = useState<string | null>(null);

  const [userEmail, setUserEmail] = useState<string>("");
  const [role, setRole] = useState<Rol | undefined>(undefined);
  const [firstName, setFirstName] = useState<string>("");
  const [lastName, setLastName] = useState<string>("");

  useEffect(() => {
    let offUserDoc: (() => void) | undefined;

    const offAuth = onAuthStateChanged(yetki, (u) => {
      if (!u) {
        setUid(null);
        setUserEmail("");
        setRole(undefined);
        setFirstName("");
        setLastName("");
        setDocReady(false);
        setAuthReady(true);
        if (offUserDoc) { offUserDoc(); offUserDoc = undefined; }
        return;
      }

      setUid(u.uid);
      setUserEmail(u.email ?? "");
      setDocReady(false);
      if (offUserDoc) { offUserDoc(); offUserDoc = undefined; }

      offUserDoc = onSnapshot(doc(veritabani, "users", u.uid), (snap) => {
        const d = snap.exists() ? (snap.data() as UserDoc) : undefined;
        setRole(d?.role);
        setFirstName(d?.firstName || "");
        setLastName(d?.lastName || "");
        setDocReady(true);
      });

      setAuthReady(true);
    });

    return () => {
      offAuth();
      if (offUserDoc) offUserDoc();
    };
  }, []);

  if (!authReady) return <Yukleniyor />;

  if (!uid) {
    return (
      <HashRouter>
        <Routes>
          <Route path="*" element={<GirisSayfasi />} />
        </Routes>
      </HashRouter>
    );
  }

  if (!docReady) return <Yukleniyor />;

  const izinli = role ? ALLOWED.includes(role) : false;
  if (!izinli) return <ErisimYok />;

  const adSoyad = [firstName, lastName].filter(Boolean).join(" ");

  return (
    <HashRouter>
      <PanelYerlesim userEmail={userEmail} adSoyad={adSoyad} role={role!}>
        <Routes>
          <Route path="/" element={<Navigate to="/stok" replace />} />
          <Route path="/kullanicilar" element={<KullaniciYonetimi rol={role!} />} />

          {/* Ürünler */}
          <Route path="/stok" element={<StokSayfasi />} />
          <Route path="/urun/:id" element={<UrunDetay />} />
          <Route path="/urun/:id/duzenle" element={<UrunDuzenle />} />
          <Route path="/fiyat-listeleri" element={<FiyatListesiSayfasi />} />
          <Route path="*" element={<Navigate to="/stok" replace />} />
          <Route path="/stok/duzenle" element={<StokDuzenle />} />

          {/* Müşteri */}
          <Route path="/musteriler" element={<MusteriListesi />} />
          <Route path="/musteri/yeni" element={<MusteriOlustur />} />
          <Route path="/musteri/:docId" element={<MusteriDetay />} />
          <Route path="/musteri/:docId/duzenle" element={<MusteriDuzenle />} />

          {/* Sipariş */}
          <Route path="/siparisler" element={<SiparisListesi />} />
          <Route path="/siparis/yeni" element={<SiparisOlustur />} />
          <Route path="/siparis/duzenle/:id" element={<SiparisDuzenle />} />
          <Route path="/siparis/:id" element={<SiparisDetay />} />

          <Route path="/analiz" element={<Analiz />} />
          <Route path="/loglar" element={<Loglar />} />
          <Route path="/ayarlar" element={<AyarlarSayfasi />} />
          <Route path="/siparis/uretim-ihtiyac" element={<UretimIhtiyacListesi />} />
          <Route path="/siparis/kismi-sevkiyat/:id" element={<KismiSevkiyat />} />
        </Routes>
      </PanelYerlesim>
    </HashRouter>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <UygulamaIc />
    </ThemeProvider>
  );
}

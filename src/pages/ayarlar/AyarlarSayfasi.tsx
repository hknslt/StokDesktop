import { useState } from "react";
import ProfilTab from "./ProfilTab";
import SifreTab from "./SifreTab";
import RenklerTab from "./RenklerTab";
import YedeklemeTab from "./yedekleme/YedeklemeTab";
import GruplarTab from "./GruplarTab";

export type Sekme = "profil" | "sifre" | "renkler" |"gruplar"| "yedekleme";

export default function AyarlarSayfasi() {
  const [sekme, setSekme] = useState<Sekme>("profil");

  return (
    <div className="card" style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <h2 style={{ margin: 0 }}>Ayarlar</h2>
      </div>

      {/* Sekmeler */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          className="theme-btn"
          onClick={() => setSekme("profil")}
          style={{ borderColor: sekme === "profil" ? "var(--ana)" : "var(--panel-bdr)" }}
        >
          👤 Profil
        </button>
        <button
          type="button"
          className="theme-btn"
          onClick={() => setSekme("sifre")}
          style={{ borderColor: sekme === "sifre" ? "var(--ana)" : "var(--panel-bdr)" }}
        >
          🔒 Şifre
        </button>
        <button
          type="button"
          className="theme-btn"
          onClick={() => setSekme("renkler")}
          style={{ borderColor: sekme === "renkler" ? "var(--ana)" : "var(--panel-bdr)" }}
        >
          🎨 Renkler
        </button>
        <button
          type="button"
          className="theme-btn"
          onClick={() => setSekme("gruplar")}
          style={{ borderColor: sekme === "gruplar" ? "var(--ana)" : "var(--panel-bdr)" }}
        >
          📁 Gruplar
        </button>
        <button
          type="button"
          className="theme-btn"
          onClick={() => setSekme("yedekleme")}
          style={{ borderColor: sekme === "yedekleme" ? "var(--ana)" : "var(--panel-bdr)" }}
        >
          💾 Yedekleme
        </button>
      </div>

      {sekme === "profil" && <ProfilTab />}
      {sekme === "sifre" && <SifreTab />}
      {sekme === "renkler" && <RenklerTab />}
      {sekme === "gruplar" && <GruplarTab />}
      {sekme === "yedekleme" && <YedeklemeTab />}
    </div >
  );
}

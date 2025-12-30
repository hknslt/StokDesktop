import { useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { veritabani } from "../../../firebase";

import { serializeForBackup } from "./utils/firestore-serialize";
import { flatten, toCSV, safeName } from "./utils/table-helpers";
import { downloadBlob } from "./utils/download";

/* ----------------------- tipler ve sabitler ----------------------- */
type ExportSet = "renkler" | "gruplar" | "grupStok" | "urunler" | "musteriler" | "siparisler" | "ozel";


type Urun = {
  urunAdi: string;
  adet: number;
  grup?: string;
};

const PRESETS: { key: ExportSet; path?: string; label: string }[] = [
  { key: "renkler", path: "renkler", label: "🎨 Renkler" },
  { key: "gruplar", path: "gruplar", label: "📁 Gruplar" },
  { key: "urunler", path: "urunler", label: "📦 Ürünler" },
  { key: "musteriler", path: "musteriler", label: "👥 Müşteriler" },
  { key: "siparisler", path: "siparisler", label: "🧾 Siparişler" },
  { key: "grupStok", label: "📊 Stok Dağılımı (Grup)" },
  { key: "ozel", label: "📁 Özel Yol" },
];

const fmtTime = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}_${String(d.getHours()).padStart(2, "0")}-${String(
    d.getMinutes()
  ).padStart(2, "0")}-${String(d.getSeconds()).padStart(2, "0")}`;

/* ----------------------- bileşen ----------------------- */
export default function YedeklemeTab() {
  const [secim, setSecim] = useState<ExportSet>("renkler");
  const [ozelYol, setOzelYol] = useState("");
  const [yuk, setYuk] = useState<null | "load" | "json" | "csv" | "xlsx">(null);
  const [durum, setDurum] = useState<string | null>(null);

  const [tumSatirlar, setTumSatirlar] = useState<any[]>([]);
  const [alanlar, setAlanlar] = useState<string[]>([]);
  const [seciliAlanlar, setSeciliAlanlar] = useState<Set<string>>(new Set());


  const etkinYol = useMemo(() => {
    if (secim === 'grupStok') return 'urunler';
    const preset = PRESETS.find((p) => p.key === secim);
    return preset?.path || ozelYol.trim();
  }, [secim, ozelYol]);

  /* ----------------------- seçim yardımcıları ----------------------- */
  function hepsiniSec() {
    setSeciliAlanlar(new Set(alanlar));
  }
  function hicbiri() {
    setSeciliAlanlar(new Set());
  }
  function toggleAlan(k: string) {
    setSeciliAlanlar((s) => {
      const n = new Set(s);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  }

  /* ----------------------- veri yükleme ----------------------- */
  async function verileriYukle() {
    if (!etkinYol) {
      setDurum("Lütfen bir koleksiyon/yol seçin.");
      return;
    }

    try {
      setYuk("load");
      setDurum(null);

      if (secim === 'grupStok') {
        const snap = await getDocs(collection(veritabani, "urunler"));
        const urunListesi = snap.docs.map(d => d.data() as Urun);

        const grupMap = new Map<string, { grupAdi: string; stokAdedi: number }>();
        for (const u of urunListesi) {
          const grupAdi = (u.grup || "").trim() || "(Grupsuz)";
          const adet = Number(u.adet || 0);
          const prev = grupMap.get(grupAdi) || { grupAdi, stokAdedi: 0 };
          grupMap.set(grupAdi, { grupAdi, stokAdedi: prev.stokAdedi + adet });
        }

        const rows = Array.from(grupMap.values()).sort((a, b) => b.stokAdedi - a.stokAdedi);
        setTumSatirlar(rows);

        const keys = ["grupAdi", "stokAdedi"];
        setAlanlar(keys);
        setSeciliAlanlar(new Set(keys));
        setDurum(`Stok Dağılımı için ${rows.length} grup hesaplandı.`);
        return;
      }
      const snap = await getDocs(collection(veritabani, etkinYol));
      const rows = snap.docs.map((d) => ({ ...d.data(), docId: d.id })); 
      setTumSatirlar(rows);

      const keys = new Set<string>();
      keys.add("docId");
      for (const r of rows) {
        const flat = flatten(r);
        Object.keys(flat).forEach((k) => keys.add(k));
      }
      const list = Array.from(keys);
      setAlanlar(list);
      setSeciliAlanlar(new Set(list));
      setDurum(`${etkinYol} için ${rows.length} kayıt yüklendi.`);

    } catch (e: any) {
      setDurum(e?.message || "Veriler alınamadı.");
    } finally {
      setYuk(null);
    }
  }

  function filtreliFlatRows() {
    const selected = seciliAlanlar.size ? Array.from(seciliAlanlar) : alanlar;
    const keys = Array.from(new Set([...selected])); 
    const out: Record<string, any>[] = [];
    for (const r of tumSatirlar) {
      const flat = flatten(r);
      const o: Record<string, any> = {};
      for (const k of keys) o[k] = flat[k];
      out.push(o);
    }
    return out;
  }
  function exportJSON(manualFileName?: string) {
    if (!tumSatirlar.length) {
      setDurum("Önce verileri yükleyin.");
      return;
    }
    try {
      setYuk("json");
      const safe = tumSatirlar.map((r) => serializeForBackup(r)); 

      const fname =
        manualFileName || `${safeName(etkinYol)}__${fmtTime(new Date())}.json`;

      downloadBlob(
        fname,
        JSON.stringify(
          {
            path: etkinYol,
            exportedAt: new Date().toISOString(),
            count: safe.length,
            data: safe,
          },
          null,
          2
        ),
        "application/json"
      );
      setDurum("JSON indirildi.");
    } finally {
      setYuk(null);
    }
  }

  function exportCSV() {
    if (!tumSatirlar.length) {
      setDurum("Önce verileri yükleyin.");
      return;
    }
    try {
      setYuk("csv");
      const rows = filtreliFlatRows();
      const headers = Array.from(new Set([...seciliAlanlar]));
      const csv = toCSV(rows, headers);
      downloadBlob(
        `${safeName(etkinYol)}__${fmtTime(new Date())}.csv`,
        csv,
        "text/csv;charset=utf-8"
      );
      setDurum("CSV indirildi.");
    } finally {
      setYuk(null);
    }
  }

  async function exportXLSX() {
    if (!tumSatirlar.length) {
      setDurum("Önce verileri yükleyin.");
      return;
    }
    try {
      setYuk("xlsx");
      const xlsx: any = await import("xlsx");

      const rows = filtreliFlatRows();
      const headers = Array.from(new Set([...seciliAlanlar]));

      const data = rows.map((r) => {
        const o: Record<string, any> = {};
        headers.forEach((h) => (o[h] = r[h]));
        return o;
      });
      const ws = xlsx.utils.json_to_sheet(data, { header: headers });

      const colWidths = headers.map((h) => {
        const maxCell = Math.max(String(h).length, ...rows.map((r) => String(r[h] ?? "").length));
        return { wch: Math.min(50, Math.max(12, maxCell + 1)) };
      });
      (ws as any)["!cols"] = colWidths;

      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, "Veriler");

      const wbout = xlsx.write(wb, { type: "array", bookType: "xlsx" });
      downloadBlob(
        `${safeName(etkinYol)}__${fmtTime(new Date())}.xlsx`,
        wbout,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      setDurum("Excel indirildi.");
    } catch (e: any) {
      setDurum(e?.message || "Excel hazırlanamıyor.");
    } finally {
      setYuk(null);
    }
  }

  /* ----------------------- UI ----------------------- */
  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 920 }}>
      {/* kaynak seçimi */}
      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 700 }}>Kaynak</div>
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <select
            className="input"
            value={secim}
            onChange={(e) => setSecim(e.target.value as ExportSet)}
            style={{ minWidth: 220 }}
            title="Koleksiyon seç"
          >
            {PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
                {p.path ? `  (${p.path})` : ""}
              </option>
            ))}
          </select>

          {secim === "ozel" && (
            <input
              className="input"
              placeholder="Örn: fiyatListeleri/ABCD/urunFiyatlari"
              value={ozelYol}
              onChange={(e) => setOzelYol(e.target.value)}
              style={{ minWidth: 320 }}
            />
          )}

          <button onClick={verileriYukle} disabled={yuk !== null || !etkinYol}>
            {yuk === "load" ? "Yükleniyor…" : "Verileri Yükle"}
          </button>

          {tumSatirlar.length > 0 && (
            <div className="tag">{tumSatirlar.length.toLocaleString()} kayıt</div>
          )}
        </div>
      </div>

      {/* alan seçimi + dışa aktarma */}
      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 700 }}>Alanlar (CSV/Excel için)</div>
          <div className="tag">Seçili: {seciliAlanlar.size || alanlar.length}</div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button className="theme-btn" onClick={hepsiniSec}>
              Tümünü Seç
            </button>
            <button className="theme-btn" onClick={hicbiri}>
              Hiçbiri
            </button>
          </div>
        </div>

        {/* alan listesi */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 8,
            maxHeight: 220,
            overflow: "auto",
            border: "1px solid var(--panel-bdr)",
            borderRadius: 12,
            padding: 8,
            background: "color-mix(in oklab, var(--panel) 80%, transparent)",
          }}
        >
          {alanlar.map((k) => {
            const sel = seciliAlanlar.size ? seciliAlanlar.has(k) : true;
            return (
              <label
                key={k}
                className="cek-kutu"
                style={{ display: "flex", gap: 8, alignItems: "center" }}
              >
                <input type="checkbox" checked={sel} onChange={() => toggleAlan(k)} />
                <span
                  style={{
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    fontSize: 12,
                  }}
                >
                  {k}
                </span>
              </label>
            );
          })}
          {!alanlar.length && (
            <div style={{ color: "var(--muted)" }}>
              Alan bulunamadı. Önce verileri yükleyin.
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="theme-btn" onClick={() => exportJSON()} disabled={!tumSatirlar.length || yuk !== null}>
            {yuk === "json" ? "Hazırlanıyor…" : "JSON indir"}
          </button>
          <button onClick={exportCSV} disabled={!tumSatirlar.length || yuk !== null}>
            {yuk === "csv" ? "Hazırlanıyor…" : "CSV indir"}
          </button>
          <button onClick={exportXLSX} disabled={!tumSatirlar.length || yuk !== null}>
            {yuk === "xlsx" ? "Hazırlanıyor…" : "Excel indir"}
          </button>
        </div>
      </div>

      {durum && <div style={{ opacity: 0.95 }}>{durum}</div>}
    </div>
  );
}

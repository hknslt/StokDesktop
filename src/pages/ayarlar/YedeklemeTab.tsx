import { useMemo, useRef, useState } from "react";
import { collection, doc, getDocs, setDoc, addDoc } from "firebase/firestore";
import { veritabani } from "../../firebase";

/* ----------------------- yardımcılar ----------------------- */
type ExportSet = "renkler" | "urunler" | "musteriler" | "siparisler" | "ozel";

const PRESETS: { key: ExportSet; path?: string; label: string }[] = [
  { key: "renkler", path: "renkler", label: "🎨 Renkler" },
  { key: "urunler", path: "urunler", label: "📦 Ürünler" },
  { key: "musteriler", path: "musteriler", label: "👥 Müşteriler" },
  { key: "siparisler", path: "siparisler", label: "🧾 Siparişler" },
  { key: "ozel", label: "📁 Özel Yol" },
];

// objeyi dot-key olacak şekilde düzleştir
function flatten(obj: any, prefix = "", out: Record<string, any> = {}) {
  if (obj == null) return out;
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (Array.isArray(v)) {
      out[key] =
        typeof v[0] === "object" ? JSON.stringify(v) : (v as any[]).join("|");
    } else if (v instanceof Date) {
      out[key] = v.toISOString();
    } else if (v && typeof v === "object") {
      flatten(v, key, out);
    } else {
      out[key] = v;
    }
  }
  return out;
}

// dot-key'leri tekrar iç içe nesneye çevir
function unflatten(obj: Record<string, any>) {
  const result: any = {};
  for (const [k, v] of Object.entries(obj)) {
    const parts = k.split(".");
    let cur = result;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (i === parts.length - 1) {
        cur[p] = v;
      } else {
        cur[p] ??= {};
        cur = cur[p];
      }
    }
  }
  return result;
}

// CSV üret
function toCSV(rows: Record<string, any>[], headers: string[]) {
  const esc = (x: any) => {
    const s = x == null ? "" : String(x);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const head = headers.join(",");
  const body = rows.map((r) => headers.map((h) => esc(r[h])).join(",")).join("\n");
  return `${head}\n${body}`;
}

// indir
function downloadBlob(filename: string, data: BlobPart, type: string) {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ----------------------- bileşen ----------------------- */
export default function YedeklemeTab() {
  const [secim, setSecim] = useState<ExportSet>("renkler");
  const [ozelYol, setOzelYol] = useState("");
  const [yuk, setYuk] = useState<null | "load" | "json" | "csv" | "xlsx" | "import">(null);
  const [durum, setDurum] = useState<string | null>(null);

  const [tumSatirlar, setTumSatirlar] = useState<any[]>([]);
  const [alanlar, setAlanlar] = useState<string[]>([]);
  const [seciliAlanlar, setSeciliAlanlar] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  const etkinYol = useMemo(() => {
    const preset = PRESETS.find((p) => p.key === secim);
    return preset?.path || ozelYol.trim();
  }, [secim, ozelYol]);

  // seç-kaldır yardımcıları
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

  async function verileriYukle() {
    if (!etkinYol) {
      setDurum("Lütfen bir koleksiyon/yol seçin.");
      return;
    }
    try {
      setYuk("load");
      setDurum(null);
      const snap = await getDocs(collection(veritabani, etkinYol));
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setTumSatirlar(rows);

      // alanları belirle (union)
      const keys = new Set<string>(["id"]);
      for (const r of rows) {
        const flat = flatten(r);
        Object.keys(flat).forEach((k) => keys.add(k));
      }
      const list = Array.from(keys);
      setAlanlar(list);
      setSeciliAlanlar(new Set(list)); // varsayılan: hepsi
      setDurum(`${etkinYol} için ${rows.length} kayıt yüklendi.`);
    } catch (e: any) {
      setDurum(e?.message || "Veriler alınamadı.");
    } finally {
      setYuk(null);
    }
  }

  function filtreliFlatRows() {
    const selected = seciliAlanlar.size ? Array.from(seciliAlanlar) : alanlar;
    const keys = Array.from(new Set(["id", ...selected]));
    const out: Record<string, any>[] = [];
    for (const r of tumSatirlar) {
      const flat = flatten(r);
      const o: Record<string, any> = {};
      for (const k of keys) o[k] = flat[k];
      out.push(o);
    }
    return out;
  }

  function exportJSON() {
    if (!tumSatirlar.length) {
      setDurum("Önce verileri yükleyin.");
      return;
    }
    try {
      setYuk("json");
      const flatRows = filtreliFlatRows();
      // JSON çıktısını tekrar orijinal yapıya döndürelim (daha okunur)
      const unflat = flatRows.map((r) => {
        const { id, ...rest } = r;
        return { id, ...unflatten(rest) };
      });
      downloadBlob(
        `${(etkinYol || "koleksiyon").replace(/\//g, "_")}.json`,
        JSON.stringify(
          {
            path: etkinYol,
            exportedAt: new Date().toISOString(),
            count: unflat.length,
            data: unflat,
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
      const headers = Array.from(
        new Set(["id", ...(seciliAlanlar.size ? Array.from(seciliAlanlar) : alanlar)])
      );
      const csv = toCSV(rows, headers);
      downloadBlob(
        `${(etkinYol || "koleksiyon").replace(/\//g, "_")}.csv`,
        csv,
        "text/csv;charset=utf-8"
      );
      setDurum("CSV indirildi.");
    } finally {
      setYuk(null);
    }
  }

  // --------- Excel (XLSX) dışa aktarma ----------
  async function exportXLSX() {
    if (!tumSatirlar.length) {
      setDurum("Önce verileri yükleyin.");
      return;
    }
    try {
      setYuk("xlsx");
      // Dinamik import — paket: npm i xlsx
      const xlsx: any = await import("xlsx");

      const rows = filtreliFlatRows();
      const headers = Array.from(
        new Set(["id", ...(seciliAlanlar.size ? Array.from(seciliAlanlar) : alanlar)])
      );

      // JSON -> sheet (başlıkları sırayla veriyoruz)
      const data = rows.map((r) => {
        const o: Record<string, any> = {};
        headers.forEach((h) => (o[h] = r[h]));
        return o;
      });
      const ws = xlsx.utils.json_to_sheet(data, { header: headers });

      // kolon genişlikleri (başlık ve hücre uzunluklarına göre)
      const colWidths = headers.map((h) => {
        const maxCell = Math.max(
          String(h).length,
          ...rows.map((r) => String(r[h] ?? "").length)
        );
        return { wch: Math.min(50, Math.max(12, maxCell + 1)) };
      });
      (ws as any)["!cols"] = colWidths;

      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, "Veriler");

      const wbout = xlsx.write(wb, { type: "array", bookType: "xlsx" });
      downloadBlob(
        `${(etkinYol || "koleksiyon").replace(/\//g, "_")}.xlsx`,
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

  // ----- IMPORT (geri yükleme) -----
  type ImportMode = "merge" | "overwrite" | "autoIdIfMissing";
  const [mode, setMode] = useState<ImportMode>("merge");
  const [preserveId, setPreserveId] = useState(true); // JSON içindeki id korunacak mı?
  function openFile() {
    fileRef.current?.click();
  }
  async function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!etkinYol) {
      setDurum("Lütfen hedef koleksiyonu seçin.");
      e.target.value = "";
      return;
    }

    try {
      setYuk("import");
      setDurum(null);
      const text = await file.text();
      const parsed = JSON.parse(text);

      let data: any[] = [];
      if (Array.isArray(parsed)) data = parsed;
      else if (parsed && Array.isArray(parsed.data)) data = parsed.data;
      else throw new Error("JSON biçimi tanınmadı. Dizi ya da { data: [] } bekleniyor.");

      let ok = 0,
        fail = 0;
      for (const item of data) {
        try {
          const { id, ...rest } = item || {};
          if (preserveId && id) {
            await setDoc(doc(veritabani, etkinYol, String(id)), rest, {
              merge: mode === "merge",
            });
          } else {
            if (mode === "overwrite" && id) {
              await setDoc(doc(veritabani, etkinYol, String(id)), rest); // tam overwrite
            } else {
              await addDoc(collection(veritabani, etkinYol), item);
            }
          }
          ok++;
        } catch {
          fail++;
        }
      }
      setDurum(
        `İçe aktarma tamamlandı. Başarılı: ${ok}, Hatalı: ${fail}.`
      );
    } catch (err: any) {
      setDurum(err?.message || "İçe aktarılamadı.");
    } finally {
      setYuk(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

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
        <div
          style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
        >
          <div style={{ fontWeight: 700 }}>Alanlar</div>
          <div className="tag">
            Seçili: {seciliAlanlar.size || alanlar.length}
          </div>
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
                <input
                  type="checkbox"
                  checked={sel}
                  onChange={() => toggleAlan(k)}
                />
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
          <button
            className="theme-btn"
            onClick={exportJSON}
            disabled={!tumSatirlar.length || yuk !== null}
          >
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

      {/* içe aktarma */}
      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 700 }}>Geri Yükleme (JSON)</div>

        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <label className="cek-kutu" style={{ userSelect: "none" }}>
              <input
                type="checkbox"
                checked={preserveId}
                onChange={(e) => setPreserveId(e.target.checked)}
              />
              <span>
                JSON’daki <b>id</b> alanını koru
              </span>
            </label>

            <select
              className="input"
              value={mode}
              onChange={(e) => setMode(e.target.value as any)}
            >
              <option value="merge">Mevcut ile Birleştir (merge)</option>
              <option value="overwrite">Tam Üzerine Yaz (overwrite)</option>
              <option value="autoIdIfMissing">id yoksa Otomatik ID</option>
            </select>

            <button onClick={openFile} disabled={yuk !== null || !etkinYol}>
              {yuk === "import" ? "Yükleniyor…" : "JSON Seç ve Yükle"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              style={{ display: "none" }}
              onChange={onFilePicked}
            />
          </div>

          <div className="tag">
            Biçimler: <code>{"[ {...} ]"}</code> veya{" "}
            <code>{"{ path, data: [ ... ] }"}</code>. Hedef koleksiyon:{" "}
            <b>{etkinYol || "—"}</b>
          </div>
        </div>
      </div>

      {durum && <div style={{ opacity: 0.95 }}>{durum}</div>}
    </div>
  );
}

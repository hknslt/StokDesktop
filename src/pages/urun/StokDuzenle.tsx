// src/pages/urun/StokDuzenle.tsx
import { useEffect, useMemo, useState } from "react";
import {
  collection, doc, onSnapshot, orderBy, query, writeBatch
} from "firebase/firestore";
import { veritabani } from "../../firebase";
import { Link} from "react-router-dom";

type Urun = {
  docId: string;
  id: number;
  urunAdi: string;
  urunKodu: string;
  renk?: string;
  adet: number;
  kapakResimYolu?: string | null;
  aciklama?: string;
};

export default function StokDuzenle() {
  const [rows, setRows] = useState<Urun[]>([]);
  const [ara, setAra] = useState("");

  const [sirala, setSirala] = useState<"az" | "za">("az");
  const [sifirStok, setSifirStok] = useState(false);

  const [taslak, setTaslak] = useState<Record<string, number>>({});
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [durum, setDurum] = useState<string | null>(null);

  useEffect(() => {
    const qy = query(collection(veritabani, "urunler"), orderBy("id", "asc"));
    return onSnapshot(qy, (snap) => {
      const list: Urun[] = snap.docs.map((d) => {
        const x = d.data() as any;
        return {
          docId: d.id,
          id: Number(x.id ?? Number(d.id)),
          urunAdi: String(x.urunAdi ?? ""),
          urunKodu: String(x.urunKodu ?? ""),
          renk: x.renk || undefined,
          adet: Number(x.adet ?? 0),
          kapakResimYolu: x.kapakResimYolu ?? undefined,
          aciklama: x.aciklama ?? undefined,
        };
      });
      setRows(list);
      setTaslak((t) => {
        const n = { ...t };
        for (const r of list) if (n[r.docId] == null) n[r.docId] = r.adet;
        return n;
      });
    });
  }, []);

  const filtreli = useMemo(() => {
    let list = rows.slice();

    // stoğu olmayanlar
    if (sifirStok) list = list.filter(u => Number(u.adet || 0) <= 0);

    // arama
    const q = ara.trim().toLowerCase();
    if (q) {
      list = list.filter((u) =>
        [u.urunAdi, u.urunKodu, u.renk, u.aciklama]
          .filter(Boolean)
          .map((s) => String(s).toLowerCase())
          .some((s) => s.includes(q))
      );
    }

    // Türkçe sıralama
    list.sort((a, b) => a.urunAdi.localeCompare(b.urunAdi, "tr", { sensitivity: "base" }));
    if (sirala === "za") list.reverse();

    return list;
  }, [rows, ara, sifirStok, sirala]);

  const degisiklikSayisi = useMemo(() => {
    let n = 0;
    for (const r of rows) {
      const d = taslak[r.docId];
      if (d != null && Number(d) !== Number(r.adet)) n++;
    }
    return n;
  }, [rows, taslak]);

  async function kaydet() {
    try {
      setKaydediliyor(true);
      setDurum(null);
      const batch = writeBatch(veritabani);
      let cnt = 0;
      for (const r of rows) {
        const val = taslak[r.docId];
        if (val == null || Number(val) === Number(r.adet)) continue;
        batch.update(doc(veritabani, "urunler", r.docId), { adet: Number(val) || 0 });
        cnt++;
      }
      if (cnt === 0) { setDurum("Değişiklik yok."); return; }
      await batch.commit();
      setDurum(`${cnt} ürün güncellendi.`);
    } catch (e: any) {
      setDurum(e?.message || "Kaydedilemedi. Yetkiler/rules kontrol edin.");
    } finally {
      setKaydediliyor(false);
    }
  }

  function setAdet(docId: string, v: string) {
    const n = Number(v);
    setTaslak((t) => ({ ...t, [docId]: Number.isFinite(n) ? n : 0 }));
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Stok Düzenle</h2>

        <input
          className="input"
          placeholder="Ara (ad, kod, renk...)"
          value={ara}
          onChange={(e) => setAra(e.target.value)}
          style={{ maxWidth: 320 }}
        />

        {/* 🔽 Stoğu olmayanlar filtresi */}
        <label className="cek-kutu" style={{ userSelect: "none" }}>
          <input
            type="checkbox"
            checked={sifirStok}
            onChange={(e) => setSifirStok(e.target.checked)}
          />
          <span>Stoğu olmayanlar</span>
        </label>

        {/* 🔽 Tek sıralama butonu (toggle) */}
        <button
          className="theme-btn"
          type="button"
          onClick={() => setSirala(s => (s === "az" ? "za" : "az"))}
          title="Ada göre sırala"
        >
          {sirala === "az" ? "A → Z" : "Z → A"}
        </button>


        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <Link to="/stok"><button className="theme-btn">← Stok listesi</button></Link>
          <button onClick={kaydet} disabled={kaydediliyor || degisiklikSayisi === 0}>
            {kaydediliyor ? "Kaydediliyor…" : `Değişiklikleri Kaydet (${degisiklikSayisi})`}
          </button>
        </div>
      </div>

      {durum && <div className="card">{durum}</div>}

      <div className="card">
        <div style={{
          display: "grid",
          gridTemplateColumns: "90px 1.2fr 1fr 1fr 120px",
          gap: 8, fontSize: 13, color: "var(--muted)", marginBottom: 8
        }}>
          <div>Foto</div><div>Ürün Adı</div><div>Kod</div><div>Renk</div><div>Adet (düzenlenebilir)</div>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          {filtreli.map((u) => (
            <div key={u.docId} style={{
              display: "grid",
              gridTemplateColumns: "90px 1.2fr 1fr 1fr 120px",
              gap: 8, alignItems: "center",
              border: "1px solid var(--panel-bdr)", borderRadius: 10, padding: "8px 10px"
            }}>
              <div>
                {u.kapakResimYolu ? (
                  <img src={u.kapakResimYolu} alt="" style={{ width: 90, height: 64, objectFit: "cover", borderRadius: 8 }} />
                ) : (
                  <div style={{
                    width: 90, height: 64, borderRadius: 8, display: "grid", placeItems: "center",
                    border: "1px dashed var(--panel-bdr)", fontSize: 12, opacity: .7
                  }}>—</div>
                )}
              </div>
              <div><b>{u.urunAdi}</b></div>
              <div>{u.urunKodu}</div>
              <div>{u.renk ?? "—"}</div>
              <input
                className="input"
                type="number"
                inputMode="numeric"
                value={String(taslak[u.docId] ?? u.adet)}
                onChange={(e) => setAdet(u.docId, e.target.value)}
                style={{ width: 100 }}
              />
            </div>
          ))}

          {!filtreli.length && <div>Liste boş.</div>}
        </div>
      </div>
    </div>
  );
}

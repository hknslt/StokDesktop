import { useEffect, useRef, useState } from "react";
import {
  doc, getDoc, updateDoc, collection, onSnapshot, orderBy, query,
  arrayRemove, arrayUnion
} from "firebase/firestore";
import {
  ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject
} from "firebase/storage";
import { veritabani, depolama } from "../../firebase";
import { Link, useNavigate, useParams } from "react-router-dom";

type ImageMode = "upload" | "url";

const safeRand = (len = 8) => {
  try {
    const u8 = new Uint8Array(len);
    crypto.getRandomValues(u8);
    return Array.from(u8).map(b => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return Math.random().toString(16).slice(2) + Date.now().toString(16);
  }
};

function parseUrlList(val: string): string[] {
  return (val || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

// Renk doküman tipi
type RenkDoc = { id: string; ad: string; adLower?: string | null };
type GrupDoc = { id: string; ad: string; adLower?: string | null };

export default function UrunDuzenle() {
  const { id } = useParams(); // docId (string)
  const navigate = useNavigate();

  // temel alanlar
  const [yuk, setYuk] = useState(true);
  const [durum, setDurum] = useState<string | null>(null);

  const [urunKodu, setUrunKodu] = useState("");
  const [urunAdi, setUrunAdi] = useState("");
  const [renk, setRenk] = useState("");
  const [grup, setGrup] = useState("");
  const [adet, setAdet] = useState<number>(0);
  const [aciklama, setAciklama] = useState("");

  const [kapakResimYolu, setKapakResimYolu] = useState<string | null>(null);
  const [galeri, setGaleri] = useState<string[]>([]); // mevcut galeri

  // resim ekleme modu
  const [imgMode, setImgMode] = useState<ImageMode>("upload");

  // ---- Upload modu (tek dropzone, çoklu dosya, yıldız kapak) ----
  const [files, setFiles] = useState<File[]>([]);
  const [coverIndex, setCoverIndex] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState(0);
  const activeTasks = useRef<ReturnType<typeof uploadBytesResumable>[]>([]);

  // ---- URL modu ----
  const [kapakUrl, setKapakUrl] = useState("");
  const [digerUrlMetni, setDigerUrlMetni] = useState("");

  // 🔹 Renkler dropdown state (StokSayfasi ile aynı mantık)
  const [renkler, setRenkler] = useState<RenkDoc[]>([]);
  const [renkAcik, setRenkAcik] = useState(false);
  const renkKutuRef = useRef<HTMLDivElement | null>(null);

  const [gruplar, setGruplar] = useState<GrupDoc[]>([]);
  const [grupAcik, setGrupAcik] = useState(false);
  const grupKutuRef = useRef<HTMLDivElement | null>(null);

  // 🔹 Renkleri canlı oku
  useEffect(() => {
    const qy = query(collection(veritabani, "renkler"), orderBy("adLower", "asc"));
    return onSnapshot(qy, (snap) => {
      const list: RenkDoc[] = snap.docs
        .map((d) => {
          const x = d.data() as any;
          const ad = String(x.ad ?? "").trim();
          return { id: d.id, ad, adLower: x.adLower ?? ad.toLowerCase() };
        })
        .filter((r) => r.ad);
      setRenkler(list);
    });
  }, []);

  useEffect(() => {
    const qy = query(collection(veritabani, "gruplar"), orderBy("adLower", "asc"));
    return onSnapshot(qy, (snap) => {
      const list: GrupDoc[] = snap.docs
        .map((d) => {
          const x = d.data() as any;
          const ad = String(x.ad ?? "").trim();
          return { id: d.id, ad, adLower: x.adLower ?? ad.toLowerCase() };
        })
        .filter((r) => r.ad);
      setGruplar(list);
    });
  }, []);

  // 🔹 Dışarı tıklanınca renk menüsünü kapat
  useEffect(() => {
    function kapat(e: MouseEvent) {
      if (!renkKutuRef.current) return;
      if (!renkKutuRef.current.contains(e.target as Node)) setRenkAcik(false);
    }
    document.addEventListener("mousedown", kapat);
    return () => document.removeEventListener("mousedown", kapat);
  }, []);

  // 🔹 Dokümanı oku & state’e bas
  async function refreshDoc() {
    if (!id) return;
    const snap = await getDoc(doc(veritabani, "urunler", id));
    const x = snap.data() as any;
    setKapakResimYolu(x?.kapakResimYolu ?? null);
    setGaleri(Array.isArray(x?.resimYollari) ? x.resimYollari : []);
  }

  useEffect(() => {
    (async () => {
      try {
        if (!id) return;
        const snap = await getDoc(doc(veritabani, "urunler", id));
        if (!snap.exists()) {
          setDurum("Ürün bulunamadı.");
          setYuk(false);
          return;
        }
        const x = snap.data() as any;
        setUrunKodu(String(x.urunKodu ?? ""));
        setUrunAdi(String(x.urunAdi ?? ""));
        setRenk(x.renk ?? "");
        setGrup(x.grup ?? "");
        setAdet(Number(x.adet ?? 0));
        setAciklama(x.aciklama ?? "");
        setKapakResimYolu(x.kapakResimYolu ?? null);
        setGaleri(Array.isArray(x.resimYollari) ? x.resimYollari : []);
      } catch (e: any) {
        setDurum(e?.message || "Yüklenemedi.");
      } finally {
        setYuk(false);
      }
    })();
  }, [id]);

  // ---- dropzone / dosya inputu ----
  function handleFileInput(fl: FileList | null) {
    if (!fl || !fl.length) return;
    const arr = Array.from(fl);
    const ok = arr.filter(f => f.type.startsWith("image/") && f.size <= 10 * 1024 * 1024);
    if (ok.length !== arr.length) setDurum("Sadece resim ve en fazla 10MB kabul edilir.");
    const yeni = [...files, ...ok];
    setFiles(yeni);
    if (yeni.length && coverIndex >= yeni.length) setCoverIndex(0);
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation();
    setDragOver(false);
    handleFileInput(e.dataTransfer.files);
  }
  function removeFile(ix: number) {
    const yeni = files.filter((_, i) => i !== ix);
    setFiles(yeni);
    if (coverIndex === ix) setCoverIndex(0);
    else if (coverIndex > ix) setCoverIndex(c => c - 1);
  }

  // ---- upload yardımcıları ----
  function storageFriendlyError(e: any): string {
    const c = e?.code || "";
    if (c.includes("storage/unauthorized")) return "Depolama izni yok (Storage Rules).";
    if (c.includes("storage/unauthenticated")) return "Oturum yok. Giriş yapın.";
    if (c.includes("storage/bucket-not-found")) return "Storage etkin değil veya bucket yanlış.";
    if (c.includes("storage/retry-limit-exceeded")) return "Ağ hatası (tekrar limiti aşıldı).";
    if (c.includes("storage/canceled")) return "Yükleme iptal edildi.";
    return e?.message || `Depolama hatası: ${c || "bilinmiyor"}`;
  }
  function uploadOneWithTimeout(
    file: File,
    path: string,
    ms = 60_000,
    onOne?: (p: number) => void
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const r = storageRef(depolama, path);
        const task = uploadBytesResumable(r, file);
        activeTasks.current.push(task);

        const t = setTimeout(() => { try { task.cancel(); } catch { } reject(new Error("Yükleme zaman aşımı (60sn). Storage/bucket/rules kontrol edin.")); }, ms);

        task.on(
          "state_changed",
          s => onOne?.(Math.round((s.bytesTransferred / s.totalBytes) * 100)),
          err => { clearTimeout(t); reject(err); },
          async () => { clearTimeout(t); resolve(await getDownloadURL(task.snapshot.ref)); }
        );
      } catch (e) { reject(e as any); }
    });
  }
  async function uploadAll(docId: string, fs: File[]): Promise<string[]> {
    if (!fs.length) return [];
    let done = 0;
    setProgress(0);
    const urls: string[] = [];
    for (let i = 0; i < fs.length; i++) {
      const u = await uploadOneWithTimeout(
        fs[i],
        `urunler/${docId}/resimler/${Date.now()}-${i}-${safeRand()}-${fs[i].name}`,
        60_000,
        () => { done += 1; setProgress(Math.round((done / fs.length) * 100)); }
      );
      urls.push(u);
    }
    setProgress(100);
    return urls;
  }

  // ---- Kapak yap (double-click)
  async function kapaYap(url: string) {
    if (!id) return;
    try {
      const oncekiKapak = kapakResimYolu;
      const refDoc = doc(veritabani, "urunler", String(id));

      // 1) Yeni kapağı ata + galeriden varsa çıkar
      await updateDoc(refDoc, {
        kapakResimYolu: url,
        resimYollari: arrayRemove(url),
      });

      // 2) Eski kapak farklıysa galeride yoksa ekle
      if (oncekiKapak && oncekiKapak !== url) {
        await updateDoc(refDoc, { resimYollari: arrayUnion(oncekiKapak) });
      }

      // 3) Sunucudan tazele
      await refreshDoc();
      setDurum("Kapak güncellendi.");
    } catch (e: any) {
      setDurum(e?.message || "Kapak güncellenemedi.");
    }
  }

  // ---- Storage + Firestore: tekil görsel sil ----
  async function resmiSil(u: string, tip: "kapak" | "galeri") {
    if (!id) return;
    try {
      setDurum(null);

      // 1) Storage’dan kaldır (download URL ile)
      const r = storageRef(depolama, u);
      await deleteObject(r);

      const refDoc = doc(veritabani, "urunler", String(id));

      if (tip === "galeri") {
        // 2a) Galeriden URL’yi çıkar
        await updateDoc(refDoc, { resimYollari: arrayRemove(u) });
      } else {
        // 2b) Kapak silinirse:
        //    - Galeride resim varsa ilkini kapak yapıp galeriden düş
        //    - Galeri boşsa kapağı null yap
        const snap = await getDoc(refDoc);
        const x = snap.data() as any;
        const mevcutGaleri: string[] = Array.isArray(x?.resimYollari) ? x.resimYollari : [];

        if (mevcutGaleri.length > 0) {
          const yeniKapak = mevcutGaleri[0];
          await updateDoc(refDoc, {
            kapakResimYolu: yeniKapak,
            resimYollari: arrayRemove(yeniKapak),
          });
        } else {
          await updateDoc(refDoc, { kapakResimYolu: null });
        }
      }

      // 3) Sunucudan tazele (drift önler)
      await refreshDoc();

      setDurum("Görsel silindi.");
    } catch (e: any) {
      const msg = e?.code?.startsWith?.("storage/") ? storageFriendlyError(e) : (e?.message || "Silinemedi.");
      setDurum(msg);
    }
  }

  // ---- kaydet ----
  async function kaydet() {
    if (!id) return;
    if (!urunAdi.trim() || !urunKodu.trim()) { setDurum("Ad ve Kod zorunlu."); return; }

    try {
      setYuk(true); setDurum(null);

      const oldCover = kapakResimYolu; // ← eski kapağı yakala
      let cover: string | null = kapakResimYolu || null;
      let eklenecek: string[] = [];

      if (imgMode === "url") {
        const others = parseUrlList(digerUrlMetni);
        if (kapakUrl.trim()) cover = kapakUrl.trim();
        // yeni kapak neyse, onu galeriden tutmamak için others’tan çıkar
        eklenecek = others.filter(u => u !== cover);
      } else {
        if (files.length) {
          const up = await uploadAll(id!, files);
          const ci = Math.min(Math.max(0, coverIndex), up.length - 1);
          cover = up[ci] ?? cover;
          // kapak olanı galeriden çıkar
          eklenecek = up.filter((_, i) => i !== ci);
        }
      }

      const refDoc = doc(veritabani, "urunler", String(id));

      // 1) Metin/kod/renk/kapak alanlarını yaz (listeyi ezme!)
      await updateDoc(refDoc, {
        urunKodu: urunKodu.trim(),
        urunAdi: urunAdi.trim(),
        renk: renk.trim() || null,
        grup: grup.trim() || null,
        adet: Number(adet) || 0,
        aciklama: aciklama.trim() || null,
        kapakResimYolu: cover ?? null
      });

      // 2) Kapak değiştiyse: eski kapağı galeriye EKLE
      if (oldCover && oldCover !== cover) {
        await updateDoc(refDoc, { resimYollari: arrayUnion(oldCover) });
      }

      // 3) Galeriye sadece yeni URL’leri EKLE (var olanlar korunur)
      if (eklenecek.length) {
        await updateDoc(refDoc, { resimYollari: arrayUnion(...eklenecek) });
      }

      // 4) Sunucudan tazele
      await refreshDoc();

      setDurum("Güncellendi.");
      navigate(`/urun/${id}`);
    } catch (e: any) {
      const msg = e?.code?.startsWith?.("storage/") ? storageFriendlyError(e) : (e?.message || "Güncellenemedi.");
      setDurum(msg);
    } finally {
      setYuk(false);
      activeTasks.current = [];
    }
  }

  if (yuk) return <div className="card">Yükleniyor…</div>;

  // 🔹 Tek grid: Kapak + Galeri birlikte
  const tumResimler: Array<{ url: string; tip: "kapak" | "galeri" }> = [
    ...(kapakResimYolu ? [{ url: kapakResimYolu, tip: "kapak" as const }] : []),
    ...galeri.map(u => ({ url: u, tip: "galeri" as const })),
  ];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Ürün Düzenle</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <Link to={`/urun/${id}`}><button className="theme-btn">İptal</button></Link>
          <button onClick={kaydet}>Kaydet</button>
        </div>
      </div>

      <div className="card" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Sol: Metin alanları */}
        <div style={{ display: "grid", gap: 10 }}>
          <input className="input" placeholder="Ürün Kodu *" value={urunKodu} onChange={e => setUrunKodu(e.target.value)} />
          <input className="input" placeholder="Ürün Adı *" value={urunAdi} onChange={e => setUrunAdi(e.target.value)} />

          <div ref={grupKutuRef} className="renk-select-wrap" style={{ position: "relative" }}>
            <button type="button" className="input renk-select-btn" onClick={() => setGrupAcik(a => !a)} title="Grup seç" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, cursor: "pointer" }}>
              <span style={{ opacity: grup ? 1 : 0.7 }}>
                {grup ? grup : "Grup seçin"}
              </span>
              <span aria-hidden>▾</span>
            </button>
            {grupAcik && (
              <div className="renk-menu" role="listbox" style={{ position: "absolute", zIndex: 20, top: "calc(100% + 6px)", left: 0, right: 0, background: "var(--input-bg)", color: "var(--txt)", border: "1px solid var(--panel-bdr)", borderRadius: 10, boxShadow: "0 6px 28px rgba(0,0,0,.18)", maxHeight: 240, overflow: "auto" }}>
                <div className="renk-item" role="option" onClick={() => { setGrup(""); setGrupAcik(false); }} style={{ padding: "10px 12px", cursor: "pointer", fontSize: 14, borderBottom: "1px solid var(--panel-bdr)", opacity: .9 }}>
                  (Seçimi temizle)
                </div>
                {gruplar.map((g) => (
                  <div key={g.id} className="renk-item" role="option" aria-selected={grup === g.ad} onClick={() => { setGrup(g.ad); setGrupAcik(false); }} style={{ padding: "10px 12px", cursor: "pointer", fontSize: 14, background: grup === g.ad ? "color-mix(in oklab, var(--ana) 14%, var(--input-bg))" : "transparent" }} onMouseEnter={(e) => (e.currentTarget.style.background = "color-mix(in oklab, var(--ana) 10%, var(--input-bg))")} onMouseLeave={(e) => (e.currentTarget.style.background = grup === g.ad ? "color-mix(in oklab, var(--ana) 14%, var(--input-bg))" : "transparent")}>
                    {g.ad}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div ref={renkKutuRef} className="renk-select-wrap" style={{ position: "relative" }}>
            <button
              type="button"
              className="input renk-select-btn"
              onClick={() => setRenkAcik(a => !a)}
              title="Renk seç"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                cursor: "pointer",
              }}
            >
              <span style={{ opacity: renk ? 1 : 0.7 }}>
                {renk ? renk : "Renk seçin"}
              </span>
              <span aria-hidden>▾</span>
            </button>

            {renkAcik && (
              <div
                className="renk-menu"
                role="listbox"
                style={{
                  position: "absolute",
                  zIndex: 20,
                  top: "calc(100% + 6px)",
                  left: 0,
                  right: 0,
                  background: "var(--input-bg)",
                  color: "var(--txt)",
                  border: "1px solid var(--panel-bdr)",
                  borderRadius: 10,
                  boxShadow: "0 6px 28px rgba(0,0,0,.18)",
                  maxHeight: 240,
                  overflow: "auto",
                }}
              >
                <div
                  className="renk-item"
                  role="option"
                  onClick={() => { setRenk(""); setRenkAcik(false); }}
                  style={{
                    padding: "10px 12px",
                    cursor: "pointer",
                    fontSize: 14,
                    borderBottom: "1px solid var(--panel-bdr)",
                    opacity: .9
                  }}
                >
                  (Seçimi temizle)
                </div>

                {renkler.map((r) => (
                  <div
                    key={r.id}
                    className="renk-item"
                    role="option"
                    aria-selected={renk === r.ad}
                    onClick={() => { setRenk(r.ad); setRenkAcik(false); }}
                    style={{
                      padding: "10px 12px",
                      cursor: "pointer",
                      fontSize: 14,
                      background: renk === r.ad ? "color-mix(in oklab, var(--ana) 14%, var(--input-bg))" : "transparent"
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "color-mix(in oklab, var(--ana) 10%, var(--input-bg))")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = renk === r.ad ? "color-mix(in oklab, var(--ana) 14%, var(--input-bg))" : "transparent")}
                  >
                    {r.ad}
                  </div>
                ))}
              </div>
            )}
          </div>

          <input
            className="input"
            type="number"
            placeholder="Adet"
            value={String(adet)}
            onChange={e => setAdet(Number(e.target.value))}
          />
          <textarea className="input" placeholder="Açıklama" value={aciklama} onChange={e => setAciklama(e.target.value)} style={{ minHeight: 120 }} />
        </div>

        {/* Sağ: Görseller */}
        <div style={{ display: "grid", gap: 12 }}>
          {/* 🔹 TEK GRID: Kapak + Galeri */}
          <div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 6 }}>Mevcut Görseller</div>
            {tumResimler.length ? (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {tumResimler.map(({ url, tip }, i) => (
                  <div
                    key={i}
                    style={{ position: "relative" }}
                    onDoubleClick={() => kapaYap(url)} // çift tık = kapak yap
                    title={tip === "kapak" ? "Kapak" : "Çift tıkla kapak yap"}
                  >
                    <img
                      src={url}
                      alt=""
                      style={{
                        width: 120, height: 90, objectFit: "cover", borderRadius: 8,
                        border: tip === "kapak" ? "2px solid var(--ana)" : "1px solid var(--panel-bdr)",
                        cursor: "pointer",
                        userSelect: "none"
                      }}
                    />
                    {tip === "kapak" && (
                      <span style={{ position: "absolute", left: 6, top: 6, fontSize: 12, padding: "0 6px", borderRadius: 6, background: "var(--ana)", color: "#0b1020" }}>
                        Kapak
                      </span>
                    )}
                    <button
                      className="theme-btn"
                      style={{ position: "absolute", top: 6, right: 6, padding: "2px 6px", fontSize: 12 }}
                      onClick={() => resmiSil(url, tip)}
                      type="button"
                      title="Resmi sil (Storage + Firestore)"
                    >
                      Sil
                    </button>
                  </div>
                ))}
              </div>
            ) : <div style={{ opacity: .7 }}>Görsel yok</div>}
          </div>

          {/* MOD SEÇİMİ */}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className="theme-btn"
              onClick={() => setImgMode("upload")}
              style={{ border: imgMode === "upload" ? "2px solid var(--ana)" : "1px solid var(--panel-bdr)" }}
            >
              Yükle (Sürükle-Bırak)
            </button>
            <button
              type="button"
              className="theme-btn"
              onClick={() => setImgMode("url")}
              style={{ border: imgMode === "url" ? "2px solid var(--ana)" : "1px solid var(--panel-bdr)" }}
            >
              URL ile
            </button>
          </div>

          {/* ---- YÜKLE modu ---- */}
          {imgMode === "upload" && (
            <div style={{ display: "grid", gap: 10 }}>
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                style={{
                  border: `2px dashed ${dragOver ? "var(--ana)" : "var(--panel-bdr)"}`,
                  borderRadius: 12,
                  padding: 16,
                  textAlign: "center",
                  background: dragOver ? "color-mix(in oklab, var(--ana) 12%, transparent)" : "transparent",
                  cursor: "pointer",
                }}
                onClick={() => document.getElementById("editFilePickHidden")?.click()}
              >
                <div style={{ fontSize: 14, opacity: .9 }}>
                  Görselleri buraya <b>sürükleyin</b> veya <u>tıklayıp seçin</u>
                </div>
                <input
                  id="editFilePickHidden"
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => handleFileInput(e.target.files)}
                />
              </div>

              {files.length > 0 && (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {files.map((f, i) => {
                    const url = URL.createObjectURL(f);
                    const isCover = i === coverIndex;
                    return (
                      <div key={i} style={{ position: "relative" }}>
                        <img
                          src={url}
                          alt=""
                          style={{
                            width: 100, height: 76, objectFit: "cover", borderRadius: 10,
                            outline: isCover ? "3px solid var(--ana)" : "1px solid var(--panel-bdr)"
                          }}
                        />
                        <button
                          type="button"
                          className="theme-btn"
                          onClick={() => setCoverIndex(i)}
                          style={{
                            position: "absolute", top: 4, left: 4, padding: "2px 6px", fontSize: 12,
                            background: isCover ? "var(--ana)" : "rgba(0,0,0,0.35)",
                            color: isCover ? "#0b1020" : "var(--txt)"
                          }}
                          title="Kapağı işaretle"
                        >
                          {isCover ? "★" : "☆"}
                        </button>
                        <button
                          type="button"
                          className="theme-btn"
                          onClick={() => removeFile(i)}
                          style={{ position: "absolute", top: 4, right: 4, padding: "2px 6px", fontSize: 12 }}
                          title="Kaldır"
                        >
                          Sil
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {progress > 0 && progress < 100 && (
                <div style={{ fontSize: 12 }}>Yükleniyor: %{progress}</div>
              )}
            </div>
          )}

          {/* ---- URL modu ---- */}
          {imgMode === "url" && (
            <div style={{ display: "grid", gap: 8 }}>
              <input
                className="input"
                placeholder="Kapak Resim URL (opsiyonel — doldurursan kapağı değiştirir)"
                value={kapakUrl}
                onChange={(e) => setKapakUrl(e.target.value)}
              />
              <input
                className="input"
                placeholder="Diğer resim URL’leri (virgülle ayrılmış, mevcut galeriye eklenir)"
                value={digerUrlMetni}
                onChange={(e) => setDigerUrlMetni(e.target.value)}
              />
            </div>
          )}
        </div>
      </div>

      {durum && <div style={{ opacity: .9 }}>{durum}</div>}
    </div>
  );
}

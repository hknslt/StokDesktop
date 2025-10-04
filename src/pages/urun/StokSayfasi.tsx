// src/sayfalar/StokSayfasi.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
    collection, doc, getDocs, limit, onSnapshot, orderBy, query,
    serverTimestamp, setDoc
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { veritabani, depolama } from "../../firebase";
import { Link, useNavigate } from "react-router-dom";
import { stokPdfIndir } from "../../pdf/stokPdf";

type Urun = {
    id: number;
    urunAdi: string;
    urunKodu: string;
    adet: number;
    renk?: string;
    aciklama?: string;
    kapakResimYolu?: string | null;
    resimYollari?: string[];
    createdAt?: any;
};

// 🔹 Renk doküman tipi
type RenkDoc = { id: string; ad: string; adLower?: string | null };

function parseResimYollari(val: any): string[] | undefined {
    if (!val) return undefined;
    if (Array.isArray(val)) return val.filter(Boolean);
    if (typeof val === "object") return Object.values(val).map(String).filter(Boolean);
    if (typeof val === "string") return val.split(",").map(s => s.trim()).filter(Boolean);
    return undefined;
}
const safeRand = (len = 8) => {
    try {
        const u8 = new Uint8Array(len);
        crypto.getRandomValues(u8);
        return Array.from(u8).map(b => b.toString(16).padStart(2, "0")).join("");
    } catch {
        return Math.random().toString(16).slice(2) + Date.now().toString(16);
    }
};
function storageHataMesaji(e: any): string {
    const code = e?.code || "";
    if (code.includes("storage/unauthorized")) return "Depolama izni yok (Storage Rules).";
    if (code.includes("storage/unauthenticated")) return "Oturum yok. Giriş yapın.";
    if (code.includes("storage/bucket-not-found")) return "Storage etkin değil veya bucket yanlış.";
    if (code.includes("storage/retry-limit-exceeded")) return "Ağ hatası (tekrar limitine takıldı).";
    if (code.includes("storage/canceled")) return "Yükleme iptal edildi.";
    return e?.message || `Depolama hatası: ${code || "bilinmiyor"}`;
}

type ImageMode = "url" | "upload";

export default function StokSayfasi() {
    const navigate = useNavigate();

    // Liste
    const [urunler, setUrunler] = useState<Urun[]>([]);
    const [ara, setAra] = useState("");

    // 🔽 sıralama & stok filtresi
    const [sirala, setSirala] = useState<"az" | "za">("az");
    const [sifirStok, setSifirStok] = useState(false);

    // Form alanları
    const [urunAdi, setUrunAdi] = useState("");
    const [urunKodu, setUrunKodu] = useState("");
    const [adet, setAdet] = useState<number>(0);
    const [renk, setRenk] = useState(""); // 🔸 seçilen/yazılan renk
    const [aciklama, setAciklama] = useState("");

    // 🔹 Firestore’dan renkler
    const [renkler, setRenkler] = useState<RenkDoc[]>([]);

    // Görsel ekleme modu
    const [imgMode, setImgMode] = useState<ImageMode>("upload");

    // URL modu alanları
    const [kapakUrl, setKapakUrl] = useState("");
    const [digerUrlMetni, setDigerUrlMetni] = useState("");

    // Yükleme modu: tek dropzone ve çoklu dosya
    const [files, setFiles] = useState<File[]>([]);
    const [coverIndex, setCoverIndex] = useState<number>(0);
    const [dragOver, setDragOver] = useState(false);

    // Yükleme / durum
    const [yuk, setYuk] = useState(false);
    const [durum, setDurum] = useState<string | null>(null);
    const [progress, setProgress] = useState(0);
    const aktifTasklar = useRef<ReturnType<typeof uploadBytesResumable>[]>([]);

    // Renk açılır liste kontrolü
    const [renkAcik, setRenkAcik] = useState(false);
    const renkKutuRef = useRef<HTMLDivElement | null>(null);

    // Dışarı tıklayınca kapat
    useEffect(() => {
        function kapat(e: MouseEvent) {
            if (!renkKutuRef.current) return;
            if (!renkKutuRef.current.contains(e.target as Node)) {
                setRenkAcik(false);
            }
        }
        document.addEventListener("mousedown", kapat);
        return () => document.removeEventListener("mousedown", kapat);
    }, []);


    // 🔸 Ürünleri canlı oku
    useEffect(() => {
        const qy = query(collection(veritabani, "urunler"), orderBy("id", "asc"));
        return onSnapshot(qy, (snap) => {
            const list: Urun[] = snap.docs.map((d) => {
                const x = d.data() as any;
                return {
                    id: Number(x.id ?? Number(d.id)),
                    urunAdi: String(x.urunAdi ?? ""),
                    urunKodu: String(x.urunKodu ?? ""),
                    adet: Number(x.adet ?? 0),
                    renk: x.renk ?? undefined,
                    aciklama: x.aciklama ?? undefined,
                    kapakResimYolu: x.kapakResimYolu ?? undefined,
                    resimYollari: parseResimYollari(x.resimYollari),
                    createdAt: x.createdAt,
                };
            });
            setUrunler(list);
        });
    }, []);

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

    // Filtre + sıralama
    const filtreli = useMemo(() => {
        let list = urunler.slice();
        if (sifirStok) list = list.filter((u) => Number(u.adet || 0) <= 0);

        const q = ara.trim().toLowerCase();
        if (q) {
            list = list.filter((u) =>
                [u.urunAdi, u.urunKodu, u.renk, u.aciklama]
                    .filter(Boolean)
                    .map((s) => String(s).toLowerCase())
                    .some((s) => s.includes(q))
            );
        }

        list.sort((a, b) => a.urunAdi.localeCompare(b.urunAdi, "tr", { sensitivity: "base" }));
        if (sirala === "za") list.reverse();

        return list;
    }, [urunler, ara, sifirStok, sirala]);

    // ID üret
    async function getNextNumericId(): Promise<number> {
        const qy = query(collection(veritabani, "urunler"), orderBy("id", "desc"), limit(1));
        const snap = await getDocs(qy);
        if (snap.empty) return 1;
        const top = snap.docs[0];
        const topId = Number((top.data() as any).id ?? Number(top.id) ?? 0);
        return (isNaN(topId) ? 0 : topId) + 1;
    }

    function handleFileInput(fs: FileList | null) {
        if (!fs || !fs.length) return;
        const arr = Array.from(fs);
        const ok = arr.filter((f) => f.type.startsWith("image/") && f.size <= 10 * 1024 * 1024);
        if (ok.length !== arr.length) {
            setDurum("Sadece resim ve en fazla 10MB kabul edilir.");
        }
        const yeni = [...files, ...ok];
        setFiles(yeni);
        if (yeni.length && coverIndex >= yeni.length) setCoverIndex(0);
    }

    function onDrop(e: React.DragEvent) {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
        handleFileInput(e.dataTransfer.files);
    }

    function removeFile(ix: number) {
        const yeni = files.filter((_, i) => i !== ix);
        setFiles(yeni);
        if (coverIndex === ix) setCoverIndex(0);
        else if (coverIndex > ix) setCoverIndex((c) => c - 1);
    }

    function uploadFileWithTimeout(
        file: File,
        path: string,
        onOneProgress?: (p: number) => void,
        ms = 60_000
    ): Promise<string> {
        return new Promise((resolve, reject) => {
            try {
                const r = ref(depolama, path);
                const task = uploadBytesResumable(r, file);
                aktifTasklar.current.push(task);

                const t = setTimeout(() => {
                    try { task.cancel(); } catch { }
                    reject(new Error("Yükleme zaman aşımı (60sn). Storage/bucket/rules kontrol edin."));
                }, ms);

                task.on(
                    "state_changed",
                    (snap) => {
                        const p = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
                        onOneProgress?.(p);
                    },
                    (err) => { clearTimeout(t); reject(err); },
                    async () => { clearTimeout(t); resolve(await getDownloadURL(task.snapshot.ref)); }
                );
            } catch (e) { reject(e as any); }
        });
    }

    async function uploadAll(docId: string, fs: File[]): Promise<string[]> {
        if (!fs.length) return [];
        let tamamlanan = 0;
        setProgress(0);
        const urls: string[] = [];
        for (let i = 0; i < fs.length; i++) {
            const f = fs[i];
            const url = await uploadFileWithTimeout(
                f,
                `urunler/${docId}/resimler/${Date.now()}-${i}-${safeRand()}-${f.name}`,
                () => {
                    tamamlanan += 1;
                    setProgress(Math.round((tamamlanan / fs.length) * 100));
                }
            );
            urls.push(url);
        }
        setProgress(100);
        return urls;
    }

    function iptalEt() {
        for (const t of aktifTasklar.current) { try { t.cancel(); } catch { } }
        aktifTasklar.current = [];
        setYuk(false);
        setDurum("Yükleme iptal edildi.");
        setProgress(0);
    }

    function formuTemizle() {
        setUrunAdi(""); setUrunKodu(""); setAdet(0); setRenk(""); setAciklama("");
        setKapakUrl(""); setDigerUrlMetni("");
        setFiles([]); setCoverIndex(0); setProgress(0);
    }

    const kaydet = async () => {
        if (!urunAdi.trim() || !urunKodu.trim()) {
            setDurum("Ürün adı ve ürün kodu zorunludur.");
            return;
        }
        if (adet < 0) { setDurum("Adet 0 veya daha büyük olmalıdır."); return; }

        try {
            setYuk(true); setDurum(null); setProgress(0); aktifTasklar.current = [];
            const nextId = await getNextNumericId();
            const docId = String(nextId);

            let kapakURL: string | null = null;
            let digerURLler: string[] = [];

            if (imgMode === "url") {
                const urls = (digerUrlMetni || "")
                    .split(",")
                    .map(s => s.trim())
                    .filter(Boolean);
                kapakURL = kapakUrl.trim() || null;
                digerURLler = urls;
            } else {
                if (files.length) {
                    try {
                        const uploaded = await uploadAll(docId, files);
                        const ci = Math.min(Math.max(0, coverIndex), uploaded.length - 1);
                        kapakURL = uploaded[ci] ?? null;
                        digerURLler = uploaded.filter((_, i) => i !== ci);
                    } catch (e: any) {
                        console.error("UPLOAD HATASI:", e);
                        setDurum(storageHataMesaji(e));
                    }
                }
            }

            const payload: any = {
                id: nextId,
                urunAdi: urunAdi.trim(),
                urunKodu: urunKodu.trim(),
                adet: Number(adet) || 0,
                renk: renk.trim() || null, // 🔸 buraya seçilen renk
                aciklama: aciklama.trim() || null,
                kapakResimYolu: kapakURL || null,
                resimYollari: digerURLler.length ? digerURLler : null,
                createdAt: serverTimestamp(),
            };

            await setDoc(doc(veritabani, "urunler", docId), payload);
            formuTemizle();
            setDurum("Ürün oluşturuldu.");
            navigate(`/urun/${docId}`);
        } catch (e: any) {
            console.error("KAYDET HATASI:", e?.code, e?.message);
            const msg = e?.code?.startsWith?.("storage/") ? storageHataMesaji(e) : (e?.message || "Ürün kaydedilemedi.");
            setDurum(msg);
        } finally {
            setYuk(false);
            aktifTasklar.current = [];
        }
    };

    return (
        <div style={{ display: "grid", gap: 16 }}>
            {/* Başlık + Arama + Filtre/Sıralama */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <h2 style={{ margin: 0, flex: "0 0 auto" }}>Stok</h2>

                <input
                    className="input"
                    placeholder="Ara (ad, kod, renk...)"
                    value={ara}
                    onChange={(e) => setAra(e.target.value)}
                    style={{ maxWidth: 320 }}
                />

                {/* Stoğu olmayanlar filtresi */}
                <label className="cek-kutu" style={{ userSelect: "none" }}>
                    <input
                        type="checkbox"
                        checked={sifirStok}
                        onChange={(e) => setSifirStok(e.target.checked)}
                    />
                    <span>Stokta olmayanlar</span>
                </label>

                <button
                    className="theme-btn"
                    type="button"
                    onClick={() => setSirala(s => (s === "az" ? "za" : "az"))}
                    title="Ada göre sırala"
                >
                    {sirala === "az" ? "A → Z" : "Z → A"}
                </button>

                <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                    <button
                        className="theme-btn"
                        onClick={() => {
                            stokPdfIndir(
                                filtreli.map(u => ({
                                    urunAdi: u.urunAdi,
                                    urunKodu: u.urunKodu,
                                    renk: u.renk ?? "",
                                    adet: Number(u.adet || 0)
                                })),
                                { baslik: "STOK LİSTESİ" }
                            );
                        }}
                    >
                        PDF indir
                    </button>

                    <Link to="/stok/duzenle">
                        <button>Stok Düzenle</button>
                    </Link>
                </div>
            </div>

            {/* Yeni Ürün */}
            <div className="card">
                <h3 style={{ marginTop: 0 }}>Yeni Ürün</h3>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 12 }}>
                    <input className="input" placeholder="Ürün Adı *" value={urunAdi} onChange={(e) => setUrunAdi(e.target.value)} disabled={yuk} />
                    <input className="input" placeholder="Ürün Kodu *" value={urunKodu} onChange={(e) => setUrunKodu(e.target.value)} disabled={yuk} />

                    {/* 🔹 Renk: sadece listeden seçilecek, yazılamaz */}
                    <div
                        ref={renkKutuRef}
                        className="renk-select-wrap"
                        style={{ position: "relative" }}
                    >
                        <button
                            type="button"
                            className="input renk-select-btn"
                            onClick={() => setRenkAcik((a) => !a)}
                            disabled={yuk}
                            title="Renk seç"
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 8,
                                cursor: "pointer"
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
                                    overflow: "auto"
                                }}
                            >
                                {/* İsteğe bağlı: temizle */}
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
                        placeholder="Adet"
                        type="number"
                        value={String(adet)}
                        onChange={(e) => setAdet(Number(e.target.value))}
                        disabled={yuk}
                    />
                </div>

                <textarea
                    className="input"
                    placeholder="Açıklama"
                    value={aciklama}
                    onChange={(e) => setAciklama(e.target.value)}
                    style={{ width: "100%", marginTop: 12, minHeight: 90 }}
                    disabled={yuk}
                />

                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
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

                {imgMode === "upload" && (
                    <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                        <div
                            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
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
                            onClick={() => document.getElementById("filePickHidden")?.click()}
                        >
                            <div style={{ fontSize: 14, opacity: .9 }}>
                                Görselleri buraya <b>sürükleyin</b> veya <u>tıklayıp seçin</u>
                            </div>
                            <input
                                id="filePickHidden"
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

                        {yuk && (
                            <div style={{ fontSize: 12 }}>
                                Yükleniyor: %{progress}
                            </div>
                        )}
                    </div>
                )}

                {imgMode === "url" && (
                    <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                        <input
                            className="input"
                            placeholder="Kapak Resim URL (opsiyonel)"
                            value={kapakUrl}
                            onChange={(e) => setKapakUrl(e.target.value)}
                            disabled={yuk}
                        />
                        <input
                            className="input"
                            placeholder="Diğer resim URL'leri (virgülle ayrılmış)"
                            value={digerUrlMetni}
                            onChange={(e) => setDigerUrlMetni(e.target.value)}
                            disabled={yuk}
                        />
                    </div>
                )}

                <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    {yuk && <button className="theme-btn" type="button" onClick={iptalEt}>İptal</button>}
                    <button onClick={kaydet} disabled={yuk || !urunAdi.trim() || !urunKodu.trim()}>
                        {yuk ? "Kaydediliyor…" : "Kaydet"}
                    </button>
                </div>

                {durum && <div style={{ marginTop: 8, opacity: .9 }}>{durum}</div>}
            </div>

            {/* LİSTE — Foto | Ad | Kod | Renk | Adet */}
            <div className="card">
                <h3 style={{ marginTop: 0 }}>Ürünler</h3>
                <div style={{ display: "grid", gap: 8 }}>
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "90px 1.2fr 1fr 1fr 100px",
                            gap: 8,
                            fontSize: 13,
                            color: "var(--muted)",
                        }}
                    >
                        <div>Foto</div>
                        <div>Ad</div>
                        <div>Kod</div>
                        <div>Renk</div>
                        <div>Adet</div>
                    </div>

                    {filtreli.map((u) => (
                        <div
                            key={u.id}
                            onClick={() => navigate(`/urun/${u.id}`)}
                            style={{
                                display: "grid",
                                gridTemplateColumns: "90px 1.2fr 1fr 1fr 100px",
                                gap: 8,
                                alignItems: "center",
                                border: "1px solid var(--panel-bdr)",
                                borderRadius: 10,
                                padding: "8px 10px",
                                cursor: "pointer"
                            }}
                            title={u.aciklama || ""}
                        >
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
                            <div>{u.urunAdi}</div>
                            <div><b>{u.urunKodu}</b></div>
                            <div>{u.renk ?? "-"}</div>
                            <div><b>{u.adet}</b></div>
                        </div>
                    ))}

                    {!filtreli.length && <div>Liste boş.</div>}
                </div>
            </div>
        </div>
    );
}

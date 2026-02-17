// src/pages/siparis/SiparisDuzenle.tsx

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
    doc,
    getDoc,
    collection,
    query,
    orderBy,
    onSnapshot,
    getDocs,
    limit,
    where,
} from "firebase/firestore";
import { veritabani } from "../../firebase";
import {
    guncelleSiparis,
    SiparisModel,
    SiparisSatiri,
    SiparisMusteri,
} from "../../services/SiparisService";
import { Timestamp } from "firebase/firestore";

// --- SiparisOlustur sayfasından alınan hook'lar ve tipler ---
type Urun = { id: number; urunAdi: string; urunKodu: string; renk?: string };
type FiyatListe = { id: string; ad: string; kdv: number };

function useUrunler() {
    const [list, setList] = useState<Urun[]>([]);
    useEffect(() => {
        const qy = query(collection(veritabani, "urunler"), orderBy("id", "asc"));
        return onSnapshot(qy, (snap) => {
            setList(
                snap.docs.map((d) => {
                    const x = d.data() as any;
                    return {
                        id: Number(x.id ?? d.id),
                        urunAdi: String(x.urunAdi ?? ""),
                        urunKodu: String(x.urunKodu ?? ""),
                        renk: x.renk ?? undefined,
                    };
                })
            );
        });
    }, []);
    return list;
}

// --- Düzenleme Sayfası ---
export default function SiparisDuzenle() {
    const { id } = useParams();
    const nav = useNavigate();
    const urunler = useUrunler();

    // --- State'ler ---
    const [yuk, setYuk] = useState(true);
    const [busy, setBusy] = useState(false);

    // Siparişin ana verileri
    const [musteri, setMusteri] = useState<SiparisMusteri | null>(null);
    const [satirlar, setSatirlar] = useState<SiparisSatiri[]>([]);
    const [aciklama, setAciklama] = useState("");
    const [kdvOrani, setKdvOrani] = useState(0);
    const [islemTarih, setIslemTarih] = useState(""); // YYYY-MM-DD

    // Fiyat listesi ve ürün seçici için state'ler
    const [listeler, setListeler] = useState<FiyatListe[]>([]);
    const [listeId, setListeId] = useState<string>("");
    const [fiyatUygulaniyor, setFiyatUygulaniyor] = useState(false);
    const [urunPicker, setUrunPicker] = useState(false);
    const [urunAra, setUrunAra] = useState("");

    // ==========================================
    // --- ÖZEL MODAL (ALERT/CONFIRM) YAPISI ---
    // ==========================================
    const [modal, setModal] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        isConfirm: boolean;
        onConfirm?: () => void;
        onClose?: () => void; // Yönlendirmeler için eklendi
    }>({
        isOpen: false,
        title: "",
        message: "",
        isConfirm: false,
    });

    const showAlert = (message: string, title = "Bilgi", onClose?: () => void) => {
        setModal({ isOpen: true, title, message, isConfirm: false, onClose });
    };

    const closeModal = () => {
        setModal(prev => ({ ...prev, isOpen: false }));
    };
    // ==========================================

    // --- Veri Yükleme ---
    useEffect(() => {
        if (!id) return;
        (async () => {
            const snap = await getDoc(doc(veritabani, "siparisler", id));
            if (snap.exists()) {
                const data = snap.data() as SiparisModel;

                // Düzenlemeye sadece bu durumlarda izin ver
                if (data.durum !== "beklemede" && data.durum !== "uretimde") {
                    setYuk(false); // Önce yüklemeyi kapatıyoruz ki modal görünebilsin
                    showAlert("Bu siparişin durumu düzenlemeye uygun değil.", "Uyarı", () => nav(`/siparis/${id}`));
                    return;
                }

                // --- MÜŞTERİ BİLGİSİNİ GÜNCELLEME KISMI ---
                let guncelMusteriData = data.musteri;
                const mIdStr = data.musteri?.id;

                if (mIdStr) {
                    try {
                        const q = query(collection(veritabani, "musteriler"), where("idNum", "==", Number(mIdStr)));
                        const mSnap = await getDocs(q);

                        if (!mSnap.empty) {
                            const liveData = mSnap.docs[0].data();
                            guncelMusteriData = {
                                id: mIdStr,
                                firmaAdi: liveData.firmaAdi,
                                yetkili: liveData.yetkili,
                                telefon: liveData.telefon,
                                adres: liveData.adres
                            };
                        }
                    } catch (error) {
                        console.error("Müşteri güncel verisi çekilemedi, eski veri kullanılıyor.", error);
                    }
                }
                setMusteri(guncelMusteriData);
                // ---------------------------------------------------

                setSatirlar(data.urunler || []);
                setAciklama(data.aciklama || "");
                setKdvOrani(data.kdvOrani || 0);

                if (data.islemeTarihi && data.islemeTarihi instanceof Timestamp) {
                    const date = data.islemeTarihi.toDate();
                    const formattedDate = date.toISOString().split('T')[0];
                    setIslemTarih(formattedDate);
                }

            } else {
                setYuk(false);
                showAlert("Sipariş bulunamadı.", "Hata", () => nav("/siparisler"));
                return;
            }
            setYuk(false);
        })();
    }, [id, nav]);

    // Fiyat listelerini çek
    useEffect(() => {
        (async () => {
            const qy = query(
                collection(veritabani, "fiyatListeleri"),
                orderBy("createdAt", "desc"),
                limit(50)
            );
            const snap = await getDocs(qy);
            const arr = snap.docs.map((d) => {
                const x = d.data() as any;
                return { id: d.id, ad: String(x.ad ?? d.id), kdv: Number(x.kdv ?? 0) };
            });
            setListeler(arr);
            if (arr[0]) setListeId(arr[0].id);
        })();
    }, []);

    // --- Hesaplamalar ---
    const netToplam = useMemo(() =>
        satirlar.reduce((t, s) => t + (Number(s.adet) || 0) * (Number(s.birimFiyat) || 0), 0),
        [satirlar]
    );
    const kdvTutar = useMemo(() => Math.round(netToplam * kdvOrani) / 100, [netToplam, kdvOrani]);
    const brutToplam = useMemo(() => netToplam + kdvTutar, [netToplam, kdvTutar]);

    // --- Fonksiyonlar ---

    const filtreliUrunler = useMemo(() => {
        const q = urunAra.trim().toLowerCase();
        if (!q) return urunler;
        return urunler.filter((u) =>
            [u.urunAdi, u.urunKodu, u.renk]
                .filter(Boolean)
                .map(String)
                .map((s) => s.toLowerCase())
                .some((s) => s.includes(q))
        );
    }, [urunler, urunAra]);

    async function fiyatGetir(urunId: number, fListeId: string) {
        if (!fListeId) return 0;
        try {
            const snap = await getDoc(
                doc(veritabani, "fiyatListeleri", fListeId, "urunFiyatlari", String(urunId))
            );
            return Number(snap.data()?.netFiyat ?? 0);
        } catch {
            return 0;
        }
    }

    async function fiyatlariUygula() {
        if (!listeId || !satirlar.length) return;
        try {
            setFiyatUygulaniyor(true);
            const uniqIds = Array.from(new Set(satirlar.map(s => Number(s.id))));
            const idFiyatPairs = await Promise.all(
                uniqIds.map(async (urunId) => [urunId, await fiyatGetir(urunId, listeId)] as const)
            );
            const fiyatMap = new Map<number, number>(idFiyatPairs);

            setSatirlar((arr) =>
                arr.map((s) => ({
                    ...s,
                    birimFiyat: fiyatMap.get(Number(s.id)) ?? s.birimFiyat,
                }))
            );

            const seciliListe = listeler.find(l => l.id === listeId);
            if (seciliListe) {
                setKdvOrani(seciliListe.kdv);
            }

        } finally {
            setFiyatUygulaniyor(false);
        }
    }

    async function urunSec(urunId: number) {
        const u = urunler.find((x) => x.id === urunId);
        if (!u) return;
        const birimFiyat = await fiyatGetir(urunId, listeId);
        setSatirlar((s) => [
            ...s,
            {
                id: String(urunId),
                urunAdi: u.urunAdi,
                renk: u.renk,
                adet: 1,
                birimFiyat: birimFiyat,
            },
        ]);
        setUrunPicker(false);
        setUrunAra("");
    }

    function satirSil(i: number) {
        setSatirlar((s) => s.filter((_, idx) => idx !== i));
    }

    // --- Kaydetme İşlemi ---
    async function handleGuncelle() {
        if (!id || !musteri || satirlar.length === 0 || busy) return;

        setBusy(true);
        try {
            await guncelleSiparis(id, {
                urunler: satirlar,
                aciklama,
                netTutar: netToplam,
                kdvOrani: kdvOrani,
                kdvTutar: kdvTutar,
                brutTutar: brutToplam,
                islemeTarihi: islemTarih ? Timestamp.fromDate(new Date(islemTarih)) : undefined
            });
            // Güncellemeden sonra modalı gösterip "Tamam" dendiğinde yönlendir
            showAlert("Sipariş başarıyla güncellendi.", "Başarılı", () => nav(`/siparis/${id}`));
        } catch (error) {
            console.error("Sipariş güncellenirken hata oluştu: ", error);
            showAlert("Sipariş güncellenirken bir hata oluştu.", "Hata");
        } finally {
            setBusy(false);
        }
    }

    if (yuk) return <div className="card">Yükleniyor…</div>;

    return (
        <div style={{ display: "grid", gap: 16 }}>

            {/* Modal'ın sayfa içerikleri görünmezse bile çalışması için yapıyı biraz değiştirdik */}
            {musteri ? (
                <>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <h2 style={{ margin: 0 }}>Siparişi Düzenle</h2>
                        <div style={{ display: "flex", gap: 8 }}>
                            <button className="theme-btn" onClick={() => nav(-1)}>İptal</button>
                            <button disabled={busy || satirlar.length === 0} onClick={handleGuncelle}>
                                {busy ? "Kaydediliyor..." : "Değişiklikleri Kaydet"}
                            </button>
                        </div>
                    </div>

                    {/* Adım 1 — Müşteri */}
                    <div className="card">
                        <h3>Müşteri Bilgileri</h3>
                        <div><b>Firma Adı:</b> {musteri.firmaAdi}</div>
                        <div><b>Yetkili:</b> {musteri.yetkili || "-"}</div>
                        <div><b>Telefon:</b> {musteri.telefon || "-"}</div>
                        <div><b>Adres:</b> {musteri.adres || "-"}</div>
                    </div>

                    {/* Adım 2 — Ürünler */}
                    <div className="card" style={{ display: "grid", gap: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                            <b>Fiyat Listesi:</b>
                            <select className="input" value={listeId} onChange={(e) => setListeId(e.target.value)}>
                                {listeler.map((l) => (
                                    <option key={l.id} value={l.id}>
                                        {l.ad} (KDV %{l.kdv})
                                    </option>
                                ))}
                            </select>
                            <button
                                className="theme-btn"
                                onClick={fiyatlariUygula}
                                disabled={!satirlar.length || !listeId || fiyatUygulaniyor}
                                title="Mevcut satırlara seçili listedeki net fiyatları ve KDV oranını uygula"
                            >
                                {fiyatUygulaniyor ? "Uygulanıyor…" : "Listeyi Uygula"}
                            </button>
                            <div style={{ marginLeft: "auto" }}>
                                <button className="theme-btn" onClick={() => setUrunPicker(true)}>+ Ürün Ekle</button>
                            </div>
                        </div>
                        <div style={{ display: "grid", gap: 8 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 90px 110px 110px 80px", gap: 8, color: "var(--muted)", fontSize: 13 }}>
                                <div>Ürün</div>
                                <div>Renk</div>
                                <div>Adet</div>
                                <div>Net Birim</div>
                                <div>Net Satır</div>
                                <div></div>
                            </div>
                            {satirlar.map((s, i) => (
                                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 120px 90px 110px 110px 80px", gap: 8, alignItems: "center", border: "1px solid var(--panel-bdr)", borderRadius: 10, padding: "6px 8px" }}>
                                    <div><b>{s.urunAdi}</b></div>
                                    <div>{s.renk ? <span className="tag" style={{ padding: "2px 8px", borderRadius: 999 }}>{s.renk}</span> : "—"}</div>
                                    <input className="input" type="number" value={s.adet} onChange={(e) => setSatirlar(arr => arr.map((x, idx) => idx === i ? { ...x, adet: Number(e.target.value) || 0 } : x))} />
                                    <input className="input" type="number" value={s.birimFiyat} onChange={(e) => setSatirlar(arr => arr.map((x, idx) => idx === i ? { ...x, birimFiyat: Number(e.target.value) || 0 } : x))} />
                                    <div>{(s.adet * s.birimFiyat).toLocaleString()}</div>
                                    <button className="theme-btn" onClick={() => satirSil(i)}>Sil</button>
                                </div>
                            ))}
                            {!satirlar.length && <div>Siparişte ürün yok.</div>}
                        </div>
                        <div style={{ display: "flex", gap: 16, justifyContent: "flex-end" }}>
                            <div>Net: <b>{netToplam.toLocaleString()}</b></div>
                            <div>KDV %{kdvOrani}: <b>{kdvTutar.toLocaleString()}</b></div>
                            <div>Brüt: <b>{brutToplam.toLocaleString()}</b></div>
                        </div>
                    </div>

                    {/* Adım 3 — Diğer */}
                    <div className="card" style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 12 }}>
                        <input className="input" type="date" value={islemTarih} onChange={(e) => setIslemTarih(e.target.value)} />
                        <input className="input" placeholder="Açıklama" value={aciklama} onChange={(e) => setAciklama(e.target.value)} />
                    </div>
                </>
            ) : (
                // Eğer veritabanında müşteri bulamazsa burası görünür (Modal hala tetiklenebilir)
                <div className="card">Bekleniyor...</div>
            )}

            {/* Ürün seçici modal */}
            {urunPicker && (
                <div className="modal" onClick={() => setUrunPicker(false)}>
                    <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <b>Ürün Ekle</b>
                            <input
                                className="input"
                                placeholder="Ara (ad/kod/renk)…"
                                value={urunAra}
                                onChange={(e) => setUrunAra(e.target.value)}
                                style={{ marginLeft: "auto" }}
                                autoFocus
                            />
                        </div>
                        <div style={{ marginTop: 8, maxHeight: 360, overflow: "auto", display: "grid", gap: 6 }}>
                            {filtreliUrunler.map((u) => (
                                <button key={u.id} className="list-btn" onClick={() => urunSec(u.id)}>
                                    <div style={{ fontWeight: 700 }}>{u.urunAdi}</div>
                                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                                        {u.urunKodu} {u.renk ? `• ${u.renk}` : ""}
                                    </div>
                                </button>
                            ))}
                            {!filtreliUrunler.length && <div>Sonuç yok.</div>}
                        </div>
                    </div>
                </div>
            )}

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
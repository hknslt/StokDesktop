// src/sayfalar/siparis/KismiSevkiyat.tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { veritabani } from "../../firebase";
import {
    SiparisSatiri,
    SiparisModel,
    urunStokDurumHaritasi,
    siparisBolVeSevkEt,
    guncelleDurum,
    SiparisDurumu,
    StokDurumTipi
} from "../../services/SiparisService";

type SevkSatiri = SiparisSatiri & {
    mevcutStok: number;
    durum: StokDurumTipi;
    sevkAdedi: number;
};

const fmtNum = (n: number) => Number(n || 0).toLocaleString("tr-TR");

const ETIKET: Record<SiparisDurumu, string> = {
    beklemede: "Beklemede", uretimde: "Üretimde", sevkiyat: "Sevkiyat", tamamlandi: "Tamamlandı", reddedildi: "Reddedildi"
};

const PALETTE = {
    red: "#ff5370",
    green: "#c3e88d",
};

export default function KismiSevkiyat() {
    const { id } = useParams();
    const nav = useNavigate();

    const [siparis, setSiparis] = useState<(SiparisModel & { docId: string }) | null>(null);
    const [guncelMusteri, setGuncelMusteri] = useState<any>(null);

    const [sevkListesi, setSevkListesi] = useState<SevkSatiri[]>([]);
    const [yukleniyor, setYukleniyor] = useState(true);
    const [busy, setBusy] = useState(false);
    const [durum, setDurum] = useState("");

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

    // Sipariş ve Stok bilgilerini yükle
    useEffect(() => {
        if (!id) {
            nav("/siparisler");
            return;
        }

        async function veriGetir() {
            setYukleniyor(true);
            try {
                // 1. Siparişi Çek
                const snap = await getDoc(doc(veritabani, "siparisler", id!));
                if (!snap.exists()) {
                    setDurum("Sipariş bulunamadı.");
                    setYukleniyor(false);
                    return;
                }

                const data = snap.data() as SiparisModel;

                if (data.durum !== 'beklemede' && data.durum !== 'uretimde') {
                    setYukleniyor(false);
                    showAlert("Sadece 'Beklemede' veya 'Üretimde' olan siparişler için sevkiyat onayı verilebilir.", "Uyarı", () => nav(`/siparis/${id}`));
                    return;
                }

                const mevcutSiparis = { ...data, docId: id! };
                setSiparis(mevcutSiparis);
                let aktifMusteri = data.musteri;
                const mIdStr = data.musteri?.id;

                if (mIdStr) {
                    try {
                        const q = query(collection(veritabani, "musteriler"), where("idNum", "==", Number(mIdStr)));
                        const mSnap = await getDocs(q);
                        if (!mSnap.empty) {
                            aktifMusteri = mSnap.docs[0].data() as any;
                        }
                    } catch (e) {
                        console.error("Müşteri güncel verisi çekilemedi", e);
                    }
                }
                setGuncelMusteri(aktifMusteri);
                // -----------------------------------------------

                const stokMap = await urunStokDurumHaritasi(mevcutSiparis.urunler);

                const baslangicListesi: SevkSatiri[] = mevcutSiparis.urunler.map(urun => {
                    const detay = stokMap.get(urun.id);
                    const stok = detay?.mevcutStok || 0;
                    const durum = detay?.durum || 'YETERSİZ';
                    const istenen = Number(urun.adet || 0);
                    const varsayilanSevkAdedi = Math.max(0, Math.min(istenen, stok));

                    return {
                        ...urun,
                        mevcutStok: stok,
                        durum: durum,
                        sevkAdedi: varsayilanSevkAdedi,
                    };
                });

                setSevkListesi(baslangicListesi);

            } catch (error: any) {
                setDurum("Veri yüklenirken hata: " + error.message);
            } finally {
                setYukleniyor(false);
            }
        }

        veriGetir();
    }, [id, nav]);

    const handleAdetChange = (urunId: string, yeniSevkAdediStr: string) => {
        setSevkListesi(prevList =>
            prevList.map(item => {
                if (item.id !== urunId) return item;
                const yeniSevkAdedi = parseInt(yeniSevkAdediStr || "0", 10);
                const istenen = Number(item.adet || 0);
                const stok = item.mevcutStok;
                let gecerliAdet = Math.max(0, yeniSevkAdedi);
                gecerliAdet = Math.min(gecerliAdet, istenen);
                gecerliAdet = Math.min(gecerliAdet, stok);
                if (isNaN(gecerliAdet)) { gecerliAdet = 0; }
                return { ...item, sevkAdedi: gecerliAdet };
            })
        );
    };

    const tumunuSec = () => {
        setSevkListesi(prevList =>
            prevList.map(item => ({
                ...item,
                sevkAdedi: Math.max(0, Math.min(Number(item.adet || 0), item.mevcutStok))
            }))
        );
    };

    const tumunuSifirla = () => {
        setSevkListesi(prevList => prevList.map(item => ({ ...item, sevkAdedi: 0 })));
    };

    const { toplamSevkEdilecek, toplamKalan } = useMemo(() => {
        let toplamSevk = 0;
        let toplamKalan = 0;
        for (const item of sevkListesi) {
            const istenen = Number(item.adet || 0);
            const sevk = Number(item.sevkAdedi || 0);
            toplamSevk += sevk;
            toplamKalan += (istenen - sevk);
        }
        return { toplamSevkEdilecek: toplamSevk, toplamKalan: toplamKalan };
    }, [sevkListesi]);

    function onaylaVeBol() {
        if (!siparis) return;

        if (toplamSevkEdilecek === 0 && toplamKalan === 0 && siparis.urunler.length > 0) {
            showAlert("Listede ürün yok veya adetler 0.", "Uyarı");
            return;
        }

        if (toplamSevkEdilecek === 0 && toplamKalan > 0) {
            showConfirm("Hiçbir ürün sevke seçilmedi. Siparişin tamamı 'Üretimde' olarak onaylanacak. Emin misiniz?", async () => {
                setBusy(true);
                setDurum("Sipariş üretime alınıyor...");
                try {
                    await guncelleDurum(siparis.docId, "uretimde", { islemeTarihiniAyarla: true });
                    showAlert("Sipariş üretime alındı.", "Başarılı", () => nav("/siparisler"));
                } catch (e: any) {
                    showAlert("Hata: " + e.message, "Hata");
                    setDurum("Hata: " + e.message);
                } finally {
                    setBusy(false);
                }
            }, "Üretime Al");
            return;
        }

        const onayMesaji = `Bu siparişi bölmek üzeresiniz:\n- ${fmtNum(toplamSevkEdilecek)} adet ürün SEVKİYATA alınacak (Yeni Sipariş).\n- ${fmtNum(toplamKalan)} adet ürün ${toplamKalan > 0 ? "ÜRETİMDE kalacak" : "kaldı (Orijinal sipariş güncellenecek)"}.\n\nOnaylıyor musunuz?`;

        showConfirm(onayMesaji, async () => {
            setBusy(true);
            setDurum("Sipariş bölünüyor ve stoklar güncelleniyor...");
            try {
                const gonderilecekListe: SevkSatiri[] = sevkListesi.map(s => ({
                    id: s.id,
                    urunAdi: s.urunAdi,
                    renk: s.renk,
                    adet: s.adet,
                    birimFiyat: s.birimFiyat,
                    sevkAdedi: s.sevkAdedi,
                    mevcutStok: s.mevcutStok,
                    durum: s.durum
                }));
                await siparisBolVeSevkEt(siparis, gonderilecekListe);
                setDurum("Sipariş başarıyla bölündü!");
                showAlert("İşlem başarılı! \nStoktaki ürünler 'Sevkiyat' durumuna alındı, kalanlar güncellendi.", "Başarılı", () => nav("/siparisler"));
            } catch (error: any) {
                console.error("Sipariş bölme hatası:", error);
                showAlert("Hata: " + error.message, "Hata");
                setDurum("Hata: " + error.message);
            } finally {
                setBusy(false);
            }
        }, "Sevkiyatı Onayla");
    }


    if (yukleniyor) {
        return <div className="card">Sevkiyat listesi hazırlanıyor...</div>;
    }

    if (!siparis) {
        return <div className="card">{durum || "Sipariş bulunamadı."} <Link to="/siparisler">Geri dön</Link></div>;
    }

    return (
        <div style={{ display: "grid", gap: 16, maxWidth: 960, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2 style={{ margin: 0 }}>Sevkiyat</h2>
                <Link to="/siparisler">
                    <button className="theme-btn" disabled={busy}>← İptal</button>
                </Link>
            </div>

            {/* Müşteri Bilgileri Kartı - Güncel Veri Kullanımı */}
            <div className="card" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                    <div>
                        <b>Müşteri:</b> {guncelMusteri?.firmaAdi}
                        {guncelMusteri?.yetkili ? ` • ${guncelMusteri?.yetkili}` : ""}
                    </div>
                    {guncelMusteri?.telefon && (
                        <div><b>Tel:</b> {guncelMusteri.telefon}</div>
                    )}
                    {guncelMusteri?.adres && (
                        <div><b>Adres:</b> {guncelMusteri.adres}</div>
                    )}
                </div>
                <div>
                    <div>
                        <b>Tarih:</b> {siparis.tarih?.toDate?.().toLocaleDateString("tr-TR") || "-"}
                    </div>
                    <div>
                        <b>Durum:</b> <span className={`tag status-${siparis.durum}`}>{ETIKET[siparis.durum as SiparisDurumu]}</span>
                    </div>
                </div>
            </div>

            <div className="card">
                <div style={{ marginBottom: 12, fontSize: 14, opacity: 0.9 }}>
                    Hangi ürünlerin stoktan düşülüp sevk edileceğini seçin. Kalan ürünler bu siparişte "Üretimde" olarak kalmaya devam edecektir.
                </div>

                {/* Başlıklar */}
                <div style={{
                    display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1.2fr", gap: 10,
                    fontSize: 13, color: "var(--muted)", marginBottom: 8, padding: "0 10px",
                }}>
                    <div>Ürün Adı</div>
                    <div style={{ justifySelf: "end" }}>İstenen</div>
                    <div style={{ justifySelf: "end" }}>Stokta</div>
                    <div style={{ justifySelf: "end" }}>Kalan</div>
                    <div style={{ justifySelf: "center" }}>Sevk Adedi</div>
                </div>

                {/* Ürün Listesi */}
                <div style={{ display: "grid", gap: 8 }}>
                    {sevkListesi.map(item => {
                        const istenen = Number(item.adet || 0);
                        const stok = item.mevcutStok;
                        const sevkAdedi = Number(item.sevkAdedi || 0);
                        const kalan = istenen - sevkAdedi;
                        const maxSevk = Math.min(istenen, stok);

                        return (
                            <div key={item.id} style={{
                                display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1.2fr", gap: 10,
                                alignItems: "center",
                                border: "1px solid",
                                borderRadius: 10, padding: "10px",
                                backgroundColor: item.durum === 'YETERLI' ? "var(--yesil-bg, #e8f5e9)"
                                    : item.durum === 'KRITIK' ? "var(--sari-bg, #fffde7)"
                                        : item.durum === 'YETERSİZ' ? "var(--kirmizi-bg, #ffebee)"
                                            : "transparent",
                                borderColor: item.durum === 'YETERLI' ? "var(--yesil, #4caf50)"
                                    : item.durum === 'KRITIK' ? "var(--sari, #ffc107)"
                                        : item.durum === 'YETERSİZ' ? "var(--kirmizi, #f44336)"
                                            : "var(--panel-bdr, #ddd)",
                                borderWidth: 2,
                            }}>
                                <div>
                                    <b>{item.urunAdi}</b>
                                    {item.renk && <span style={{ opacity: 0.8 }}> • {item.renk}</span>}
                                </div>
                                <div style={{ justifySelf: "end", fontSize: 16 }}><b>{fmtNum(istenen)}</b></div>
                                <div style={{ justifySelf: "end", fontSize: 16, color: item.durum === 'YETERSİZ' ? PALETTE.red : "inherit" }}>
                                    {fmtNum(stok)}
                                </div>
                                <div style={{ justifySelf: "end", fontSize: 16 }}>{fmtNum(kalan)}</div>
                                <div style={{ justifySelf: "center" }}>
                                    <input
                                        type="number"
                                        className="input"
                                        value={item.sevkAdedi}
                                        onChange={(e) => handleAdetChange(item.id, e.target.value)}
                                        max={maxSevk}
                                        min={0}
                                        disabled={busy}
                                        style={{ width: "80px", textAlign: "center", fontWeight: 700, fontSize: 16 }}
                                    />
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* Kontrol Butonları */}
                <div style={{ display: "flex", gap: 8, marginTop: 12, borderTop: "1px solid var(--panel-bdr)", paddingTop: 12 }}>
                    <button className="theme-btn" onClick={tumunuSec} disabled={busy}>Stoktakileri Tamamla</button>
                    <button className="theme-btn" onClick={tumunuSifirla} disabled={busy}>Tümünü Sıfırla</button>
                </div>

            </div>

            {/* Onay Alanı */}
            <div className="card" style={{ background: "var(--panel-hover)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                    <div style={{ display: "grid", gap: 4 }}>
                        <div style={{ fontSize: 16 }}>Toplam Sevk Edilecek: <b style={{ color: PALETTE.green }}>{fmtNum(toplamSevkEdilecek)} adet</b></div>
                        <div style={{ fontSize: 16 }}>Kalan Sipariş: <b style={{ color: PALETTE.red }}>{fmtNum(toplamKalan)} adet</b></div>
                        {durum && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{durum}</div>}
                    </div>
                    <button
                        onClick={onaylaVeBol}
                        disabled={busy}
                        style={{ padding: "12px 24px", fontSize: 16, fontWeight: 700 }}
                    >
                        {busy ? "İşleniyor..." : (toplamSevkEdilecek > 0 ? "Sevkiyatı Onayla" : "Sadece Üretime Al")}
                    </button>
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
// src/sayfalar/siparis/UretimIhtiyacListesi.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { veritabani } from "../../firebase";

/* ---------- TİPLER ---------- */
type UrunSatiri = { id: string; urunAdi?: string; adet?: number; renk?: string;[key: string]: any }; 
type SiparisRow = {
    docId: string;
    durum: string;
    urunler?: UrunSatiri[];
    musteri?: { firmaAdi?: string; yetkili?: string };
    [key: string]: any;
};

type UrunStok = {
    id: number; 
    urunAdi: string;
    renk?: string;
    adet: number;
};

type SiparisDetayi = {
    musteriAdi: string;
    adet: number;
    siparisId: string;
};

type IhtiyacSatiri = {
    key: string;
    urunAdi: string;
    renk: string;
    toplamIstenen: number;
    mevcutStok: number;
    netIhtiyac: number;
    siparisler: SiparisDetayi[];
};

type SortKey = "netIhtiyacDesc" | "netIhtiyacAsc" | "urunAdiAsc" | "urunAdiDesc" | "istenenDesc";

const fmtNum = (n: number) => Number(n || 0).toLocaleString("tr-TR");

const PALETTE = {
    red: "#ff5370",
    green: "#c3e88d",
    muted: "var(--muted, #a6adbb)",
};

export default function UretimIhtiyacListesi() {
    const [siparisler, setSiparisler] = useState<SiparisRow[]>([]);
    const [urunStoklari, setUrunStoklari] = useState<UrunStok[]>([]);
    const [yukleniyor, setYukleniyor] = useState(true);
    const [acikSatirKey, setAcikSatirKey] = useState<string | null>(null);

    const [siparislerYuklendi, setSiparislerYuklendi] = useState(false);
    const [urunlerYuklendi, setUrunlerYuklendi] = useState(false);

    const [ara, setAra] = useState("");
    const [sirala, setSirala] = useState<SortKey>("netIhtiyacDesc");

    // Siparişleri ve Stokları canlı dinle
    useEffect(() => {
        const qSiparis = query(collection(veritabani, "siparisler"), where("durum", "==", "uretimde"));
        const unsubSiparis = onSnapshot(qSiparis, (snap) => {
            const rows = snap.docs.map(d => ({ ...d.data(), docId: d.id } as SiparisRow));
            setSiparisler(rows);
            setSiparislerYuklendi(true);
        });

        const qUrun = query(collection(veritabani, "urunler"));
        const unsubUrun = onSnapshot(qUrun, (snap) => {
            const list = snap.docs.map(d => d.data() as UrunStok);
            setUrunStoklari(list);
            setUrunlerYuklendi(true);
        });

        return () => {
            unsubSiparis();
            unsubUrun();
        };
    }, []);

    useEffect(() => {
        if (siparislerYuklendi && urunlerYuklendi) {
            setYukleniyor(false);
        }
    }, [siparislerYuklendi, urunlerYuklendi]);

    // GÜNCELLENDİ: Hesaplama mantığı 'urun.id' ve 'renk' bazlı çalışacak şekilde değiştirildi
    const hesaplananListe = useMemo(() => {
        // Adım 1: Stok ve güncel ürün bilgilerini 'id::renk' anahtarıyla haritala
        const stokMap = new Map<string, number>();
        const urunBilgiMap = new Map<string, { urunAdi: string; renk: string }>();

        for (const urun of urunStoklari) {
            const id = String(urun.id); // Siparişlerdeki ID (string) ile eşleşmesi için
            const renkStr = (urun.renk || "").trim();
            const key = `${id}::${renkStr.toLowerCase()}`;

            stokMap.set(key, (stokMap.get(key) || 0) + Number(urun.adet || 0));

            // Ürün adını ve rengini (büyük/küçük harf tutarlı) sakla
            urunBilgiMap.set(key, {
                urunAdi: urun.urunAdi || "(İsimsiz Ürün)",
                renk: renkStr || "—"
            });
        }

        // Adım 2: Siparişlerdeki ihtiyaçları 'id::renk' anahtarıyla topla
        const ihtiyacMap = new Map<string, IhtiyacSatiri>();
        for (const siparis of siparisler) { // Bunlar zaten 'uretimde' olanlar
            const musteriAdi = siparis.musteri?.firmaAdi || siparis.musteri?.yetkili || "(Bilinmeyen Müşteri)";

            for (const urun of (siparis.urunler || [])) {
                const id = (urun.id || "").trim(); // Ürün ID'si (string)
                const eskiAdi = (urun.urunAdi || "").trim(); // Eski (fallback) ad
                const renkStr = (urun.renk || "").trim();
                const renkKey = renkStr.toLowerCase();
                const key = `${id}::${renkKey}`; // YENİ ANAHTAR
                const adet = Number(urun.adet || 0);

                if (adet <= 0 || !id) continue;

                let satir = ihtiyacMap.get(key);
                if (!satir) {
                    satir = {
                        key: key,
                        urunAdi: eskiAdi || "(Bilinmeyen Ürün)", // Güncel ad bulunamazsa bu kullanılacak
                        renk: renkStr || "—",                   // Güncel renk bulunamazsa bu kullanılacak
                        toplamIstenen: 0,
                        mevcutStok: 0,
                        netIhtiyac: 0,
                        siparisler: [],
                    };
                    ihtiyacMap.set(key, satir);
                }

                satir.toplamIstenen += adet;
                satir.siparisler.push({
                    musteriAdi: musteriAdi,
                    adet: adet,
                    siparisId: siparis.docId,
                });
            }
        }

        // Adım 3: İki haritayı birleştir (Stokları ve GÜNCEL adları ekle)
        const liste = Array.from(ihtiyacMap.values());
        for (const item of liste) {
            const key = item.key;
            const mevcutStok = stokMap.get(key) || 0;
            const guncelBilgi = urunBilgiMap.get(key); // Güncel adı ve rengi al

            item.mevcutStok = mevcutStok;
            item.netIhtiyac = item.toplamIstenen - mevcutStok;

            // GÜNCELLEME: Ad ve Rengi 'urunler' koleksiyonundan gelen güncel bilgiyle ez.
            if (guncelBilgi) {
                item.urunAdi = guncelBilgi.urunAdi; // ÇÖZÜM BURADA
                item.renk = guncelBilgi.renk;
            }

            item.siparisler.sort((a, b) => b.adet - a.adet);
        }

        return liste;
    }, [siparisler, urunStoklari]); // Sadece ana veriler değiştiğinde çalışır

    //Filtreleme ve Sıralama (Bu blok aynı kalır, 'hesaplananListe'yi kullanır)
    const filtreliVeSiraliListe = useMemo(() => {
        let list = [...hesaplananListe];
        const q = ara.trim().toLowerCase();

        if (q) {
            list = list.filter(item =>
                item.urunAdi.toLowerCase().includes(q) ||
                item.renk.toLowerCase().includes(q)
            );
        }

        list.sort((a, b) => {
            switch (sirala) {
                case "netIhtiyacAsc":
                    return a.netIhtiyac - b.netIhtiyac;
                case "urunAdiAsc":
                    return a.urunAdi.localeCompare(b.urunAdi, 'tr');
                case "urunAdiDesc":
                    return b.urunAdi.localeCompare(a.urunAdi, 'tr');
                case "istenenDesc":
                    return b.toplamIstenen - a.toplamIstenen;
                case "netIhtiyacDesc":
                default:
                    return b.netIhtiyac - a.netIhtiyac;
            }
        });

        return list;
    }, [hesaplananListe, ara, sirala]); // Arama veya sıralama değiştikçe çalışır

    if (yukleniyor) {
        return <div className="card">Üretim ihtiyaç listesi hesaplanıyor...</div>;
    }

    return (
        <div style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2 style={{ margin: 0 }}>Üretim İhtiyaç Listesi</h2>
                <Link to="/siparisler">
                    <button className="theme-btn">← Geri</button>
                </Link>
            </div>
            {/* Arama ve Sıralama (Aynı kalır) */}
            <div className="card" style={{ padding: "10px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <input
                    type="text"
                    placeholder="Ürün adı veya renge göre ara..."
                    className="input"
                    value={ara}
                    onChange={(e) => setAra(e.target.value)}
                    style={{ flex: 1, minWidth: "240px" }}
                />
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: 'var(--muted)', whiteSpace: 'nowrap' }}>Sırala:</span>
                    <select
                        className="input"
                        value={sirala}
                        onChange={(e) => setSirala(e.target.value as SortKey)}
                    >
                        <option value="netIhtiyacDesc">Net İhtiyaç (En Acil)</option>
                        <option value="netIhtiyacAsc">Net İhtiyaç (Acil Değil)</option>
                        <option value="istenenDesc">Toplam İstenen (Çoktan Aza)</option>
                        <option value="urunAdiAsc">Ürün Adı (A-Z)</option>
                        <option value="urunAdiDesc">Ürün Adı (Z-A)</option>
                    </select>
                </div>
            </div>

            <div className="card">
                <div style={{ marginBottom: 12, fontSize: 14, opacity: 0.9 }}>
                    "Üretimde" durumundaki siparişler için gereken ürünler, anlık stok durumu ve net ihtiyaç listesi:
                </div>

                {/* Liste Başlığı (Aynı kalır) */}
                <div style={{
                    display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 10,
                    fontSize: 13, color: "var(--muted)", marginBottom: 8, padding: "0 10px",
                }}>
                    <div>Ürün Adı</div>
                    <div>Renk</div>
                    <div style={{ justifySelf: "end" }}>Toplam İstenen</div>
                    <div style={{ justifySelf: "end" }}>Mevcut Stok</div>
                    <div style={{ justifySelf: "end" }}>Net İhtiyaç</div>
                </div>

                {/* Liste İçeriği (Aynı kalır, 'filtreliVeSiraliListe'yi kullanır) */}
                <div style={{ display: "grid", gap: 6 }}>
                    {filtreliVeSiraliListe.length > 0 ? (
                        filtreliVeSiraliListe.map((item) => {
                            const netIhtiyacRengi = item.netIhtiyac > 0 ? PALETTE.red : PALETTE.green;
                            const isOpen = acikSatirKey === item.key;

                            return (
                                <React.Fragment key={item.key}>
                                    <div
                                        className="row hoverable"
                                        onClick={() => setAcikSatirKey(isOpen ? null : item.key)}
                                        style={{
                                            display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 10,
                                            alignItems: "center", border: "1px solid var(--panel-bdr)",
                                            borderRadius: 10, padding: "10px", cursor: "pointer",
                                            background: isOpen ? "var(--panel-hover)" : "transparent"
                                        }}
                                    >
                                        <div><b>{item.urunAdi}</b></div>
                                        <div>{item.renk}</div>
                                        <div style={{ justifySelf: "end", fontSize: 16, fontWeight: 700 }}>
                                            {fmtNum(item.toplamIstenen)}
                                        </div>
                                        <div style={{ justifySelf: "end", fontSize: 16, fontWeight: 700 }}>
                                            {fmtNum(item.mevcutStok)}
                                        </div>
                                        <div style={{ justifySelf: "end", fontSize: 16, fontWeight: 700, color: netIhtiyacRengi }}>
                                            {item.netIhtiyac > 0 ? `-${fmtNum(item.netIhtiyac)}` : `+${fmtNum(Math.abs(item.netIhtiyac))}`}
                                        </div>
                                    </div>

                                    {isOpen && (
                                        <div style={{
                                            padding: "8px 16px 16px 48px",
                                            background: "var(--panel-hover)",
                                            borderRadius: "0 0 10px 10px",
                                            marginTop: "-8px",
                                            border: "1px solid var(--panel-bdr)",
                                            borderTop: "none"
                                        }}>
                                            <div style={{
                                                display: "grid", gridTemplateColumns: "1fr auto", gap: 8,
                                                fontSize: 12, color: PALETTE.muted, marginBottom: 6,
                                                borderBottom: "1px solid var(--panel-bdr)", paddingBottom: 4
                                            }}>
                                                <div>Müşteri</div>
                                                <div style={{ justifySelf: "end" }}>İstenen Adet</div>
                                            </div>
                                            <div style={{ display: "grid", gap: 4 }}>
                                                {item.siparisler.map((sip, index) => (
                                                    <Link
                                                        key={index}
                                                        to={`/siparis/${sip.siparisId}`}
                                                        className="hoverable"
                                                        style={{
                                                            display: "grid", gridTemplateColumns: "1fr auto", gap: 8,
                                                            padding: "4px", borderRadius: 4, textDecoration: 'none', color: 'inherit'
                                                        }}
                                                    >
                                                        <div>{sip.musteriAdi}</div>
                                                        <div style={{ justifySelf: "end", fontWeight: 600 }}>{fmtNum(sip.adet)}</div>
                                                    </Link>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </React.Fragment>
                            );
                        })
                    ) : (
                        <div style={{ padding: "10px" }}>
                            {hesaplananListe.length === 0 ? "Üretimde olan sipariş bulunamadı." : "Arama kriterlerine uyan ürün bulunamadı."}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
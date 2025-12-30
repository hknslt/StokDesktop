import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { veritabani } from "../../firebase";

import {
    AktifListe, Grup, SiparisRow, Urun,
    getJSDate, keyOfDate, makeBuckets
} from "./utils/AnalizUtils";
import AnalizTopbar from "./widgets/AnalizTopbar";
import AnalizGrafikler from "./widgets/AnalizGrafikler";
import AnalizTablolar from "./widgets/AnalizTablolar";

export default function Analiz() {
    const [siparisler, setSiparisler] = useState<SiparisRow[]>([]);
    const [urunler, setUrunler] = useState<Urun[]>([]);
    
    const [grup, setGrup] = useState<Grup>("gun");
    const [kombine, setKombine] = useState(true);
    const [aktifListe, setAktifListe] = useState<AktifListe>("satanUrunler");

    // 1. VERİ ÇEKME
    useEffect(() => {
        const qySiparis = query(collection(veritabani, "siparisler"), orderBy("islemeTarihi", "desc"));
        const unsubSiparis = onSnapshot(qySiparis, (snap) => {
            const rows: SiparisRow[] = snap.docs.map((d) => {
                const x = d.data() as any;
                return {
                    docId: d.id,
                    durum: (x.durum || "beklemede"),
                    tarih: x.tarih,
                    islemeTarihi: x.islemeTarihi,
                    brutTutar: Number(x.brutTutar ?? 0),
                    netTutar: Number(x.netTutar ?? 0),
                    kdvTutar: Number(x.kdvTutar ?? 0),
                    urunler: Array.isArray(x.urunler) ? x.urunler : []
                };
            });
            setSiparisler(rows);
        });

        const qyUrun = query(collection(veritabani, "urunler"), orderBy("urunAdi", "asc"));
        const unsubUrun = onSnapshot(qyUrun, (snap) => {
            const list: Urun[] = snap.docs.map((d) => ({
                id: Number(d.data().id ?? d.id),
                urunAdi: String(d.data().urunAdi ?? ""),
                adet: Number(d.data().adet ?? 0),
                grup: d.data().grup ?? undefined
            }));
            setUrunler(list);
        });

        return () => {
            unsubSiparis();
            unsubUrun();
        };
    }, []);

    // 2. HESAPLAMALAR
    const tamamlanan = useMemo(() => siparisler.filter((r) => r.durum === "tamamlandi"), [siparisler]);
    const guncelSiparisler = useMemo(() => siparisler.filter(s => s.durum !== 'tamamlandi' && s.durum !== 'reddedildi'), [siparisler]);
    const buckets = useMemo(() => makeBuckets(grup), [grup]);

    // Grafik Verisi Hesaplama
    const { seri, toplamCiro, toplamSiparis, currentLabel, refText } = useMemo(() => {
        const map = new Map<string, { key: string; label: string; ciro: number; adet: number; date: Date }>();
        for (const b of buckets) map.set(b.key, { key: b.key, label: b.label, ciro: 0, adet: 0, date: b.date });
        
        for (const r of tamamlanan) {
            const d = getJSDate(r.islemeTarihi) || getJSDate(r.tarih);
            if (!d) continue;
            const k = keyOfDate(d, grup);
            const row = map.get(k);
            if (!row) continue;
            row.adet += 1;
            row.ciro += Number(r.brutTutar ?? 0);
        }
        const arr = Array.from(map.values());
        const toplamCiro = arr.reduce((t, x) => t + x.ciro, 0);
        const toplamSiparis = arr.reduce((t, x) => t + x.adet, 0);
        const currentLabel = buckets[buckets.length - 1]?.label;
        const refText = grup === "gun" ? "Şu anki saat" : grup === "hafta" ? "Bugün" : grup === "ay" ? "Bugün" : "Bu ay";
        
        return { seri: arr, toplamCiro, toplamSiparis, currentLabel, refText };
    }, [tamamlanan, buckets, grup]);

    // Tablo: En Çok Satanlar
    const topUrunler = useMemo(() => {
        const m = new Map<string, { urunAdi: string; adet: number; ciro: number }>();
        for (const r of tamamlanan) {
            for (const u of (r.urunler || [])) {
                const ad = (u.urunAdi || "").trim() || "(İsimsiz)";
                const adet = Number(u.adet || 0);
                const ciro = adet * Number(u.birimFiyat || 0);
                const prev = m.get(ad) || { urunAdi: ad, adet: 0, ciro: 0 };
                m.set(ad, { urunAdi: ad, adet: prev.adet + adet, ciro: prev.ciro + ciro });
            }
        }
        const arr = Array.from(m.values()).sort((a, b) => b.adet - a.adet).slice(0, 15);
        const toplamAdet = arr.reduce((t, x) => t + x.adet, 0) || 1;
        return arr.map(x => ({ ...x, pay: x.adet / toplamAdet }));
    }, [tamamlanan]);

    // Tablo: Stok Grupları
    const topGruplar = useMemo(() => {
        const m = new Map<string, { grupAdi: string; adet: number }>();
        for (const u of urunler) {
            const grupAdi = (u.grup || "").trim() || "(Grupsuz)";
            const adet = Number(u.adet || 0);
            const prev = m.get(grupAdi) || { grupAdi, adet: 0 };
            m.set(grupAdi, { grupAdi, adet: prev.adet + adet });
        }
        const arr = Array.from(m.values()).sort((a, b) => b.adet - a.adet);
        const toplamAdet = arr.reduce((t, x) => t + x.adet, 0) || 1;
        return arr.map(x => ({ ...x, pay: x.adet / toplamAdet }));
    }, [urunler]);

    // Tablo: Güncel Sipariş İhtiyacı
    const guncelSiparisGruplari = useMemo(() => {
        const urunGrupMap = new Map<string, string>();
        urunler.forEach(u => urunGrupMap.set(u.urunAdi, u.grup || "(Grupsuz)"));

        const m = new Map<string, { grupAdi: string; adet: number }>();
        for (const r of guncelSiparisler) {
            for (const u of (r.urunler || [])) {
                const ad = (u.urunAdi || "").trim();
                if (!ad) continue;
                const grupAdi = urunGrupMap.get(ad) || "(Bilinmeyen Ürün)";
                const adet = Number(u.adet || 0);
                const prev = m.get(grupAdi) || { grupAdi, adet: 0 };
                m.set(grupAdi, { grupAdi, adet: prev.adet + adet });
            }
        }
        const arr = Array.from(m.values()).sort((a, b) => b.adet - a.adet);
        const toplamAdet = arr.reduce((t, x) => t + x.adet, 0) || 1;
        return arr.map(x => ({ ...x, pay: x.adet / toplamAdet }));
    }, [guncelSiparisler, urunler]);

    return (
        <div style={{ display: "grid", gap: 16 }}>
            <AnalizTopbar
                grup={grup}
                setGrup={setGrup}
                kombine={kombine}
                setKombine={setKombine}
                toplamCiro={toplamCiro}
                toplamSiparis={toplamSiparis}
            />

            <AnalizGrafikler
                data={seri}
                grup={grup}
                kombine={kombine}
                currentLabel={currentLabel}
                refText={refText}
            />

            <AnalizTablolar
                aktifListe={aktifListe}
                setAktifListe={setAktifListe}
                topUrunler={topUrunler}
                topGruplar={topGruplar}
                guncelSiparisGruplari={guncelSiparisGruplari}
            />

            <div style={{ fontSize: 12, color: "var(--muted)" }}>
                Görüntülenen aralık: {grup === "gun" ? "Son 24 saat" : grup === "hafta" ? "Son 7 gün" : grup === "ay" ? "Son 30 gün" : "Son 12 ay"}.
            </div>
        </div>
    );
}
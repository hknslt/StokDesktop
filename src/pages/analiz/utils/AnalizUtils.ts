import { Timestamp } from "firebase/firestore";

// --- TİPLER ---
export type SiparisDurumu = "beklemede" | "uretimde" | "sevkiyat" | "tamamlandi" | "reddedildi";
export type Grup = "gun" | "hafta" | "ay" | "yil";
export type AktifListe = "satanUrunler" | "stokGrup" | "siparisGrup";

export type UrunSatiri = { urunAdi?: string; adet?: number; birimFiyat?: number; renk?: string };

export type SiparisRow = {
    docId: string;
    durum: SiparisDurumu;
    tarih?: Timestamp | Date;
    islemeTarihi?: Timestamp | Date;
    brutTutar?: number;
    netTutar?: number;
    kdvTutar?: number;
    urunler?: UrunSatiri[];
};

export type Urun = {
    id: number;
    urunAdi: string;
    adet: number;
    grup?: string;
};

export type GrafikVerisi = {
    key: string;
    label: string;
    ciro: number;
    adet: number;
    date: Date;
};

// --- SABİTLER ---
export const PALETTE = {
    line: "#7aa2f7",
    lineFrom: "rgba(122,162,247,.35)",
    lineTo: "rgba(122,162,247,.05)",
    bar: "#8bd5ff",
    grid: "rgba(128,128,128,.25)",
    muted: "var(--muted, #a6adbb)",
};

// --- YARDIMCI FONKSİYONLAR ---
export const fmtNum = (n: number) => Number(n || 0).toLocaleString("tr-TR");
export const fmtTL = (n: number) =>
    new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 })
        .format(Number(n || 0));

export const getJSDate = (ts: any) => {
    try { return ts?.toDate?.() ?? (ts instanceof Date ? ts : null); } catch { return null; }
};

const pad = (n: number) => String(n).padStart(2, "0");
const addDays = (d: Date, i: number) => { const x = new Date(d); x.setDate(x.getDate() + i); return x; };
const addHours = (d: Date, i: number) => { const x = new Date(d); x.setHours(x.getHours() + i, 0, 0, 0); return x; };
const addMonths = (d: Date, i: number) => new Date(d.getFullYear(), d.getMonth() + i, 1);
const floorHour = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), 0, 0, 0);
const floorDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const firstOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

export function makeBuckets(grup: Grup) {
    const now = new Date();
    const arr: { key: string; label: string; date: Date }[] = [];

    if (grup === "gun") {
        const end = floorHour(now);
        const start = addHours(end, -23);
        for (let i = 0; i < 24; i++) {
            const d = addHours(start, i);
            const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:00`;
            arr.push({ key, label: `${pad(d.getHours())}:00`, date: d });
        }
    } else if (grup === "hafta") {
        const end = floorDay(now);
        const start = addDays(end, -6);
        for (let i = 0; i < 7; i++) {
            const d = addDays(start, i);
            const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
            arr.push({ key, label: `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, date: d });
        }
    } else if (grup === "ay") {
        const end = floorDay(now);
        const start = addDays(end, -29);
        for (let i = 0; i < 30; i++) {
            const d = addDays(start, i);
            const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
            arr.push({ key, label: `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, date: d });
        }
    } else {
        const m0 = firstOfMonth(now);
        const start = addMonths(m0, -11);
        for (let i = 0; i < 12; i++) {
            const d = addMonths(start, i);
            const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
            arr.push({ key, label: key, date: d });
        }
    }
    return arr;
}

export function keyOfDate(d: Date, grup: Grup): string {
    if (grup === "gun") {
        const x = floorHour(d);
        return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())} ${pad(x.getHours())}:00`;
    }
    if (grup === "hafta" || grup === "ay") {
        const x = floorDay(d);
        return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
    }
    const x = firstOfMonth(d);
    return `${x.getFullYear()}-${pad(x.getMonth() + 1)}`;
}
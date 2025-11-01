// src/services/SiparisService.ts - TAM GÜNCEL HALİ
import {
  addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query,
  serverTimestamp, updateDoc, where, Timestamp, getDoc, getDocs, deleteField
} from "firebase/firestore";
import { veritabani } from "../firebase";
import { decrementStocksIfSufficient, getStocksByNumericIds, iadeStok } from "./UrunService";

// ... (SiparisDurumu, SiparisSatiri vb. tipleriniz aynı kalıyor) ...
export type SiparisDurumu =
  | "beklemede"
  | "uretimde"
  | "sevkiyat"
  | "tamamlandi"
  | "reddedildi";

export type SiparisSatiri = {
  id: string;
  urunAdi: string;
  renk?: string;
  adet: number;
  birimFiyat: number;
};

export type SiparisMusteri = {
  id: string;
  firmaAdi: string;
  yetkili?: string;
  telefon?: string;
  adres?: string;
};

export type SiparisModel = {
  musteri: SiparisMusteri;
  urunler: SiparisSatiri[];
  durum: SiparisDurumu;
  tarih: Timestamp;
  islemeTarihi?: Timestamp;
  aciklama?: string;
  netTutar: number;
  kdvOrani: number;
  kdvTutar: number;
  brutTutar: number;
};

export type StokDurumTipi = 'YETERLI' | 'KRITIK' | 'YETERSİZ';
export type StokDetay = {
  durum: StokDurumTipi;
  mevcutStok: number;
};

// ... (hepsiDinle ve diğer mevcut fonksiyonlarınız aynı kalıyor) ...
export function hepsiDinle(cb: (rows: (SiparisModel & { docId: string })[]) => void) {
  const qy = query(collection(veritabani, "siparisler"), orderBy("tarih", "desc"));
  return onSnapshot(qy, (snap) => {
    cb(snap.docs.map(d => ({ ...(d.data() as any), docId: d.id })));
  });
}

export function dinleDurumaGore(durum: SiparisDurumu, cb: (rows: (SiparisModel & { docId: string })[]) => void) {
  const qy = query(
    collection(veritabani, "siparisler"),
    where("durum", "==", durum),
    orderBy("tarih", "desc"),
  );
  return onSnapshot(qy, (snap) => {
    cb(snap.docs.map(d => ({ ...(d.data() as any), docId: d.id })));
  });
}

export async function ekleSiparis(model: Omit<SiparisModel, "tarih"> & { tarih?: Timestamp }) {
  await addDoc(collection(veritabani, "siparisler"), {
    ...model,
    tarih: model.tarih ?? serverTimestamp(),
  });
}

export async function guncelleSiparis(docId: string, fields: Partial<SiparisModel>) {
  await updateDoc(doc(veritabani, "siparisler", docId), fields as any);
}

export async function silSiparis(docId: string) {
  await deleteDoc(doc(veritabani, "siparisler", docId));
}

export async function guncelleDurum(
  docId: string,
  yeni: SiparisDurumu,
  opts?: { islemeTarihiniAyarla?: boolean; islemeTarihi?: Date }
) {
  await updateDoc(doc(veritabani, "siparisler", docId), {
    durum: yeni,
    ...(opts?.islemeTarihiniAyarla
      ? { islemeTarihi: opts.islemeTarihi ? Timestamp.fromDate(opts.islemeTarihi) : serverTimestamp() }
      : {}),
  } as any);
}

export async function sevkiyataGecir(s: SiparisModel & { docId: string }) {
  const istek: Record<number, number> = {};
  for (const r of s.urunler) {
    const nid = Number(r.id);
    if (!Number.isFinite(nid)) continue;
    istek[nid] = (istek[nid] ?? 0) + Number(r.adet || 0);
  }
  const ok = await decrementStocksIfSufficient(istek);
  if (ok) {
    await guncelleDurum(s.docId, "sevkiyat", { islemeTarihiniAyarla: true });
  } else {
    await guncelleDurum(s.docId, "uretimde");
  }
  return ok;
}

export async function uretimeOnayla(docId: string) {
  await guncelleDurum(docId, "uretimde", { islemeTarihiniAyarla: true });
}

export async function stokYeterlilikHaritasi(rows: (SiparisModel & { docId: string })[]) {
  const ids = new Set<number>();
  rows.forEach(r => r.urunler?.forEach(u => {
    const id = Number(u.id); if (Number.isFinite(id)) ids.add(id);
  }));
  const stok = await getStocksByNumericIds([...ids]);
  const sonuc = new Map<string, boolean>();
  rows.forEach(r => {
    let ok = true;
    const ihtiyac = new Map<number, number>();
    r.urunler?.forEach(u => {
      const id = Number(u.id);
      if (!Number.isFinite(id)) return;
      ihtiyac.set(id, (ihtiyac.get(id) ?? 0) + Number(u.adet || 0));
    });
    for (const [id, n] of ihtiyac) {
      if ((stok.get(id) ?? 0) - n < 0) { ok = false; break; }
    }
    sonuc.set(r.docId, ok);
  });
  return sonuc;
}

export async function reddetVeIade(docId: string): Promise<boolean> {
  const ref = doc(veritabani, "siparisler", docId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return false;

  const s: any = snap.data();
  const durum: SiparisDurumu = s?.durum;
  const satirlar: any[] = Array.isArray(s?.urunler) ? s.urunler : [];

  let iadeYapildi = false;

  if (durum === "sevkiyat" && satirlar.length) {
    const harita: Record<number, number> = {};
    for (const su of satirlar) {
      const idNum = Number.parseInt(String(su.id), 10);
      const adet = Number(su.adet || 0);
      if (Number.isFinite(idNum) && adet > 0) {
        harita[idNum] = (harita[idNum] ?? 0) + adet;
      }
    }
    if (Object.keys(harita).length) {
      await iadeStok(harita);
      iadeYapildi = true;
    }
  }

  await updateDoc(ref, {
    durum: "reddedildi",
    islemeTarihi: serverTimestamp(),
  });

  return iadeYapildi;
}

// ✅ YENİ: Sevkiyattaki siparişi stoğa iade edip bekleme durumuna alan fonksiyon
export async function sevkiyattanGeriCek(docId: string): Promise<boolean> {
  const ref = doc(veritabani, "siparisler", docId);
  const snap = await getDoc(ref);
  if (!snap.exists() || snap.data().durum !== 'sevkiyat') {
    console.error("Sipariş bulunamadı veya sevkiyatta değil.");
    return false;
  }

  const satirlar: SiparisSatiri[] = snap.data().urunler || [];

  // 1. Stokları iade et
  if (satirlar.length > 0) {
    const harita: Record<number, number> = {};
    for (const satir of satirlar) {
      const idNum = Number(satir.id);
      const adet = Number(satir.adet || 0);
      if (Number.isFinite(idNum) && adet > 0) {
        harita[idNum] = (harita[idNum] ?? 0) + adet;
      }
    }
    if (Object.keys(harita).length) {
      await iadeStok(harita);
    }
  }

  // 2. Sipariş durumunu güncelle ve işlem tarihini temizle
  await updateDoc(ref, {
    durum: "beklemede",
    islemeTarihi: deleteField(), // İşlem tarihini siliyoruz
  });

  return true;
}


export async function urunStokDurumHaritasi(
  mevcutSiparisUrunleri: SiparisSatiri[]
): Promise<Map<string, StokDetay>> {
  const sonuc = new Map<string, StokDetay>();
  if (!mevcutSiparisUrunleri?.length) return sonuc;
  // ... (Bu fonksiyonun geri kalanı aynı)
  const q = query(collection(veritabani, "siparisler"), where("durum", "in", ["beklemede", "uretimde"]));
  const tumAktifSiparislerSnap = await getDocs(q);

  const toplamTalep = new Map<number, number>();
  const ilgiliTumUrunIdleri = new Set<number>();

  tumAktifSiparislerSnap.docs.forEach(doc => {
    const urunler = doc.data().urunler as SiparisSatiri[] || [];
    urunler.forEach(u => {
      const idNum = Number(u.id);
      if (!Number.isFinite(idNum)) return;
      ilgiliTumUrunIdleri.add(idNum);
      toplamTalep.set(idNum, (toplamTalep.get(idNum) ?? 0) + Number(u.adet || 0));
    });
  });

  if (ilgiliTumUrunIdleri.size === 0) {
    mevcutSiparisUrunleri.forEach(u => ilgiliTumUrunIdleri.add(Number(u.id)));
  }

  const mevcutStoklar = await getStocksByNumericIds([...ilgiliTumUrunIdleri]);

  mevcutSiparisUrunleri.forEach(u => {
    const idNum = Number(u.id);
    if (!Number.isFinite(idNum)) return;

    const buSiparistekiAdet = Number(u.adet || 0);
    const mevcutStok = mevcutStoklar.get(idNum) ?? 0;
    const tumSiparislerdekiTalep = toplamTalep.get(idNum) || buSiparistekiAdet;

    if (mevcutStok < buSiparistekiAdet) {
      sonuc.set(u.id, { durum: 'YETERSİZ', mevcutStok });
    } else if (mevcutStok < tumSiparislerdekiTalep) {
      sonuc.set(u.id, { durum: 'KRITIK', mevcutStok });
    } else {
      sonuc.set(u.id, { durum: 'YETERLI', mevcutStok });
    }
  });

  return sonuc;
}
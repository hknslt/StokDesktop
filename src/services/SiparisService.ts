
import {
  addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query,
  serverTimestamp, updateDoc, where, Timestamp, getDoc, getDocs, deleteField, runTransaction, limit
} from "firebase/firestore";
import { veritabani } from "../firebase";
import { decrementStocksIfSufficient, getStocksByNumericIds, iadeStok } from "./UrunService";

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
  siparisId?: number;
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

async function sonrakiSiparisId(): Promise<number> {
  const qy = query(collection(veritabani, "siparisler"), orderBy("siparisId", "desc"), limit(1));
  const snap = await getDocs(qy);
  if (snap.empty) return 1001; // İlk sipariş numarası
  const lastId = Number(snap.docs[0].data().siparisId ?? 0);
  return (isFinite(lastId) ? lastId : 0) + 1;
}

export async function ekleSiparis(model: Omit<SiparisModel, "tarih" | "siparisId"> & { tarih?: Timestamp }) {
  const yeniId = await sonrakiSiparisId(); 
  await addDoc(collection(veritabani, "siparisler"), {
    ...model,
    siparisId: yeniId,
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

type SevkSatiri = SiparisSatiri & {
  mevcutStok: number;
  sevkAdedi: number;
};


function tutarlariHesapla(urunListesi: SiparisSatiri[], kdvOrani: number) {
  const netTutar = urunListesi.reduce(
    (t, s) => t + Number(s.adet || 0) * Number(s.birimFiyat || 0), 0
  );
  const kdvTutar = Math.round(netTutar * (kdvOrani || 0)) / 100;
  const brutTutar = netTutar + kdvTutar;
  return { netTutar, kdvTutar, brutTutar };
}

export async function siparisBolVeSevkEt(
  orijinalSiparis: SiparisModel & { docId: string },
  sevkListesi: SevkSatiri[]
) {
  const sevkEdilecekUrunler: SiparisSatiri[] = [];
  const kalanUrunler: SiparisSatiri[] = [];
  const stokDusmeIstegi: Record<number, number> = {};


  for (const satir of sevkListesi) {
    const urunIdNum = Number(satir.id);
    const toplamIstenen = Number(satir.adet || 0);
    const sevkAdedi = Number(satir.sevkAdedi || 0);
    const kalanAdet = toplamIstenen - sevkAdedi;

    if (sevkAdedi > 0) {
      sevkEdilecekUrunler.push({ ...satir, adet: sevkAdedi });

      if (Number.isFinite(urunIdNum) && urunIdNum > 0) {
        stokDusmeIstegi[urunIdNum] = (stokDusmeIstegi[urunIdNum] || 0) + sevkAdedi;
      }
    }

    if (kalanAdet > 0) {
      kalanUrunler.push({ ...satir, adet: kalanAdet });
    }
  }

  if (sevkEdilecekUrunler.length === 0) {
    throw new Error("Sevk edilecek ürün seçilmedi.");
  }

  const stokKontroluTamam = await decrementStocksIfSufficient(stokDusmeIstegi);
  if (!stokKontroluTamam) {
    throw new Error("Stoklar yetersiz! Başka bir işlem stokları tüketmiş olabilir. Sayfayı yenileyip tekrar deneyin.");
  }

  const kdvOrani = orijinalSiparis.kdvOrani || 0;
  const yeniSevkiyatTutar = tutarlariHesapla(sevkEdilecekUrunler, kdvOrani);
  const guncelKalanTutar = tutarlariHesapla(kalanUrunler, kdvOrani);


  try {
    await runTransaction(veritabani, async (transaction) => {
      const orjSiparisRef = doc(veritabani, "siparisler", orijinalSiparis.docId);
      if (kalanUrunler.length === 0) {
        transaction.update(orjSiparisRef, {
          durum: "sevkiyat",
          islemeTarihi: serverTimestamp(),
        });
      }
      else {
        const yeniSiparisRef = doc(collection(veritabani, "siparisler"));
        const yeniSiparisId = await sonrakiSiparisId(); 

        transaction.set(yeniSiparisRef, {
          ...orijinalSiparis,
          urunler: sevkEdilecekUrunler,
          ...yeniSevkiyatTutar,
          durum: "sevkiyat",
          tarih: serverTimestamp(),
          islemeTarihi: serverTimestamp(),
          siparisId: yeniSiparisId,
          aciklama: `Sipariş bölündü (Kaynak: ${orijinalSiparis.siparisId || orijinalSiparis.docId})`
        });

        transaction.update(orjSiparisRef, {
          urunler: kalanUrunler,
          ...guncelKalanTutar,
          durum: "uretimde", 
          islemeTarihi: serverTimestamp(),
          aciklama: `Sipariş bölündü. Kalan ürünler.`
        });
      }
    });
  } catch (error) {
    console.error("TRANSACTION HATASI! Stoklar düşüldü ancak siparişler güncellenemedi!", error);
    await iadeStok(stokDusmeIstegi);
    throw new Error("Siparişler güncellenirken kritik bir hata oluştu. Stoklar iade edildi. Lütfen tekrar deneyin.");
  }
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
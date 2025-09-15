import {
  addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query,
  serverTimestamp, updateDoc, where, Timestamp, getDoc
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
  id: string;        // ürün id (string), Firestore’da böyle tutuluyor
  urunAdi: string;
  renk?: string;
  adet: number;
  birimFiyat: number; // net
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
  tarih: Timestamp;         // oluşturma
  islemeTarihi?: Timestamp; // sevk/tamam vs
  aciklama?: string;

  netTutar: number;
  kdvOrani: number;
  kdvTutar: number;
  brutTutar: number;
};

export function hepsiDinle(cb: (rows: (SiparisModel & {docId:string})[]) => void) {
  const qy = query(collection(veritabani, "siparisler"), orderBy("tarih", "desc"));
  return onSnapshot(qy, (snap) => {
    cb(snap.docs.map(d => ({...(d.data() as any), docId: d.id})));
  });
}

export function dinleDurumaGore(durum: SiparisDurumu, cb: (rows: (SiparisModel & {docId:string})[]) => void) {
  const qy = query(
    collection(veritabani, "siparisler"),
    where("durum", "==", durum),
    orderBy("tarih", "desc"),
  );
  return onSnapshot(qy, (snap) => {
    cb(snap.docs.map(d => ({...(d.data() as any), docId: d.id})));
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

/** ✅ Beklemede/Üretimde → stok yeterse SEVKIYAT'a geçir ve stok düş; değilse ÜRETİMDE bırak */
export async function sevkiyataGecir(s: SiparisModel & {docId:string}) {
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
    await guncelleDurum(s.docId, "uretimde"); // ekstra güvenlik: stok yetersizse üretimde kalsın/geçsin
  }
  return ok;
}

/** ✅ ÜRETİM ONAYI (stoklara dokunmaz) */
export async function uretimeOnayla(docId: string) {
  await guncelleDurum(docId, "uretimde", { islemeTarihiniAyarla: true });
}

/** bilgilendirme amaçlı (liste görünümünde) */
export async function stokYeterlilikHaritasi(rows: (SiparisModel & {docId:string})[]) {
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

/** ✅ Sevkiyattaki siparişi reddet → stok iadesi + durum=reddedildi */
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

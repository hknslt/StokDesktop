// src/services/UrunService.ts
import {
  doc, getDoc, runTransaction, increment, updateDoc
} from "firebase/firestore";
import { veritabani } from "../firebase";

/** stok haritası: { [urunId]: adet } */
export async function getStocksByNumericIds(ids: number[]) {
  const out = new Map<number, number>();
  await Promise.all(
    ids.map(async (id) => {
      const ref = doc(veritabani, "urunler", String(id));
      const snap = await getDoc(ref);
      const adet = Number(snap.data()?.adet ?? 0);
      out.set(id, adet);
    })
  );
  return out;
}

/** Hepsi yeterliyse atomik düş, yoksa hiç dokunma → true/false */
export async function decrementStocksIfSufficient(istek: Record<number, number>) {
  const ids = Object.keys(istek).map((s) => Number(s));
  if (!ids.length) return true;

  try {
    await runTransaction(veritabani, async (tx) => {
      // 1) oku
      const mevcut = new Map<number, number>();
      for (const id of ids) {
        const ref = doc(veritabani, "urunler", String(id));
        const snap = await tx.get(ref);
        const adet = Number(snap.data()?.adet ?? 0);
        mevcut.set(id, adet);
      }

      // 2) kontrol
      for (const id of ids) {
        const kalan = (mevcut.get(id) ?? 0) - (istek[id] ?? 0);
        if (kalan < 0) throw new Error("insufficient");
      }

      // 3) uygula
      for (const id of ids) {
        const ref = doc(veritabani, "urunler", String(id));
        tx.update(ref, { adet: increment(-(istek[id] ?? 0)) });
      }
    });
    return true;
  } catch {
    return false;
  }
}

export async function adetArtir(docId: string, delta: number) {
  await updateDoc(doc(veritabani, "urunler", docId), { adet: increment(delta) });
}

/** Sevkiyattan reddedilen siparişler için stok iadesi.
 *  istek: { urunId:int -> iadeMiktar:int } (pozitif miktarlar dikkate alınır)
 */
export async function iadeStok(istek: Record<number, number>): Promise<void> {
  const ids = Object.keys(istek)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && (istek[n] ?? 0) > 0);

  if (!ids.length) return;

  // Dokümanların var olduğunu varsayıyoruz; increment atomik artış yapar.
  await runTransaction(veritabani, async (tx) => {
    for (const id of ids) {
      const miktar = Number(istek[id] ?? 0);
      if (!miktar) continue;
      const ref = doc(veritabani, "urunler", String(id));
      // get zorunlu değil; increment doğrudan kullanılabilir.
      tx.update(ref, { adet: increment(miktar) });
    }
  });
}

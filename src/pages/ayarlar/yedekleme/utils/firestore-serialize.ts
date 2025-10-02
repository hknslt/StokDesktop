import { Timestamp, DocumentReference, GeoPoint } from "firebase/firestore";

/**
 * Yedek JSON’unda okunaklı bir format üretir:
 * - Timestamp  -> { __t:"ts", iso:"2025-10-02T12:34:56.789Z", ms: 1696259696789 }
 * - DocumentRef-> { __t:"ref", path:"koleksiyon/dokumanId" }
 * - GeoPoint   -> { __t:"geo", lat: 38.7, lng: 35.4 }
 * - Date       -> { __t:"date", iso:"..." }
 *
 * Not: Bu sadece Y E D E K dosyası içindir. Firestore’daki veriyi değiştirmez.
 */
export function serializeForBackup(input: any): any {
  if (input == null) return input;

  // Firestore Timestamp
  if (input instanceof Timestamp) {
    const ms = input.toMillis();
    return { __t: "ts", ms, iso: new Date(ms).toISOString() };
  }

  // Native Date
  if (input instanceof Date) {
    return { __t: "date", iso: input.toISOString() };
  }

  // DocumentReference (instanceof güvenilir değil, path varlığına bakacağız)
  if (Array.isArray(input)) {
    return input.map((x) => serializeForBackup(x));
  }

  if (typeof input === "object") {
    // Pratik: DocumentReference'lar çoğunlukla {path: "..."} özelliği taşır
    if ("path" in (input as any) && typeof (input as any).path === "string") {
      const ref = input as DocumentReference;
      return { __t: "ref", path: (ref as any).path };
    }

    // GeoPoint
    if ("latitude" in (input as any) && "longitude" in (input as any)) {
      const gp = input as GeoPoint;
      return { __t: "geo", lat: gp.latitude, lng: gp.longitude };
    }

    // Düz obje
    const out: any = {};
    for (const [k, v] of Object.entries(input)) {
      out[k] = serializeForBackup(v);
    }
    return out;
  }

  return input; // string/number/boolean
}

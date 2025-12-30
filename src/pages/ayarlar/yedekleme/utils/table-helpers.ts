import { Timestamp } from "firebase/firestore";

/** Objeyi dot-key olarak düzleştir (CSV/Excel içindir) */
export function flatten(obj: any, prefix = "", out: Record<string, any> = {}) {
  if (obj == null) return out;
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (Array.isArray(v)) {
      out[key] = JSON.stringify(v);
    } else if (v instanceof Date) {
      out[key] = v.toISOString();
    } else if (v instanceof Timestamp) {
      out[key] = new Date(v.toMillis()).toISOString();
    } else if (v && typeof v === "object") {
      if ("path" in (v as any) && typeof (v as any).path === "string") {
        out[key] = (v as any).path;
      } else if ("latitude" in (v as any) && "longitude" in (v as any)) {
        out[key] = JSON.stringify({
          lat: (v as any).latitude,
          lng: (v as any).longitude,
        });
      } else {
        flatten(v, key, out);
      }
    } else {
      out[key] = v;
    }
  }
  return out;
}

/** CSV oluşturma (headers sırasını korur) */
export function toCSV(rows: Record<string, any>[], headers: string[]) {
  const esc = (x: any) => {
    const s = x == null ? "" : String(x);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = headers.join(",");
  const body = rows.map((r) => headers.map((h) => esc(r[h])).join(",")).join("\n");
  return `${head}\n${body}`;
}

/** Dosya adı için güvenli koleksiyon adı üretir */
export function safeName(path: string | undefined) {
  return (path || "koleksiyon").replace(/\//g, "_");
}

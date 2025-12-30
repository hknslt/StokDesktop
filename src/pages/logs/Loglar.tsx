// src/pages/logs/Loglar.tsx
import { useEffect, useMemo, useState } from "react";
import {
  collection, onSnapshot, orderBy, query,
  writeBatch, doc, getDocs, limit as fbLimit
} from "firebase/firestore";
import { veritabani } from "../../firebase";
import {
  PRIVITY_MAILS,
  PRIVITY_UIDS,
  PRIVITY_USERNAMES
} from "../../config/privity.ts";

// ==== Tipler ====
type LogActor = {
  uid?: string | null; email?: string | null; username?: string;
  firstName?: string; lastName?: string; role?: string | null;
};
type LogTarget = {
  type?: string; docId?: string | null; urunId?: number; urunAdi?: string;
};
type LogRow = {
  docId: string; ts?: any | null; action?: string; actor?: LogActor;
  target?: LogTarget; meta?: Record<string, unknown>;
};

// ==== Yardımcılar ====
function getJSDate(ts: any | null | undefined): Date | null {
  try {
    if (!ts) return null;
    if (ts instanceof Date) return ts;
    if (typeof ts.toDate === "function") return ts.toDate();
    const d = new Date(ts); return Number.isNaN(d.getTime()) ? null : d;
  } catch { return null; }
}
function fmtDateTime(ts: any | null | undefined) {
  const d = getJSDate(ts); return d ? d.toLocaleString("tr-TR") : "—";
}
function actorLabel(a?: LogActor) {
  if (!a) return "—";
  const name = [a.firstName, a.lastName].filter(Boolean).join(" ").trim();
  if (name) return `${name}${a.username ? ` (@${a.username})` : ""}${a.role ? ` · ${a.role}` : ""}`;
  if (a.username) return `@${a.username}${a.role ? ` · ${a.role}` : ""}`;
  if (a.email) return `${a.email}${a.role ? ` · ${a.role}` : ""}`;
  return a.role || "—";
}
function targetLabel(t?: LogTarget) {
  if (!t) return "—";
  const parts: string[] = [];
  const icon = ((type?: string) => {
    switch ((type || "").toLowerCase()) {
      case "urun": return "📦";
      case "musteri": return "👤";
      case "fiyat_listesi": return "💲";
      case "siparis": return "🧾";
      default: return "🗂️";
    }
  })(t.type);
  if (icon) parts.push(icon);
  if (t.type) parts.push(t.type);
  if (t.urunAdi) parts.push(`“${t.urunAdi}”`);
  if (t.urunId != null) parts.push(`#${t.urunId}`);
  if (t.docId) parts.push(`(id:${t.docId})`);
  return parts.join(" ");
}
function compactMeta(meta?: Record<string, unknown>, limit = 80) {
  if (!meta) return "—";
  const keysOrder = ["delta", "oncekiAdet", "yeniAdet", "renk", "kdv", "netFiyat", "silinenUrunFiyatSatiri"];
  const shown: string[] = [];
  for (const k of keysOrder) if ((meta as any)[k] != null) shown.push(`${k}: ${String((meta as any)[k])}`);
  const rest = Object.keys(meta).filter(k => !keysOrder.includes(k)).map(k => `${k}: ${String((meta as any)[k])}`);
  const text = [...shown, ...rest].join(" · ") || "—";
  return text.length > limit ? text.slice(0, limit - 1) + "…" : text;
}
function uniq<T>(arr: T[]): T[] { return Array.from(new Set(arr)); }
function downloadCSV(filename: string, rows: LogRow[]) {
  const header = ["ts", "action", "actor", "role", "target.type", "target.docId", "urunId", "urunAdi", "meta"];
  const toRow = (r: LogRow) => {
    const ts = getJSDate(r.ts)?.toISOString() ?? "";
    const actor = actorLabel(r.actor);
    const role = r.actor?.role || "";
    const t = r.target || {};
    const meta = JSON.stringify(r.meta || {});
    return [ts, r.action || "", actor, role, (t as any).type || "", (t as any).docId || "", String((t as any).urunId ?? ""), (t as any).urunAdi || "", meta]
      .map(x => `"${String(x).replace(/"/g, '""')}"`).join(",");
  };
  const csv = [header.join(","), ...rows.map(toRow)].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// ==== Bileşen ====
export default function Loglar() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [q, setQ] = useState("");

  // filtreler
  const [fAction, setFAction] = useState<string>("");
  const [fType, setFType] = useState<string>("");
  const [fRole, setFRole] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  // sıralama
  const [desc, setDesc] = useState(true);

  // meta ayrıntı
  const [openMeta, setOpenMeta] = useState<Record<string, boolean>>({});

  // operasyon durumu
  const [opMsg, setOpMsg] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);


  useEffect(() => {
    const qy = query(collection(veritabani, "logs"), orderBy("ts", "desc"));
    return onSnapshot(qy, (snap) => {
      const list: LogRow[] = snap.docs.map((d) => {
        const x = d.data() as any;
        return {
          docId: d.id,
          ts: x.ts ?? null,
          action: String(x.action ?? ""),
          actor: x.actor || {},
          target: { ...x.target },
          meta: x.meta || {},
        };
      });

      const gorunen = list.filter(r => {
        const mail = (r.actor?.email || "").toLowerCase();
        const uname = (r.actor?.username || "").toLowerCase();
        const uid = r.actor?.uid || "";
        if (PRIVITY_MAILS.has(mail)) return false;
        if (PRIVITY_UIDS.has(uid)) return false;
        if (PRIVITY_USERNAMES.has(uname)) return false;
        return true;
      });

      setRows(gorunen);
    });
  }, []);


  // hızlı aralık
  function setQuickRange(key: "today" | "7" | "30" | "all") {
    const now = new Date(); const pad = (n: number) => String(n).padStart(2, "0");
    if (key === "today") {
      const y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate();
      setDateFrom(`${y}-${pad(m)}-${pad(d)}`); setDateTo(`${y}-${pad(m)}-${pad(d)}`); return;
    }
    if (key === "7") {
      const start = new Date(now); start.setDate(now.getDate() - 6);
      setDateFrom(`${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`);
      setDateTo(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`); return;
    }
    if (key === "30") {
      const start = new Date(now); start.setDate(now.getDate() - 29);
      setDateFrom(`${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`);
      setDateTo(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`); return;
    }
    setDateFrom(""); setDateTo("");
  }

  // filtre + sıralama
  const filtered = useMemo(() => {
    let list = rows.slice();

    const term = q.trim().toLowerCase();
    if (term) {
      list = list.filter(r => {
        const hay = [
          r.action,
          r.actor?.username, r.actor?.firstName, r.actor?.lastName, r.actor?.email, r.actor?.role,
          r.target?.type, r.target?.docId, r.target?.urunAdi, String(r.target?.urunId ?? ""),
          JSON.stringify(r.meta ?? {})
        ].filter(Boolean).map(s => String(s).toLowerCase()).join(" ");
        return hay.includes(term);
      });
    }

    if (fAction) list = list.filter(r => (r.action || "") === fAction);
    if (fType) list = list.filter(r => (r.target?.type || "") === fType);
    if (fRole) list = list.filter(r => (r.actor?.role || "") === fRole);

    if (dateFrom) {
      const from = new Date(dateFrom + "T00:00:00");
      list = list.filter(r => { const d = getJSDate(r.ts); return d ? d >= from : false; });
    }
    if (dateTo) {
      const to = new Date(dateTo + "T23:59:59.999");
      list = list.filter(r => { const d = getJSDate(r.ts); return d ? d <= to : false; });
    }

    list.sort((a, b) => {
      const da = getJSDate(a.ts), db = getJSDate(b.ts);
      if (!da && !db) return 0; if (!da) return 1; if (!db) return -1;
      return desc ? (db.getTime() - da.getTime()) : (da.getTime() - db.getTime());
    });
    return list;
  }, [rows, q, fAction, fType, fRole, dateFrom, dateTo, desc]);


  // ==== TÜMÜNÜ SİL (Firestore'dan) ====
  async function deleteAllLogs() {
    const ok = confirm("TÜM logları silmek istediğine emin misin? Bu işlem geri alınamaz!");
    if (!ok) return;
    setDeleting(true);
    setOpMsg(null);
    try {
      let total = 0;
      while (true) {
        const snap = await getDocs(
          query(collection(veritabani, "logs"), orderBy("__name__"), fbLimit(450))
        );
        if (snap.empty) break;
        const batch = writeBatch(veritabani);
        snap.docs.forEach(d => batch.delete(doc(veritabani, "logs", d.id)));
        await batch.commit();
        total += snap.size;
      }
      setOpMsg(`${total} log silindi.`);
    } catch (e: any) {
      setOpMsg(e?.message || "Silme işlemi başarısız oldu. Yetkileri (rules) kontrol edin.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* ÜST BAR */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Loglar</h2>

        <input
          className="input"
          placeholder="Ara (eylem, kullanıcı, hedef, meta…)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ maxWidth: 300 }}
        />

        {/* Filtre çipleri */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select className="input" value={fAction} onChange={(e) => setFAction(e.target.value)} title="Eylem">
            <option value="">Eylem (tümü)</option>
            {useMemo(() => uniq(rows.map(r => r.action || "").filter(Boolean)).sort(), [rows]).map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <select className="input" value={fType} onChange={(e) => setFType(e.target.value)} title="Tür">
            <option value="">Tür (tümü)</option>
            {useMemo(() => uniq(rows.map(r => r.target?.type || "").filter(Boolean)).sort(), [rows]).map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select className="input" value={fRole} onChange={(e) => setFRole(e.target.value)} title="Rol">
            <option value="">Rol (tümü)</option>
            {useMemo(() => uniq(rows.map(r => (r.actor?.role || "") as string).filter(Boolean)).sort(), [rows]).map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <input className="input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="Başlangıç" />
          <input className="input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="Bitiş" />
        </div>

        {/* Hızlı aralık */}
        <div style={{ display: "flex", gap: 6 }}>
          <button className="theme-btn" onClick={() => setQuickRange("today")}>Bugün</button>
          <button className="theme-btn" onClick={() => setQuickRange("7")}>7g</button>
          <button className="theme-btn" onClick={() => setQuickRange("30")}>30g</button>
          <button className="theme-btn" onClick={() => setQuickRange("all")}>Tümü</button>
        </div>

        {/* Sağ */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="theme-btn" title="Zamana göre sırala" onClick={() => setDesc(v => !v)}>
            {desc ? "Yeni → Eski" : "Eski → Yeni"}
          </button>
          <button className="theme-btn" title="CSV dışa aktar" onClick={() => downloadCSV(`loglar-${Date.now()}.csv`, filtered)}>
            CSV
          </button>
          <button className="theme-btn" title="Filtreleri temizle"
            onClick={() => { setQ(""); setFAction(""); setFType(""); setFRole(""); setDateFrom(""); setDateTo(""); }}>
            Filtreleri Temizle
          </button>

          {/* 🔴 SADECE TÜMÜNÜ SİL */}
          <button
            className="theme-btn"
            style={{ borderColor: "var(--kirmizi)", color: "var(--kirmizi)" }}
            disabled={deleting || rows.length === 0}
            title="Tüm logları Firestore'dan sil (geri alınamaz)"
            onClick={deleteAllLogs}
          >
            {deleting ? "Siliniyor…" : "Tümünü Sil"}
          </button>
        </div>
      </div>

      {/* Operasyon mesajı */}
      {opMsg && <div className="card" style={{ borderColor: "var(--panel-bdr)" }}>{opMsg}</div>}

      {/* ÖZET */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 12 }}>
        <div className="card" style={{ padding: "10px 12px" }}>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Toplam Kayıt</div>
          <div style={{ fontWeight: 800, fontSize: 18 }}>{filtered.length.toLocaleString("tr-TR")}</div>
        </div>
        <div className="card" style={{ padding: "10px 12px" }}>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Tekil Kullanıcı</div>
          <div style={{ fontWeight: 800, fontSize: 18 }}>
            {uniq(filtered.map(r => r.actor?.uid || r.actor?.email || r.actor?.username || "").filter(Boolean)).length.toLocaleString("tr-TR")}
          </div>
        </div>
        <div className="card" style={{ padding: "10px 12px" }}>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Aralık</div>
          <div style={{ fontSize: 13 }}>
            {filtered.length ? `${fmtDateTime(filtered[filtered.length - 1]?.ts)} → ${fmtDateTime(filtered[0]?.ts)}` : "—"}
          </div>
        </div>
      </div>

      {/* TABLO */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ display: "grid", gridTemplateRows: "auto 1fr", maxHeight: "72vh" }}>
          <div
            style={{
              position: "sticky", top: 0, zIndex: 1,
              background: "var(--panel, #0f1115)", borderBottom: "1px solid var(--panel-bdr)", padding: "10px 12px",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "170px 170px 1fr 1.2fr 1.4fr 90px",
                gap: 8, fontSize: 13, color: "var(--muted)",
              }}
            >
              <div>Zaman</div>
              <div>Eylem</div>
              <div>Kullanıcı</div>
              <div>Hedef</div>
              <div>Meta</div>
              <div style={{ textAlign: "right" }}>Ayrıntı</div>
            </div>
          </div>

          <div style={{ overflow: "auto", padding: 12 }}>
            <div style={{ display: "grid", gap: 8 }}>
              {filtered.map((r) => {
                const metaOpen = !!openMeta[r.docId];
                const a = (r.action || "").toLowerCase();
                const bg =
                  a.includes("sil") ? "color-mix(in oklab, var(--kirmizi) 18%, transparent)" :
                    a.includes("ekle") ? "color-mix(in oklab, var(--yesil) 18%, transparent)" :
                      a.includes("guncel") || a.includes("güncel") ? "color-mix(in oklab, #f59e0b 22%, transparent)" :
                        "color-mix(in oklab, var(--ana) 14%, transparent)";
                return (
                  <div key={r.docId} style={{ border: "1px solid var(--panel-bdr)", borderRadius: 12, overflow: "hidden" }}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "170px 170px 1fr 1.2fr 1.4fr 90px",
                        gap: 8, alignItems: "center", padding: "8px 10px"
                      }}
                    >
                      <div style={{ whiteSpace: "nowrap" }}>{fmtDateTime(r.ts)}</div>
                      <div>
                        <span style={{ display: "inline-block", padding: "4px 8px", borderRadius: 999, border: "1px solid var(--panel-bdr)", background: bg, fontSize: 12 }}>
                          {r.action || "—"}
                        </span>
                      </div>
                      <div>{actorLabel(r.actor)}</div>
                      <div title={targetLabel(r.target)}>{targetLabel(r.target)}</div>
                      <div style={{ color: "var(--muted)" }}>{compactMeta(r.meta, 100)}</div>
                      <div style={{ textAlign: "right" }}>
                        <button className="theme-btn" onClick={() => setOpenMeta(s => ({ ...s, [r.docId]: !s[r.docId] }))}>
                          {metaOpen ? "Gizle" : "Ayrıntı"}
                        </button>
                      </div>
                    </div>

                    {metaOpen && (
                      <div style={{ borderTop: "1px solid var(--panel-bdr)", padding: "10px 12px", background: "color-mix(in oklab, var(--ana) 7%, transparent)" }}>
                        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>JSON Meta</div>
                        <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: 12.5 }}>
                          {JSON.stringify(r.meta ?? {}, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
              {!filtered.length && (
                <div style={{ padding: 24, textAlign: "center", color: "var(--muted)", border: "1px dashed var(--panel-bdr)", borderRadius: 12 }}>
                  Bu filtrelerle sonuç bulunamadı.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

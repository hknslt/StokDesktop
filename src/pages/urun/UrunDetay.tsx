import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { veritabani } from "../../firebase";
import { Link, useNavigate, useParams } from "react-router-dom";
import { collection, query, where, getDocs } from "firebase/firestore";

/* ---------- tipler ---------- */
type Urun = {
  id: number;
  urunAdi: string;
  urunKodu: string;
  adet: number;
  renk?: string;
  grup?: string;
  aciklama?: string;
  kapakResimYolu?: string | null;
  resimYollari?: string[];
  createdAt?: any;
};

export default function UrunDetay() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [veri, setVeri] = useState<Urun | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);

  // ---- galeri durumu ----
  const [indeks, setIndeks] = useState(0);
  const [lightbox, setLightbox] = useState(false);

  // swipe (dokunmatik + mouse drag) için
  const downX = useRef<number | null>(null);
  const isDragging = useRef(false);

  useEffect(() => {
    let iptal = false;
    (async () => {
      try {
        if (!id) return;
        const qy = query(collection(veritabani, "urunler"), where("id", "==", Number(id)));
        const qs = await getDocs(qy);
        if (qs.empty) {
          if (!iptal) { setVeri(null); setYukleniyor(false); }
          return;
        }
        const snap = qs.docs[0];
        const x = snap.data() as any;
        const d: Urun = {
          id: Number(x.id ?? Number(snap.id)),
          urunAdi: String(x.urunAdi ?? ""),
          urunKodu: String(x.urunKodu ?? ""),
          adet: Number(x.adet ?? 0),
          renk: x.renk ?? undefined,
          grup: x.grup ?? undefined,
          aciklama: x.aciklama ?? undefined,
          kapakResimYolu: x.kapakResimYolu ?? undefined,
          resimYollari: Array.isArray(x.resimYollari) ? x.resimYollari : undefined,
          createdAt: x.createdAt,
        };
        if (!iptal) setVeri(d);
      } finally {
        if (!iptal) setYukleniyor(false);
      }
    })();
    return () => { iptal = true; };
  }, [id]);

  // kapak + diğer resimleri tek listede topla (kapak başa), tekrarları çıkar
  const resimler = useMemo(() => {
    const arr: string[] = [];
    if (veri?.kapakResimYolu) arr.push(veri.kapakResimYolu);
    if (veri?.resimYollari?.length) arr.push(...veri.resimYollari);
    return arr.filter((u, i) => arr.indexOf(u) === i);
  }, [veri]);

  // indeks aralığını koru
  useEffect(() => {
    if (!resimler.length) { setIndeks(0); return; }
    if (indeks > resimler.length - 1) setIndeks(resimler.length - 1);
  }, [resimler, indeks]);

  const onceki = useCallback(() => {
    if (!resimler.length) return;
    setIndeks(i => (i - 1 + resimler.length) % resimler.length);
  }, [resimler.length]);

  const sonraki = useCallback(() => {
    if (!resimler.length) return;
    setIndeks(i => (i + 1) % resimler.length);
  }, [resimler.length]);

  // klavye kısayolları (lightbox açıkken)
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(false);
      if (e.key === "ArrowLeft") onceki();
      if (e.key === "ArrowRight") sonraki();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, onceki, sonraki]);

  // swipe/drag olayları
  const onPointerDown = (e: React.PointerEvent) => {
    downX.current = e.clientX;
    isDragging.current = true;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!isDragging.current || downX.current == null) return;
    const delta = e.clientX - downX.current;
    isDragging.current = false;
    downX.current = null;
    const esik = 40; // kaydırma eşiği (px)
    if (delta > esik) onceki();
    else if (delta < -esik) sonraki();
  };
  const onPointerLeave = () => {
    isDragging.current = false;
    downX.current = null;
  };

  function geri() {
    navigate("/stok", { replace: true });
  }

  if (yukleniyor) return <div className="card">Yükleniyor…</div>;
  if (!veri) return <div className="card">Ürün bulunamadı.</div>;

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {/* başlık */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Ürün Detayı</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="theme-btn" onClick={geri}>Geri</button>
          <Link to={`/urun/${veri.id}/duzenle`}><button>Düzenle</button></Link>
        </div>
      </div>

      <div className="card" style={{
        display: "grid",
        gridTemplateColumns: "minmax(280px, 460px) 1fr",
        gap: 20
      }}>
        {/* -------- sol: galeri -------- */}
        <div style={{ display: "grid", gap: 10 }}>
          {/* ana görüntü alanı */}
          <div
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerLeave}
            style={{
              position: "relative",
              width: "100%",
              aspectRatio: "4/3",
              borderRadius: 14,
              overflow: "hidden",
              background: "linear-gradient(180deg, rgba(0,0,0,.75), rgba(0,0,0,.6))",
              border: "1px solid var(--panel-bdr, #222)",
              display: "grid",
              placeItems: "center",
              touchAction: "pan-y"
            }}
          >
            {/* sol/sağ gradient mask (estetik) */}
            <div style={kenarFade("left")} />
            <div style={kenarFade("right")} />

            {resimler.length ? (
              <>
                <img
                  src={resimler[indeks]}
                  alt={`Ürün görseli ${indeks + 1}/${resimler.length}`}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",   // tamamı görünsün
                    objectPosition: "center",
                    cursor: "zoom-in",
                    display: "block",
                    userSelect: "none"
                  }}
                  onClick={() => setLightbox(true)}
                  draggable={false}
                />

                {/* oklar — büyük hit-area + tam merkez */}
                <ButonOk yon="left" onClick={onceki} />
                <ButonOk yon="right" onClick={sonraki} />

                {/* sayaç + noktalar */}
                <div style={{
                  position: "absolute", bottom: 10, left: 10, right: 10,
                  display: "flex", justifyContent: "space-between", alignItems: "center"
                }}>
                  <div style={{
                    padding: "4px 8px", fontSize: 12, borderRadius: 8,
                    background: "rgba(0,0,0,.55)", color: "#fff", backdropFilter: "blur(2px)"
                  }}>
                    {indeks + 1} / {resimler.length}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {resimler.map((_, i) => (
                      <span
                        key={i}
                        style={{
                          width: 8, height: 8, borderRadius: 999,
                          background: i === indeks ? "white" : "rgba(255,255,255,.4)"
                        }}
                      />
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div style={{
                width: "100%", height: "100%", display: "grid", placeItems: "center",
                color: "var(--muted, #aaa)"
              }}>Görsel yok</div>
            )}
          </div>

          {/* küçük önizlemeler */}
          {resimler.length > 1 && (
            <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 2 }}>
              {resimler.map((u, i) => (
                <button
                  key={u + i}
                  onClick={() => setIndeks(i)}
                  aria-label={`Görsel ${i + 1}`}
                  style={{
                    padding: 0,
                    border: i === indeks ? "2px solid var(--accent, #4da3ff)" : "1px solid var(--panel-bdr, #222)",
                    borderRadius: 10,
                    overflow: "hidden",
                    background: "transparent",
                    outline: "none",
                    width: 92, height: 68,
                    cursor: "pointer",
                    flex: "0 0 auto",
                    boxShadow: i === indeks ? "0 0 0 3px rgba(77,163,255,.25)" : "none"
                  }}
                >
                  <img
                    src={u}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    draggable={false}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* -------- sağ: bilgiler -------- */}
        <div style={{ display: "grid", gap: 12 }}>
          <Satir baslik="Kod" deger={veri.urunKodu} />
          <Satir baslik="Ad" deger={veri.urunAdi} />
          <Satir baslik="Grup" deger={veri.grup || "-"} />
          <Satir baslik="Renk" deger={veri.renk || "-"} />
          <Satir baslik="Adet" deger={String(veri.adet)} />
          <div>
            <div style={etiketStil()}>Açıklama</div>
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{veri.aciklama || "-"}</div>
          </div>
        </div>
      </div>

      {/* -------- Lightbox (büyütme) -------- */}
      {lightbox && resimler.length > 0 && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setLightbox(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,.88)",
            display: "grid", placeItems: "center", zIndex: 9999
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ position: "relative", maxWidth: "95vw", maxHeight: "90vh" }}
          >
            <img
              src={resimler[indeks]}
              alt=""
              style={{ maxWidth: "95vw", maxHeight: "90vh", objectFit: "contain", display: "block", userSelect: "none" }}
              draggable={false}
            />
            <ButonOk yon="left" onClick={onceki} boyut="lg" icZindex />
            <ButonOk yon="right" onClick={sonraki} boyut="lg" icZindex />

            <button
              onClick={() => setLightbox(false)}
              aria-label="Kapat"
              style={{
                position: "absolute", top: 8, right: 8,
                background: "rgba(0,0,0,.55)", color: "#fff",
                border: "1px solid rgba(255,255,255,.25)",
                borderRadius: 10, padding: "8px 12px", cursor: "pointer",
                fontSize: 18
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- küçük yardımcı bileşenler & stiller ---------- */

function Satir({ baslik, deger }: { baslik: string; deger: string }) {
  return (
    <div>
      <div style={etiketStil()}>{baslik}</div>
      <div style={{ fontWeight: 600 }}>{deger}</div>
    </div>
  );
}

function etiketStil(): React.CSSProperties {
  return {
    fontSize: 12,
    letterSpacing: .3,
    textTransform: "uppercase",
    color: "var(--muted, #9aa1a9)",
    marginBottom: 4
  };
}

function kenarFade(side: "left" | "right"): React.CSSProperties {
  return {
    position: "absolute",
    top: 0,
    bottom: 0,
    [side]: 0,
    width: 36,
    background: side === "left"
      ? "linear-gradient(90deg, rgba(0,0,0,.55), transparent)"
      : "linear-gradient(270deg, rgba(0,0,0,.55), transparent)",
    pointerEvents: "none",
    zIndex: 1
  };
}

function ButonOk({
  yon,
  onClick,
  boyut = "md",
  icZindex = false
}: {
  yon: "left" | "right";
  onClick: () => void;
  boyut?: "md" | "lg";
  icZindex?: boolean; // lightbox içinde üstte kalsın
}) {
  const w = boyut === "lg" ? 54 : 44;
  const fs = boyut === "lg" ? 28 : 22;
  return (
    <button
      onClick={onClick}
      aria-label={yon === "left" ? "Önceki" : "Sonraki"}
      style={{
        position: "absolute",
        top: "50%",
        transform: "translateY(-50%)",
        [yon]: 10,
        width: w, height: w,
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,.35)",
        background: "rgba(0,0,0,.45)",
        color: "#fff",
        fontSize: fs,
        lineHeight: `${w - 8}px`,
        textAlign: "center",
        cursor: "pointer",
        backdropFilter: "blur(2px)",
        userSelect: "none",
        outline: "none",
        zIndex: icZindex ? 5 : 2,
        boxShadow: "0 4px 14px rgba(0,0,0,.35)"
      }}
    >
      {yon === "left" ? "‹" : "›"}
    </button>
  );
}

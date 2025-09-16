// src/pages/siparis/SiparisOlustur.tsx
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  addDoc,
} from "firebase/firestore";
import { veritabani } from "../../firebase";
import {
  ekleSiparis,
  SiparisSatiri,
  SiparisMusteri,
} from "../../services/SiparisService";
import { Link, useNavigate } from "react-router-dom";

/* ------------ kaynaklar ------------ */
type Urun = { id: number; urunAdi: string; urunKodu: string; renk?: string };
type FiyatListe = { id: string; ad: string; kdv: number };

function useUrunler() {
  const [list, setList] = useState<Urun[]>([]);
  useEffect(() => {
    const qy = query(collection(veritabani, "urunler"), orderBy("id", "asc"));
    return onSnapshot(qy, (snap) => {
      setList(
        snap.docs.map((d) => {
          const x = d.data() as any;
          return {
            id: Number(x.id ?? d.id),
            urunAdi: String(x.urunAdi ?? ""),
            urunKodu: String(x.urunKodu ?? ""),
            renk: x.renk ?? undefined,
          };
        })
      );
    });
  }, []);
  return list;
}

/* ------------ sayfa ------------ */
export default function SiparisOlustur() {
  const nav = useNavigate();
  const urunler = useUrunler();

  // Müşteri seçimi
  const [kayitliMi, setKayitliMi] = useState(true);
  const [musteriler, setMusteriler] = useState<
    {
      docId: string;
      id: number;
      firmaAdi: string;
      yetkili?: string;
      telefon?: string;
      adres?: string;
    }[]
  >([]);
  const [seciliMusteriId, setSeciliMusteriId] = useState<string>("");
  const [musteriAra, setMusteriAra] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    const qy = query(
      collection(veritabani, "musteriler"),
      orderBy("id", "asc")
    );
    return onSnapshot(qy, (snap) => {
      setMusteriler(
        snap.docs.map((d) => {
          const x = d.data() as any;
          return {
            docId: d.id,
            id: Number(x.id ?? d.id),
            firmaAdi: String(x.firmaAdi ?? ""),
            yetkili: x.yetkili || "",
            telefon: x.telefon || "",
            adres: x.adres || "",
          };
        })
      );
    });
  }, []);

  const filtreliMusteriler = useMemo(() => {
    const q = musteriAra.trim().toLowerCase();
    if (!q) return musteriler;
    return musteriler.filter((m) =>
      [m.firmaAdi, m.yetkili, m.telefon, m.adres]
        .filter(Boolean)
        .map(String)
        .map((s) => s.toLowerCase())
        .some((s) => s.includes(q))
    );
  }, [musteriler, musteriAra]);

  const seciliMusteri = useMemo(
    () => musteriler.find((m) => m.docId === seciliMusteriId),
    [musteriler, seciliMusteriId]
  );

  const [manuel, setManuel] = useState<SiparisMusteri>({
    id: "",
    firmaAdi: "",
    yetkili: "",
    telefon: "",
    adres: "",
  });

  // Manuel müşteriyi kayıtlılara kaydetme tiki (varsayılan açık)
  const [manuelKaydet, setManuelKaydet] = useState<boolean>(true);

  const musteriEmbed: SiparisMusteri | null = useMemo(() => {
    if (kayitliMi) {
      if (!seciliMusteri) return null;
      return {
        id: String(seciliMusteri.id),
        firmaAdi: seciliMusteri.firmaAdi,
        yetkili: seciliMusteri.yetkili,
        telefon: seciliMusteri.telefon,
        adres: seciliMusteri.adres,
      };
    }
    if (!manuel.firmaAdi || !manuel.telefon) return null;
    return manuel;
  }, [kayitliMi, seciliMusteri, manuel]);

  // Fiyat listesi + satırlar
  const [listeler, setListeler] = useState<FiyatListe[]>([]);
  const [listeId, setListeId] = useState<string>("");
  useEffect(() => {
    (async () => {
      const qy = query(
        collection(veritabani, "fiyatListeleri"),
        orderBy("createdAt", "desc"),
        limit(50)
      );
      const snap = await getDocs(qy);
      const arr = snap.docs.map((d) => {
        const x = d.data() as any;
        return { id: d.id, ad: String(x.ad ?? d.id), kdv: Number(x.kdv ?? 0) };
      });
      setListeler(arr);
      if (arr[0]) setListeId(arr[0].id);
    })();
  }, []);

  async function fiyatGetir(urunId: number, listeId: string) {
    try {
      const snap = await getDoc(
        doc(
          veritabani,
          "fiyatListeleri",
          listeId,
          "urunFiyatlari",
          String(urunId)
        )
      );
      return Number(snap.data()?.netFiyat ?? 0);
    } catch {
      return 0;
    }
  }

  const [satirlar, setSatirlar] = useState<SiparisSatiri[]>([]);
  const [urunPicker, setUrunPicker] = useState(false);
  const [urunAra, setUrunAra] = useState("");

  const filtreliUrunler = useMemo(() => {
    const q = urunAra.trim().toLowerCase();
    if (!q) return urunler;
    return urunler.filter((u) =>
      [u.urunAdi, u.urunKodu, u.renk]
        .filter(Boolean)
        .map(String)
        .map((s) => s.toLowerCase())
        .some((s) => s.includes(q))
    );
  }, [urunler, urunAra]);

  async function urunSec(urunId: number) {
    const u = urunler.find((x) => x.id === urunId);
    if (!u || !listeId) return;
    const birim = await fiyatGetir(urunId, listeId);
    setSatirlar((s) => [
      ...s,
      {
        id: String(urunId),
        urunAdi: u.urunAdi,
        renk: u.renk,
        adet: 1,
        birimFiyat: birim,
      },
    ]);
    setUrunPicker(false);
  }
  function satirSil(i: number) {
    setSatirlar((s) => s.filter((_, idx) => idx !== i));
  }

  const kdv = Number(listeler.find((x) => x.id === listeId)?.kdv ?? 0);
  const netToplam = satirlar.reduce(
    (t, s) => t + Number(s.adet || 0) * Number(s.birimFiyat || 0),
    0
  );
  const kdvTutar = Math.round(netToplam * kdv) / 100;
  const brutToplam = netToplam + kdvTutar;

  // Diğer
  const [islemTarih, setIslemTarih] = useState(""); // YYYY-MM-DD
  const [aciklama, setAciklama] = useState("");

  const kaydedilebilir = !!musteriEmbed && satirlar.length > 0;

  // --- Yardımcı: bir sonraki müşteri id'si ---
  async function sonrakiMusteriId(): Promise<number> {
    const qy = query(
      collection(veritabani, "musteriler"),
      orderBy("id", "desc"),
      limit(1)
    );
    const snap = await getDocs(qy);
    const lastId = snap.docs.length ? Number(snap.docs[0].data().id ?? 0) : 0;
    return (isFinite(lastId) ? lastId : 0) + 1;
  }

  // --- Kaydet ---
  async function kaydet() {
    if (!kaydedilebilir) return;

    let embedToUse = musteriEmbed!;

    // Manuel mod + "kaydet" tiki açık ise önce müşteriyi koleksiyona ekle
    if (!kayitliMi && manuelKaydet) {
      if (!manuel.firmaAdi?.trim() || !manuel.telefon?.trim()) {
        alert("Firma adı ve telefon zorunludur.");
        return;
      }

      const yeniId = await sonrakiMusteriId();
      const docData = {
        id: yeniId,
        firmaAdi: manuel.firmaAdi.trim(),
        yetkili: manuel.yetkili?.trim() || "",
        telefon: manuel.telefon?.trim() || "",
        adres: manuel.adres?.trim() || "",
        createdAt: serverTimestamp(),
      };

      const ref = await addDoc(collection(veritabani, "musteriler"), docData);

      // Sipariş embed'ini yeni kayıtla senkronla
      embedToUse = {
        id: String(yeniId),
        firmaAdi: docData.firmaAdi,
        yetkili: docData.yetkili,
        telefon: docData.telefon,
        adres: docData.adres,
      };

      // UI tarafında da seçim yapılan müşteri gibi davranması için
      setSeciliMusteriId(ref.id);
    }

    await ekleSiparis({
      musteri: embedToUse,
      urunler: satirlar,
      durum: "beklemede",
      tarih: serverTimestamp() as any,
      islemeTarihi: islemTarih
        ? (new Date(islemTarih + "T00:00:00") as any)
        : undefined,
      aciklama,
      netTutar: netToplam,
      kdvOrani: kdv,
      kdvTutar,
      brutTutar: brutToplam,
    });

    nav("/siparisler");
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <h2 style={{ margin: 0 }}>Yeni Sipariş</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <Link to="/siparisler">
            <button className="theme-btn">İptal</button>
          </Link>
          <button disabled={!kaydedilebilir} onClick={kaydet}>
            Kaydet
          </button>
        </div>
      </div>

      {/* Adım 1 — Müşteri */}
      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", gap: 12 }}>
          <label>
            <input
              type="radio"
              checked={kayitliMi}
              onChange={() => setKayitliMi(true)}
            />{" "}
            Kayıtlıdan seç
          </label>
          <label>
            <input
              type="radio"
              checked={!kayitliMi}
              onChange={() => setKayitliMi(false)}
            />{" "}
            Manuel
          </label>
        </div>

        {kayitliMi ? (
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              className="theme-btn"
              onClick={() => setPickerOpen(true)}
            >
              {seciliMusteri
                ? `Seçili: ${seciliMusteri.firmaAdi}`
                : "Müşteri Seç"}
            </button>
            {seciliMusteri && (
              <div style={{ fontSize: 13, opacity: 0.8 }}>
                {seciliMusteri.yetkili || ""}{" "}
                {seciliMusteri.telefon ? `• ${seciliMusteri.telefon}` : ""}
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
            }}
          >
            <input
              className="input"
              placeholder="Firma Adı *"
              value={manuel.firmaAdi}
              onChange={(e) =>
                setManuel({ ...manuel, firmaAdi: e.target.value })
              }
            />
            <input
              className="input"
              placeholder="Telefon *"
              value={manuel.telefon || ""}
              onChange={(e) =>
                setManuel({ ...manuel, telefon: e.target.value })
              }
            />
            <input
              className="input"
              placeholder="Yetkili"
              value={manuel.yetkili || ""}
              onChange={(e) =>
                setManuel({ ...manuel, yetkili: e.target.value })
              }
            />
            <input
              className="input"
              placeholder="Adres"
              value={manuel.adres || ""}
              onChange={(e) => setManuel({ ...manuel, adres: e.target.value })}
            />

            {/* Manuel müşteriyi kaydet tiki */}
            <div
              style={{
                gridColumn: "1 / -1",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <input
                id="manuelKaydet"
                type="checkbox"
                checked={manuelKaydet}
                onChange={(e) => setManuelKaydet(e.target.checked)}
              />
              <label htmlFor="manuelKaydet">
                Bu manuel müşteriyi kayıtlı müşterilere kaydet
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Adım 2 — Ürünler */}
      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <b>Aktif Liste:</b>
          <select
            className="input"
            value={listeId}
            onChange={(e) => setListeId(e.target.value)}
          >
            {listeler.map((l) => (
              <option key={l.id} value={l.id}>
                {l.ad} (KDV %{l.kdv})
              </option>
            ))}
          </select>
          <div style={{ marginLeft: "auto" }}>
            <button className="theme-btn" onClick={() => setUrunPicker(true)}>
              + Ürün Ekle
            </button>
          </div>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          {/* Başlık */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "1fr 120px 90px 110px 110px 80px", // Ürün | Renk | Adet | Net Birim | Net Satır | Sil
              gap: 8,
              color: "var(--muted)",
              fontSize: 13,
            }}
          >
            <div>Ürün</div>
            <div>Renk</div>
            <div>Adet</div>
            <div>Net Birim</div>
            <div>Net Satır</div>
            <div></div>
          </div>

          {/* Satırlar */}
          {satirlar.map((s, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 120px 90px 110px 110px 80px",
                gap: 8,
                alignItems: "center",
                border: "1px solid var(--panel-bdr)",
                borderRadius: 10,
                padding: "6px 8px",
              }}
            >
              <div>
                <b>{s.urunAdi}</b>
              </div>

              {/* Renk gösterimi */}
              <div>
                {s.renk ? (
                  <span
                    className="tag"
                    style={{ padding: "2px 8px", borderRadius: 999 }}
                  >
                    {s.renk}
                  </span>
                ) : (
                  "—"
                )}
              </div>

              <input
                className="input"
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                value={String(s.adet)}
                onChange={(e) =>
                  setSatirlar((arr) =>
                    arr.map((x, idx) =>
                      idx === i ? { ...x, adet: Number(e.target.value) || 0 } : x
                    )
                  )
                }
              />

              <input
                className="input"
                type="number"
                inputMode="decimal"
                value={String(s.birimFiyat)}
                onChange={(e) =>
                  setSatirlar((arr) =>
                    arr.map((x, idx) =>
                      idx === i
                        ? { ...x, birimFiyat: Number(e.target.value) || 0 }
                        : x
                    )
                  )
                }
              />

              <div>
                {(
                  Number(s.adet || 0) * Number(s.birimFiyat || 0)
                ).toLocaleString()}
              </div>

              <button className="theme-btn" onClick={() => satirSil(i)}>
                Sil
              </button>
            </div>
          ))}
          {!satirlar.length && <div>Satır yok.</div>}
        </div>

        <div style={{ display: "flex", gap: 16, justifyContent: "flex-end" }}>
          <div>
            Net: <b>{netToplam.toLocaleString()}</b>
          </div>
          <div>
            KDV %{kdv}: <b>{kdvTutar.toLocaleString()}</b>
          </div>
          <div>
            Brüt: <b>{brutToplam.toLocaleString()}</b>
          </div>
        </div>
      </div>

      {/* Adım 3 — Diğer */}
      <div
        className="card"
        style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 12 }}
      >
        <input
          className="input"
          type="date"
          value={islemTarih}
          onChange={(e) => setIslemTarih(e.target.value)}
        />
        <input
          className="input"
          placeholder="Açıklama"
          value={aciklama}
          onChange={(e) => setAciklama(e.target.value)}
        />
      </div>

      {/* Müşteri seçici modal */}
      {pickerOpen && (
        <div className="modal" onClick={() => setPickerOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <b>Müşteri Seç</b>
              <input
                className="input"
                placeholder="Ara…"
                value={musteriAra}
                onChange={(e) => setMusteriAra(e.target.value)}
                style={{ marginLeft: "auto" }}
              />
            </div>
            <div
              style={{
                marginTop: 8,
                maxHeight: 360,
                overflow: "auto",
                display: "grid",
                gap: 6,
              }}
            >
              {filtreliMusteriler.map((m) => (
                <button
                  key={m.docId}
                  className="list-btn"
                  onClick={() => {
                    setSeciliMusteriId(m.docId);
                    setPickerOpen(false);
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{m.firmaAdi}</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    {m.yetkili || ""} {m.telefon ? `• ${m.telefon}` : ""}{" "}
                    {m.adres ? `• ${m.adres}` : ""}
                  </div>
                </button>
              ))}
              {!filtreliMusteriler.length && <div>Sonuç yok.</div>}
            </div>
          </div>
        </div>
      )}

      {/* Ürün seçici modal */}
      {urunPicker && (
        <div className="modal" onClick={() => setUrunPicker(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <b>Ürün Ekle</b>
              <input
                className="input"
                placeholder="Ara (ad/kod/renk)…"
                value={urunAra}
                onChange={(e) => setUrunAra(e.target.value)}
                style={{ marginLeft: "auto" }}
              />
            </div>
            <div
              style={{
                marginTop: 8,
                maxHeight: 360,
                overflow: "auto",
                display: "grid",
                gap: 6,
              }}
            >
              {filtreliUrunler.map((u) => (
                <button
                  key={u.id}
                  className="list-btn"
                  onClick={() => urunSec(u.id)}
                >
                  <div style={{ fontWeight: 700 }}>{u.urunAdi}</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    {u.urunKodu} {u.renk ? `• ${u.renk}` : ""}
                  </div>
                </button>
              ))}
              {!filtreliUrunler.length && <div>Sonuç yok.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
  
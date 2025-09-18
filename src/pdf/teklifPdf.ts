import jsPDF from "jspdf";
import autoTable, { RowInput } from "jspdf-autotable";

/* ——— Font yardımcıları ——— */
async function loadTtf(
  doc: jsPDF,
  url: string,
  vfsName: string,
  family: string,
  style: "normal" | "bold"
) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Font fetch failed: ${url}`);
  const buf = await res.arrayBuffer();

  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + chunk) as unknown as number[]
    );
  }
  const b64 = btoa(binary);

  doc.addFileToVFS(vfsName, b64);
  doc.addFont(vfsName, family, style);
}

async function ensureFontFamily(doc: jsPDF): Promise<string> {
  try {
    await loadTtf(doc, "/fonts/NotoSans-Regular.ttf", "NotoSans-Regular.ttf", "NotoSans", "normal");
    await loadTtf(doc, "/fonts/NotoSans-Bold.ttf", "NotoSans-Bold.ttf", "NotoSans", "bold");
    doc.setFont("NotoSans", "normal");
    return "NotoSans";
  } catch {
    doc.setFont("helvetica", "normal");
    return "helvetica";
  }
}

/* ——— Görsel yardımcıları ——— */
async function loadImageDataUrl(possibleUrls: string[]): Promise<string> {
  for (const url of possibleUrls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const blob = await res.blob();
      const reader = new FileReader();
      const p = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
      });
      reader.readAsDataURL(blob);
      return await p;
    } catch {}
  }
  throw new Error("Logo bulunamadı");
}

/* ——— küçük yardımcılar ——— */
const TL = (n: number) =>
  Number(n || 0).toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const NUM = (n: any) => {
  const v = Number(n);
  return Number.isFinite(v) ? v : 0;
};
function toDateStr(ts: any | undefined) {
  try {
    const d = ts?.toDate?.() ?? (ts instanceof Date ? ts : null);
    return d ? d.toLocaleDateString("tr-TR") : "";
  } catch {
    return "";
  }
}

/* ——— KDV yardımcıları ——— */
function resolveKdvOrani(siparis: any): number {
  // Öncelik: fiyat listesi → sipariş → fallback %10
  const candidates = [
    siparis?.fiyatListesi?.kdvOrani,
    siparis?.fiyatListesi?.kdv,
    siparis?.kdvOrani,
    siparis?.kdv,
  ].map(NUM);

  const found = candidates.find((x) => x > 0 && x <= 100);
  return found ?? 10;
}

function isKdvDahil(siparis: any): boolean {
  return Boolean(
    siparis?.fiyatListesi?.kdvDahil ??
    siparis?.kdvDahil ??
    false
  );
}

/* ——— ANA: Teklif PDF ——— */
export async function teklifPdfYazdirWeb(siparis: any) {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const fontFamily = await ensureFontFamily(doc);

  const pageWidth = doc.internal.pageSize.getWidth();
  const leftMargin = 14;
  const rightMargin = 14;
  const contentRightX = pageWidth - rightMargin;

  const teklifTarihi =
    toDateStr(siparis?.islemeTarihi) ||
    toDateStr(siparis?.tarih) ||
    new Date().toLocaleDateString("tr-TR");

  /* ----- Logo ----- */
  let headerBottomY = 20;
  try {
    const logoDataUrl = await loadImageDataUrl([
      "/src/assets/capri_logo_ori.png",
      "/assets/capri_logo_ori.png",
      "src/assets/capri_logo_ori.png",
    ]);

    const img = new Image();
    img.src = logoDataUrl;
    await new Promise((res) => (img.onload = res));

    const pxWidth = img.width;
    const pxHeight = img.height;

    const maxW = 80; // mm
    const maxH = 30; // mm

    let w = maxW;
    let h = (pxHeight / pxWidth) * w;
    if (h > maxH) {
      h = maxH;
      w = (pxWidth / pxHeight) * h;
    }

    const logoX = leftMargin;
    const logoY = 8;
    doc.addImage(logoDataUrl, "PNG", logoX, logoY, w, h);

    headerBottomY = Math.max(headerBottomY, logoY + h);
  } catch {}

  /* ----- Başlık ----- */
  doc.setFont(fontFamily, "bold");
  doc.setFontSize(18);
  doc.setTextColor(0);
  const titleY = headerBottomY;
  doc.text("TEKLİF FİŞİ", pageWidth / 2, titleY, { align: "center" });

  // Sağ üstte tarih
  doc.setFont(fontFamily, "normal");
  doc.setFontSize(11);
  doc.text(`Tarih: ${teklifTarihi}`, contentRightX, titleY - 8, { align: "right" });

  /* ----- Müşteri Bilgileri ----- */
  autoTable(doc, {
    startY: titleY + 4,
    theme: "grid",
    margin: { left: leftMargin, right: rightMargin },
    styles: { font: fontFamily, fontSize: 10, cellPadding: 2 },
    headStyles: { fillColor: [230, 230, 230] },
    body: [
      [
        `Müşteri: ${siparis?.musteri?.firmaAdi ?? siparis?.musteri?.yetkili ?? ""}`,
        `Yetkili: ${siparis?.musteri?.yetkili ?? ""}`,
      ],
      [`Telefon: ${siparis?.musteri?.telefon ?? ""}`, `Adres: ${siparis?.musteri?.adres ?? ""}`],
      [`Açıklama: ${siparis?.aciklama ?? ""}`, ``],
    ],
  });

  /* ----- Ürünler Tablosu ----- */
  const urunler: any[] = Array.isArray(siparis?.urunler) ? siparis.urunler : [];
  const rows: RowInput[] = urunler.map((u: any, i: number) => {
    const adet = NUM(u?.adet);
    const birim = NUM(u?.birimFiyat);
    const tutar = adet * birim;
    return [
      String(i + 1),
      String(u?.urunAdi ?? ""),
      String(u?.renk ?? ""),
      String(adet),
      TL(birim),
      TL(tutar),
    ];
  });

  const startY = ((doc as any).lastAutoTable?.finalY ?? 40) + 6;
  autoTable(doc, {
    startY,
    theme: "grid",
    margin: { left: leftMargin, right: rightMargin },
    styles: { font: fontFamily, fontSize: 10, cellPadding: 2 },
    headStyles: { fillColor: [150, 150, 150], font: fontFamily, fontStyle: "bold" },
    head: [["NO", "ÜRÜN/MODEL", "RENK", "ADET", "BİRİM FİYAT (₺)", "TUTAR (₺)"]],
    body: rows,
    columnStyles: {
      0: { cellWidth: 12 },
      1: { cellWidth: 78 },
      2: { cellWidth: 30 },
      3: { cellWidth: 18, halign: "right" },
      4: { cellWidth: 22, halign: "right" },
      5: { cellWidth: 22, halign: "right" },
    },
  });

  /* ----- Toplamlar: dinamik KDV / kdvDahil desteği ----- */
  const globalKdv = resolveKdvOrani(siparis); // %
  const kdvDahil = isKdvDahil(siparis);

  let araToplam = 0;   // KDV hariç
  let kdvTutar = 0;    // KDV toplamı
  let genelToplam = 0; // KDV dahil

  for (const u of urunler) {
    const adet = NUM(u?.adet);
    const birim = NUM(u?.birimFiyat);

    // Ürün üzerinde farklı oran varsa onu kullan
    const satirKdv = (() => {
      const cands = [u?.kdvOrani, u?.kdv, u?.kdvYuzde].map(NUM);
      const found = cands.find((x) => x > 0 && x <= 100);
      return found ?? globalKdv;
    })();

    if (kdvDahil) {
      // birim fiyat KDV dahil → neti ayır
      const birimNet = birim / (1 + satirKdv / 100);
      const satirNet = birimNet * adet;
      const satirKdvTutar = satirNet * (satirKdv / 100);
      const satirBrut = birim * adet; // zaten dahil

      araToplam += satirNet;
      kdvTutar += satirKdvTutar;
      genelToplam += satirBrut;
    } else {
      // birim fiyat KDV hariç → KDV ekle
      const satirNet = birim * adet;
      const satirKdvTutar = satirNet * (satirKdv / 100);
      const satirBrut = satirNet + satirKdvTutar;

      araToplam += satirNet;
      kdvTutar += satirKdvTutar;
      genelToplam += satirBrut;
    }
  }

  let y = ((doc as any).lastAutoTable?.finalY ?? 260) + 4;
  if (y > 260) { doc.addPage(); y = 20; }

  autoTable(doc, {
    startY: y,
    theme: "grid",
    margin: { left: leftMargin, right: rightMargin },
    styles: { font: fontFamily, fontSize: 10, cellPadding: 2 },
    body: [
      ["Ara Toplam", "", "", "", "", TL(araToplam)],
      [`KDV (Toplam)`, "", "", "", "", TL(kdvTutar)],
      ["Genel Toplam", "", "", "", "", TL(genelToplam)],
    ],
    columnStyles: {
      0: { cellWidth: 60, fontStyle: "bold" },
      5: { cellWidth: 22, halign: "right", fontStyle: "bold" },
    },
  });

  // İsteğe bağlı: sağ üst köşeye bilgi notu
  doc.setFont(fontFamily, "normal");
  doc.setFontSize(9);
  doc.setTextColor(80);
  const info = `Fiyatlar ${kdvDahil ? "KDV DAHİL" : "KDV HARİÇ"}. Global KDV: %${globalKdv}`;
  doc.text(info, contentRightX, 287 - 6, { align: "right" });

  /* ----- Sayfa numarası ----- */
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont(fontFamily, "normal");
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Sayfa ${i}/${total}`, contentRightX, 287, { align: "right" });
  }

  const ad = siparis?.musteri?.firmaAdi ? `Teklif_${siparis.musteri.firmaAdi}.pdf` : "Teklif.pdf";
  try { doc.output("dataurlnewwindow"); } catch { doc.save(ad); }
}

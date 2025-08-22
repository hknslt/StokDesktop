// src/pdf/siparisPdf.ts
import jsPDF from "jspdf";
import autoTable, { RowInput } from "jspdf-autotable";

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

function toDateStr(ts: any | undefined) {
  try {
    const d = ts?.toDate?.() ?? (ts instanceof Date ? ts : null);
    return d ? d.toLocaleDateString() : "";
  } catch {
    return "";
  }
}

export async function siparisPdfYazdirWeb(siparis: any) {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const fontFamily = await ensureFontFamily(doc); 
  const sevkTarihi = toDateStr(siparis?.islemeTarihi);
  const kdvOrani = Number(siparis?.kdvOrani ?? 0);

  // --- Başlık
  doc.setFont(fontFamily, "bold");
  doc.setFontSize(16);
  doc.setTextColor(0);
  doc.text("SEVKİYAT FİŞİ", 20, 18);

  doc.setFont(fontFamily, "normal");
  doc.setFontSize(11);
  doc.text(`Sevkiyat Tarihi: ${sevkTarihi}`, 200, 18, { align: "right" });

  // --- Müşteri Bilgileri
  autoTable(doc, {
    startY: 24,
    theme: "grid",
    styles: { font: fontFamily, fontStyle: "normal", fontSize: 10, cellPadding: 2, textColor: 20 },
    headStyles: { fillColor: [230, 230, 230] },
    body: [
      [`Firma Adı: ${siparis?.musteri?.firmaAdi ?? ""}`, `Yetkili: ${siparis?.musteri?.yetkili ?? ""}`],
      [`İletişim: ${siparis?.musteri?.telefon ?? ""}`, `Teslimat Adresi: ${siparis?.musteri?.adres ?? ""}`],
      [`Fatura Bilgileri: ${siparis?.musteri?.firmaAdi ?? ""}`, `Not: ${siparis?.aciklama ?? ""}`],
    ],
    columnStyles: { 0: { cellWidth: 95 }, 1: { cellWidth: 95 } },
  });

  // --- Ürünler tablosu (BAŞLIK SİYAH)
  const urunler: any[] = Array.isArray(siparis?.urunler) ? siparis.urunler : [];
  const rows: RowInput[] = urunler.map((u: any, i: number) => [
    String(i + 1),
    String(u?.urunAdi ?? ""),
    String(u?.renk ?? ""),
    String(Number(u?.adet || 0)),
    "",
  ]);

  const startY = ((doc as any).lastAutoTable?.finalY ?? 40) + 6;

  autoTable(doc, {
    startY,
    theme: "grid",
    styles: { font: fontFamily, fontStyle: "normal", fontSize: 10, cellPadding: 2, textColor: 20 },
    headStyles: { fillColor: [230, 230, 230], textColor: 0, font: fontFamily, fontStyle: "bold" }, // başlık siyah
    head: [["NO", "MODEL", "RENK", "ADET", "AÇIKLAMA"]],
    body: rows,
    columnStyles: {
      0: { cellWidth: 12 },
      1: { cellWidth: 80 },
      2: { cellWidth: 40 },
      3: { cellWidth: 18, halign: "right" },
      4: { cellWidth: 40 },
    },
  });

  // --- Toplamlar + Sevk/KDV/Teslim (SADECE SON SAYFADA, tablodan SONRA)
  const toplamUrunAdedi = urunler.reduce((t, u) => t + Number(u?.adet || 0), 0);

  const pageCount = doc.getNumberOfPages();
  doc.setPage(pageCount); // son sayfaya git

  let y = ((doc as any).lastAutoTable?.finalY ?? 260) + 4;
  if (y > 260) { // sığmazsa yeni sayfa
    doc.addPage();
    y = 20;
  }

  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { font: fontFamily, fontStyle: "normal", fontSize: 10, cellPadding: 2 },
    body: [["TOPLAM", "", "", String(toplamUrunAdedi), ""]],
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 60 },
      2: { cellWidth: 40 },
      3: { cellWidth: 20, halign: "right" },
      4: { cellWidth: 40 },
    },
  });

  const y2 = ((doc as any).lastAutoTable?.finalY ?? y) + 6;
  doc.setFont(fontFamily, "normal");
  doc.setFontSize(10);
  doc.text(`Sevk Tarihi: ${sevkTarihi}`, 20, y2);
  doc.text(`KDV (%): ${kdvOrani}`, 110, y2);
  doc.text(`Teslim Tarihi:`, 160, y2);

  // --- Sayfa numaraları (alt bilgi)
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont(fontFamily, "normal");
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Sayfa ${i}/${total}`, 200, 287, { align: "right" });
  }

  // Göster / kaydet
  try {
    doc.output("dataurlnewwindow");
  } catch {
    const ad =
      siparis?.musteri?.firmaAdi ? `Sevkiyat_${siparis.musteri.firmaAdi}.pdf` : "Sevkiyat.pdf";
    doc.save(ad);
  }
}

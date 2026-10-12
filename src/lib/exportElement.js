// Turns a DOM element into an image or PDF and hands it over: the native share sheet on phones
// (WhatsApp, etc.) when the browser can share files, a plain download otherwise.
// html2canvas and jsPDF are heavy, so they load on demand and never weigh on the initial bundle.

// Renders the element to a canvas (2x for a crisp image/PDF), always on a white sheet.
export async function renderCanvas(el) {
  const { default: html2canvas } = await import("html2canvas");
  return html2canvas(el, { backgroundColor: "#ffffff", scale: 2 });
}

export async function shareOrDownload(blob, filename, mime, title) {
  try {
    const file = new File([blob], filename, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return;
    }
  } catch {
    // share failed or was cancelled — fall back to a plain download below
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function exportImage(el, filename, title) {
  const canvas = await renderCanvas(el);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("empty blob");
  await shareOrDownload(blob, `${filename}.png`, "image/png", title);
}

// page "image": the PDF page is the image itself. page "a4": the image is fitted, centered, on an A4 sheet
// (landscape when the picture is wider than tall) so it prints well.
export async function exportPdf(el, filename, title, { page = "image" } = {}) {
  const canvas = await renderCanvas(el);
  const { jsPDF } = await import("jspdf");
  const data = canvas.toDataURL("image/png");
  let doc;
  if (page === "a4") {
    doc = new jsPDF({ orientation: canvas.width >= canvas.height ? "landscape" : "portrait", unit: "pt", format: "a4" });
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const margin = 24;
    const k = Math.min((pw - 2 * margin) / canvas.width, (ph - 2 * margin) / canvas.height);
    const w = canvas.width * k;
    const h = canvas.height * k;
    doc.addImage(data, "PNG", (pw - w) / 2, (ph - h) / 2, w, h, undefined, "FAST"); // FAST = compress: a flat diagram stays small
  } else {
    doc = new jsPDF({ unit: "px", format: [canvas.width, canvas.height] });
    doc.addImage(data, "PNG", 0, 0, canvas.width, canvas.height, undefined, "FAST");
  }
  await shareOrDownload(doc.output("blob"), `${filename}.pdf`, "application/pdf", title);
}

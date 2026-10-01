import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

function stripHtml(html: string) {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el.textContent ?? "";
}

function htmlToSimpleMarkdown(html: string) {
  let s = html;
  s = s.replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, "\n## $1\n");
  s = s.replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**");
  s = s.replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**");
  s = s.replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*");
  s = s.replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*");
  s = s.replace(/<u[^>]*>(.*?)<\/u>/gi, "_$1_");
  s = s.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, inner: string) => {
    let n = 1;
    const items = inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, li: string) => `${n++}. ${li.replace(/<[^>]+>/g, "").trim()}\n`);
    return `\n${items}\n`;
  });
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/p>/gi, "\n\n");
  s = s.replace(/<[^>]+>/g, "");
  return s.replace(/\n{3,}/g, "\n\n").trim();
}

export type NoteExportMeta = {
  title: string;
  folder: string;
  authorName: string;
  authorEmail?: string;
  updatedAt: string;
  contentHtml: string;
};

function metaBlock(meta: NoteExportMeta) {
  const when = new Date(meta.updatedAt).toLocaleString();
  return [
    `Title: ${meta.title}`,
    `Folder: ${meta.folder}`,
    `Author: ${meta.authorName}${meta.authorEmail ? ` <${meta.authorEmail}>` : ""}`,
    `Date: ${when}`,
    "",
  ].join("\n");
}

export function downloadMarkdown(meta: NoteExportMeta) {
  const body = htmlToSimpleMarkdown(meta.contentHtml) || stripHtml(meta.contentHtml);
  const md = `# ${meta.title}\n\n${metaBlock(meta)}---\n\n${body}\n`;
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  triggerDownload(blob, `${safeFilename(meta.title)}.md`);
}

export function downloadWord(meta: NoteExportMeta) {
  const when = new Date(meta.updatedAt).toLocaleString();
  const blob = new Blob([buildPrintableDocumentHtml(meta, when)], { type: "application/msword;charset=utf-8" });
  triggerDownload(blob, `${safeFilename(meta.title)}.doc`);
}

export function downloadHtml(meta: NoteExportMeta) {
  const when = new Date(meta.updatedAt).toLocaleString();
  const blob = new Blob([buildStandaloneHtmlDocument(meta, when)], { type: "text/html;charset=utf-8" });
  triggerDownload(blob, `${safeFilename(meta.title)}.html`);
}

function buildStandaloneHtmlDocument(meta: NoteExportMeta, when: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(meta.title)}</title>
<style>
body{font-family:'IBM Plex Sans',Arial,sans-serif;color:#0f172a;max-width:720px;margin:40px auto;padding:0 24px;line-height:1.65;font-size:15px}
h1{margin:0 0 12px;font-size:26px;line-height:1.25}
.meta{font-size:12px;color:#475569;margin-bottom:16px}
.meta p{margin:4px 0}
hr{border:none;border-top:1px solid #cbd5e1;margin:20px 0}
article{word-break:break-word}
ol{list-style:decimal;padding-left:1.6rem;margin:0.4rem 0}li{display:list-item}
</style>
</head>
<body>
  <h1>${escapeHtml(meta.title)}</h1>
  <div class="meta">
    <p><strong>Author:</strong> ${escapeHtml(meta.authorName)}</p>
    <p><strong>Email:</strong> ${escapeHtml(meta.authorEmail ?? "—")}</p>
    <p><strong>Category:</strong> ${escapeHtml(meta.folder)}</p>
    <p><strong>Date:</strong> ${escapeHtml(when)}</p>
  </div>
  <hr/>
  <article>${meta.contentHtml || "<p></p>"}</article>
</body>
</html>`;
}

function buildPrintableDocumentHtml(meta: NoteExportMeta, when: string) {
  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><title>${escapeHtml(meta.title)}</title></head>
<body style="font-family:'IBM Plex Sans',Arial,sans-serif;color:#0f172a;">
<style>ol{list-style:decimal;padding-left:1.6rem;margin:0.4rem 0}li{display:list-item}</style>
  <h1 style="margin:0 0 12px;font-size:22px;">${escapeHtml(meta.title)}</h1>
  <p style="margin:4px 0;font-size:12px;"><strong>Author:</strong> ${escapeHtml(meta.authorName)}</p>
  <p style="margin:4px 0;font-size:12px;"><strong>Email:</strong> ${escapeHtml(meta.authorEmail ?? "—")}</p>
  <p style="margin:4px 0;font-size:12px;"><strong>Folder:</strong> ${escapeHtml(meta.folder)}</p>
  <p style="margin:4px 0 16px;font-size:12px;"><strong>Date:</strong> ${escapeHtml(when)}</p>
  <hr style="border:none;border-top:1px solid #cbd5e1;margin:16px 0;"/>
  <div style="font-size:14px;line-height:1.6;">${meta.contentHtml || "<p></p>"}</div>
</body>
</html>`;
}

/** Renders note to A4 PDF (multi-page) with title, author, folder, and date. */
export async function downloadPdf(meta: NoteExportMeta) {
  const when = new Date(meta.updatedAt).toLocaleString();
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText =
    "position:fixed;left:-12000px;top:0;width:794px;max-width:794px;padding:48px 56px;background:#ffffff;color:#0f172a;box-sizing:border-box;";
  host.innerHTML = `
    <style>ol{list-style:decimal;padding-left:1.6rem;margin:0.4rem 0}li{display:list-item}</style>
    <div style="font-family:'IBM Plex Sans',Arial,sans-serif;">
      <h1 style="margin:0 0 14px;font-size:24px;font-weight:600;line-height:1.25;">${escapeHtml(meta.title)}</h1>
      <div style="margin-bottom:18px;font-size:12px;line-height:1.5;color:#475569;">
        <div><strong>Author:</strong> ${escapeHtml(meta.authorName)}</div>
        <div><strong>Email:</strong> ${escapeHtml(meta.authorEmail ?? "—")}</div>
        <div><strong>Folder:</strong> ${escapeHtml(meta.folder)}</div>
        <div><strong>Date:</strong> ${escapeHtml(when)}</div>
      </div>
      <hr style="border:none;border-top:1px solid #cbd5e1;margin:0 0 20px;" />
      <div style="font-size:14px;line-height:1.65;word-break:break-word;">${meta.contentHtml || "<p></p>"}</div>
    </div>`;
  document.body.appendChild(host);

  try {
    const canvas = await html2canvas(host, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const imgData = canvas.toDataURL("image/png");

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save(`${safeFilename(meta.title)}.pdf`);
  } finally {
    host.remove();
  }
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function safeFilename(name: string) {
  return (name.trim() || "note").replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").slice(0, 80);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const NOTE_MAX_CONTENT = 50_000;
export const NOTE_MAX_TITLE = 200;

export function plainTextLength(html: string) {
  return stripHtml(html).length;
}

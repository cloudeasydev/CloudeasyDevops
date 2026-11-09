export const NOTE_FONT_FAMILIES = [
  { label: "Sans (IBM Plex)", value: '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif' },
  { label: "Serif (Merriweather)", value: 'Merriweather, Georgia, "Times New Roman", serif' },
  { label: "Mono (IBM Plex)", value: '"IBM Plex Mono", ui-monospace, monospace' },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Times New Roman", value: '"Times New Roman", Times, serif' },
  { label: "Courier", value: '"Courier New", Courier, monospace' },
] as const;

export const NOTE_FONT_SIZES = [
  { label: "10 px", value: "10px" },
  { label: "12 px", value: "12px" },
  { label: "14 px", value: "14px" },
  { label: "16 px (default)", value: "16px" },
  { label: "18 px", value: "18px" },
  { label: "20 px", value: "20px" },
  { label: "24 px", value: "24px" },
  { label: "28 px", value: "28px" },
  { label: "32 px", value: "32px" },
  { label: "36 px", value: "36px" },
] as const;

export function applyEditorStyle(
  editor: HTMLElement,
  styles: { fontFamily?: string; fontSize?: string; lineHeight?: string },
) {
  editor.focus();
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;

  const range = sel.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return;

  const cssParts: string[] = [];
  if (styles.fontFamily) cssParts.push(`font-family:${styles.fontFamily}`);
  if (styles.fontSize) cssParts.push(`font-size:${styles.fontSize}`);
  if (styles.lineHeight) cssParts.push(`line-height:${styles.lineHeight}`);
  if (!cssParts.length) return;

  const styleAttr = cssParts.join(";");

  if (range.collapsed) {
    document.execCommand(
      "insertHTML",
      false,
      `<span style="${styleAttr}">\u200B</span>`,
    );
    const spans = editor.querySelectorAll("span");
    const last = spans[spans.length - 1];
    if (last?.firstChild) {
      const r = document.createRange();
      r.setStart(last.firstChild, 1);
      r.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r);
    }
    return;
  }

  const span = document.createElement("span");
  if (styles.fontFamily) span.style.fontFamily = styles.fontFamily;
  if (styles.fontSize) span.style.fontSize = styles.fontSize;
  if (styles.lineHeight) span.style.lineHeight = styles.lineHeight;

  try {
    range.surroundContents(span);
  } catch {
    const fragment = range.extractContents();
    span.appendChild(fragment);
    range.insertNode(span);
  }

  sel.removeAllRanges();
  const after = document.createRange();
  after.selectNodeContents(span);
  after.collapse(false);
  sel.addRange(after);
}

export function setEditorDefaultFont(editor: HTMLElement, fontFamily: string, fontSize: string) {
  editor.style.fontFamily = fontFamily;
  editor.style.fontSize = fontSize;
}

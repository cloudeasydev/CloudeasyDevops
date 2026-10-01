import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlignCenter, AlignLeft, AlignRight, Bold, Italic, ListOrdered, Underline } from "lucide-react";
import { cn } from "@/lib/utils";
import { NOTE_MAX_CONTENT, plainTextLength } from "@/lib/noteExport";
import {
  NOTE_FONT_FAMILIES,
  NOTE_FONT_SIZES,
  applyEditorStyle,
  setEditorDefaultFont,
} from "@/components/docs/richEditorFormat";

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
};

const DEFAULT_FONT = NOTE_FONT_FAMILIES[0].value;
const DEFAULT_SIZE = "16px";

export function RichEditor({ value, onChange, placeholder, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const lastHtml = useRef(value);
  const [fontFamily, setFontFamily] = useState<string>(DEFAULT_FONT);
  const [fontSize, setFontSize] = useState<string>(DEFAULT_SIZE);
  const [align, setAlign] = useState<"left" | "center" | "right">("left");
  const [numbered, setNumbered] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || el.innerHTML === value) return;
    if (value !== lastHtml.current) {
      el.innerHTML = value || "";
      lastHtml.current = value;
    }
  }, [value]);

  useEffect(() => {
    const el = ref.current;
    if (el) setEditorDefaultFont(el, fontFamily, fontSize);
  }, [fontFamily, fontSize]);

  const sync = () => {
    const el = ref.current;
    if (!el) return;
    let html = el.innerHTML;
    if (plainTextLength(html) > NOTE_MAX_CONTENT) {
      toastTrim(el);
      html = el.innerHTML;
    }
    lastHtml.current = html;
    onChange(html);
  };

  const readFormat = () => {
    const centered = document.queryCommandState("justifyCenter");
    const right = document.queryCommandState("justifyRight");
    setAlign(centered ? "center" : right ? "right" : "left");
    setNumbered(document.queryCommandState("insertOrderedList"));
  };

  const cmd = (command: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    readFormat();
    sync();
  };

  const applyFontFamily = (family: string) => {
    setFontFamily(family);
    const el = ref.current;
    if (!el) return;
    applyEditorStyle(el, { fontFamily: family, fontSize });
    sync();
  };

  const applyFontSize = (size: string) => {
    setFontSize(size);
    const el = ref.current;
    if (!el) return;
    applyEditorStyle(el, { fontSize: size, fontFamily });
    sync();
  };

  const len = plainTextLength(value);

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-2">
        <ToolbarBtn title="Bold" onClick={() => cmd("bold")}>
          <Bold className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn title="Italic" onClick={() => cmd("italic")}>
          <Italic className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn title="Underline" onClick={() => cmd("underline")}>
          <Underline className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <span className="mx-0.5 h-5 w-px bg-line" />
        <ToolbarBtn title="Align left" active={align === "left"} onClick={() => cmd("justifyLeft")}>
          <AlignLeft className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn title="Align center" active={align === "center"} onClick={() => cmd("justifyCenter")}>
          <AlignCenter className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn title="Align right" active={align === "right"} onClick={() => cmd("justifyRight")}>
          <AlignRight className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn title="Numbered list (1, 2, 3)" active={numbered} onClick={() => cmd("insertOrderedList")}>
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <span className="mx-0.5 h-5 w-px bg-line" />
        <label className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-faint">
          Font
          <select
            className="h-8 max-w-[140px] rounded-md border border-line bg-canvas px-2 text-xs normal-case text-foreground"
            value={fontFamily}
            onChange={(e) => applyFontFamily(e.target.value)}
            title="Font type"
          >
            {NOTE_FONT_FAMILIES.map((f) => (
              <option key={f.label} value={f.value} style={{ fontFamily: f.value }}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-faint">
          Size
          <select
            className="h-8 w-[118px] rounded-md border border-line bg-canvas px-2 text-xs normal-case text-foreground"
            value={fontSize}
            onChange={(e) => applyFontSize(e.target.value)}
            title="Font size"
          >
            {NOTE_FONT_SIZES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <span className="ml-auto text-[11px] text-muted">
          {len.toLocaleString()} / {NOTE_MAX_CONTENT.toLocaleString()}
        </span>
      </div>
      <p className="border-b border-line px-4 py-1 text-[10px] text-faint">
        Select text, then set font, size, left / center / right, or a numbered list (1, 2, 3).
      </p>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        style={{ fontFamily, fontSize, lineHeight: 1.65 }}
        className="rich-editor min-h-[280px] flex-1 overflow-y-auto px-5 py-4 text-foreground outline-none [&:empty]:before:pointer-events-none [&:empty]:before:text-muted [&:empty]:before:content-[attr(data-placeholder)]"
        onInput={sync}
        onBlur={sync}
        onKeyUp={readFormat}
        onMouseUp={readFormat}
      />
    </div>
  );
}

function ToolbarBtn({
  children,
  title,
  onClick,
  active,
}: {
  children: ReactNode;
  title: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      className={cn("rounded-md p-1.5 hover-surface hover:text-foreground", active ? "bg-accent/15 text-accent-text" : "text-muted")}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function toastTrim(el: HTMLDivElement) {
  const text = el.innerText;
  if (text.length <= NOTE_MAX_CONTENT) return;
  el.innerText = text.slice(0, NOTE_MAX_CONTENT);
}

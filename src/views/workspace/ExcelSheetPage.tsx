"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ClipboardPaste,
  Copy,
  DollarSign,
  Download,
  Italic,
  Minus,
  Percent,
  Plus,
  Printer,
  Redo2,
  Strikethrough,
  Undo2,
  WrapText,
} from "lucide-react";
import { toast } from "sonner";
import { Button, Skeleton } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { downloadCsv, escapeCsvCell } from "@/lib/projectCsv";

type Cell = {
  value: string;
  bold: boolean;
  italic: boolean;
  strike: boolean;
  size: number;
  color: string;
  fill: string;
  align: "left" | "center" | "right";
  format: "general" | "number" | "currency" | "percent" | "decimal" | "decimal2";
  font: string;
  wrap: boolean;
};
type SheetTab = { id: string; name: string; rows: Cell[][] };
type Workbook = { sheets: SheetTab[] };

const FONT_SIZES = [10, 12, 14, 16, 18, 24];
const FONTS = ["Arial", "Calibri", "Georgia", "Courier New", "Times New Roman", "Verdana"];

function columnName(index: number) {
  let name = "";
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function blankCell(): Cell {
  return {
    value: "",
    bold: false,
    italic: false,
    strike: false,
    size: 14,
    color: "",
    fill: "",
    align: "left",
    format: "general",
    font: "Arial",
    wrap: false,
  };
}

function displayValue(cell: Cell) {
  const raw = cell.value.trim().replace(/[$,%]/g, "");
  const number = Number(raw);
  if (!raw || Number.isNaN(number) || cell.format === "general") return cell.value;
  if (cell.format === "currency") return number.toLocaleString("en-US", { style: "currency", currency: "USD" });
  if (cell.format === "percent") return `${number}%`;
  if (cell.format === "number") return number.toLocaleString("en-US");
  if (cell.format === "decimal") return number.toFixed(1);
  if (cell.format === "decimal2") return number.toFixed(2);
  return cell.value;
}

function blankGrid(rowCount = 20, columnCount = 8) {
  return Array.from({ length: rowCount }, () => Array.from({ length: columnCount }, () => blankCell()));
}

function Tool({
  title,
  pressed,
  onClick,
  children,
}: {
  title: string;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-foreground hover:bg-inset ${pressed ? "bg-inset" : ""}`}
    >
      {children}
    </button>
  );
}

function cellStyle(cell: Cell) {
  return {
    fontWeight: cell.bold ? 700 : 400,
    fontStyle: cell.italic ? "italic" : "normal",
    fontSize: `${cell.size || 14}px`,
    fontFamily: cell.font || "Arial",
    textDecoration: cell.strike ? "line-through" : "none",
    color: cell.color || undefined,
    backgroundColor: cell.fill || undefined,
    textAlign: cell.align || "left",
  } as const;
}

export function ExcelSheetPage() {
  const [sheets, setSheets] = useState<SheetTab[]>([]);
  const [activeId, setActiveId] = useState("");
  const [active, setActive] = useState({ row: 0, column: 0 });
  const [anchor, setAnchor] = useState({ row: 0, column: 0 });
  const [filter, setFilter] = useState("");
  const [zoom, setZoom] = useState(100);
  const [status, setStatus] = useState("Saved");
  const history = useRef<SheetTab[][]>([]);
  const future = useRef<SheetTab[][]>([]);
  const gridRef = useRef<HTMLDivElement>(null);
  const formulaRef = useRef<HTMLDivElement>(null);
  const clipRef = useRef<Cell[][] | null>(null);
  const dragRef = useRef<{ block: Cell[][]; from: { r1: number; r2: number; c1: number; c2: number } } | null>(null);
  const actionsRef = useRef({
    copy: () => {},
    cut: () => {},
    paste: (_text: string) => {},
    selectAll: () => {},
    clear: () => {},
    isMulti: () => false,
    inSheet: (_target: EventTarget | null) => false,
  });
  const hydrated = useRef(false);
  const saved = useRef("");

  const { data, isLoading } = useQuery({
    queryKey: ["sheet"],
    queryFn: () => api<Workbook>("/api/sheet"),
  });

  const save = useMutation({
    mutationFn: async (next: SheetTab[]) => {
      await api<Workbook>("/api/sheet", { method: "PUT", body: JSON.stringify({ sheets: next }) });
      return next;
    },
    onSuccess: (next) => {
      saved.current = JSON.stringify(next);
      setStatus("Saved");
    },
    onError: (error: Error) => {
      setStatus("Not saved");
      toast.error(error.message);
    },
  });

  useEffect(() => {
    if (!data?.sheets?.length) return;
    saved.current = JSON.stringify(data.sheets);
    hydrated.current = true;
    setSheets(data.sheets);
    setActiveId((current) => (data.sheets.some((sheet) => sheet.id === current) ? current : data.sheets[0].id));
  }, [data]);

  const saveSheets = save.mutate;
  useEffect(() => {
    if (!hydrated.current || !sheets.length) return;
    const key = JSON.stringify(sheets);
    if (key === saved.current) return;
    setStatus("Saving…");
    const timer = window.setTimeout(() => saveSheets(sheets), 400);
    return () => window.clearTimeout(timer);
  }, [sheets, saveSheets]);

  const sheet = sheets.find((item) => item.id === activeId) ?? sheets[0];
  const rows = sheet?.rows ?? [];
  const columns = rows[0]?.length || 0;
  const query = filter.trim().toLowerCase();
  const visible = rows
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => !query || line.some((cell) => cell.value.toLowerCase().includes(query)));
  const activeCell = rows[active.row]?.[active.column] ?? blankCell();

  function reveal(row: number, column: number) {
    setActive({ row, column });
    window.setTimeout(() => {
      gridRef.current?.querySelector(`[data-cell="${row}-${column}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }, 0);
  }

  function remember(current: SheetTab[]) {
    history.current = [...history.current, current].slice(-30);
    future.current = [];
  }

  function updateSheet(nextRows: Cell[][]) {
    if (!sheet) return;
    setSheets((current) => {
      remember(current);
      return current.map((item) => (item.id === sheet.id ? { ...item, rows: nextRows } : item));
    });
  }

  function undo() {
    const previous = history.current.pop();
    if (!previous) return;
    setSheets((current) => {
      future.current.push(current);
      return previous;
    });
  }

  function redo() {
    const next = future.current.pop();
    if (!next) return;
    setSheets((current) => {
      history.current.push(current);
      return next;
    });
  }

  function changeSize(step: number) {
    const index = FONT_SIZES.indexOf(activeCell.size);
    const next = FONT_SIZES[Math.min(FONT_SIZES.length - 1, Math.max(0, (index < 0 ? 2 : index) + step))];
    patchSelection({ size: next });
  }

  function exportCsv() {
    const lines = rows.map((line) => line.map((cell) => escapeCsvCell(cell.value)).join(","));
    const name = (sheet?.name || "sheet").replace(/[^\w.-]+/g, "-");
    downloadCsv(`${name}.csv`, `\uFEFF${lines.join("\r\n")}`);
    toast.success("Exported CSV");
  }

  function selectionBounds() {
    return {
      r1: Math.min(anchor.row, active.row),
      r2: Math.max(anchor.row, active.row),
      c1: Math.min(anchor.column, active.column),
      c2: Math.max(anchor.column, active.column),
    };
  }

  function selectionBlock() {
    const { r1, r2, c1, c2 } = selectionBounds();
    return rows.slice(r1, r2 + 1).map((line) => line.slice(c1, c2 + 1).map((cell) => ({ ...cell })));
  }

  function blockText(block: Cell[][]) {
    return block.map((line) => line.map((cell) => cell.value).join("\t")).join("\n");
  }

  async function copySelection() {
    const block = selectionBlock();
    if (!block.length) return;
    clipRef.current = block;
    try {
      await navigator.clipboard.writeText(blockText(block));
    } catch {
      /* the in-app clipboard still keeps the cells */
    }
  }

  function cutSelection() {
    const bounds = selectionBounds();
    const block = selectionBlock();
    clipRef.current = block;
    void navigator.clipboard.writeText(blockText(block)).catch(() => undefined);
    const next = rows.map((line) => line.map((cell) => ({ ...cell })));
    for (let row = bounds.r1; row <= bounds.r2 && row < next.length; row += 1) {
      for (let column = bounds.c1; column <= bounds.c2 && column < next[row].length; column += 1) next[row][column] = blankCell();
    }
    updateSheet(next);
  }

  function pasteText(text: string, at = active, moveFrom?: { r1: number; r2: number; c1: number; c2: number }) {
    const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n$/, "");
    const internal = clipRef.current;
    const block =
      internal && blockText(internal) === normalized
        ? internal.map((line) => line.map((cell) => ({ ...cell })))
        : normalized.split("\n").map((line) => line.split("\t").map((value) => ({ ...blankCell(), value })));
    placeBlock(block, at.row, at.column, moveFrom);
  }

  function placeBlock(block: Cell[][], originRow: number, originCol: number, clear?: { r1: number; r2: number; c1: number; c2: number }) {
    if (!block.length) return;
    let next = rows.map((line) => line.map((cell) => ({ ...cell })));
    const height = Math.min(200, originRow + block.length);
    const width = Math.min(40, originCol + Math.max(...block.map((line) => line.length), 1));
    while (next.length < height) next.push(Array.from({ length: next[0]?.length || 1 }, () => blankCell()));
    next = next.map((line) => {
      const copy = line.slice();
      while (copy.length < width) copy.push(blankCell());
      return copy;
    });
    if (clear) {
      for (let row = clear.r1; row <= clear.r2 && row < next.length; row += 1) {
        for (let column = clear.c1; column <= clear.c2 && column < next[row].length; column += 1) next[row][column] = blankCell();
      }
    }
    let clipped = false;
    block.forEach((line, rowOffset) => {
      line.forEach((cell, columnOffset) => {
        const row = originRow + rowOffset;
        const column = originCol + columnOffset;
        if (row >= 200 || column >= 40) {
          clipped = true;
          return;
        }
        if (next[row] && next[row][column]) next[row][column] = { ...cell };
      });
    });
    if (clipped) toast.error("Paste was cut off at the sheet edge");
    setFilter("");
    updateSheet(next);
    setAnchor({ row: originRow, column: originCol });
    reveal(originRow, originCol);
  }

  function selectAll() {
    if (!rows.length || !columns) return;
    setActive({ row: 0, column: 0 });
    setAnchor({ row: rows.length - 1, column: columns - 1 });
  }

  function clearSelection() {
    const { r1, r2, c1, c2 } = selectionBounds();
    const next = rows.map((line) => line.map((cell) => ({ ...cell })));
    for (let row = r1; row <= r2 && row < next.length; row += 1) {
      for (let column = c1; column <= c2 && column < next[row].length; column += 1) next[row][column] = blankCell();
    }
    updateSheet(next);
  }

  function patchSelection(patch: Partial<Cell>) {
    const { r1, r2, c1, c2 } = selectionBounds();
    updateSheet(
      rows.map((line, rowIndex) =>
        line.map((cell, columnIndex) => (rowIndex >= r1 && rowIndex <= r2 && columnIndex >= c1 && columnIndex <= c2 ? { ...cell, ...patch } : cell)),
      ),
    );
  }

  function selectRow(rowIndex: number, extend: boolean) {
    if (extend) setActive({ row: rowIndex, column: Math.max(columns - 1, 0) });
    else {
      setActive({ row: rowIndex, column: 0 });
      setAnchor({ row: rowIndex, column: Math.max(columns - 1, 0) });
    }
  }

  function selectColumn(columnIndex: number, extend: boolean) {
    if (extend) setActive({ row: Math.max(rows.length - 1, 0), column: columnIndex });
    else {
      setActive({ row: 0, column: columnIndex });
      setAnchor({ row: Math.max(rows.length - 1, 0), column: columnIndex });
    }
  }

  function updateCell(row: number, column: number, patch: Partial<Cell>) {
    updateSheet(rows.map((line, rowIndex) => (rowIndex === row ? line.map((cell, columnIndex) => (columnIndex === column ? { ...cell, ...patch } : cell)) : line)));
    setActive({ row, column });
  }

  function addRow(at = rows.length) {
    if (rows.length >= 200) {
      toast.error("This sheet already has 200 rows");
      return;
    }
    const index = Math.max(0, Math.min(at, rows.length));
    const next = rows.slice();
    next.splice(index, 0, Array.from({ length: Math.max(columns, 1) }, () => blankCell()));
    setFilter("");
    updateSheet(next);
    reveal(index, Math.min(active.column, Math.max(columns - 1, 0)));
  }

  function addColumn(at = columns) {
    if (columns >= 40) {
      toast.error("This sheet already has 40 columns");
      return;
    }
    const index = Math.max(0, Math.min(at, columns));
    updateSheet(rows.map((line) => {
      const next = line.slice();
      next.splice(index, 0, blankCell());
      return next;
    }));
    reveal(Math.min(active.row, Math.max(rows.length - 1, 0)), index);
  }

  function deleteRow() {
    const { r1, r2 } = selectionBounds();
    const removing = r2 - r1 + 1;
    if (removing >= rows.length) {
      updateSheet([Array.from({ length: Math.max(columns, 1) }, () => blankCell())]);
      setActive({ row: 0, column: 0 });
      setAnchor({ row: 0, column: Math.max(columns - 1, 0) });
      return;
    }
    updateSheet(rows.filter((_, rowIndex) => rowIndex < r1 || rowIndex > r2));
    const nextRow = Math.max(0, r1 - 1);
    setActive({ row: nextRow, column: 0 });
    setAnchor({ row: nextRow, column: Math.max(columns - 1, 0) });
  }

  function deleteColumn() {
    const { c1, c2 } = selectionBounds();
    const removing = c2 - c1 + 1;
    if (removing >= columns) {
      updateSheet(rows.map(() => [blankCell()]));
      setActive({ row: 0, column: 0 });
      setAnchor({ row: Math.max(rows.length - 1, 0), column: 0 });
      return;
    }
    updateSheet(rows.map((line) => line.filter((_, columnIndex) => columnIndex < c1 || columnIndex > c2)));
    const nextColumn = Math.max(0, c1 - 1);
    setActive({ row: 0, column: nextColumn });
    setAnchor({ row: Math.max(rows.length - 1, 0), column: nextColumn });
  }

  function addSheet() {
    if (sheets.length >= 12) {
      toast.error("You can keep up to 12 sheets");
      return;
    }
    const next = { id: crypto.randomUUID(), name: `Sheet${sheets.length + 1}`, rows: blankGrid() };
    setSheets((current) => {
      remember(current);
      return [...current, next];
    });
    setActiveId(next.id);
    setActive({ row: 0, column: 0 });
  }

  function deleteSheet(id: string) {
    if (sheets.length <= 1) return;
    const remaining = sheets.filter((item) => item.id !== id);
    setSheets((current) => {
      remember(current);
      return current.filter((item) => item.id !== id);
    });
    if (activeId === id) setActiveId(remaining[0]?.id ?? "");
  }

  function renameSheet(id: string, name: string) {
    setSheets((current) => current.map((item) => (item.id === id ? { ...item, name: name.slice(0, 31) } : item)));
  }

  actionsRef.current = {
    copy: () => void copySelection(),
    cut: cutSelection,
    paste: (text) => pasteText(text),
    selectAll,
    clear: clearSelection,
    isMulti: () => {
      const bounds = selectionBounds();
      return bounds.r1 !== bounds.r2 || bounds.c1 !== bounds.c2;
    },
    inSheet: (target) => target instanceof Node && Boolean(gridRef.current?.contains(target) || formulaRef.current?.contains(target)),
  };

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!actionsRef.current.inSheet(event.target)) return;
      const meta = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (meta && key === "a") {
        event.preventDefault();
        actionsRef.current.selectAll();
        return;
      }
      if (!meta && (event.key === "Delete" || event.key === "Backspace") && actionsRef.current.isMulti()) {
        event.preventDefault();
        actionsRef.current.clear();
        return;
      }
      if (!meta) return;
      const input = event.target instanceof HTMLInputElement ? event.target : null;
      const editingText = Boolean(input && input.selectionStart !== input.selectionEnd);
      if ((key === "c" || key === "x") && editingText) return;
      if (key === "c") {
        event.preventDefault();
        actionsRef.current.copy();
      }
      if (key === "x") {
        event.preventDefault();
        actionsRef.current.cut();
      }
      if (key === "v") {
        event.preventDefault();
        void navigator.clipboard.readText().then((text) => actionsRef.current.paste(text)).catch(() => toast.error("Allow clipboard access to paste"));
      }
    }
    function onPaste(event: ClipboardEvent) {
      if (!actionsRef.current.inSheet(event.target)) return;
      const text = event.clipboardData?.getData("text/plain") ?? "";
      if (!text.includes("\t") && !/[\n\r]/.test(text)) return;
      event.preventDefault();
      actionsRef.current.paste(text);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("paste", onPaste);
    };
  }, []);

  if (isLoading || !sheet) return <Skeleton className="h-[70vh]" />;

  return (
    <div className="-m-3 flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col bg-canvas sm:-m-4 md:-m-6">
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-line bg-raised px-2 py-1.5">
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter"
          className="h-8 w-28 shrink-0 rounded-full border border-line bg-canvas px-3 text-sm outline-none focus:border-accent/60"
        />
        <Tool title="Select all" onClick={selectAll}><span className="text-[10px] font-semibold">All</span></Tool>
        <Tool title="Copy" onClick={() => void copySelection()}><Copy className="h-4 w-4" /></Tool>
        <Tool title="Clear selection" onClick={clearSelection}><span className="text-[10px] font-semibold">Del</span></Tool>
        <Tool title="Paste" onClick={() => void navigator.clipboard.readText().then((text) => pasteText(text)).catch(() => toast.error("Allow clipboard access to paste"))}><ClipboardPaste className="h-4 w-4" /></Tool>
        <Tool title="Undo" onClick={undo}><Undo2 className="h-4 w-4" /></Tool>
        <Tool title="Redo" onClick={redo}><Redo2 className="h-4 w-4" /></Tool>
        <Tool title="Print" onClick={() => window.print()}><Printer className="h-4 w-4" /></Tool>
        <select className="h-8 rounded-md border border-line bg-canvas px-1 text-xs" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} title="Zoom">
          {[75, 100, 125, 150].map((value) => (
            <option key={value} value={value}>{value}%</option>
          ))}
        </select>
        <span className="mx-1 h-5 w-px bg-line" />
        <Tool title="Currency" pressed={activeCell.format === "currency"} onClick={() => patchSelection({ format: "currency" })}><DollarSign className="h-4 w-4" /></Tool>
        <Tool title="Percent" pressed={activeCell.format === "percent"} onClick={() => patchSelection({ format: "percent" })}><Percent className="h-4 w-4" /></Tool>
        <Tool title="One decimal" pressed={activeCell.format === "decimal"} onClick={() => patchSelection({ format: "decimal" })}><span className="text-xs font-medium">.0</span></Tool>
        <Tool title="Two decimals" pressed={activeCell.format === "decimal2"} onClick={() => patchSelection({ format: "decimal2" })}><span className="text-xs font-medium">.00</span></Tool>
        <Tool title="Number" pressed={activeCell.format === "number"} onClick={() => patchSelection({ format: "number" })}><span className="text-xs font-medium">123</span></Tool>
        <span className="mx-1 h-5 w-px bg-line" />
        <select className="h-8 max-w-28 rounded-md border border-line bg-canvas px-1 text-xs" value={activeCell.font || "Arial"} onChange={(event) => patchSelection({ font: event.target.value })} title="Font">
          {FONTS.map((font) => (
            <option key={font} value={font}>{font}</option>
          ))}
        </select>
        <Tool title="Smaller" onClick={() => changeSize(-1)}><Minus className="h-4 w-4" /></Tool>
        <span className="w-6 text-center text-xs">{activeCell.size || 14}</span>
        <Tool title="Larger" onClick={() => changeSize(1)}><Plus className="h-4 w-4" /></Tool>
        <span className="mx-1 h-5 w-px bg-line" />
        <Tool title="Bold" pressed={activeCell.bold} onClick={() => patchSelection({ bold: !activeCell.bold })}><Bold className="h-4 w-4" /></Tool>
        <Tool title="Italic" pressed={activeCell.italic} onClick={() => patchSelection({ italic: !activeCell.italic })}><Italic className="h-4 w-4" /></Tool>
        <Tool title="Strikethrough" pressed={activeCell.strike} onClick={() => patchSelection({ strike: !activeCell.strike })}><Strikethrough className="h-4 w-4" /></Tool>
        <label className="relative inline-flex h-8 w-8 items-center justify-center" title="Text color">
          <span className="text-sm font-semibold underline decoration-2" style={{ textDecorationColor: activeCell.color || "currentColor" }}>A</span>
          <input type="color" className="absolute inset-0 cursor-pointer opacity-0" value={activeCell.color || "#111827"} onChange={(event) => patchSelection({ color: event.target.value })} />
        </label>
        <label className="relative inline-flex h-8 w-8 items-center justify-center" title="Fill color">
          <span className="h-4 w-4 rounded-sm border border-line" style={{ background: activeCell.fill || "transparent" }} />
          <input type="color" className="absolute inset-0 cursor-pointer opacity-0" value={activeCell.fill || "#ffffff"} onChange={(event) => patchSelection({ fill: event.target.value })} />
        </label>
        <span className="mx-1 h-5 w-px bg-line" />
        <Tool title="Align left" pressed={activeCell.align === "left"} onClick={() => patchSelection({ align: "left" })}><AlignLeft className="h-4 w-4" /></Tool>
        <Tool title="Align center" pressed={activeCell.align === "center"} onClick={() => patchSelection({ align: "center" })}><AlignCenter className="h-4 w-4" /></Tool>
        <Tool title="Align right" pressed={activeCell.align === "right"} onClick={() => patchSelection({ align: "right" })}><AlignRight className="h-4 w-4" /></Tool>
        <Tool title="Wrap text" pressed={activeCell.wrap} onClick={() => patchSelection({ wrap: !activeCell.wrap })}><WrapText className="h-4 w-4" /></Tool>
        <span className="mx-1 h-5 w-px bg-line" />
        <Button variant="outline" size="sm" onClick={() => addRow(active.row + 1)}><Plus className="h-3.5 w-3.5" /> Add row</Button>
        <Button variant="outline" size="sm" onClick={() => addColumn(active.column + 1)}><Plus className="h-3.5 w-3.5" /> Add column</Button>
        <Button variant="ghost" size="sm" onClick={deleteRow}>Delete row</Button>
        <Button variant="ghost" size="sm" onClick={deleteColumn}>Delete column</Button>
        <Button variant="primary" size="sm" onClick={exportCsv}><Download className="h-3.5 w-3.5" /> Export CSV</Button>
        <span className="ml-auto shrink-0 text-xs text-muted">{status}</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div ref={formulaRef} className="flex border-b border-line bg-raised">
          <div className="flex w-16 shrink-0 items-center justify-center border-r border-line font-mono text-xs text-muted">
            {columnName(active.column)}
            {active.row + 1}
          </div>
          <input
            className="h-9 min-w-0 flex-1 bg-transparent px-3 outline-none"
            style={cellStyle(activeCell)}
            value={activeCell.value}
            onChange={(event) => updateCell(active.row, active.column, { value: event.target.value })}
          />
        </div>
        <div ref={gridRef} className="min-h-0 flex-1 overflow-auto" style={{ zoom: zoom / 100 }}>
          <table className="border-collapse">
            <thead className="sticky top-0 z-10 bg-raised">
              <tr>
                <th className="sticky left-0 z-20 w-12 border border-line bg-raised p-0">
                  <button type="button" className="h-7 w-full text-[10px] font-semibold text-muted hover:text-foreground" title="Select all" onClick={selectAll}>
                    All
                  </button>
                </th>
                {Array.from({ length: columns }, (_, index) => (
                  <th key={index} className="w-36 border border-line p-0 text-center text-xs font-semibold text-muted">
                    <button type="button" className="h-7 w-full hover:bg-inset" title={`Select column ${columnName(index)}`} onClick={(event) => selectColumn(index, event.shiftKey)}>
                      {columnName(index)}
                    </button>
                  </th>
                ))}
                <th className="w-10 border border-line bg-raised">
                  <button type="button" className="h-7 w-8 text-base text-muted hover:text-foreground" title="Add column" onClick={() => addColumn(columns)}>
                    +
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.length ? (
                visible.map(({ line, index: rowIndex }) => (
                  <tr key={rowIndex}>
                    <th className="sticky left-0 z-10 w-12 border border-line bg-raised p-0 text-center text-xs font-medium text-muted">
                      <button type="button" className="h-8 w-full hover:bg-inset" title={`Select row ${rowIndex + 1}`} onClick={(event) => selectRow(rowIndex, event.shiftKey)}>
                        {rowIndex + 1}
                      </button>
                    </th>
                    {line.map((cell, columnIndex) => {
                      const selected = active.row === rowIndex && active.column === columnIndex;
                      const bounds = selectionBounds();
                      const inRange = rowIndex >= bounds.r1 && rowIndex <= bounds.r2 && columnIndex >= bounds.c1 && columnIndex <= bounds.c2;
                      return (
                        <td
                          key={columnIndex}
                          data-cell={`${rowIndex}-${columnIndex}`}
                          draggable
                          onDragStart={(event) => {
                            const bounds = selectionBounds();
                            const inside = rowIndex >= bounds.r1 && rowIndex <= bounds.r2 && columnIndex >= bounds.c1 && columnIndex <= bounds.c2;
                            const block = inside ? selectionBlock() : [[{ ...cell }]];
                            const from = inside ? bounds : { r1: rowIndex, r2: rowIndex, c1: columnIndex, c2: columnIndex };
                            clipRef.current = block;
                            dragRef.current = { block, from };
                            event.dataTransfer.setData("text/plain", blockText(block));
                            event.dataTransfer.effectAllowed = "move";
                          }}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => {
                            event.preventDefault();
                            const drag = dragRef.current;
                            if (drag) placeBlock(drag.block.map((line) => line.map((item) => ({ ...item }))), rowIndex, columnIndex, drag.from);
                            else pasteText(event.dataTransfer.getData("text/plain"), { row: rowIndex, column: columnIndex });
                            dragRef.current = null;
                          }}
                          className={`border border-line p-0 ${inRange ? "bg-accent/10" : ""} ${selected ? "outline outline-2 outline-accent" : ""}`}
                        >
                          <input
                            className={`w-36 bg-transparent px-2 outline-none focus:bg-inset ${cell.wrap ? "min-h-8 whitespace-normal" : "h-8"}`}
                            style={cellStyle(cell)}
                            value={selected ? cell.value : displayValue(cell)}
                            onMouseDown={(event) => {
                              if (event.shiftKey) setActive({ row: rowIndex, column: columnIndex });
                              else setAnchor({ row: rowIndex, column: columnIndex });
                            }}
                            onFocus={() => setActive({ row: rowIndex, column: columnIndex })}
                            onChange={(event) => updateCell(rowIndex, columnIndex, { value: event.target.value })}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))
              ) : null}
              <tr>
                <th className="sticky left-0 z-10 border border-line bg-raised">
                  <button type="button" className="h-7 w-full text-base text-muted hover:text-foreground" title="Add row" onClick={() => addRow(rows.length)}>
                    +
                  </button>
                </th>
                <td colSpan={columns + 1} className="border border-line" />
              </tr>
              {!visible.length ? (
                <tr>
                  <td colSpan={columns + 1} className="px-4 py-8 text-center text-sm text-muted">
                    No rows match that filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="flex items-end gap-1 overflow-x-auto border-t border-line bg-raised px-2 pt-2">
          {sheets.map((item) => {
            const selected = item.id === sheet.id;
            return (
              <div key={item.id} className={`flex items-center rounded-t-md border border-b-0 ${selected ? "border-line bg-canvas" : "border-transparent"}`}>
                <input
                  value={item.name}
                  onFocus={() => {
                    if (item.id === sheet.id) return;
                    setActiveId(item.id);
                    setActive({ row: 0, column: 0 });
                  }}
                  onChange={(event) => renameSheet(item.id, event.target.value)}
                  className="h-8 w-28 bg-transparent px-2 text-sm outline-none"
                />
                {sheets.length > 1 && (
                  <button type="button" className="px-2 text-xs text-muted hover:text-foreground" title="Delete sheet" onClick={() => deleteSheet(item.id)}>
                    ×
                  </button>
                )}
              </div>
            );
          })}
          <button type="button" className="mb-1 inline-flex h-8 items-center gap-1 rounded-md px-2 text-sm text-muted hover:text-foreground" onClick={addSheet}>
            <Plus className="h-3.5 w-3.5" /> Sheet
          </button>
        </div>
      </div>
    </div>
  );
}

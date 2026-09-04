"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";

type Option = { label: string; value: string };
type SharedFieldProps = { name: string; label: string; help?: string; required?: boolean; className?: string };

export function FieldHelp({ label, help }: { label: string; help: string }) {
  return <span className="builder-field-help" tabIndex={0} aria-label={`${label}: ${help}`} data-tooltip={help}>?</span>;
}

function FieldLabel({ id, label, help, required }: SharedFieldProps & { id: string }) {
  return <span className="drop-field__label" id={`${id}-label`}>{label}{required && <i aria-hidden="true">*</i>}{help && <FieldHelp label={label} help={help} />}</span>;
}

function usePopover(open: boolean, close: () => void, root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) close(); };
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [close, open, root]);
}

export function FormSelectField({ name, label, help, options, placeholder = "Select an option", required = false, className, value, defaultValue = "", onValueChange }: SharedFieldProps & { options: Option[]; placeholder?: string; value?: string; defaultValue?: string; onValueChange?: (value: string) => void }) {
  const generatedId = useId();
  const id = `${name}-${generatedId}`;
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const selectedValue = value ?? internalValue;
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === selectedValue));
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const selected = options.find((option) => option.value === selectedValue);
  function close() { setOpen(false); window.requestAnimationFrame(() => trigger.current?.focus()); }
  usePopover(open, close, root);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(selectedIndex);
    window.requestAnimationFrame(() => list.current?.focus());
  }, [open, selectedIndex]);

  function choose(nextValue: string) {
    if (value === undefined) setInternalValue(nextValue);
    onValueChange?.(nextValue);
    setOpen(false);
    window.requestAnimationFrame(() => trigger.current?.focus());
  }

  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (options.length === 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((index) => (index + direction + options.length) % options.length);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActiveIndex(event.key === "Home" ? 0 : options.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = options[activeIndex];
      if (option) choose(option.value);
    } else if (event.key === "Tab") close();
  }

  return <div ref={root} className={`drop-field${className ? ` ${className}` : ""}`}>
    <FieldLabel id={id} name={name} label={label} help={help} required={required} />
    <input type="hidden" name={name} value={selectedValue} />
    <div className="drop-select">
      <button ref={trigger} type="button" role="combobox" aria-controls={`${id}-options`} aria-expanded={open} aria-haspopup="listbox" aria-labelledby={`${id}-label ${id}-value`} onClick={() => setOpen((current) => !current)} onKeyDown={(event) => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); } }}><span id={`${id}-value`} data-placeholder={!selected}>{selected?.label ?? placeholder}</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4.5 6.25 3.5 3.5 3.5-3.5" /></svg></button>
      {open && <div ref={list} id={`${id}-options`} className="drop-select__menu" role="listbox" tabIndex={-1} aria-labelledby={`${id}-label`} aria-activedescendant={`${id}-option-${activeIndex}`} onKeyDown={navigate}>{options.length === 0 ? <p>No options available</p> : options.map((option, index) => <button key={option.value} id={`${id}-option-${index}`} type="button" role="option" aria-selected={option.value === selectedValue} data-active={index === activeIndex} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(option.value)}><span>{option.label}</span>{option.value === selectedValue && <i aria-hidden="true">✓</i>}</button>)}</div>}
    </div>
  </div>;
}

function pad(value: number) { return String(value).padStart(2, "0"); }
type DateFieldMode = "date" | "datetime";
function localValue(date: Date, mode: DateFieldMode) {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return mode === "date" ? day : `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function parseLocal(value: string, mode: DateFieldMode) {
  const pattern = mode === "date"
    ? /^(\d{4})-(\d{2})-(\d{2})$/
    : /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
  const match = pattern.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const hour = Number(match[4] ?? 0);
  const minute = Number(match[5] ?? 0);
  const date = new Date(year, month, day, hour, minute);
  if (Number.isNaN(date.getTime()) || date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day || date.getHours() !== hour || date.getMinutes() !== minute) return null;
  return date;
}
function displayValue(value: string, mode: DateFieldMode) {
  const date = parseLocal(value, mode);
  return date ? new Intl.DateTimeFormat("en", mode === "date"
    ? { day: "numeric", month: "short", year: "numeric" }
    : { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date) : null;
}
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

export function FormDateTimeField({ name, label, help, required = false, className, defaultValue = "", min, mode = "datetime" }: SharedFieldProps & { defaultValue?: string; min?: string; mode?: DateFieldMode }) {
  const generatedId = useId();
  const id = `${name}-${generatedId}`;
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [value, setValue] = useState(defaultValue);
  const [draft, setDraft] = useState(defaultValue);
  const initial = parseLocal(defaultValue, mode) ?? new Date();
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [open, setOpen] = useState(false);
  const [hour, setHour] = useState(pad(initial.getHours()));
  const [minute, setMinute] = useState(pad(initial.getMinutes()));
  function close() { setOpen(false); window.requestAnimationFrame(() => trigger.current?.focus()); }
  usePopover(open, close, root);

  const days = useMemo(() => {
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const leading = (new Date(year, month, 1).getDay() + 6) % 7;
    const count = new Date(year, month + 1, 0).getDate();
    return [...Array<null>(leading).fill(null), ...Array.from({ length: count }, (_, index) => index + 1)];
  }, [visibleMonth]);

  function openPicker() {
    const selected = parseLocal(value, mode) ?? new Date();
    setDraft(localValue(selected, mode));
    setHour(pad(selected.getHours()));
    setMinute(pad(selected.getMinutes()));
    setVisibleMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
    setOpen(true);
  }

  function commit(next: string) {
    if (min && next < min) return false;
    setDraft(next);
    setValue(next);
    return true;
  }

  function selectDay(day: number) {
    const selectedHour = Math.min(23, Math.max(0, Number(hour) || 0));
    const selectedMinute = Math.min(59, Math.max(0, Number(minute) || 0));
    const next = localValue(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day, selectedHour, selectedMinute), mode);
    if (!commit(next)) return;
    if (mode === "date") {
      setOpen(false);
      window.requestAnimationFrame(() => trigger.current?.focus());
    }
  }

  function updateTime(part: "hour" | "minute", rawValue: string) {
    const cleanValue = rawValue.replace(/\D/g, "").slice(0, 2);
    if (part === "hour") setHour(cleanValue);
    else setMinute(cleanValue);

    const nextHour = Number(part === "hour" ? cleanValue : hour);
    const nextMinute = Number(part === "minute" ? cleanValue : minute);
    if (!cleanValue || !Number.isInteger(nextHour) || nextHour < 0 || nextHour > 23 || !Number.isInteger(nextMinute) || nextMinute < 0 || nextMinute > 59) return;

    const selected = parseLocal(draft, mode) ?? parseLocal(value, mode) ?? new Date();
    selected.setHours(nextHour, nextMinute, 0, 0);
    commit(localValue(selected, mode));
  }

  function normalizeTime(part: "hour" | "minute") {
    const limit = part === "hour" ? 23 : 59;
    const current = part === "hour" ? hour : minute;
    updateTime(part, pad(Math.min(limit, Math.max(0, Number(current) || 0))));
  }

  function apply() {
    const selected = parseLocal(draft, mode);
    const nextHour = Number(hour);
    const nextMinute = Number(minute);
    if (!selected || !Number.isInteger(nextHour) || nextHour < 0 || nextHour > 23 || !Number.isInteger(nextMinute) || nextMinute < 0 || nextMinute > 59) return;
    selected.setHours(nextHour, nextMinute, 0, 0);
    const next = localValue(selected, mode);
    if (min && next < min) return;
    if (commit(next)) close();
  }

  const selectedDraft = parseLocal(draft, mode);
  const visibleValue = value;
  const today = new Date();
  const monthLabel = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(visibleMonth);

  return <div ref={root} className={`drop-field${className ? ` ${className}` : ""}`}>
    <FieldLabel id={id} name={name} label={label} help={help} required={required} />
    <input type="hidden" name={name} value={value} />
    <div className="drop-datetime">
      <button ref={trigger} type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls={`${id}-picker`} aria-labelledby={`${id}-label ${id}-value`} onClick={() => open ? close() : openPicker()}><span id={`${id}-value`} data-placeholder={!visibleValue}>{displayValue(visibleValue, mode) ?? (mode === "date" ? "Choose date" : "Choose date and time")}</span><svg viewBox="0 0 18 18" aria-hidden="true"><rect x="2.25" y="3.5" width="13.5" height="12" rx="2" /><path d="M5.5 1.75v3.5M12.5 1.75v3.5M2.5 7.25h13" /><path d="M6 10h.01M9 10h.01M12 10h.01M6 13h.01M9 13h.01" /></svg></button>
      {open && <section id={`${id}-picker`} className="drop-datetime__popover" role="dialog" aria-modal="false" aria-labelledby={`${id}-month`}>
        <header><button type="button" aria-label="Previous month" onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}>←</button><strong id={`${id}-month`}>{monthLabel}</strong><button type="button" aria-label="Next month" onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}>→</button></header>
        <div className="drop-calendar__week" aria-hidden="true">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
        <div className="drop-calendar" role="grid" aria-label={monthLabel}>{days.map((day, index) => day === null ? <span key={`blank-${index}`} /> : <button key={day} type="button" role="gridcell" aria-selected={Boolean(selectedDraft && selectedDraft.getFullYear() === visibleMonth.getFullYear() && selectedDraft.getMonth() === visibleMonth.getMonth() && selectedDraft.getDate() === day)} data-today={today.getFullYear() === visibleMonth.getFullYear() && today.getMonth() === visibleMonth.getMonth() && today.getDate() === day} onClick={() => selectDay(day)}>{day}</button>)}</div>
        {mode === "datetime" && <div className="drop-time"><span>Time</span><label><span className="sr-only">Hour</span><input inputMode="numeric" value={hour} maxLength={2} onChange={(event) => updateTime("hour", event.target.value)} onBlur={() => normalizeTime("hour")} /></label><b>:</b><label><span className="sr-only">Minute</span><input inputMode="numeric" value={minute} maxLength={2} onChange={(event) => updateTime("minute", event.target.value)} onBlur={() => normalizeTime("minute")} /></label></div>}
        <footer><button type="button" onClick={() => { const next = new Date(); const nextValue = localValue(next, mode); if (!commit(nextValue)) return; setVisibleMonth(new Date(next.getFullYear(), next.getMonth(), 1)); setHour(pad(next.getHours())); setMinute(pad(next.getMinutes())); if (mode === "date") close(); }}>Today</button><div><button type="button" onClick={close}>Close</button>{mode === "datetime" && <button type="button" onClick={apply}>Done</button>}</div></footer>
      </section>}
    </div>
  </div>;
}

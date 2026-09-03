"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ToastTone = "success" | "error" | "info";
type ToastInput = {
  message: string;
  tone?: ToastTone;
  href?: string;
  linkLabel?: string;
};
type Toast = ToastInput & { id: number };

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((input: ToastInput) => {
    const id = ++nextId.current;
    setToasts((current) => [...current.slice(-2), { ...input, id }]);
    window.setTimeout(() => dismiss(id), input.tone === "error" ? 7_000 : 5_000);
  }, [dismiss]);

  const value = useMemo(() => showToast, [showToast]);

  return <ToastContext.Provider value={value}>
    {children}
    <div className="toast-viewport" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => <div className="product-toast" data-tone={toast.tone ?? "info"} role={toast.tone === "error" ? "alert" : "status"} key={toast.id}>
        <i aria-hidden="true" />
        <p>{toast.message}</p>
        {toast.href && <a href={toast.href} target="_blank" rel="noreferrer">{toast.linkLabel ?? "View"}</a>}
        <button type="button" aria-label="Dismiss notification" onClick={() => dismiss(toast.id)}>×</button>
      </div>)}
    </div>
  </ToastContext.Provider>;
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside ToastProvider.");
  return value;
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

const TOAST_TTL_MS = 2600;
const TOAST_MAX = 3;

export type ToastPush = (text: string) => void;

export interface ToastProviderProps {
  children: ReactNode;
}

interface ToastEntry {
  id: number;
  text: string;
}

const ToastContext = createContext<ToastPush | null>(null);

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextIdRef = useRef(0);
  const timersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((previous) => previous.filter((toast) => toast.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (text: string) => {
      const id = ++nextIdRef.current;
      setToasts((previous) => [...previous, { id, text }].slice(-TOAST_MAX));
      timersRef.current.set(
        id,
        setTimeout(() => dismiss(id), TOAST_TTL_MS),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" role="status">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast">
            {toast.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastPush {
  const push = useContext(ToastContext);
  if (!push) {
    throw new Error("useToast must be used within a <ToastProvider>");
  }
  return push;
}

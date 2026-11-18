'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, ImagePlus, Images, Loader2, X } from 'lucide-react';
import { api } from '@/lib/client';

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------
type ToastItem = { id: number; text: string; kind: 'ok' | 'error' };
const ToastCtx = createContext<(text: string, kind?: 'ok' | 'error') => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const show = useCallback((text: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="toast-wrap" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.kind === 'error' ? ' error' : ''}`}>
            {t.kind === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ---------------------------------------------------------------------------
// Modal & drawer
// ---------------------------------------------------------------------------
export function Modal({ title, onClose, children, footer, wide, icon }: {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean; icon?: ReactNode;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={wide ? { maxWidth: 860 } : undefined} onMouseDown={(e) => e.stopPropagation()}>
        <header>
          {icon}
          <h2>{title}</h2>
          <span className="spacer" />
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

export function Drawer({ title, onClose, children, actions }: { title: ReactNode; onClose: () => void; children: ReactNode; actions?: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-overlay drawer-overlay" onMouseDown={onClose}>
      <aside className="drawer" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <span className="spacer" />
          {actions}
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="body">{children}</div>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirm / prompt dialogs (promise-based, replaces window.confirm / prompt)
// ---------------------------------------------------------------------------
interface DialogReq {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  prompt?: { label: string; placeholder?: string; minLength?: number; options?: string[] };
  resolve: (v: string | boolean | null) => void;
}
const DialogCtx = createContext<{
  confirm: (o: Omit<DialogReq, 'resolve' | 'prompt'>) => Promise<boolean>;
  prompt: (o: Omit<DialogReq, 'resolve'> & { prompt: NonNullable<DialogReq['prompt']> }) => Promise<string | null>;
} | null>(null);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<DialogReq | null>(null);
  const [value, setValue] = useState('');
  const confirm = useCallback((o: Omit<DialogReq, 'resolve' | 'prompt'>) =>
    new Promise<boolean>((resolve) => setReq({ ...o, resolve: (v) => resolve(Boolean(v)) })), []);
  const prompt = useCallback((o: Omit<DialogReq, 'resolve'> & { prompt: NonNullable<DialogReq['prompt']> }) =>
    new Promise<string | null>((resolve) => {
      setValue('');
      setReq({ ...o, resolve: (v) => resolve(typeof v === 'string' ? v : null) });
    }), []);
  const close = (v: string | boolean | null) => {
    req?.resolve(v);
    setReq(null);
  };
  const min = req?.prompt?.minLength ?? 1;
  return (
    <DialogCtx.Provider value={{ confirm, prompt }}>
      {children}
      {req && (
        <Modal
          title={req.title}
          onClose={() => close(req.prompt ? null : false)}
          icon={req.danger ? <span style={{ color: 'var(--danger)', display: 'flex' }}><AlertTriangle size={18} /></span> : undefined}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => close(req.prompt ? null : false)}>Cancel</button>
              <button
                className={`btn${req.danger ? ' btn-danger-solid' : ''}`}
                disabled={Boolean(req.prompt) && value.trim().length < min}
                onClick={() => close(req.prompt ? value.trim() : true)}
                autoFocus={!req.prompt}
              >
                {req.confirmLabel ?? 'Confirm'}
              </button>
            </>
          }
        >
          <div className="stack">
            {req.message && <p className="muted mb-0">{req.message}</p>}
            {req.prompt && (
              <div className="field">
                <label htmlFor="dlg-input">{req.prompt.label}</label>
                {req.prompt.options ? (
                  <select id="dlg-input" className="select" value={value} onChange={(e) => setValue(e.target.value)} autoFocus>
                    <option value="">Choose…</option>
                    {req.prompt.options.map((o) => <option key={o}>{o}</option>)}
                  </select>
                ) : (
                  <input id="dlg-input" className="input" autoFocus placeholder={req.prompt.placeholder} value={value}
                    onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && value.trim().length >= min && close(value.trim())} />
                )}
              </div>
            )}
          </div>
        </Modal>
      )}
    </DialogCtx.Provider>
  );
}
export function useDialog() {
  const c = useContext(DialogCtx);
  if (!c) throw new Error('useDialog outside DialogProvider');
  return c;
}

// ---------------------------------------------------------------------------
// Form bits
// ---------------------------------------------------------------------------
export function Field({ label, hint, children, htmlFor, error }: { label: string; hint?: string; children: ReactNode; htmlFor?: string; error?: string }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <span className="error-text">{error}</span> : hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <label className="switch" title={label}>
      <input type="checkbox" role="switch" aria-label={label} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </label>
  );
}

export function ErrorBox({ error }: { error?: string | null }) {
  return error ? <div className="alert" role="alert"><AlertTriangle size={16} style={{ marginTop: 2 }} /><span>{error}</span></div> : null;
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {description && <p className="desc">{description}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {text && <p style={{ maxWidth: 380, margin: '0 auto 14px' }}>{text}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ h = 16, w = '100%', style }: { h?: number; w?: number | string; style?: React.CSSProperties }) {
  return <div className="skeleton" style={{ height: h, width: w, ...style }} aria-hidden />;
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="stack-sm" style={{ padding: 16 }} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} h={36} />)}
    </div>
  );
}

/** Simple data loader with reload(). */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fn());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, setData, error, loading, reload };
}

// ---------------------------------------------------------------------------
// Image uploader: drag & drop, click to browse, or pick from the library
// ---------------------------------------------------------------------------
export async function uploadFile(file: File): Promise<string> {
  if (file.size > 3 * 1024 * 1024) throw new Error('Images must be 3 MB or smaller');
  const res = await fetch('/api/proxy/media', {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Filename': file.name.slice(0, 80), 'x-qs-csrf': '1' },
    body: file,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message ?? 'Upload failed');
  return body.url as string;
}

export function ImageUploader({ value, onChange, label = 'Image', hint, compact }: {
  value?: string; onChange: (url: string) => void; label?: string; hint?: string; compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [error, setError] = useState('');
  const [library, setLibrary] = useState<{ id: string; url: string; name: string }[] | null>(null);

  async function handle(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    setBusy(true);
    setError('');
    try {
      onChange(await uploadFile(f));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field">
      <span className="label">{label}</span>
      <div
        className={`dropzone${over ? ' over' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files); }}
        aria-label={`${label}: click or drop an image to upload`}
        style={compact ? { padding: 10 } : undefined}
      >
        <div className="preview">
          {busy ? <Loader2 size={20} className="spin" /> : value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" />
          ) : <ImagePlus size={22} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="strong">{busy ? 'Uploading…' : value ? 'Replace image' : 'Upload an image'}</div>
          <div className="small muted">Drag & drop or click · JPG, PNG, WebP · up to 3 MB</div>
          {hint && <div className="small muted">{hint}</div>}
        </div>
        <div className="row nowrap" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={async () => setLibrary(await api('media'))}>
            <Images size={14} /> Library
          </button>
          {value && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange('')}>Remove</button>}
        </div>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => handle(e.target.files)} />
      </div>
      {error && <span className="error-text">{error}</span>}
      {library && (
        <Modal title="Your images" onClose={() => setLibrary(null)} wide>
          {library.length === 0 ? <p className="muted">No images yet. Upload one to start your library.</p> : (
            <div className="library">
              {library.map((img) => (
                <button key={img.id} type="button" title={img.name} onClick={() => { onChange(img.url); setLibrary(null); }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={img.name} loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

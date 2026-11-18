'use client';

import { api } from '@/lib/client';
import { useMe } from './Shell';
import { ErrorBox, Switch, useLoad, useToast } from './ui';

interface Feature {
  key: string; name: string; description: string; category: string; dependsOn: string[];
  minPlan: string; available: boolean; enabled: boolean; locked: boolean;
}

const CATS: Record<string, string> = {
  ordering: 'Ordering', payments: 'Payments', catalog: 'Menu', customers: 'Customers', marketing: 'Marketing', operations: 'Operations',
};

export function FeatureGrid({ compact }: { compact?: boolean }) {
  const { can } = useMe();
  const toast = useToast();
  const list = useLoad(() => api<Feature[]>('features'));
  const names = new Map((list.data ?? []).map((f) => [f.key, f.name]));

  async function toggle(f: Feature, enabled: boolean) {
    try {
      const r = await api<{ changed: string[] }>(`features/${f.key}/toggle`, { method: 'POST', body: { enabled } });
      const also = r.changed.filter((k) => k !== f.key).map((k) => names.get(k));
      toast(`${f.name} ${enabled ? 'on' : 'off'}${also.length ? ` (also ${enabled ? 'enabled' : 'disabled'}: ${also.join(', ')})` : ''}. Publish to make it live.`);
      list.reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  const shown = (list.data ?? []).filter((f) => !compact || f.available);
  const groups = Object.keys(CATS).map((c) => ({ c, items: shown.filter((f) => f.category === c) })).filter((g) => g.items.length);
  return (
    <div className="stack">
      <ErrorBox error={list.error} />
      {groups.map(({ c, items }) => (
        <div key={c}>
          {!compact && <h2 style={{ marginTop: 8 }}>{CATS[c]}</h2>}
          <div className="grid grid-3">
            {items.map((f) => (
              <div key={f.key} className="card" style={{ opacity: f.available ? 1 : 0.65 }}>
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  <strong style={{ flex: 1 }}>{f.name}</strong>
                  {f.available ? (
                    f.locked ? <span className="pill warn" title={`Needs ${f.minPlan} plan`}>🔒 {f.minPlan}</span> : (
                      <Switch label={f.name} checked={f.enabled} disabled={!can('site.write')} onChange={(v) => toggle(f, v)} />
                    )
                  ) : <span className="pill">Coming soon</span>}
                </div>
                <p className="muted small" style={{ margin: '6px 0 0' }}>{f.description}</p>
                {f.dependsOn.length > 0 && <p className="small" style={{ margin: '6px 0 0' }}>Needs: {f.dependsOn.map((d) => names.get(d) ?? d).join(', ')}</p>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}


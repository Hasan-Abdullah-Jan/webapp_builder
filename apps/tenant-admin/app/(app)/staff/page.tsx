'use client';

import { useState } from 'react';
import { api } from '@/lib/client';
import { useMe } from '@/components/Shell';
import { ErrorBox, Field, Modal, PageHeader, useDialog, useLoad, useToast } from '@/components/ui';
import { Plus } from 'lucide-react';

interface Staff { _id: string; name: string; email?: string; phone?: string; roleId: string; active: boolean; lastLoginAt?: string }
interface Role { _id: string; name: string; permissions: string[] }

const ROLE_HELP: Record<string, string> = {
  Owner: 'Everything, including billing and staff.',
  Manager: 'Menu, orders, branches, website and publishing.',
  'Branch Manager': 'Orders and menu viewing.',
  Staff: 'See and update orders (kitchen / counter).',
};

export default function StaffPage() {
  const { me } = useMe();
  const toast = useToast();
  const dialog = useDialog();
  const data = useLoad(() => api<{ users: Staff[]; roles: Role[]; ownerId: string }>('staff'));
  const [adding, setAdding] = useState(false);
  const roleName = new Map((data.data?.roles ?? []).map((r) => [r._id, r.name]));

  async function setActive(u: Staff, active: boolean) {
    try {
      await api(`staff/${u._id}`, { method: 'PATCH', body: { active } });
      data.reload();
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }
  async function remove(u: Staff) {
    if (!(await dialog.confirm({ title: `Remove ${u.name}?`, message: 'They lose access and are logged out immediately.', confirmLabel: 'Remove', danger: true }))) return;
    try {
      await api(`staff/${u._id}`, { method: 'DELETE' });
      data.reload();
      toast('Staff member removed');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  return (
    <div className="content">
      <PageHeader title="Staff" description="Give your team their own logins. Each role only sees what it needs."
        actions={<button className="btn" onClick={() => setAdding(true)}><Plus size={15} /> Add staff member</button>} />
      <ErrorBox error={data.error} />
      <div className="card flush">
        <table className="table">
          <thead><tr><th>Name</th><th>Login</th><th>Role</th><th>Last login</th><th /></tr></thead>
          <tbody>
            {data.data?.users.map((u) => {
              const isOwner = u._id === data.data!.ownerId;
              const isMe = u._id === me.user._id;
              return (
                <tr key={u._id}>
                  <td><strong>{u.name}</strong> {isMe && <span className="pill">You</span>}</td>
                  <td className="muted">{u.email}</td>
                  <td>{roleName.get(u.roleId)}</td>
                  <td className="muted small">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {!isOwner && !isMe && (
                      <>
                        <button className="btn btn-secondary btn-sm" onClick={() => setActive(u, !u.active)}>{u.active ? 'Disable' : 'Enable'}</button>{' '}
                        <button className="btn btn-danger btn-sm" onClick={() => remove(u)}>Remove</button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="grid grid-4" style={{ marginTop: 16 }}>
        {data.data?.roles.map((r) => (
          <div key={r._id} className="card"><strong>{r.name}</strong><p className="muted small" style={{ margin: '4px 0 0' }}>{ROLE_HELP[r.name] ?? r.permissions.join(', ')}</p></div>
        ))}
      </div>
      {adding && data.data && <AddStaff roles={data.data.roles.filter((r) => r.name !== 'Owner')} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); data.reload(); toast('Staff member added'); }} />}
    </div>
  );
}

function AddStaff({ roles, onClose, onSaved }: { roles: Role[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: '', email: '', roleId: roles.find((r) => r.name === 'Staff')?._id ?? roles[0]?._id ?? '', password: '' });
  const [error, setError] = useState('');
  async function save() {
    try {
      await api('staff', { method: 'POST', body: f });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Modal title="Add staff member" onClose={onClose} footer={
      <><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn" disabled={!f.name || !f.email || f.password.length < 8} onClick={save}>Add</button></>
    }>
      <div className="stack">
        <ErrorBox error={error} />
        <Field label="Name" htmlFor="s-name"><input id="s-name" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Email (used to log in)" htmlFor="s-email"><input id="s-email" className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Role" htmlFor="s-role">
          <select id="s-role" className="select" value={f.roleId} onChange={(e) => setF({ ...f, roleId: e.target.value })}>
            {roles.map((r) => <option key={r._id} value={r._id}>{r.name} — {ROLE_HELP[r.name] ?? ''}</option>)}
          </select>
        </Field>
        <Field label="Temporary password" htmlFor="s-pw" hint="At least 8 characters. Share it with them privately."><input id="s-pw" className="input" type="text" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

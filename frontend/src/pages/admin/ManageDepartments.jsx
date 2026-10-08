import { useCallback, useState } from 'react';
import { departmentApi } from '../../api/doctor.api';
import { useFetch } from '../../hooks/useFetch';
import Table from '../../components/common/Table.jsx';
import Modal from '../../components/common/Modal.jsx';
import { useToast } from '../../components/common/Toast.jsx';
import { currency } from '../../utils/datetime';

const BLANK = { name: '', description: '', location: '', consultationFee: '' };

export default function ManageDepartments() {
  const toast = useToast();
  const [editing, setEditing] = useState(null); // department | 'new' | null
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);

  const { data, loading, error, refetch } = useFetch(
    useCallback(() => departmentApi.list({ limit: 100, includeInactive: 'true' }), []),
    []
  );

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  function openNew() {
    setForm(BLANK);
    setEditing('new');
  }

  function openEdit(dept) {
    setForm({
      name: dept.name,
      description: dept.description || '',
      location: dept.location || '',
      consultationFee: String(dept.consultationFee ?? ''),
    });
    setEditing(dept);
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    const payload = {
      name: form.name,
      description: form.description || undefined,
      location: form.location || undefined,
      ...(form.consultationFee !== '' ? { consultationFee: Number(form.consultationFee) } : {}),
    };
    try {
      if (editing === 'new') await departmentApi.create(payload);
      else await departmentApi.update(editing._id, payload);
      toast.success(editing === 'new' ? 'Department created' : 'Department updated');
      setEditing(null);
      refetch();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(dept) {
    try {
      const { data: result } = await departmentApi.remove(dept._id);
      toast.success(result.deleted ? 'Department deleted' : result.reason);
      refetch();
    } catch (err) {
      toast.error(err.message);
    }
  }

  const columns = [
    { key: 'name', header: 'Department', render: (d) => (
      <div>
        <strong>{d.name}</strong>
        {!d.isActive && <span className="badge badge--cancelled">inactive</span>}
        <div className="muted">{d.description}</div>
      </div>
    ) },
    { key: 'location', header: 'Location', render: (d) => d.location || '—' },
    { key: 'consultationFee', header: 'Base fee', render: (d) => currency(d.consultationFee) },
    { key: 'doctorCount', header: 'Doctors', render: (d) => d.doctorCount ?? 0 },
    { key: 'actions', header: '', render: (d) => (
      <div className="row-gap">
        <button className="btn btn--ghost btn--sm" onClick={() => openEdit(d)}>Edit</button>
        <button className="btn btn--danger btn--sm" onClick={() => remove(d)}>Delete</button>
      </div>
    ) },
  ];

  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h2>Departments</h2>
          <p className="muted">Departments with doctors attached are deactivated rather than deleted.</p>
        </div>
        <button className="btn btn--primary" onClick={openNew}>+ Add department</button>
      </header>

      <Table columns={columns} rows={data} loading={loading} error={error} empty="No departments yet." />

      <Modal
        open={Boolean(editing)}
        title={editing === 'new' ? 'New department' : `Edit ${editing?.name || ''}`}
        onClose={() => setEditing(null)}
        footer={
          <>
            <button className="btn btn--ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn btn--primary" form="dept-form" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
          </>
        }
      >
        <form id="dept-form" onSubmit={save}>
          <label className="field"><span>Name *</span><input required minLength={2} value={form.name} onChange={set('name')} /></label>
          <label className="field"><span>Description</span><textarea rows={3} value={form.description} onChange={set('description')} /></label>
          <div className="grid-2">
            <label className="field"><span>Location</span><input value={form.location} onChange={set('location')} placeholder="Block A, Floor 2" /></label>
            <label className="field"><span>Base consultation fee</span><input type="number" min="0" value={form.consultationFee} onChange={set('consultationFee')} /></label>
          </div>
        </form>
      </Modal>
    </div>
  );
}

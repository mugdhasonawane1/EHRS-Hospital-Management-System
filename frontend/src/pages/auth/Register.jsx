import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/useAuth';
import { useToast } from '../../components/common/Toast.jsx';

/**
 * Public registration creates a *patient* only — doctor and admin accounts are
 * provisioned by an admin, so no one can self-promote.
 */
export default function Register() {
  const { register, isAuthenticated, loading } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '', email: '', password: '', phone: '', dob: '', gender: 'undisclosed', bloodGroup: 'unknown',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!loading && isAuthenticated) return <Navigate to="/patient" replace />;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload = { ...form };
      if (!payload.dob) delete payload.dob;
      if (!payload.phone) delete payload.phone;
      const user = await register(payload);
      toast.success(`Account created — welcome, ${user.name}`);
      navigate('/patient', { replace: true });
    } catch (err) {
      setError(err.details?.map((d) => `${d.path}: ${d.message}`).join(' · ') || err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth__card auth__card--wide">
        <Link to="/" className="brand brand--lg">
          <span className="brand__mark" aria-hidden="true">✚</span>
          Meridian Hospital
        </Link>
        <h1>Create a patient account</h1>

        <form onSubmit={handleSubmit}>
          <div className="grid-2">
            <label className="field">
              <span>Full name</span>
              <input required minLength={2} value={form.name} onChange={set('name')} />
            </label>
            <label className="field">
              <span>Email</span>
              <input type="email" required value={form.email} onChange={set('email')} />
            </label>
            <label className="field">
              <span>Password</span>
              <input type="password" required minLength={8} value={form.password} onChange={set('password')} />
            </label>
            <label className="field">
              <span>Phone</span>
              <input value={form.phone} onChange={set('phone')} placeholder="+91 …" />
            </label>
            <label className="field">
              <span>Date of birth</span>
              <input type="date" value={form.dob} onChange={set('dob')} />
            </label>
            <label className="field">
              <span>Gender</span>
              <select value={form.gender} onChange={set('gender')}>
                <option value="undisclosed">Prefer not to say</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="field">
              <span>Blood group</span>
              <select value={form.bloodGroup} onChange={set('bloodGroup')}>
                {['unknown', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </label>
          </div>

          {error && <p className="error-box">{error}</p>}

          <button className="btn btn--primary btn--block" disabled={submitting}>
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="muted auth__foot">
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

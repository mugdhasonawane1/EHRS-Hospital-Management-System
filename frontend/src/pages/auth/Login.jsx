import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/useAuth';
import { useRole } from '../../hooks/useRole';
import { useToast } from '../../components/common/Toast.jsx';

const DEMO = [
  { label: 'Admin', email: 'admin@hospital.test' },
  { label: 'Doctor', email: 'doctor@hospital.test' },
  { label: 'Patient', email: 'patient@hospital.test' },
];

export default function Login() {
  const { login, isAuthenticated, loading } = useAuth();
  const { homePath } = useRole();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!loading && isAuthenticated) return <Navigate to={location.state?.from?.pathname || homePath} replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const user = await login(form);
      toast.success(`Welcome back, ${user.name}`);
      const home = user.role === 'admin' ? '/admin' : user.role === 'doctor' ? '/doctor' : '/patient';
      navigate(location.state?.from?.pathname || home, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth__card">
        <Link to="/" className="brand brand--lg">
          <span className="brand__mark" aria-hidden="true">✚</span>
          Meridian Hospital
        </Link>
        <h1>Sign in</h1>
        <p className="muted">Admin, doctor and patient portals share one login.</p>

        <form onSubmit={handleSubmit}>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              required
              autoComplete="username"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </label>

          {error && <p className="error-box">{error}</p>}

          <button className="btn btn--primary btn--block" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="auth__demo">
          <p className="muted">Demo accounts (password <code>Password123!</code>):</p>
          <div className="auth__demo-row">
            {DEMO.map((d) => (
              <button
                key={d.email}
                type="button"
                className="btn btn--ghost"
                onClick={() => setForm({ email: d.email, password: 'Password123!' })}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <p className="muted auth__foot">
          New patient? <Link to="/register">Create an account</Link>
        </p>
      </div>
    </div>
  );
}

import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/useAuth';
import { useRole } from '../../hooks/useRole';

export default function Navbar({ onToggleSidebar }) {
  const { user, logout } = useAuth();
  const { role } = useRole();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <header className="navbar">
      <div className="navbar__left">
        <button className="icon-btn navbar__burger" onClick={onToggleSidebar} aria-label="Toggle navigation">☰</button>
        <span className="brand">
          <span className="brand__mark" aria-hidden="true">✚</span>
          Meridian Hospital
        </span>
      </div>

      <div className="navbar__right">
        <div className="who">
          <span className="who__name">{user?.name}</span>
          <span className={`badge badge--role badge--${role}`}>{role}</span>
        </div>
        <button className="btn btn--ghost" onClick={handleLogout}>Sign out</button>
      </div>
    </header>
  );
}

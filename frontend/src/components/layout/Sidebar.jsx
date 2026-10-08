import { NavLink } from 'react-router-dom';
import { useRole } from '../../hooks/useRole';

/** Navigation differs per role — the routes themselves are gated by RoleRoute. */
const NAV = {
  admin: [
    { to: '/admin', label: 'Overview', icon: '▤', end: true },
    { to: '/admin/doctors', label: 'Doctors', icon: '🩺' },
    { to: '/admin/departments', label: 'Departments', icon: '🏥' },
    { to: '/admin/appointments', label: 'Appointments', icon: '🗓' },
    { to: '/admin/billing', label: 'Billing', icon: '₹' },
  ],
  doctor: [
    { to: '/doctor', label: 'My appointments', icon: '🗓', end: true },
    { to: '/doctor/availability', label: 'My availability', icon: '⏱' },
  ],
  patient: [
    { to: '/patient', label: 'My appointments', icon: '🗓', end: true },
    { to: '/patient/book', label: 'Book appointment', icon: '＋' },
    { to: '/patient/records', label: 'My records', icon: '📋' },
    { to: '/patient/invoices', label: 'My invoices', icon: '₹' },
  ],
};

export default function Sidebar({ open, onNavigate }) {
  const { role } = useRole();
  const links = NAV[role] || [];

  return (
    <aside className={`sidebar sidebar--${role}${open ? ' sidebar--open' : ''}`}>
      <nav>
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            onClick={onNavigate}
            className={({ isActive }) => `sidebar__link${isActive ? ' is-active' : ''}`}
          >
            <span className="sidebar__icon" aria-hidden="true">{l.icon}</span>
            {l.label}
          </NavLink>
        ))}
      </nav>
      <p className="sidebar__note">All times are shown in UTC.</p>
    </aside>
  );
}

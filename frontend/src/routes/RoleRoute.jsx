import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useRole } from '../hooks/useRole';
import Loader from '../components/common/Loader.jsx';

/**
 * Gates a whole route subtree by role. This is real routing-level RBAC:
 * a patient typing /admin into the address bar is bounced to their own
 * dashboard, not just shown a page with the buttons hidden.
 */
export default function RoleRoute({ allowed = [] }) {
  const { loading, isAuthenticated } = useAuth();
  const { role, homePath } = useRole();

  if (loading) return <Loader full />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!allowed.includes(role)) return <Navigate to={homePath} replace />;

  return <Outlet />;
}

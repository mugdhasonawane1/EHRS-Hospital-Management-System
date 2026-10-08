import { useAuth } from '../context/useAuth';

/**
 * Role helpers for conditional UI. Note this is for *presentation* only —
 * every capability it hides is also enforced by the route guards and the API.
 */
export function useRole() {
  const { user, role } = useAuth();

  return {
    role,
    isAdmin: role === 'admin',
    isDoctor: role === 'doctor',
    isPatient: role === 'patient',
    doctorId: user?.doctorId || null,
    patientId: user?.patientId || null,
    /** Landing route for the current role. */
    homePath: role === 'admin' ? '/admin' : role === 'doctor' ? '/doctor' : role === 'patient' ? '/patient' : '/login',
    has: (...roles) => roles.flat().includes(role),
  };
}

export default useRole;

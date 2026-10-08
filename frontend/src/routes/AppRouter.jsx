import { Navigate, Route, Routes } from 'react-router-dom';

import ProtectedRoute from './ProtectedRoute.jsx';
import RoleRoute from './RoleRoute.jsx';
import DashboardLayout from '../components/layout/DashboardLayout.jsx';
import { useRole } from '../hooks/useRole';

import Landing from '../pages/Landing.jsx';
import Login from '../pages/auth/Login.jsx';
import Register from '../pages/auth/Register.jsx';

import AdminDashboard from '../pages/admin/Dashboard.jsx';
import ManageDoctors from '../pages/admin/ManageDoctors.jsx';
import ManageDepartments from '../pages/admin/ManageDepartments.jsx';
import AdminAppointments from '../pages/admin/AllAppointments.jsx';
import AdminBilling from '../pages/admin/Billing.jsx';

import MyAppointments from '../pages/doctor/MyAppointments.jsx';
import PatientRecord from '../pages/doctor/PatientRecord.jsx';
import WritePrescription from '../pages/doctor/WritePrescription.jsx';
import DoctorAvailability from '../pages/doctor/Availability.jsx';

import BookAppointment from '../pages/patient/BookAppointment.jsx';
import PatientAppointments from '../pages/patient/MyAppointments.jsx';
import MyRecords from '../pages/patient/MyRecords.jsx';
import MyInvoices from '../pages/patient/MyInvoices.jsx';

function HomeRedirect() {
  const { homePath } = useRole();
  return <Navigate to={homePath} replace />;
}

export default function AppRouter() {
  return (
    <Routes>
      {/* Public marketing site — the only route open to anonymous visitors. */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route element={<ProtectedRoute />}>

        {/* ---------------------------- admin ---------------------------- */}
        <Route element={<RoleRoute allowed={['admin']} />}>
          <Route path="/admin" element={<DashboardLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="doctors" element={<ManageDoctors />} />
            <Route path="departments" element={<ManageDepartments />} />
            <Route path="appointments" element={<AdminAppointments />} />
            <Route path="billing" element={<AdminBilling />} />
          </Route>
        </Route>

        {/* ---------------------------- doctor --------------------------- */}
        <Route element={<RoleRoute allowed={['doctor']} />}>
          <Route path="/doctor" element={<DashboardLayout />}>
            <Route index element={<MyAppointments />} />
            <Route path="patients/:patientId" element={<PatientRecord />} />
            <Route path="appointments/:appointmentId/record" element={<WritePrescription />} />
            <Route path="availability" element={<DoctorAvailability />} />
          </Route>
        </Route>

        {/* ---------------------------- patient -------------------------- */}
        <Route element={<RoleRoute allowed={['patient']} />}>
          <Route path="/patient" element={<DashboardLayout />}>
            <Route index element={<PatientAppointments />} />
            <Route path="book" element={<BookAppointment />} />
            <Route path="records" element={<MyRecords />} />
            <Route path="invoices" element={<MyInvoices />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}

import { request } from './axiosClient';

export const billingApi = {
  list: (params) => request({ method: 'GET', url: '/billing', params }),
  forPatient: (patientId, params) => request({ method: 'GET', url: `/billing/patient/${patientId}`, params }),
  getById: (id) => request({ method: 'GET', url: `/billing/invoice/${id}` }),
  generate: (appointmentId, payload = {}) =>
    request({ method: 'POST', url: `/billing/${appointmentId}/generate`, data: payload }),
  pay: (id, payload) => request({ method: 'POST', url: `/billing/invoice/${id}/pay`, data: payload }),
  update: (id, payload) => request({ method: 'PATCH', url: `/billing/invoice/${id}`, data: payload }),
  void: (id, reason) => request({ method: 'DELETE', url: `/billing/invoice/${id}`, data: { reason } }),
  summary: () => request({ method: 'GET', url: '/billing/summary' }),
};

export default billingApi;

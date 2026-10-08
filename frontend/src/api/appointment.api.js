import { request } from './axiosClient';

export const appointmentApi = {
  /** Role-aware: patient -> own, doctor -> assigned, admin -> all. */
  listMine: (params) => request({ method: 'GET', url: '/appointments/me', params }),
  getById: (id) => request({ method: 'GET', url: `/appointments/${id}` }),
  book: (payload) => request({ method: 'POST', url: '/appointments', data: payload }),
  cancel: (id, reason) => request({ method: 'PATCH', url: `/appointments/${id}/cancel`, data: { reason } }),
  complete: (id, payload) => request({ method: 'PATCH', url: `/appointments/${id}/complete`, data: payload }),
};

export default appointmentApi;

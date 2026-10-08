import { request } from './axiosClient';

export const doctorApi = {
  list: (params) => request({ method: 'GET', url: '/doctors', params }),
  getById: (id) => request({ method: 'GET', url: `/doctors/${id}` }),
  me: () => request({ method: 'GET', url: '/doctors/me' }),
  /** Slot list for one UTC date — mirrors the backend conflict rules. */
  availability: (id, date) => request({ method: 'GET', url: `/doctors/${id}/availability`, params: { date } }),
  schedule: (id, date) => request({ method: 'GET', url: `/doctors/${id}/schedule`, params: { date } }),
  update: (id, payload) => request({ method: 'PATCH', url: `/doctors/${id}`, data: payload }),
  updateAvailability: (id, availableSlots) =>
    request({ method: 'PATCH', url: `/doctors/${id}/availability`, data: { availableSlots } }),
  deactivate: (id) => request({ method: 'DELETE', url: `/doctors/${id}` }),
};

export const departmentApi = {
  list: (params) => request({ method: 'GET', url: '/departments', params }),
  getById: (id) => request({ method: 'GET', url: `/departments/${id}` }),
  create: (payload) => request({ method: 'POST', url: '/departments', data: payload }),
  update: (id, payload) => request({ method: 'PATCH', url: `/departments/${id}`, data: payload }),
  remove: (id) => request({ method: 'DELETE', url: `/departments/${id}` }),
};

export default doctorApi;

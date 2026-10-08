import { request } from './axiosClient';

export const patientApi = {
  list: (params) => request({ method: 'GET', url: '/patients', params }),
  getById: (id) => request({ method: 'GET', url: `/patients/${id}` }),
  me: () => request({ method: 'GET', url: '/patients/me' }),
  update: (id, payload) => request({ method: 'PATCH', url: `/patients/${id}`, data: payload }),
};

export const medicalRecordApi = {
  list: (params) => request({ method: 'GET', url: '/medical-records', params }),
  getById: (id) => request({ method: 'GET', url: `/medical-records/${id}` }),
  create: (payload) => request({ method: 'POST', url: '/medical-records', data: payload }),
  update: (id, payload) => request({ method: 'PATCH', url: `/medical-records/${id}`, data: payload }),
  patientHistory: (patientId, params) =>
    request({ method: 'GET', url: `/medical-records/patient/${patientId}`, params }),
  createPrescription: (payload) => request({ method: 'POST', url: '/medical-records/prescriptions', data: payload }),
  listPrescriptions: (params) => request({ method: 'GET', url: '/medical-records/prescriptions', params }),
};

export default patientApi;

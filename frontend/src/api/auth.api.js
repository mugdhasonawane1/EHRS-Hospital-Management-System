import { request } from './axiosClient';

export const authApi = {
  login: (payload) => request({ method: 'POST', url: '/auth/login', data: payload }),
  register: (payload) => request({ method: 'POST', url: '/auth/register', data: payload }),
  me: () => request({ method: 'GET', url: '/auth/me' }),
  logout: () => request({ method: 'POST', url: '/auth/logout' }),
  changePassword: (payload) => request({ method: 'PATCH', url: '/auth/password', data: payload }),
  createStaff: (payload) => request({ method: 'POST', url: '/users/staff', data: payload }),
  listUsers: (params) => request({ method: 'GET', url: '/users', params }),
};

export default authApi;

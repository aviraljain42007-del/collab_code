// src/features/auth/authSlice.js
import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  user: null,
  isAuthenticated: false,
  isAuthChecked: false, // NEW: session restore attempt ho chuka?
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials: (state, action) => {
      const { user, accessToken } = action.payload;
      state.user = user;
      state.isAuthenticated = true;
      if (accessToken) localStorage.setItem('accessToken', accessToken);
    },
    logout: (state) => {
      state.user = null;
      state.isAuthenticated = false;
      localStorage.removeItem('accessToken');
    },
    setAuthChecked: (state) => {
      state.isAuthChecked = true; // NEW
    },
  },
});

export const { setCredentials, logout, setAuthChecked } = authSlice.actions;
export default authSlice.reducer;
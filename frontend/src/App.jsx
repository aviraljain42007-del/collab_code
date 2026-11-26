import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { api } from './lib/axios';
import { setCredentials, logout, setAuthChecked } from './features/auth/authSlice';

import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Room from './pages/Room';
import NotFound from './pages/NotFound';
import ProtectedRoute from './routes/ProtectedRoute';
import PublicRoute from './routes/PublicRoute';

function App() {
  const dispatch = useDispatch();
  const { isAuthChecked } = useSelector((s) => s.auth);

  // Session bootstrap: refresh pe Redux khali hota hai, localStorage se token le kar /auth/me call karo
  useEffect(() => {
    const bootstrap = async () => {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        dispatch(setAuthChecked());
        return;
      }
      try {
        const { data } = await api.get('/auth/me');
        dispatch(setCredentials({ user: data.user, accessToken: token }));
      } catch {
        dispatch(logout());
      } finally {
        dispatch(setAuthChecked());
      }
    };
    bootstrap();
  }, [dispatch]);

  if (!isAuthChecked) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-400">
        Loading...
      </div>
    );
  }

  return (
    <Routes>
      {/* Default redirect */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />

      {/* Public-only routes (login/register) — agar already logged-in ho to dashboard pe bhejo */}
      <Route element={<PublicRoute />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>

      {/* Protected routes — auth chahiye */}
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/room/:roomCode" element={<Room />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default App;
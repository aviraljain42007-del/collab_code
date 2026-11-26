import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';

export default function ProtectedRoute() {
  const { isAuthenticated } = useSelector((s) => s.auth);
  const location = useLocation();

  if (!isAuthenticated) {
    // Login ke baad user wapas wahi pe jaye jaha se aaya tha
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
}
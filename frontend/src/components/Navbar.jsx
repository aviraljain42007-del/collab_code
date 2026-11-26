import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/axios';
import { logout } from '../features/auth/authSlice';
import { LogOut, Code2 } from 'lucide-react';

export default function Navbar() {
  const { user } = useSelector((state) => state.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      dispatch(logout());
      navigate('/login');
    }
  };

  return (
    <nav className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-2 text-blue-500">
        <Code2 className="w-6 h-6" />
        <span className="text-xl font-bold text-white tracking-wide">CollabCode</span>
      </div>

      <div className="flex items-center gap-4">
        <span className="text-gray-300 text-sm">
          Hi, <strong className="text-white">{user?.name || 'User'}</strong>
        </span>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-sm bg-gray-800 hover:bg-red-500/10 text-gray-300 hover:text-red-400 px-4 py-2 rounded-lg transition-colors border border-gray-700 hover:border-red-500/50"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </div>
    </nav>
  );
}
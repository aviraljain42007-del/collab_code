import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/axios';
import Navbar from '../components/Navbar';
import { Loader2, PlusCircle, LogIn } from 'lucide-react';

const LANGUAGES = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'python', label: 'Python' },
  { value: 'cpp', label: 'C++' },
  { value: 'java', label: 'Java' },
];

export default function Dashboard() {
  const navigate = useNavigate();
  
  // Create Room State
  const [roomName, setRoomName] = useState('');
  const [language, setLanguage] = useState('javascript');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Join Room State
  const [roomCode, setRoomCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    setCreateError('');
    setIsCreating(true);

    try {
      const { data } = await api.post('/rooms', { name: roomName, language });
      
      // Backend returns { room, snapshot }. We need roomCode to navigate.
      navigate(`/room/${data.room.roomCode || data.room.id}`);
    } catch (err) {
      const errorMsg = err.response?.data?.error?.message 
                    || err.response?.data?.message 
                    || 'Failed to create room';
      setCreateError(errorMsg);
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    setJoinError('');
    
    // REST API call hata di, kyunki Room Page ka Socket khud join kar lega
    const formattedRoomCode = roomCode.toUpperCase();
    navigate(`/room/${formattedRoomCode}`);
  };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-5xl w-full mx-auto p-6 mt-8">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-white mb-2">Your Workspace</h1>
          <p className="text-gray-400">Create a new session or join your team.</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          
          {/* Create Room Card */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-blue-500/10 p-2 rounded-lg text-blue-500">
                <PlusCircle className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-semibold text-white">Create a Room</h2>
            </div>

            {createError && <p className="text-red-400 text-sm mb-4">{createError}</p>}

            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Room Name</label>
                <input
                  type="text"
                  required
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="e.g. DSA Interview Prep"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Language</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang.value} value={lang.value}>{lang.label}</option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={isCreating}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 rounded-lg transition flex justify-center items-center gap-2 disabled:opacity-70 mt-2"
              >
                {isCreating ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Create & Enter'}
              </button>
            </form>
          </div>

          {/* Join Room Card */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-green-500/10 p-2 rounded-lg text-green-500">
                <LogIn className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-semibold text-white">Join a Room</h2>
            </div>

            {joinError && <p className="text-red-400 text-sm mb-4">{joinError}</p>}

            <form onSubmit={handleJoinRoom} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Room Code</label>
                <input
                  type="text"
                  required
                  value={roomCode}
                  // FIX: Hamesha Uppercase mein save karo
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())} 
                  placeholder="Paste room code here"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-green-500 outline-none uppercase placeholder:normal-case"
                />
              </div>

              <button
                type="submit"
                disabled={isJoining}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 rounded-lg transition flex justify-center items-center gap-2 disabled:opacity-70 mt-2"
              >
                {isJoining ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Join Room'}
              </button>
            </form>
          </div>

        </div>
      </main>
    </div>
  );
}
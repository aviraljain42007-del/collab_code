import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { io } from 'socket.io-client';
import Editor from '@monaco-editor/react';
import { Play, Users, MessageSquare, TerminalSquare, ChevronLeft, Loader2, Send } from 'lucide-react';
import { api } from '../lib/axios';

const API_URL = import.meta.env.VITE_API_URL || "http://localhost/api/v1";
const SOCKET_URL = API_URL.replace("/api/v1", "");

function mergeMessages(current, incoming) {
  const messagesById = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    messagesById.set(message.id, message);
  }
  return [...messagesById.values()].sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
}

export default function Room() {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);

  const socketRef = useRef(null);
  const roomIdRef = useRef(null);
  const remoteCodeRef = useRef(null);
  const chatEndRef = useRef(null); // Auto-scroll ke liye

  const [roomData, setRoomData] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [isConnecting, setIsConnecting] = useState(true);
  const [error, setError] = useState("");

  // Code States
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("javascript");
  const [version, setVersion] = useState(1); // Version tracking conflict ke liye

  // Chat States
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatError, setChatError] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  // Execution States
  const [isRunning, setIsRunning] = useState(false);
  const [executionResult, setExecutionResult] = useState(null);
  const [executionError, setExecutionError] = useState("");

  const [activeTab, setActiveTab] = useState("chat");

  // 1. Fetch Chat History on Mount
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const { data } = await api.get(`/rooms/${roomCode}/messages?limit=50`);
        setMessages((current) => mergeMessages(current, data.messages || []));
      } catch (err) {
        console.error("Failed to load chat history:", err);
      }
    };
    fetchHistory();
  }, [roomCode]);

  // 2. Socket Setup
  useEffect(() => {
    if (!user) return;

    const token = localStorage.getItem("accessToken");
    const socket = io(SOCKET_URL, {
      auth: { token, name: user.name },
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("room:join", { roomCode }, (response) => {
        setIsConnecting(false);

        if (response.success) {
          setRoomData(response.room);
          roomIdRef.current = response.room.id;
          setVersion(response.room.currentVersion || 1); // Initial version set karo

          const snapshot = response.snapshot || response.room.snapshot;
          if (snapshot) {
            const initialCode = snapshot.code || "";
            remoteCodeRef.current = initialCode;
            setCode(initialCode);
            setLanguage(snapshot.language || "javascript");
            setVersion(snapshot.version || 1);
          }

          setParticipants(response.participants || []);
        } else {
          setError(response.message || "Failed to join room");
        }
      });
    });

    socket.on("connect_error", (err) => {
      setIsConnecting(false);
      setError(err.message || "Socket connection failed");
    });

    socket.on("presence:sync", ({ presence }) => setParticipants(presence));
    
    socket.on("room:user-joined", ({ userId, name }) => {
      setParticipants((prev) => {
        const exists = prev.some((p) => p.userId === userId);
        if (exists) return prev;
        return [...prev, { userId, name, status: "online" }];
      });
    });

    socket.on("room:user-left", ({ userId }) => {
      setParticipants((prev) => prev.filter((p) => p.userId !== userId));
    });

    // Code Sync Event
    socket.on("code:update", ({ newCode, version, senderId }) => {
      if (senderId !== user.id) {
        remoteCodeRef.current = newCode;
        setCode(newCode);
        setVersion(version);
      }
    });

    // Conflict Handling (Agar version mismatch ho jaye)
    socket.on("code:conflict", ({ code, currentVersion }) => {
      console.log("⚠️ Code conflict detected. Syncing server code.");
      remoteCodeRef.current = code;
      setCode(code);
      setVersion(currentVersion);
    });

    socket.on("language:change", ({ language, senderId }) => {
      if (senderId !== user.id) setLanguage(language);
    });

    // Chat Receive
    socket.on("chat:message", (message) => {
      setMessages((current) => mergeMessages(current, [message]));
    });

    // Execution Completed
    socket.on("execution:completed", (data) => {
      if (data.roomId === roomIdRef.current) {
        setIsRunning(false);
        setExecutionResult(data);
      }
    });

    return () => {
      if (socket.connected && roomIdRef.current) {
        socket.emit("room:leave", { roomId: roomIdRef.current });
      }
      socket.disconnect();
    };
  }, [roomCode, user]);

  // 3. Auto-scroll to bottom when new message arrives
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeTab]);

  // 4. Handlers
  const handleCodeChange = (newValue) => {
    const newCode = newValue || "";
    if (remoteCodeRef.current === newCode) {
      remoteCodeRef.current = null;
      return;
    }
    remoteCodeRef.current = null;
    setCode(newCode);
    
    if (socketRef.current && roomIdRef.current) {
      // Contract ke hisaab se expectedVersion bhejna zaroori hai
      socketRef.current.emit("code:update", {
        roomId: roomIdRef.current,
        expectedVersion: version,
        newCode: newCode,
      });
    }
  };

  const handleLanguageChange = (e) => {
    const newLang = e.target.value;
    setLanguage(newLang);
    if (socketRef.current && roomIdRef.current) {
      socketRef.current.emit("language:change", {
        roomId: roomIdRef.current,
        language: newLang,
      });
    }
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (
      !chatInput.trim() ||
      isSendingMessage ||
      !socketRef.current ||
      !roomIdRef.current
    ) {
      return;
    }

    const text = chatInput.trim();
    setChatError("");
    setIsSendingMessage(true);

    socketRef.current.timeout(10000).emit(
      "chat:send",
      {
        roomId: roomIdRef.current,
        text,
      },
      (timeoutError, response) => {
        setIsSendingMessage(false);
        if (timeoutError || !response?.success) {
          setChatError(
            timeoutError
              ? "Message send timed out. Please try again."
              : response?.error || "Failed to send message.",
          );
          return;
        }

        setChatInput((current) => (current === text ? "" : current));
      },
    );
  };

  const handleRunCode = async () => {
    if (!roomIdRef.current || isRunning) return;

    setIsRunning(true);
    setActiveTab("output");
    setExecutionResult(null);
    setExecutionError("");

    try {
      const clientRequestId = crypto.randomUUID();

      await api.post('/executions', {
        roomId: roomIdRef.current,
        language,
        code,
        clientRequestId
      });
    } catch (err) {
      setIsRunning(false);
      setExecutionError(
        err.response?.data?.error?.message || 
        err.response?.data?.message || 
        'Failed to queue execution.'
      );
    }
  };

  if (isConnecting) return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center text-white">
      <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
      <p>Connecting to room {roomCode}...</p>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center text-white">
      <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-6 rounded-xl text-center">
        <p className="mb-4">{error}</p>
        <button onClick={() => navigate("/dashboard")} className="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-white">Back to Dashboard</button>
      </div>
    </div>
  );

  return (
    <div className="h-screen bg-gray-950 flex flex-col text-white overflow-hidden">
      
      {/* Top Navbar */}
      <header className="h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate("/dashboard")} className="text-gray-400 hover:text-white">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <span className="font-semibold">{roomData?.name || "Room"}</span>
            <span className="bg-gray-800 text-xs px-2 py-1 rounded-md text-gray-400 border border-gray-700 uppercase">
              {roomCode}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={language}
            onChange={handleLanguageChange}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm outline-none"
          >
            <option value="javascript">JavaScript</option>
            <option value="python">Python</option>
            <option value="cpp">C++</option>
            <option value="java">Java</option>
          </select>
          <button 
            onClick={handleRunCode}
            disabled={isRunning}
            className="bg-green-600 hover:bg-green-700 disabled:bg-green-800/50 text-white px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
          >
            {isRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {isRunning ? 'Running...' : 'Run Code'}
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        
        {/* Participants Sidebar */}
        <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col hidden md:flex">
          <div className="p-3 border-b border-gray-800 flex items-center gap-2 text-sm font-medium text-gray-400">
            <Users className="w-4 h-4" /> Participants ({participants.length})
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {participants.map((p, idx) => (
              <div key={idx} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-800 rounded-lg transition-colors">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span className="text-sm truncate">
                  {p.userId === user?.id ? `${user.name} (You)` : p.name || `User`}
                </span>
              </div>
            ))}
          </div>
        </aside>

        {/* Main Area */}
        <main className="flex-1 flex flex-col min-w-0">
          
          {/* Monaco Editor */}
          <div className="flex-1 bg-[#1e1e1e] relative">
            <Editor
              height="100%"
              language={language}
              theme="vs-dark"
              value={code}
              onChange={handleCodeChange}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                wordWrap: "on",
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
            />
          </div>

          {/* Bottom Panel (Chat / Output) */}
          <div className="h-64 bg-gray-900 flex flex-col shrink-0">
            <div className="flex items-center border-b border-gray-800 px-2 pt-2 gap-2">
              <button onClick={() => setActiveTab("chat")} className={`px-4 py-2 text-sm font-medium rounded-t-lg flex items-center gap-2 ${activeTab === "chat" ? "bg-gray-800 text-blue-400" : "text-gray-400 hover:text-white"}`}>
                <MessageSquare className="w-4 h-4" /> Chat
              </button>
              <button onClick={() => setActiveTab("output")} className={`px-4 py-2 text-sm font-medium rounded-t-lg flex items-center gap-2 ${activeTab === "output" ? "bg-gray-800 text-green-400" : "text-gray-400 hover:text-white"}`}>
                <TerminalSquare className="w-4 h-4" /> Output
              </button>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col bg-gray-900">
              {activeTab === "chat" ? (
                <>
                  {/* Messages Area */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                    {messages.map((msg, idx) => {
                      const isMe = msg.senderId === user.id;
                      return (
                        <div key={idx} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                          <span className="text-xs text-gray-500 mb-1">
                            {isMe ? 'You' : (participants.find(p => p.userId === msg.senderId)?.name || 'User')}
                          </span>
                          <div className={`px-3 py-2 rounded-lg max-w-[80%] text-sm ${isMe ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-200'}`}>
                            {msg.text}
                          </div>
                        </div>
                      );
                    })}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Input Area */}
                  <form onSubmit={handleSendMessage} className="p-3 bg-gray-800/50 border-t border-gray-800">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={chatInput}
                        maxLength={1000}
                        onChange={(e) => {
                          setChatInput(e.target.value);
                          setChatError("");
                        }}
                        placeholder="Type a message..."
                        className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                      />
                      <button 
                        type="submit"
                        disabled={!chatInput.trim() || isSendingMessage}
                        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white p-2 rounded-lg transition-colors"
                      >
                        <Send className="w-5 h-5" />
                      </button>
                    </div>
                    {chatError && (
                      <p className="mt-2 text-xs text-red-400">{chatError}</p>
                    )}
                  </form>
                </>
              ) : (
                <div className="flex-1 p-4 overflow-y-auto font-mono text-sm">
                  {isRunning && (
                    <div className="flex items-center gap-2 text-yellow-400">
                      <Loader2 className="w-4 h-4 animate-spin" /> Executing code...
                    </div>
                  )}
                  
                  {executionError && <div className="text-red-400">{executionError}</div>}

                  {executionResult && (
                    <div>
                      {executionResult.stdout && (
                        <pre className="text-white whitespace-pre-wrap mb-2">{executionResult.stdout}</pre>
                      )}
                      {executionResult.stderr && (
                        <pre className="text-red-400 whitespace-pre-wrap mb-2">{executionResult.stderr}</pre>
                      )}
                      {!executionResult.stdout && !executionResult.stderr && (
                        <div className="text-gray-500">No output.</div>
                      )}
                      <div className="text-gray-500 text-xs mt-4 border-t border-gray-700 pt-2">
                        Process exited with code: <span className={executionResult.exitCode === 0 ? "text-green-400" : "text-red-400"}>{executionResult.exitCode}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
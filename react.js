import React, { useState, useEffect, createContext, useContext } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, getDoc, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';

// --- Firebase Configuration ---
// IMPORTANT: Replace with your actual Firebase project configuration
const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Context for User and Firebase ---
const AuthContext = createContext(null);

function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dbInstance, setDbInstance] = useState(null);
  const [authInstance, setAuthInstance] = useState(null);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    // Initialize Firebase and set up auth listener
    setDbInstance(db);
    setAuthInstance(auth);

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        setUserId(user.uid);
        // Sign in with custom token if available
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          try {
            await signInWithCustomToken(auth, __initial_auth_token);
            console.log("Signed in with custom token.");
          } catch (error) {
            console.error("Error signing in with custom token:", error);
            await signInAnonymously(auth); // Fallback to anonymous if custom token fails
            console.log("Signed in anonymously as fallback.");
          }
        }
        // Ensure user document exists in Firestore
        const userRef = doc(db, `artifacts/${typeof __app_id !== 'undefined' ? __app_id : 'default-app-id'}/users/${user.uid}/profile/`);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            uid: user.uid,
            email: user.email,
            displayName: user.email ? user.email.split('@')[0] : `User-${user.uid.substring(0, 6)}`,
            createdAt: serverTimestamp(),
          });
        }
      } else {
        setCurrentUser(null);
        setUserId(null);
        // Sign in anonymously if no user and no custom token
        if (typeof __initial_auth_token === 'undefined' || !__initial_auth_token) {
          try {
            await signInAnonymously(auth);
            console.log("Signed in anonymously.");
          } catch (error) {
            console.error("Error signing in anonymously:", error);
          }
        }
      }
      setLoading(false);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-xl font-semibold text-gray-700">Loading application...</div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ currentUser, userId, db: dbInstance, auth: authInstance }}>
      {children}
    </AuthContext.Provider>
  );
}

// --- Components ---

function App() {
  const { currentUser, userId } = useContext(AuthContext);
  const [view, setView] = useState('chatList'); // 'login', 'chatList', 'chatRoom'
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [selectedChatName, setSelectedChatName] = useState('');

  useEffect(() => {
    if (!currentUser) {
      setView('login');
    } else {
      setView('chatList');
    }
  }, [currentUser]);

  const handleSelectChat = (chatId, chatName) => {
    setSelectedChatId(chatId);
    setSelectedChatName(chatName);
    setView('chatRoom');
  };

  const handleBackToChatList = () => {
    setView('chatList');
    setSelectedChatId(null);
    setSelectedChatName('');
  };

  return (
    <div className="min-h-screen bg-gray-100 font-inter antialiased flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg overflow-hidden flex flex-col h-[90vh] sm:h-[80vh] md:h-[70vh] lg:h-[65vh]">
        {view === 'login' && <AuthScreen setView={setView} />}
        {view === 'chatList' && currentUser && (
          <ChatListScreen onSelectChat={handleSelectChat} />
        )}
        {view === 'chatRoom' && currentUser && selectedChatId && (
          <ChatRoomScreen
            chatId={selectedChatId}
            chatName={selectedChatName}
            onBack={handleBackToChatList}
          />
        )}
      </div>
    </div>
  );
}

function AuthScreen({ setView }) {
  const { auth } = useContext(AuthContext);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, email, password);
        setMessage('Registration successful! You are now logged in.');
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        setMessage('Login successful!');
      }
      // AuthProvider will handle setting currentUser and redirecting
    } catch (err) {
      console.error("Auth error:", err.message);
      if (err.code === 'auth/operation-not-allowed') {
        setError('Email/Password authentication is not enabled. Please enable it in your Firebase project settings (Authentication -> Sign-in method).');
      } else {
        setError(err.message);
      }
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 sm:p-8 h-full bg-gradient-to-br from-green-400 to-green-600 rounded-xl">
      <h2 className="text-3xl font-bold text-white mb-6">
        {isRegistering ? 'Sign Up' : 'Login'}
      </h2>
      <form onSubmit={handleAuth} className="w-full max-w-xs space-y-4">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-green-500 focus:border-transparent transition duration-200"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full p-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-green-500 focus:border-transparent transition duration-200"
          required
        />
        <button
          type="submit"
          className="w-full bg-white text-green-600 font-bold py-3 px-4 rounded-lg shadow-md hover:bg-gray-100 transition duration-200 transform hover:scale-105"
        >
          {isRegistering ? 'Register' : 'Login'}
        </button>
      </form>
      {error && <p className="text-red-200 mt-4 text-sm">{error}</p>}
      {message && <p className="text-white mt-4 text-sm">{message}</p>}
      <button
        onClick={() => setIsRegistering(!isRegistering)}
        className="mt-6 text-white text-sm opacity-80 hover:opacity-100 transition duration-200"
      >
        {isRegistering ? 'Already have an account? Login' : 'Need an account? Register'}
      </button>
    </div>
  );
}

function ChatListScreen({ onSelectChat }) {
  const { currentUser, userId, db, auth } = useContext(AuthContext);
  const [chats, setChats] = useState([]);
  const [newChatName, setNewChatName] = useState('');
  const [showCreateChat, setShowCreateChat] = useState(false);
  const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

  useEffect(() => {
    if (!db || !userId) return;

    // Listen for chats where the current user is a participant
    const q = query(collection(db, `artifacts/${appId}/public/data/chats`));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chatData = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(chat => chat.participants && chat.participants.includes(userId)); // Filter chats current user is part of
      setChats(chatData);
    }, (error) => {
      console.error("Error fetching chats:", error);
    });

    return () => unsubscribe();
  }, [db, userId, appId]);

  const handleCreateChat = async () => {
    if (!newChatName.trim()) return;
    try {
      const chatsCollectionRef = collection(db, `artifacts/${appId}/public/data/chats`);
      await addDoc(chatsCollectionRef, {
        name: newChatName.trim(),
        participants: [userId], // Current user is the first participant
        createdAt: serverTimestamp(),
      });
      setNewChatName('');
      setShowCreateChat(false);
    } catch (error) {
      console.error("Error creating chat:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      // AuthProvider will handle redirecting to login
    } catch (error) {
      console.error("Error logging out:", error);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between bg-green-500 p-4 text-white shadow-md rounded-t-xl">
        <h1 className="text-2xl font-bold">WhatsApp Clone</h1>
        <div className="flex items-center space-x-3">
          <span className="text-sm opacity-80">
            {currentUser?.email || `User: ${userId?.substring(0, 6)}`}
          </span>
          <button
            onClick={handleLogout}
            className="bg-white text-green-600 px-3 py-1 rounded-full text-sm font-semibold hover:bg-gray-100 transition duration-200"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="flex-grow overflow-y-auto p-4 space-y-3">
        {chats.length === 0 ? (
          <p className="text-gray-500 text-center mt-8">No chats yet. Create one!</p>
        ) : (
          chats.map((chat) => (
            <div
              key={chat.id}
              onClick={() => onSelectChat(chat.id, chat.name)}
              className="flex items-center p-3 bg-gray-50 rounded-lg shadow-sm cursor-pointer hover:bg-gray-100 transition duration-200"
            >
              <div className="flex-shrink-0 w-10 h-10 bg-green-200 rounded-full flex items-center justify-center text-green-700 font-bold text-lg">
                {chat.name.charAt(0).toUpperCase()}
              </div>
              <div className="ml-4 flex-grow">
                <h3 className="font-semibold text-gray-800">{chat.name}</h3>
                <p className="text-sm text-gray-500 truncate">
                  {chat.lastMessage || 'No messages yet.'}
                </p>
              </div>
              <div className="text-xs text-gray-400">
                {chat.lastMessageTime ? new Date(chat.lastMessageTime.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="p-4 border-t border-gray-200">
        {!showCreateChat ? (
          <button
            onClick={() => setShowCreateChat(true)}
            className="w-full bg-green-500 text-white py-3 rounded-lg font-semibold shadow-md hover:bg-green-600 transition duration-200 transform hover:scale-105"
          >
            + Create New Chat
          </button>
        ) : (
          <div className="flex flex-col space-y-2">
            <input
              type="text"
              placeholder="Enter new chat name"
              value={newChatName}
              onChange={(e) => setNewChatName(e.target.value)}
              className="w-full p-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-green-500 focus:border-transparent transition duration-200"
            />
            <div className="flex space-x-2">
              <button
                onClick={handleCreateChat}
                className="flex-grow bg-green-500 text-white py-2 rounded-lg font-semibold shadow-md hover:bg-green-600 transition duration-200"
              >
                Create
              </button>
              <button
                onClick={() => setShowCreateChat(false)}
                className="flex-grow bg-gray-300 text-gray-800 py-2 rounded-lg font-semibold shadow-md hover:bg-gray-400 transition duration-200"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ChatRoomScreen({ chatId, chatName, onBack }) {
  const { currentUser, userId, db } = useContext(AuthContext);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
  const messagesEndRef = React.useRef(null);

  useEffect(() => {
    if (!db || !chatId) return;

    // Fetch messages for the selected chat
    const messagesCollectionRef = collection(db, `artifacts/${appId}/public/data/chats/${chatId}/messages`);
    const q = query(messagesCollectionRef, orderBy('createdAt'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMessages(msgs);
    }, (error) => {
      console.error("Error fetching messages:", error);
    });

    return () => unsubscribe();
  }, [db, chatId, appId]);

  useEffect(() => {
    // Scroll to bottom on new message
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !db || !chatId || !userId) return;

    try {
      const messagesCollectionRef = collection(db, `artifacts/${appId}/public/data/chats/${chatId}/messages`);
      await addDoc(messagesCollectionRef, {
        text: newMessage.trim(),
        senderId: userId,
        senderEmail: currentUser?.email || `User-${userId.substring(0, 6)}`,
        createdAt: serverTimestamp(),
      });

      // Update last message in chat document (optional, for chat list preview)
      const chatDocRef = doc(db, `artifacts/${appId}/public/data/chats/${chatId}`);
      await updateDoc(chatDocRef, {
        lastMessage: newMessage.trim(),
        lastMessageTime: serverTimestamp(),
      });

      setNewMessage('');
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      <div className="flex items-center bg-green-500 p-4 text-white shadow-md">
        <button onClick={onBack} className="mr-3 text-white hover:text-gray-100 transition duration-200">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <h2 className="text-xl font-bold flex-grow">{chatName}</h2>
        <span className="text-sm opacity-80">
          Your ID: {userId?.substring(0, 6)}
        </span>
      </div>

      <div className="flex-grow overflow-y-auto p-4 space-y-3 custom-scrollbar">
        {messages.length === 0 ? (
          <p className="text-gray-500 text-center mt-8">Start the conversation!</p>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.senderId === userId ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[75%] p-3 rounded-lg shadow-sm ${
                  msg.senderId === userId
                    ? 'bg-green-200 text-gray-800 rounded-br-none'
                    : 'bg-white text-gray-800 rounded-bl-none'
                }`}
              >
                <div className="font-semibold text-xs text-gray-600 mb-1">
                  {msg.senderId === userId ? 'You' : msg.senderEmail.split('@')[0]}
                </div>
                <p className="text-sm">{msg.text}</p>
                <div className="text-right text-xs text-gray-500 mt-1">
                  {msg.createdAt ? new Date(msg.createdAt.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} /> {/* Scroll target */}
      </div>

      <form onSubmit={handleSendMessage} className="flex p-4 border-t border-gray-200">
        <input
          type="text"
          placeholder="Type a message..."
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          className="flex-grow p-3 rounded-full border border-gray-300 focus:ring-2 focus:ring-green-500 focus:border-transparent transition duration-200 mr-2"
        />
        <button
          type="submit"
          className="bg-green-500 text-white p-3 rounded-full shadow-md hover:bg-green-600 transition duration-200 transform hover:scale-105 flex items-center justify-center"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
          </svg>
        </button>
      </form>
    </div>
  );
}

// --- Main App Export ---
export default function MainApp() {
  return (
    <>
      {/* Tailwind CSS CDN */}
      <script src="https://cdn.tailwindcss.com"></script>
      {/* Font Inter */}
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <style>
        {`
          body {
            font-family: 'Inter', sans-serif;
          }
          .custom-scrollbar::-webkit-scrollbar {
            width: 8px;
          }
          .custom-scrollbar::-webkit-scrollbar-track {
            background: #f1f1f1;
            border-radius: 10px;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: #888;
            border-radius: 10px;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: #555;
          }
        `}
      </style>
      <AuthProvider>
        <App />
      </AuthProvider>
    </>
  );
}


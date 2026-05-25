import { createContext, useState, useCallback, useEffect } from 'react';

const AuthContext = createContext(null);

const API_BASE = 'http://localhost/uni-api';

export function AuthProvider({ children }) {
  const [authToken, setAuthToken] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const stored = localStorage.getItem('authToken');
    const storedUser = localStorage.getItem('currentUser');
    if (stored && storedUser) {
      setAuthToken(stored);
      setCurrentUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (usernameOrEmail, password) => {
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/auth/login.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usernameOrEmail, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || data.title || 'Login failed');
      }

      setAuthToken(data.token);
      setCurrentUser(data.user);
      localStorage.setItem('authToken', data.token);
      localStorage.setItem('currentUser', JSON.stringify(data.user));
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  const register = useCallback(async (username, email, password) => {
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/auth/register.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || data.title || 'Registration failed');
      }

      setAuthToken(data.token);
      setCurrentUser(data.user);
      localStorage.setItem('authToken', data.token);
      localStorage.setItem('currentUser', JSON.stringify(data.user));
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    setError(null);
    try {
      if (authToken) {
        await fetch(`${API_BASE}/auth/logout.php`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json',
          },
        });
      }
    } catch (err) {
      console.error('Logout request failed:', err);
    } finally {
      setAuthToken(null);
      setCurrentUser(null);
      localStorage.removeItem('authToken');
      localStorage.removeItem('currentUser');
    }
  }, [authToken]);

  return (
    <AuthContext.Provider value={{ authToken, currentUser, setCurrentUser, loading, error, login, register, logout, setError }}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthContext;

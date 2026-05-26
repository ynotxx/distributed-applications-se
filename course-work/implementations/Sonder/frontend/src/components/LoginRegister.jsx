import { useState, useContext } from 'react';
import AuthContext from '../AuthContext';
import './LoginRegister.css';

export function LoginRegister() {
  const { login, register, error: authError, setError } = useContext(AuthContext);
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLocalError('');
    setLoading(true);
    try {
      await login(username || email, password);
    } catch (err) {
      setLocalError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLocalError('');
    
    if (!username || !email || !password) {
      setLocalError('All fields required');
      return;
    }
    if (password.length < 8) {
      setLocalError('Паролата трябва да бъде поне 8 символа');
      return;
    }
    if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      setLocalError('Паролата трябва да съдържа главна буква и цифра');
      return;
    }

    setLoading(true);
    try {
      await register(username, email, password);
    } catch (err) {
      setLocalError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const displayError = localError || authError;

  return (
    <div className="auth-shell">
      <div className="auth-container">
        <section className="auth-card">
          <div className="auth-card-header">
            <span className="auth-pill">{isRegistering ? 'Създай профил' : 'Добре дошъл'}</span>
            <h2>{isRegistering ? 'Регистрация' : 'Вход'}</h2>
            <p>{isRegistering ? 'Създай нов профил и започни да публикуваш.' : 'Влез в своя профил.'}</p>
          </div>

          <form className="auth-form" onSubmit={isRegistering ? handleRegister : handleLogin}>
            {isRegistering && (
              <label className="auth-field">
                <span>Потребителско име</span>
                <input
                  type="text"
                  placeholder="Вашето потребителско име"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={loading}
                />
              </label>
            )}

            <label className="auth-field">
              <span>{isRegistering ? 'Имейл' : 'Потребителско име или имейл'}</span>
              <input
                type={isRegistering ? 'email' : 'text'}
                placeholder={isRegistering ? 'ime@example.com' : 'Потребителско име или имейл'}
                value={isRegistering ? email : username || email}
                onChange={(e) => {
                  if (isRegistering) setEmail(e.target.value);
                  else setUsername(e.target.value);
                }}
                disabled={loading}
              />
            </label>

            <label className="auth-field">
              <span>Парола</span>
              <input
                type="password"
                placeholder="Вашата парола"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </label>

            {displayError && <div className="auth-error">{displayError}</div>}

            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? 'Зареждане...' : isRegistering ? 'Създай профил' : 'Вход'}
            </button>
          </form>

          <div className="auth-switch">
            <span>{isRegistering ? 'Вече имате профил?' : 'Нямате профил?'}</span>
            <button
              type="button"
              onClick={() => {
                setIsRegistering(!isRegistering);
                setLocalError('');
                setError(null);
                setUsername('');
                setEmail('');
                setPassword('');
              }}
              disabled={loading}
            >
              {isRegistering ? 'Вход' : 'Регистрация'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

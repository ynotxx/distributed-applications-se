import { useContext, useState, useEffect, useRef } from 'react';
import AuthContext, { AuthProvider } from './AuthContext';
import { LoginRegister } from './components/LoginRegister';
import './App.css';

const API_BASE = 'http://localhost/backend';
const DEFAULT_AVATAR = 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y';

const normalizeTimestamp = (ts) => {
  if (ts == null) return null;
  if (!Number.isNaN(Number(ts))) {
    const value = Number(ts);
    return value < 100000000000 ? value * 1000 : value;
  }
  const parsed = Date.parse(ts);
  if (!Number.isNaN(parsed)) return parsed;
  return null;
};

const timeAgo = (ts) => {
  const normalizedTs = normalizeTimestamp(ts);
  if (!normalizedTs) return 'току-що';

  const seconds = Math.floor((Date.now() - normalizedTs) / 1000);
  if (seconds <= 0) return 'току-що';
  if (seconds < 5) return 'току-що';
  if (seconds < 60) return `преди ${seconds} сек.`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `преди ${minutes} мин.`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `преди ${hours} ч.`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `преди ${days} дни`;
  const months = Math.floor(days / 30);
  if (months < 12) return `преди ${months} мес.`;
  return `преди ${Math.floor(months / 12)} год.`;
};

const getReputationBadge = (score = 0) => {
  if (score >= 300) return { label: 'Легенда' };
  if (score >= 100) return { label: 'Автор' };
  if (score >= 25) return { label: 'Активен' };
  return { label: 'Нов потребител' };
};

const getStoredTheme = () => localStorage.getItem('theme') || 'light';

function AppContent() {
  const { authToken, currentUser, logout, loading, setCurrentUser } = useContext(AuthContext);
  const [view, setView] = useState('posts');
  const [profileSlug, setProfileSlug] = useState('');
  const [notification, setNotification] = useState(null);
  const [dbError, setDbError] = useState(null);
  const [users, setUsers] = useState([]);
  const [profileData, setProfileData] = useState(null);
  const [posts, setPosts] = useState([]);
  const [comments, setComments] = useState({});
  const [commentsError, setCommentsError] = useState({});
  const [viewedPosts, setViewedPosts] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortMode, setSortMode] = useState('newest');
  const [feedMode, setFeedMode] = useState('global');
  const [theme, setTheme] = useState(getStoredTheme());
  const [activityLog, setActivityLog] = useState([]);
  const [serverNotifications, setServerNotifications] = useState([]);
  const unreadCount = serverNotifications.filter(n => !n.is_read).length;
  const [showActivity, setShowActivity] = useState(false);
  const notificationsPanelRef = useRef(null);
  const [followState, setFollowState] = useState({ is_following: false, follow_id: null });
  const [myFollows, setMyFollows] = useState([]);
  const [isBlockedUser, setIsBlockedUser] = useState(false);
  const [followQuery, setFollowQuery] = useState('');
  const [followStatusFilter, setFollowStatusFilter] = useState('');
  const [followDrafts, setFollowDrafts] = useState({});
  const [editId, setEditId] = useState(null);
  const [editType, setEditType] = useState('');
  const [tempData, setTempData] = useState({});
  const [postTitle, setPostTitle] = useState('');
  const [postContent, setPostContent] = useState('');
  const [commentText, setCommentText] = useState({});
  const [replyText, setReplyText] = useState({});
  const [replyingTo, setReplyingTo] = useState(null);
  const [collapsedThreads, setCollapsedThreads] = useState({});
  const [newUsername, setNewUsername] = useState('');
  const [newAvatar, setNewAvatar] = useState('');
  const [showOptions, setShowOptions] = useState(false);
  const filteredUsers = users.filter(u => u.username.toLowerCase().includes(userSearch.toLowerCase()));

  const postsPerPage = 5;

  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.body.classList.remove('theme-light', 'theme-dark');
    document.body.classList.add(theme === 'dark' ? 'theme-dark' : 'theme-light');
    document.documentElement.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
  }, [theme]);

  const isDark = theme === 'dark';
  const colors = {
    page: isDark ? '#0a0e27' : '#ffffff',
    card: isDark ? '#0f1623' : '#f9f9f9',
    softCard: isDark ? '#12192d' : '#f3f6f9',
    text: isDark ? '#e8e8e8' : '#333333',
    muted: isDark ? '#888888' : '#999999',
    border: isDark ? '#2a3a5a' : '#e0e0e0',
    subtleBorder: isDark ? '#1a2a4a' : '#f0f0f0',
    input: isDark ? '#1a2a4a' : '#f9f9f9',
    link: isDark ? '#5dade2' : '#0066cc',
    accent: isDark ? '#7fb3d5' : '#0066cc',
    primary: isDark ? '#5dade2' : '#007bff',
    followBg: isDark ? '#2a3a5a' : '#e8f4f8',
    followBorder: isDark ? '#4a5a7a' : '#b3d9e8',
    successBg: isDark ? '#1a3a2a' : '#d4edda',
    successText: isDark ? '#a8e6c8' : '#155724',
  };

  const apiFetch = (endpoint, options = {}) => {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    return fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  };

  const isAdmin = () => currentUser && currentUser.is_admin === 1;
  const canEdit = (item) => {
    if (!currentUser) return false;
    const editableAuthorId = item.original_post_id ? (item.original_author_id || item.author_id) : item.author_id;
    if (String(currentUser.id) === String(editableAuthorId)) return true;
    return !item.original_post_id && isAdmin();
  };
  const canDelete = (authorId) => currentUser && (currentUser.id === authorId || isAdmin());

  const addActivity = (text) => {
    setActivityLog(prev => [...prev, { id: Date.now(), text, ts: Date.now() }]);
  };

  const showMsg = (text) => {
    setNotification(text);
    setTimeout(() => setNotification(null), 3000);
  };

  const fetchNotifications = () => {
    if (!currentUser) return;
    apiFetch(`/notifications.php?pageSize=8&sortDir=asc`)
      .then(res => res.json())
      .then(data => {
        const rows = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : []);
        const mapped = rows.map(r => ({ ...r, is_read: Number(r.is_read) === 1 || r.is_read === true }));
        setServerNotifications(mapped);
        console.log('Notifications fetched:', mapped.length, 'Unread:', mapped.filter(r => !r.is_read).length);
      })
      .catch(e => console.error('Fetch notifications error:', e));
  };

  useEffect(() => {
    if (!currentUser) return;
    let intervalId = null;
    const intervalMs = 5000;

    const startPolling = () => {
      if (intervalId) clearInterval(intervalId);
      fetchNotifications();
      intervalId = setInterval(() => {
        if (document.hidden) return;
        fetchNotifications();
      }, intervalMs);
    };

    const handleVisibility = () => {
      if (!document.hidden) {
        fetchNotifications();
      }
    };

    startPolling();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [currentUser]);

  useEffect(() => {
    if (!showActivity) return;
    const handler = (e) => {
      if (notificationsPanelRef.current && !notificationsPanelRef.current.contains(e.target)) {
        setShowActivity(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showActivity]);
 

  const markNotificationsRead = () => {
    if (!currentUser) return;
    setServerNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    apiFetch(`/notifications.php`, {
      method: 'POST',
      body: JSON.stringify({ action: 'mark_read' })
    }).then(async res => {
      try {
        const data = await res.json();
        console.log('Mark all read response:', data);
        fetchNotifications();
        showMsg('Всички известия са отбелязани като прочетени.');
      } catch (e) { console.error('Mark read error:', e); fetchNotifications(); }
    }).catch(e => { console.error('Mark read fetch error:', e); fetchNotifications(); });
  };

  const markNotificationRead = (id, read = true) => {
    if (!currentUser) return;
    setServerNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: !!read } : n));
    apiFetch(`/notifications.php`, { method: 'POST', body: JSON.stringify({ action: read ? 'mark_read' : 'mark_unread', notification_id: id }) })
      .then(async res => {
        const data = await res.json();
        console.log('Mark notification response:', data);
        fetchNotifications();
      }).catch(e => { console.error('Mark notification error:', e); fetchNotifications(); });
  };

  const deleteNotification = (id) => {
    if (!currentUser) return;
    if (!window.confirm('Да изтрия ли известието?')) return;
    setServerNotifications(prev => prev.filter(n => n.id !== id));
    apiFetch(`/notifications.php?id=${id}`, { method: 'DELETE' })
      .then(async res => {
        try { 
          const data = await res.json();
          console.log('Delete notification response:', data);
        } catch(e) { console.error('Parse delete response:', e); }
        fetchNotifications();
        showMsg('Известието е изтрито.');
      }).catch(e => { console.error('Delete notification error:', e); fetchNotifications(); });
  };

  const fetchFollowState = (user) => {
    if (!currentUser || !user || String(currentUser.id) === String(user.id)) {
      setFollowState({ is_following: false, follow_id: null });
      return;
    }
    apiFetch(`/follows.php?profile_id=${user.id}`)
      .then(res => res.json())
      .then(data => setFollowState({
        is_following: !!data?.is_following,
        follow_id: data?.follow_id ?? null,
      }))
      .catch(() => setFollowState({ is_following: false, follow_id: null }));
  };

  const fetchMyFollows = () => {
    if (!currentUser || !isMyProfile) return;
    const params = new URLSearchParams({
      follower_id: String(currentUser.id),
      pageSize: '50',
      sortBy: 'created_at',
      sortDir: 'desc'
    });
    if (followQuery.trim()) params.set('q', followQuery.trim());
    if (followStatusFilter) params.set('status', followStatusFilter);
    apiFetch(`/follows.php?${params.toString()}`)
      .then(res => res.json())
      .then(data => {
        const rows = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : []);
        const now = Date.now();
        const ACTIVE_WINDOW_MS = 5 * 60 * 1000;
        const mapped = rows.map(f => {
          const otherUsername = f.other_username || (() => {
            const otherId = (String(f.follower_id) === String(currentUser.id)) ? f.following_id : f.follower_id;
            const otherUser = users.find(u => String(u.id) === String(otherId));
            return otherUser ? otherUser.username : (otherId ? String(otherId) : '—');
          })();

          let statusDisplay = 'offline';
          if (f.is_blocked || f.is_blocked === 1) {
            statusDisplay = 'blocked';
          } else if (f.other_last_login_ts) {
            const last = Number(f.other_last_login_ts);
            if (!Number.isNaN(last) && (now - last) <= ACTIVE_WINDOW_MS) {
              statusDisplay = 'active';
            } else {
              statusDisplay = 'offline';
            }
          } else if (f.status && String(f.status).trim() !== '') {
            statusDisplay = f.status;
          } else {
            statusDisplay = 'offline';
          }

          return { ...f, other_username: otherUsername, status_display: statusDisplay };
        });
        setMyFollows(mapped);
      })
      .catch(() => setMyFollows([]));
  };

  const handleToggleFollow = () => {
    if (!currentUser || !profileUser || isMyProfile) return;

    const nextFollowing = !followState.is_following;
    const nextState = { is_following: nextFollowing, follow_id: nextFollowing ? followState.follow_id : null };

    setFollowState(nextState);

    const request = nextFollowing
      ? apiFetch(`/follows.php`, {
          method: 'POST',
          body: JSON.stringify({ follower_id: currentUser.id, following_id: profileUser.id })
        })
      : apiFetch(`/follows.php?id=${followState.follow_id}`, { method: 'DELETE' });

    request
      .then(async res => {
        const data = await res.json();
        if (nextFollowing) {
          const createdId = data?.id ?? null;
          setFollowState({ is_following: true, follow_id: createdId });
          showMsg('Последвахте потребителя.');
        } else {
          setFollowState({ is_following: false, follow_id: null });
          showMsg('Спряхте да следвате потребителя.');
        }
        fetchUsers();
        fetchProfileUser(profileSlug);
        fetchNotifications();
      })
      .catch(() => {
        setFollowState(prev => ({ ...prev, is_following: !nextFollowing }));
        fetchFollowState(profileUser);
        showMsg('Грешка при follow/unfollow.');
      });
  };

  const handleToggleBlock = (user) => {
    if (!currentUser || !user || isMyProfile) return;
    if (isBlockedUser) {
      apiFetch(`/blocks.php?blocked_id=${user.id}`, { method: 'DELETE' })
        .then(() => { setIsBlockedUser(false); fetchPosts(); fetchNotifications(); showMsg('Потребителят е разблокиран.'); })
        .catch(() => alert('Грешка при разблокиране.'));
    } else {
      if (!window.confirm('Сигурни ли сте, че искате да блокирате този потребител?')) return;
      apiFetch('/blocks.php', { method: 'POST', body: JSON.stringify({ blocked_id: user.id }) })
        .then(() => { setIsBlockedUser(true); fetchPosts(); fetchNotifications(); showMsg('Потребителят е блокиран.'); })
        .catch(() => alert('Грешка при блокиране.'));
    }
  };

  let profileUser = null;
  if (profileSlug) {
    if (profileData && profileData.username.toLowerCase() === profileSlug.toLowerCase()) {
      profileUser = profileData;
    } else if (currentUser && currentUser.username.toLowerCase() === profileSlug.toLowerCase()) {
      profileUser = users.find(u => u.username.toLowerCase() === profileSlug.toLowerCase()) || currentUser;
    } else {
      profileUser = users.find(u => u.username.toLowerCase() === profileSlug.toLowerCase());
    }
  }

  const isMyProfile = currentUser && profileUser && currentUser.username.toLowerCase() === profileUser.username.toLowerCase();

  const changeView = (newView) => { window.location.hash = `/${newView}`; };

  const openProfile = (user) => {
    setNewUsername(user.username);
    setNewAvatar(user.avatar || '');
    window.location.hash = `/profile/${user.username}`;
  };

  const validateData = (u, e, p) => {
    if (u.toLowerCase() === 'admin' || isAdmin()) return true;
    if (u.length < 3) { alert('Потребителското име трябва да е поне 3 символа.'); return false; }
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { alert('Невалиден формат на имейл адрес.'); return false; }
    if (p !== undefined) {
      if (p.length < 8 || !/[A-Z]/.test(p) || !/[0-9]/.test(p)) { alert('Паролата трябва да е поне 8 символа, да съдържа поне една главна буква и една цифра.'); return false; }
    }
    return true;
  };

  const fetchUsers = () => {
    if (currentUser) {
      apiFetch(`/users.php?pageSize=50&sortBy=id&sortDir=asc`)
        .then(async res => {
          const text = await res.text();
          try { return JSON.parse(text); } 
          catch (e) { setDbError("Грешка в users.php: " + text); return []; }
        })
        .then(data => {
          const rows = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : []);
          setUsers(rows);
        });
    }
  };

  const fetchProfileUser = (username) => {
    if (!username) {
      setProfileData(null);
      return;
    }

    apiFetch(`/users.php?username=${encodeURIComponent(username)}`)
      .then(async res => {
        const text = await res.text();
        try { return { ok: res.ok, data: JSON.parse(text) }; }
        catch (e) { setDbError("Грешка в users.php: " + text); return { ok: false, data: null }; }
      })
      .then(result => {
        const payload = result.data;
        const user = payload && Array.isArray(payload.data) ? (payload.data[0] || null) : (Array.isArray(payload) ? (payload[0] || null) : payload);
        setProfileData(result.ok ? user : null);
        if (user && user.id) {
          apiFetch(`/blocks.php?blocked_id=${user.id}`).then(res => res.json()).then(b => setIsBlockedUser(!!b.blocked)).catch(()=>{});
        } else {
          setIsBlockedUser(false);
        }
      })
      .catch(() => setProfileData(null));
  };

  const fetchPosts = () => {
    apiFetch(`/posts.php?feed=${feedMode}&pageSize=50&sortBy=id&sortDir=desc`)
      .then(async res => {
        const text = await res.text();
        try { return JSON.parse(text); } 
        catch (e) { setDbError("Грешка в posts.php: " + text); return []; }
      })
      .then(data => {
        const rows = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : []);
        if (rows.length) {
          setDbError(null);
          setPosts(rows);
          rows.forEach(post => fetchComments(post.original_post_id || post.id));
        } else {
          setPosts([]);
        }
      });
  };

  const fetchComments = (postId) => {
    const numericId = Number(postId);
    if (!numericId || Number.isNaN(numericId) || numericId <= 0) {
      console.warn('fetchComments: invalid postId, skipping', postId);
      return;
    }

    apiFetch(`/comments.php?post_id=${numericId}&pageSize=50&sortBy=created_at&sortDir=asc`)
      .then(async res => {
        const text = await res.text();
        if (!res.ok) {
          console.error('comments.php error', res.status, text);
          setCommentsError(prev => ({ ...prev, [String(postId)]: `Грешка при зареждане на коментари (${res.status})` }));
          setComments(prev => ({ ...prev, [String(postId)]: [] }));
          return null;
        }
        try { return JSON.parse(text); } 
        catch (e) { console.error("Грешка в comments.php (invalid JSON):", text); setComments(prev => ({ ...prev, [String(postId)]: [] })); return null; }
      })
      .then(data => {
        if (!data) return;
        const rows = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : []);
        console.debug('Fetched comments for', postId, rows);
        setComments(prev => ({ ...prev, [String(postId)]: rows }));
        setCommentsError(prev => {
          const next = { ...prev };
          delete next[String(postId)];
          return next;
        });
      }).catch(err => {
        console.error('Unexpected error fetching comments:', err);
        setComments(prev => ({ ...prev, [String(postId)]: [] }));
        setCommentsError(prev => ({ ...prev, [String(postId)]: 'Грешка при свързване' }));
      });
  };

  useEffect(() => { 
    if (currentUser) {
      fetchPosts(); 
      fetchUsers();
      fetchNotifications();
    }
  }, [currentUser, feedMode]);

  useEffect(() => {
    fetchFollowState(profileUser);
  }, [profileUser?.id, currentUser?.id]);

  useEffect(() => {
    if (view === 'profile' && profileSlug) {
      fetchProfileUser(profileSlug);
    } else {
      setProfileData(null);
    }
  }, [view, profileSlug, currentUser?.id]);

  useEffect(() => {
    if (currentUser && view === 'profile' && profileSlug && currentUser.username.toLowerCase() === profileSlug.toLowerCase()) {
      fetchMyFollows();
    }
  }, [currentUser?.id, view, profileSlug]);

  useEffect(() => {
    const applyRoute = () => {
      const hash = window.location.hash.slice(1);

      if (!hash) {
        window.location.hash = '/posts';
        setView('posts');
        setFeedMode('global');
        setProfileSlug('');
        setCurrentPage(1);
        setSearchTerm('');
        return;
      }

      if (hash.startsWith('/profile/')) {
        setView('profile');
        setProfileSlug(hash.replace('/profile/', ''));
        return;
      }

      if (hash === '/users') {
        setView('users');
        setProfileSlug('');
        return;
      }

      setView('posts');
      setProfileSlug('');
    };

    applyRoute();
    window.addEventListener('hashchange', applyRoute);
    return () => window.removeEventListener('hashchange', applyRoute);
  }, []);

  const handleAddPost = (e) => {
    e.preventDefault();
    apiFetch(`/posts.php`, { method: 'POST', body: JSON.stringify({ title: postTitle, content: postContent }) })
      .then(() => { fetchPosts(); fetchUsers(); setPostTitle(''); setPostContent(''); showMsg('Статията е публикувана!'); fetchNotifications(); addActivity('Публикувахте нова статия'); });
  };

  const handleLike = (post) => {
    const targetId = post.original_post_id || post.id;
    const isUnlike = Number(post.is_liked) > 0;
    const url = isUnlike ? `/likes.php?post_id=${targetId}` : `/likes.php`;
    const opts = isUnlike ? { method: 'DELETE' } : { method: 'POST', body: JSON.stringify({ post_id: targetId }) };
    apiFetch(url, opts).then(() => {
      fetchPosts();
      fetchUsers();
      fetchNotifications();
      addActivity(isUnlike ? 'Премахнахте харесване' : 'Харесахте публикация');
    });
  };

  const handleReblog = (post) => {
    const originalPostId = post.original_post_id || post.id;
    const isReblogged = Number(post.is_reblogged_by_me) > 0;
    if (isReblogged) {
      apiFetch(`/posts.php`, {
        method: 'POST',
        body: JSON.stringify({ action: 'unreblog', original_post_id: originalPostId })
      }).then(async res => {
        if (!res.ok) throw new Error(await res.text());
        fetchPosts();
        fetchUsers();
        fetchNotifications();
        addActivity('Премахнахте реблога');
      }).catch(err => showMsg(`Грешка при премахване на реблог: ${String(err).slice(0, 80)}`));
    } else {
      apiFetch(`/posts.php`, {
        method: 'POST',
        body: JSON.stringify({ action: 'reblog', title: `${post.title}`, content: post.content, original_post_id: originalPostId })
      }).then(async res => {
        if (!res.ok) throw new Error(await res.text());
        fetchPosts();
        fetchUsers();
        fetchNotifications();
        addActivity('Реблогнахте публикация');
      }).catch(err => showMsg(`Грешка при реблог: ${String(err).slice(0, 80)}`));
    }
  };

  const handleCommentLike = (comment) => {
    const isUnlike = Number(comment.is_liked) > 0;
    const url = isUnlike ? `/comment_likes.php?comment_id=${comment.id}` : `/comment_likes.php`;
    const options = isUnlike ? { method: 'DELETE' } : { method: 'POST', body: JSON.stringify({ comment_id: comment.id }) };
    apiFetch(url, options).then(async res => {
      if (!res.ok) throw new Error(await res.text());
      fetchComments(comment.post_id);
      fetchUsers();
      fetchNotifications();
    }).catch(err => showMsg(`Грешка при харесване на коментар: ${String(err).slice(0, 80)}`));
  };

  const handleUpdate = () => {
    apiFetch(`/${editType}s.php`, { method: 'PUT', body: JSON.stringify(tempData) }).then(() => { setEditId(null); fetchPosts(); });
  };

  const handleDeletePost = (id) => { if (window.confirm('Сигурни ли сте?')) apiFetch(`/posts.php?id=${id}`, { method: 'DELETE' }).then(() => { fetchPosts(); fetchUsers(); addActivity('Изтрихте публикация'); }); };

  const handleAddComment = (postId, parentId = null) => {
    const text = parentId ? replyText[parentId] : commentText[postId];
    if (!text) return;
    const numericId = Number(postId);
    if (!numericId || Number.isNaN(numericId) || numericId <= 0) { showMsg('Невалиден идентификатор на публикация'); return; }
    apiFetch(`/comments.php`, { method: 'POST', body: JSON.stringify({ post_id: numericId, parent_id: parentId, content: text }) })
      .then(() => { 
        fetchComments(numericId);
        fetchUsers();
        fetchNotifications();
        addActivity(parentId ? 'Отговорихте на коментар' : 'Добавихте коментар');
        if (parentId) { setReplyText(prev => ({ ...prev, [parentId]: '' })); setReplyingTo(null); setCollapsedThreads(prev => ({ ...prev, [parentId]: false })); } 
        else { setCommentText(prev => ({ ...prev, [String(postId)]: '' })); }
      });
  };

  const handleDeleteComment = (commentId, postId) => { if (window.confirm('Изтриване на коментара?')) apiFetch(`/comments.php?id=${commentId}`, { method: 'DELETE' }).then(() => { fetchComments(postId); fetchUsers(); addActivity('Изтрихте коментар'); }); };

  const handleSaveOptions = () => {
    if (!validateData(newUsername, null, undefined)) return;
    apiFetch(`/users.php`, { method: 'PUT', body: JSON.stringify({ id: currentUser.id, username: newUsername, avatar: newAvatar }) })
      .then(async res => { if (res.status === 409) throw new Error('Заето име'); return res.json(); })
      .then(() => {
        const updatedUser = { ...currentUser, username: newUsername, avatar: newAvatar };
        setCurrentUser(updatedUser); setShowOptions(false);
        fetchPosts(); fetchUsers(); showMsg('Профилът е обновен!');
        window.location.hash = `/profile/${newUsername}`;
      }).catch(err => alert(err.message === 'Заето име' ? 'Това име вече е заето!' : 'Грешка при запазване.'));
  };

  const handleSaveFollow = (follow) => {
    const draft = followDrafts[follow.id] || {};
    apiFetch(`/follows.php`, {
      method: 'PUT',
      body: JSON.stringify({
        id: follow.id,
        status: draft.status ?? follow.status,
        note: draft.note ?? follow.note ?? '',
        is_close_friend: draft.is_close_friend ?? follow.is_close_friend
      })
    })
      .then(res => res.json())
      .then(() => {
        setFollowDrafts(prev => {
          const next = { ...prev };
          delete next[follow.id];
          return next;
        });
        fetchMyFollows();
        showMsg('Записът за follow е обновен.');
      });
  };

  const handleDeleteFollow = (followId) => {
    if (!window.confirm('Да премахна ли следването?')) return;
    apiFetch(`/follows.php?id=${followId}`, { method: 'DELETE' })
      .then(() => {
        fetchMyFollows();
        showMsg('Следването е премахнато.');
      });
  };

  const startEdit = (type, item) => { setEditId(item.id); setEditType(type); setTempData(item); };
  const toggleThread = (id) => setCollapsedThreads(prev => ({ ...prev, [id]: !prev[id] }));

  const filteredPosts = posts
    .filter(p => ((p.title || '') + ' ' + (p.content || '')).toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      if (sortMode === 'liked') return (b.likes_count || 0) - (a.likes_count || 0);
      if (sortMode === 'viewed') return (b.view_count || 0) - (a.view_count || 0);
      const tb = normalizeTimestamp(b.created_at ?? b.created_ts) || 0;
      const ta = normalizeTimestamp(a.created_at ?? a.created_ts) || 0;
      return tb - ta;
    });
  const currentPosts = filteredPosts.slice((currentPage - 1) * postsPerPage, currentPage * postsPerPage);
  const totalPages = Math.ceil(filteredPosts.length / postsPerPage);

  useEffect(() => {
    const postsToCount = view === 'profile'
      ? posts.filter(p => profileUser && String(p.author_id) === String(profileUser.id))
      : currentPosts;

    postsToCount.forEach(post => {
      const postKey = String(post.id);
      if (viewedPosts.has(postKey)) return;

      setViewedPosts(prev => {
        const next = new Set(prev);
        next.add(postKey);
        return next;
      });

      apiFetch(`/posts.php`, { method: 'POST', body: JSON.stringify({ action: 'view', post_id: post.id }) })
        .catch(() => {});
    });
  }, [view, currentPage, feedMode, currentPosts, posts, profileUser?.id]);

  const getUserComments = () => {
    let userComments = [];
    if (!profileUser) return [];
    Object.keys(comments).forEach(postId => {
      comments[postId].forEach(c => {
        if (String(c.user_id) === String(profileUser.id)) {
          const post = posts.find(p => String(p.id) === String(postId));
          userComments.push({...c, postTitle: post ? post.title : 'Неизвестна статия'});
        }
      });
    });
    return userComments.sort((a, b) => (normalizeTimestamp(b.created_at ?? b.created_ts) || 0) - (normalizeTimestamp(a.created_at ?? a.created_ts) || 0));
  };

  const getProfileStats = (user) => {
    const userPosts = posts.filter(p => String(p.author_id) === String(user.id));
    const userComments = getUserComments();
    const likes = userPosts.reduce((sum, p) => sum + (Number(p.likes_count) || 0), 0);
    const views = userPosts.reduce((sum, p) => sum + (Number(p.view_count) || 0), 0);
    return { posts: userPosts.length, comments: userComments.length, likes, views };
  };

  const renderComments = (commentsList, postId, parentId = null, depth = 0) => {
    if (!commentsList) return null;
    const filtered = commentsList.filter(c => c.parent_id == parentId);
    if (filtered.length === 0) return null;

    return filtered.map(c => {
      const isCollapsed = collapsedThreads[c.id];
      const childrenCount = commentsList.filter(child => child.parent_id === c.id).length;
      
      return (
        <div key={c.id} style={{ marginTop: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px' }}>
            <button onClick={() => toggleThread(c.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '11px', color: colors.muted, padding: '0', width: '15px', textAlign: 'left', outline: 'none' }}>
              {isCollapsed ? '[+]' : '[-]'}
            </button>
            <strong style={{ cursor: 'pointer', color: colors.link }} onClick={() => openProfile({username: c.username})}>
              {c.username}
            </strong>
            <span style={{ fontSize: '11px', color: colors.muted }}>{timeAgo(c.created_at ?? c.created_ts)}</span>
            {isCollapsed && childrenCount > 0 && <span style={{ fontSize: '11px', color: colors.muted }}>({childrenCount} отговора)</span>}
          </div>

                  {!isCollapsed && (
            <div style={{ marginLeft: '5px', paddingLeft: '15px', borderLeft: `2px solid ${colors.subtleBorder}`, marginTop: '5px' }}>
              {editId === c.id && editType === 'comment' ? (
                <div className="comment-input-area" style={{ marginBottom: '10px' }}>
                  <input value={tempData.content} onChange={e => setTempData({ ...tempData, content: e.target.value })} style={{ padding: '4px', fontSize: '12px', border: `1px solid ${colors.border}` }}/>
                  <button onClick={handleUpdate} className="btn btn-primary" style={{ padding: '2px 8px', fontSize: '12px', marginLeft: '5px' }}>ОК</button>
                  <button onClick={() => setEditId(null)} className="btn btn-default" style={{ padding: '2px 8px', fontSize: '12px', marginLeft: '5px' }}>X</button>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: '14px', marginBottom: '4px', marginTop: '2px' }}>{c.is_blocked ? (<em style={{ color: colors.muted }}>Потребителят @{c.username} е блокиран</em>) : c.content}</div>
                  {!c.is_blocked && (
                    <div style={{ marginTop: '3px', marginBottom: '8px' }}>
                      <button onClick={() => setReplyingTo(replyingTo === c.id ? null : c.id)} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontSize: '11px', padding: 0 }}>Отговор</button>
                      <button onClick={() => handleCommentLike(c)} style={{ background: 'none', border: 'none', color: c.is_liked > 0 ? colors.link : colors.muted, cursor: 'pointer', fontSize: '11px', marginLeft: '10px', padding: 0, fontWeight: c.is_liked > 0 ? 'bold' : 'normal' }}>❤ {c.likes_count || 0}</button>
                      {canEdit({author_id: c.user_id}) && <button onClick={() => startEdit('comment', c)} style={{ background: 'none', border: 'none', color: colors.link, cursor: 'pointer', fontSize: '11px', marginLeft: '10px', padding: 0 }}>Редактирай</button>}
                      {canDelete(c.user_id) && <button onClick={() => handleDeleteComment(c.id, postId)} style={{ background: 'none', border: 'none', color: '#e35d5b', cursor: 'pointer', fontSize: '11px', marginLeft: '10px', padding: 0 }}>Изтрий</button>}
                    </div>
                  )}
                </>
              )}

              {replyingTo === c.id && (
                <div style={{ display: 'flex', gap: '5px', marginTop: '5px', marginBottom: '10px' }}>
                  <input placeholder={`Отговор до ${c.username}...`} value={replyText[c.id] || ''} onChange={e => setReplyText({...replyText, [c.id]: e.target.value})} style={{ flex: 1, padding: '4px', fontSize: '12px', border: `1px solid ${colors.border}` }} />
                  <button onClick={() => handleAddComment(postId, c.id)} className="btn btn-primary" style={{ padding: '2px 10px', fontSize: '12px' }}>Прати</button>
                </div>
              )}

              {renderComments(commentsList, postId, c.id, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  const renderPost = (p) => {
    const targetId = p.original_post_id || p.id;
    const targetKey = String(targetId);
    const displayAvatar = p.original_author_avatar || p.author_avatar || DEFAULT_AVATAR;
    const displayUsername = p.original_author_name || p.author_name || 'Неизвестен';
    const originalPostDate = p.original_created_ts || p.created_ts;
    const isReblogged = Number(p.is_reblogged_by_me) > 0;
    const postAuthorObj = users.find(u => u.username === displayUsername);
    const repScore = postAuthorObj ? postAuthorObj.reputation_score : 0;
    const readingTime = Number(p.reading_time_minutes) || 0;
    const displayTitle = p.original_title || p.title;
    const displayContent = p.original_content || p.content;
    
    return (
      <div key={p.id} className="card" style={{ border: `1px solid ${colors.border}`, borderRadius: '12px', padding: '15px', marginBottom: '20px', backgroundColor: colors.card, color: colors.text, position: 'relative', boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.25)' : '0 2px 5px rgba(0,0,0,0.05)' }}>
        <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', gap: '5px' }}>
          {canEdit(p) && <button onClick={() => startEdit('post', p)} className="btn btn-default" style={{ fontSize: '11px' }}>Редактирай</button>}
          {canDelete(p.author_id) && <button onClick={() => handleDeletePost(p.id)} className="btn btn-danger" style={{ fontSize: '11px' }}>Изтрий</button>}
        </div>

        {editId === p.id && editType === 'post' ? (
          <div className="form-group" style={{ marginTop: '20px' }}>
            <input value={tempData.title} onChange={e => setTempData({ ...tempData, title: e.target.value })} style={{width: '100%', marginBottom: '10px', padding: '8px', border: `1px solid ${colors.border}`}}/>
            <textarea value={tempData.content} onChange={e => setTempData({ ...tempData, content: e.target.value })} style={{width: '100%', minHeight: '80px', marginBottom: '10px', padding: '8px', border: `1px solid ${colors.border}`}}/>
            <button onClick={handleUpdate} className="btn btn-primary">Запази</button>
            <button onClick={() => setEditId(null)} className="btn btn-default" style={{marginLeft: '10px'}}>Отказ</button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '15px' }}>
              <img src={displayAvatar} onClick={() => openProfile({username: displayUsername})} style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '4px', border: `1px solid ${colors.border}`, cursor: 'pointer' }} alt="avatar" />
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <h2 style={{ margin: '0 0 5px 0' }}>{displayTitle}</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <small style={{ color: colors.link, cursor: 'pointer', fontWeight: 'bold' }} onClick={() => openProfile({username: displayUsername})}>
                    @{displayUsername}
                  </small>
                  <span style={{ fontSize: '11px', color: colors.accent, fontWeight: 'bold' }}>Репутация: {repScore}</span>
                  <span style={{ fontSize: '11px', color: colors.muted }}>{getReputationBadge(repScore).label}</span>
                  <span style={{ fontSize: '11px', color: colors.muted }}>Публикувано: {timeAgo(originalPostDate)}</span>
                  {readingTime > 0 && <span style={{ fontSize: '11px', color: colors.muted }}>• {readingTime} мин. четене</span>}
                </div>
                
                <div style={{ marginTop: '15px', fontSize: '16px', lineHeight: '1.5', overflowWrap: 'break-word', color: colors.text }}>{displayContent}</div>
              </div>
            </div>
            
            <div style={{ marginTop: '20px', display: 'flex', gap: '10px', borderTop: `1px solid ${colors.subtleBorder}`, paddingTop: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              {!p.is_blocked ? (
                <>
                  <button onClick={() => handleLike(p)} className="btn btn-default" style={{ backgroundColor: isDark ? (p.is_liked > 0 ? '#1e2c3f' : '#121a27') : (p.is_liked > 0 ? '#eef5fb' : '#ffffff'), boxShadow: p.is_liked > 0 ? 'inset 0 2px 4px rgba(0,0,0,0.08)' : 'none', padding: '4px 10px' }}>
                    Харесвания: {p.likes_count || 0}
                  </button>
                  <button onClick={() => handleReblog(p)} className="btn btn-default" style={{ backgroundColor: isDark ? (isReblogged ? '#1e2c3f' : '#121a27') : (isReblogged ? '#eef5fb' : '#ffffff'), boxShadow: isReblogged ? 'inset 0 2px 4px rgba(0,0,0,0.08)' : 'none', padding: '4px 10px' }}>
                    {isReblogged ? 'Реблогнато' : 'Реблогни'} ({p.reblogs_count || 0})
                  </button>
                </>
              ) : (
                <div style={{ color: colors.muted, fontStyle: 'italic' }}>Тази публикация е скрита (потребителят е блокиран)</div>
              )}
              <span style={{ fontSize: '12px', color: colors.muted, marginLeft: 'auto' }}>Преглеждания: {p.view_count || 0}</span>
            </div>
          </>
        )}

        <div className="comments-section" style={{ marginTop: '15px', paddingTop: '15px', borderTop: `1px solid ${colors.subtleBorder}` }}>
          <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: colors.muted }}>Коментари</h4>
          <div style={{ marginBottom: '15px' }}>
            {commentsError[targetKey] ? (
              <div style={{ color: colors.muted, fontStyle: 'italic' }}>{commentsError[targetKey]}</div>
            ) : (
              renderComments(comments[targetKey], targetKey)
            )}
          </div>
          <div className="comment-input-area" style={{ display: 'flex', gap: '5px' }}>
            <input placeholder="Напишете нов коментар..." value={commentText[targetKey] || ''} onChange={e => setCommentText({ ...commentText, [targetKey]: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddComment(targetKey); } }} style={{ flex: 1, padding: '8px', border: `1px solid ${colors.border}` }} />
            <button onClick={() => handleAddComment(targetKey)} className="btn btn-primary" style={{ padding: '4px 15px' }}>OK</button>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return <div className="app-container"><p>Loading...</p></div>;
  }

  if (!authToken) {
    return <LoginRegister />;
  }

  return (
    <div className="container" style={{ backgroundColor: colors.page, color: colors.text, minHeight: '100vh', paddingBottom: '30px' }}>
      {notification && (
        <div style={{ position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)', backgroundColor: colors.successBg, border: `1px solid ${colors.border}`, color: colors.successText, padding: '10px 20px', borderRadius: '4px', zIndex: 1000, boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
          {notification}
        </div>
      )}

      {dbError && (
        <div style={{ backgroundColor: isDark ? '#2a1f26' : '#f8d7da', color: isDark ? '#ffd0dc' : '#721c24', padding: '15px', borderRadius: '5px', marginBottom: '20px', border: isDark ? '1px solid #5a2f42' : '1px solid #f5c6cb' }}>
          <strong>Внимание! Проблем с базата данни:</strong>
          <p style={{ marginTop: '5px', fontSize: '13px' }}>Проверете че всички колони (view_count, likes_count, reputation_score и т.н.) са създадени правилно.</p>
        </div>
      )}

      <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', color: colors.text, marginBottom: '20px' }}>
        <div>Влезли сте като: <strong style={{ color: colors.primary }}>{currentUser.username}</strong></div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', position: 'relative', flexWrap: 'wrap' }}>
          <button onClick={() => setShowActivity(!showActivity)} className="btn btn-default">Известия {unreadCount}</button>
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="btn btn-default">{theme === 'dark' ? 'Светъл режим' : 'Тъмен режим'}</button>
          <button onClick={logout} className="btn btn-default">Изход</button>
          {showActivity && (
            <div ref={notificationsPanelRef} style={{ position: 'absolute', top: '42px', right: 0, width: '420px', backgroundColor: colors.card, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: '10px', zIndex: 900, boxShadow: '0 8px 20px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', maxHeight: '600px' }}>
              <div style={{ padding: '12px', borderBottom: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <strong>Известия ({serverNotifications.length})</strong>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button onClick={markNotificationsRead} className="btn btn-default" style={{ padding: '4px 10px', fontSize: '12px', whiteSpace: 'nowrap' }}>Прочети всички</button>
                  {serverNotifications.length > 0 && <button onClick={() => { if(window.confirm('Да изтрия ли всички известия?')) apiFetch('/notifications.php?action=delete_all', { method: 'DELETE' }).then(async res => { try { const data = await res.json(); console.log('Delete all response:', data); if(data && data.unread_count !== undefined) setUnreadCount(data.unread_count); } catch(e){} fetchNotifications(); showMsg('Всички известия са изтрити.'); }).catch(e => console.error('Delete all error:', e)); }} className="btn btn-danger" style={{ padding: '4px 10px', fontSize: '12px', whiteSpace: 'nowrap' }}>Изтрий всички</button>}
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', minHeight: '200px' }}>
                {serverNotifications.length === 0 && activityLog.length === 0 ? (
                  <p style={{ color: colors.muted, marginBottom: 0, fontSize: '13px' }}>Няма нова активност.</p>
                ) : (
                  <>
                    {serverNotifications.map(n => (
                      <div key={`server-${n.id}`} style={{ fontSize: '13px', display: 'flex', gap: '10px', alignItems: 'flex-start', justifyContent: 'space-between', backgroundColor: n.is_read ? (isDark ? '#1a1f2e' : '#f5f5f5') : (isDark ? 'rgba(100, 150, 200, 0.2)' : 'rgba(59, 130, 246, 0.15)'), padding: '10px', borderRadius: '6px', border: n.is_read ? `1px solid ${colors.subtleBorder}` : `1px solid ${colors.primary}` }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: n.is_read ? 'normal' : 'bold', color: n.is_read ? colors.muted : colors.primary }}>{n.message}</div>
                          <small style={{ color: colors.muted, display: 'block', marginTop: '4px' }}>{timeAgo(n.created_at ?? n.created_ts ?? n.createdAt)}</small>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                          <button onClick={() => deleteNotification(n.id)} title="Изтрий" className="btn btn-danger" style={{ padding: '4px 8px', fontSize: '12px', minWidth: '32px' }}>🗑</button>
                        </div>
                      </div>
                    ))}
                    {activityLog.map(a => (
                      <div key={`local-${a.id}`} style={{ fontSize: '13px', padding: '8px', backgroundColor: isDark ? '#1a1f2e' : '#f5f5f5', borderRadius: '6px', borderLeft: `3px solid ${colors.primary}` }}>
                        <div style={{ fontWeight: '500' }}>{a.text}</div>
                        <small style={{ color: colors.muted, display: 'block', marginTop: '4px' }}>{timeAgo(a.ts)}</small>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <nav style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <button onClick={() => { setFeedMode('global'); changeView('posts'); setCurrentPage(1); setSearchTerm(''); }} style={{ backgroundColor: view === 'posts' && feedMode === 'global' ? colors.primary : colors.card, color: view === 'posts' && feedMode === 'global' ? '#fff' : colors.text, padding: '8px 16px', border: `1px solid ${colors.border}`, borderRadius: '4px', cursor: 'pointer' }}>Начало</button>
        <button onClick={() => { setFeedMode('following'); changeView('posts'); setCurrentPage(1); setSearchTerm(''); }} style={{ backgroundColor: view === 'posts' && feedMode === 'following' ? colors.primary : colors.card, color: view === 'posts' && feedMode === 'following' ? '#fff' : colors.text, padding: '8px 16px', border: `1px solid ${colors.border}`, borderRadius: '4px', cursor: 'pointer' }}>Следвани</button>
        {isAdmin() && <button onClick={() => changeView('users')} style={{ backgroundColor: view === 'users' ? colors.primary : colors.card, color: view === 'users' ? '#fff' : colors.text, padding: '8px 16px', border: `1px solid ${colors.border}`, borderRadius: '4px', cursor: 'pointer' }}>Потребители</button>}
        <button onClick={() => openProfile(currentUser)} style={{ backgroundColor: view === 'profile' && isMyProfile ? colors.primary : colors.card, color: view === 'profile' && isMyProfile ? '#fff' : colors.text, padding: '8px 16px', border: `1px solid ${colors.border}`, borderRadius: '4px', cursor: 'pointer' }}>Моят Профил</button>
      </nav>

      {view === 'posts' && (
        <section>
          <div className="card" style={{ backgroundColor: colors.softCard, color: colors.text, padding: '15px', border: `1px solid ${colors.border}`, borderRadius: '12px', marginBottom: '20px' }}>
            <form onSubmit={handleAddPost} className="form-group">
              <input placeholder="Заглавие..." value={postTitle} onChange={e => setPostTitle(e.target.value)} required style={{ width: '100%', marginBottom: '10px', padding: '8px', border: `1px solid ${colors.border}`, backgroundColor: colors.input, color: colors.text }} />
              <textarea placeholder="Какво е на ума ти..." value={postContent} onChange={e => setPostContent(e.target.value)} required style={{ width: '100%', minHeight: '80px', marginBottom: '10px', padding: '8px', border: `1px solid ${colors.border}`, backgroundColor: colors.input, color: colors.text }} />
              <button type="submit" className="btn btn-primary">Публикувай</button>
            </form>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <input type="text" placeholder="Търси..." value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }} style={{ flex: 1, minWidth: '220px', padding: '10px', border: `1px solid ${colors.border}`, backgroundColor: colors.input, color: colors.text }} />
            <select value={sortMode} onChange={e => { setSortMode(e.target.value); setCurrentPage(1); }} style={{ padding: '10px', border: `1px solid ${colors.border}`, backgroundColor: colors.input, color: colors.text }}>
              <option value="newest">Най-нови</option>
              <option value="liked">Най-харесвани</option>
              <option value="viewed">Най-гледани</option>
            </select>
          </div>

          {currentPosts.length > 0 ? currentPosts.map(p => renderPost(p)) : <p>Няма намерени статии.</p>}

          {totalPages > 1 && (
            <div style={{ marginTop: '20px', display: 'flex', gap: '5px', justifyContent: 'center' }}>
              {Array.from({ length: totalPages }, (_, i) => (
                <button key={i + 1} onClick={() => setCurrentPage(i + 1)} style={{ backgroundColor: currentPage === i + 1 ? colors.primary : colors.card, color: currentPage === i + 1 ? '#fff' : colors.text, padding: '8px 12px', border: `1px solid ${colors.border}`, borderRadius: '4px', cursor: 'pointer' }}>
                  {i + 1}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {view === 'profile' && profileUser && !!profileUser.blocked_you && (
        <section>
          <div className="card" style={{ backgroundColor: colors.softCard, color: colors.text, padding: '20px', border: `1px solid ${colors.border}`, borderRadius: '12px' }}>
            <h2 style={{ marginTop: 0 }}>Потребителят не съществува.</h2>
            <p style={{ color: colors.muted }}>Този профил не е наличен.</p>
          </div>
        </section>
      )}

      {view === 'profile' && profileUser && !profileUser.blocked_you && (
        <section>
          <div style={{ background: colors.card, color: colors.text, borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', marginBottom: '20px' }}>
            <div style={{ height: '180px', background: isDark ? 'linear-gradient(135deg, #152235, #26364b)' : 'linear-gradient(135deg, #337ab7, #6fa8dc)' }}></div>
            <div style={{ padding: '0 25px 25px 25px', marginTop: '-60px' }}>
              <img src={profileUser.avatar || DEFAULT_AVATAR} alt="profile" style={{ width: '120px', height: '120px', borderRadius: '16px', objectFit: 'cover', border: `4px solid ${colors.card}`, boxShadow: '0 4px 10px rgba(0,0,0,0.15)' }} />
              <div style={{ marginTop: '15px' }}>
                <h2 style={{ margin: 0 }}>@{profileUser.username}</h2>
                <div style={{ color: colors.accent, fontWeight: 'bold', marginTop: '6px' }}>Репутация: {profileUser.reputation_score || 0}</div>
                <div style={{ color: colors.muted, fontSize: '13px', marginTop: '6px' }}>{getReputationBadge(profileUser.reputation_score || 0).label}</div>
                {(profileUser.registered_on || profileUser.registered_ts) ? (
                  <div style={{ color: colors.muted, fontSize: '13px', marginTop: '6px' }}>
                    Профил създаден: {timeAgo(profileUser.registered_on ?? profileUser.registered_ts)}
                  </div>
                ) : null}
              </div>
              <div style={{ display: 'flex', gap: '25px', marginTop: '20px', flexWrap: 'wrap', borderTop: `1px solid ${colors.subtleBorder}`, paddingTop: '15px' }}>
                <div><strong>{getProfileStats(profileUser).posts}</strong><br />Постове</div>
                <div><strong>{getProfileStats(profileUser).comments}</strong><br />Коментари</div>
                <div><strong>{getProfileStats(profileUser).likes}</strong><br />Харесвания</div>
                <div><strong>{getProfileStats(profileUser).views}</strong><br />Преглеждания</div>
                <div><strong>{profileUser.followers_count || 0}</strong><br />Последователи</div>
                <div><strong>{profileUser.following_count || 0}</strong><br />Следва</div>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '20px', flexWrap: 'wrap' }}>
                {isMyProfile ? (
                  <button onClick={() => setShowOptions(!showOptions)} className="btn btn-default">Опции</button>
                ) : (
                  <>
                    <button onClick={handleToggleFollow} className="btn" style={{ color: followState.is_following ? '#ffffff' : colors.text, backgroundColor: followState.is_following ? colors.primary : colors.followBg, borderColor: followState.is_following ? colors.link : colors.followBorder, fontWeight: 600, boxShadow: followState.is_following ? '0 1px 0 rgba(0,0,0,0.12)' : 'none', border: `1px solid`, borderRadius: '4px', padding: '8px 16px', cursor: 'pointer' }}>
                      {followState.is_following ? 'Следвате' : 'Следвай'}
                    </button>
                    <button onClick={() => handleToggleBlock(profileUser)} className="btn btn-default" style={{ marginLeft: '8px' }}>{isBlockedUser ? 'Разблокирай' : 'Блокирай'}</button>
                  </>
                )}
              </div>
            </div>
          </div>

          {showOptions && isMyProfile && (
            <div className="card" style={{ border: `1px solid ${colors.border}`, padding: '15px', marginBottom: '20px', backgroundColor: colors.softCard, color: colors.text, borderRadius: '12px' }}>
              <h4 style={{ marginTop: 0 }}>Настройки на профила</h4>
              <input value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="Ново име..." style={{ width: '100%', marginBottom: '10px', padding: '8px', border: `1px solid ${colors.border}`, backgroundColor: colors.input, color: colors.text }} />
              <input value={newAvatar} onChange={e => setNewAvatar(e.target.value)} placeholder="URL на профилна снимка..." style={{ width: '100%', marginBottom: '10px', padding: '8px', border: `1px solid ${colors.border}`, backgroundColor: colors.input, color: colors.text }} />
              <button onClick={handleSaveOptions} className="btn btn-primary">Запази промените</button>
            </div>
          )}

          {isMyProfile && (
            <div className="card" style={{ border: `1px solid ${colors.border}`, padding: '15px', marginBottom: '20px', backgroundColor: colors.softCard, color: colors.text, borderRadius: '12px' }}>
              <h4 style={{ marginTop: 0 }}>Моите следвания</h4>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '15px' }}>
                <input value={followQuery} onChange={e => setFollowQuery(e.target.value)} placeholder="Търси..." style={{ flex: 1, minWidth: '220px', padding: '8px', border: `1px solid ${colors.border}`, backgroundColor: colors.input, color: colors.text }} />
                <select value={followStatusFilter} onChange={e => setFollowStatusFilter(e.target.value)} style={{ padding: '8px', border: `1px solid ${colors.border}`, backgroundColor: colors.input, color: colors.text }}>
                  <option value="">Всички статуси</option>
                  <option value="active">Активен</option>
                  <option value="offline">Офлайн</option>
                  <option value="blocked">Блокиран</option>
                </select>
                <button onClick={fetchMyFollows} className="btn btn-default">Обнови</button>
              </div>
              {myFollows.length === 0 ? (
                <p style={{ color: colors.muted, marginBottom: 0 }}>Няма резултати.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                        <th style={{ padding: '8px', textAlign: 'left' }}>Потребител</th>
                        <th style={{ padding: '8px', textAlign: 'left' }}>Статус</th>
                        <th style={{ padding: '8px', textAlign: 'left' }}>Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myFollows.map(follow => (
                        <tr key={follow.id} style={{ borderTop: `1px solid ${colors.subtleBorder}` }}>
                          <td style={{ padding: '8px' }}>{follow.other_username}</td>
                          <td style={{ padding: '8px' }}>{follow.status_display}</td>
                          <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                            <button onClick={() => handleDeleteFollow(follow.id)} className="btn btn-danger" style={{ padding: '4px 8px', fontSize: '12px' }}>Премахни</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {posts.filter(p => String(p.author_id) === String(profileUser.id)).length > 0 ? (
            posts.filter(p => String(p.author_id) === String(profileUser.id)).map(p => renderPost(p))
          ) : (
            <p style={{ textAlign: 'center' }}>Няма постове от този потребител.</p>
          )}
        </section>
      )}

      {view === 'users' && isAdmin() && (
        <section>
          <h2 style={{ color: colors.text }}>Всички потребители</h2>
          <input 
            type="text" 
            placeholder="Търси потребител..."
            value={userSearch}
            onChange={e => setUserSearch(e.target.value)}
            style={{ width: '100%', marginBottom: '20px', padding: '8px', border: `1px solid ${colors.border}`, backgroundColor: colors.input, color: colors.text }} 
          />
          <table style={{ width: '100%', marginTop: '20px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${colors.border}`, textAlign: 'left' }}>
                <th style={{ padding: '8px' }}>ID</th>
                <th style={{ padding: '8px' }}>Username</th>
                <th style={{ padding: '8px' }}>Email</th>
                <th style={{ padding: '8px' }}>Репутация</th>
                <th style={{ padding: '8px' }}>Admin</th>
                <th style={{ padding: '8px' }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(u => (
                <tr key={u.id} style={{ borderBottom: `1px solid ${colors.subtleBorder}` }}>
                  <td style={{ padding: '8px' }}>{u.id}</td>
                  <td style={{ padding: '8px' }}>{u.username}</td>
                  <td style={{ padding: '8px' }}>{u.email || '—'}</td>
                  <td style={{ padding: '8px', color: colors.accent, fontWeight: 'bold' }}>{u.reputation_score || 0}</td>
                  <td style={{ padding: '8px' }}>{u.is_admin === 1 ? '✓' : '—'}</td>
                  <td style={{ padding: '8px' }}>
                    <button onClick={() => { if(window.confirm('Изтриване?')) apiFetch(`/users.php?id=${u.id}`, { method: 'DELETE' }).then(() => { fetchUsers(); addActivity('Изтрихте потребител'); }); }} className="btn btn-danger" style={{ fontSize: '11px', padding: '2px 5px' }}>Изтрий</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

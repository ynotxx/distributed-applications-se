import { useEffect, useState } from 'react'

const setCookie = (name, value, days) => {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = name + '=' + encodeURIComponent(JSON.stringify(value)) + '; expires=' + expires + '; path=/';
}
const getCookie = (name) => {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    if (match) return JSON.parse(decodeURIComponent(match[2]));
    return null;
}
const eraseCookie = (name) => {
    document.cookie = name + '=; Max-Age=-99999999; path=/';
}

const API = 'http://localhost/uni-api';
const DEFAULT_AVATAR = 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y';

const timeAgo = (ts) => {
  if (!ts) return 'току-що';
  const seconds = Math.floor((Date.now() - Number(ts)) / 1000);
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

const formatDate = (ts) => {
  if (!ts) return '';
  return new Date(Number(ts)).toLocaleString('bg-BG');
};

const getStoredTheme = () => localStorage.getItem('theme') || 'light';

function App() {
  const storedAuth = getCookie('auth');
  const [authToken, setAuthToken] = useState(storedAuth?.token || null);
  const [currentUser, setCurrentUser] = useState(storedAuth?.token ? storedAuth?.user : null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [view, setView] = useState('posts');
  const [profileSlug, setProfileSlug] = useState('');
  const [notification, setNotification] = useState(null);
  const [dbError, setDbError] = useState(null);

  const [users, setUsers] = useState([]);
  const [posts, setPosts] = useState([]);
  const [comments, setComments] = useState({});
  const [viewedPosts, setViewedPosts] = useState(new Set());

  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortMode, setSortMode] = useState('newest');
  const [feedMode, setFeedMode] = useState('global');
  const [theme, setTheme] = useState(getStoredTheme);
  const [activityLog, setActivityLog] = useState([]);
  const [serverNotifications, setServerNotifications] = useState([]);
  const [showActivity, setShowActivity] = useState(false);
  const [followState, setFollowState] = useState({ is_following: false });
  const [myFollows, setMyFollows] = useState([]);
  const [followQuery, setFollowQuery] = useState('');
  const [followStatusFilter, setFollowStatusFilter] = useState('');
  const [followDrafts, setFollowDrafts] = useState({});
  const postsPerPage = 5;

  const [editId, setEditId] = useState(null);
  const [editType, setEditType] = useState('');
  const [tempData, setTempData] = useState({});

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [postTitle, setPostTitle] = useState('');
  const [postContent, setPostContent] = useState('');
  
  const [commentText, setCommentText] = useState({});
  const [replyText, setReplyText] = useState({});
  const [replyingTo, setReplyingTo] = useState(null);
  const [collapsedThreads, setCollapsedThreads] = useState({});

  const [showOptions, setShowOptions] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newAvatar, setNewAvatar] = useState('');

  const isAdmin = () => currentUser && (Number(currentUser.is_admin) === 1 || currentUser.is_admin === true || String(currentUser.username || '').toLowerCase() === 'admin');
  const canEdit = (post) => currentUser && String(currentUser.id) === String(post.author_id) && !post.original_post_id;
  const canDelete = (authorId) => (currentUser && String(currentUser.id) === String(authorId)) || isAdmin();
  const isDark = theme === 'dark';
  const colors = {
    page: isDark ? '#0f1621' : '#f0f4f9',
    card: isDark ? '#121a27' : '#ffffff',
    softCard: isDark ? '#172233' : '#f8fbff',
    text: isDark ? '#dbe6f3' : '#243447',
    muted: isDark ? '#93a4b8' : '#66758b',
    border: isDark ? '#243246' : '#d7e0ea',
    subtleBorder: isDark ? '#1a2537' : '#e8eef5',
    input: isDark ? '#0e1520' : '#ffffff',
    primary: '#529ecc',
    link: isDark ? '#7fb5d9' : '#337ab7',
    accent: '#f39c12',
    followBg: isDark ? '#163042' : '#e9f5fb',
    followBorder: isDark ? '#2d5e7a' : '#86b8d8',
    followingBg: isDark ? '#1f3a2e' : '#e4f4ea',
    followingBorder: isDark ? '#3f7a61' : '#8dc9a5',
    successBg: isDark ? '#163042' : '#e1f0fa',
    successText: isDark ? '#d6efff' : '#2d5f7a'
  };

  const apiFetch = (path, opts = {}) => {
    const headers = { ...(opts.headers || {}) };
    if (opts.method && opts.method !== 'GET' && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    return fetch(`${API}${path}`, { ...opts, headers });
  };

  useEffect(() => {
  const handleHashChange = () => {
    const hash = window.location.hash.replace(/^#\/?/, '');
    const parts = hash.split('/');
    
    const newView = parts[0] || 'posts';
    const slug = parts[1] || '';
    setView(newView);
    if (newView === 'profile') {
      setProfileSlug(slug);
      setShowOptions(false);
    }
  };
  window.addEventListener('hashchange', handleHashChange);
  handleHashChange();
  return () => window.removeEventListener('hashchange', handleHashChange);
}, []);

  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.body.classList.toggle('theme-dark', theme === 'dark');
    document.body.classList.toggle('theme-light', theme !== 'dark');
    document.body.dataset.theme = theme;
  }, [theme]);

  const addActivity = (text) => {
    const item = { id: Date.now() + Math.random(), text, ts: Date.now() };
    setActivityLog(prev => [item, ...prev].slice(0, 10));
  };

  const fetchNotifications = () => {
    if (!currentUser) return;
    apiFetch(`/notifications.php?pageSize=20`)
      .then(res => res.json())
      .then(data => Array.isArray(data) && setServerNotifications(data))
      .catch(() => {});
  };

  const markNotificationsRead = () => {
    if (!currentUser) return;
    apiFetch(`/notifications.php`, {
      method: 'POST',
      body: JSON.stringify({ action: 'mark_read', user_id: currentUser.id })
    }).then(fetchNotifications);
  };

  const fetchFollowState = (user) => {
    if (!currentUser || !user || String(currentUser.id) === String(user.id)) {
      setFollowState({ is_following: false });
      return;
    }

    apiFetch(`/follows.php?profile_id=${user.id}`)
      .then(res => res.json())
      .then(data => setFollowState(data))
      .catch(() => setFollowState({ is_following: false }));
  };

  const fetchMyFollows = () => {
    if (!currentUser || !isMyProfile) return;

    const params = new URLSearchParams({
      direction: 'following',
      pageSize: '50',
      sortBy: 'created_at',
      sortDir: 'desc'
    });

    if (followQuery.trim()) params.set('q', followQuery.trim());
    if (followStatusFilter) params.set('status', followStatusFilter);

    apiFetch(`/follows.php?${params.toString()}`)
      .then(res => res.json())
      .then(data => setMyFollows(Array.isArray(data) ? data : []))
      .catch(() => setMyFollows([]));
  };

  const handleToggleFollow = () => {
    if (!currentUser || !profileUser || isMyProfile) return;

    apiFetch(`/follows.php`, {
      method: 'POST',
      body: JSON.stringify({ follower_id: currentUser.id, following_id: profileUser.id })
    })
      .then(res => res.json())
      .then(data => {
        setFollowState({ is_following: data.following });
        fetchUsers();
        fetchNotifications();
        showMsg(data.following ? 'Последвахте потребителя.' : 'Спряхте да следвате потребителя.');
      });
  };

  let profileUser = null;
  if (profileSlug) {
    if (currentUser && currentUser.username.toLowerCase() === profileSlug.toLowerCase()) {
      profileUser = users.find(
        u => u.username.toLowerCase() === profileSlug.toLowerCase()
      ) || currentUser;
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


  const showMsg = (text) => {
    setNotification(text);
    setTimeout(() => setNotification(null), 3000);
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
        .then(setUsers);
    }
  };
  
  const fetchPosts = () => {
    apiFetch(`/posts.php?feed=${feedMode}&pageSize=50&sortBy=id&sortDir=desc`)
      .then(async res => {
          const text = await res.text();
          try { return JSON.parse(text); } 
          catch (e) { setDbError("Грешка в posts.php: " + text); return []; }
      })
      .then(data => { 
        if (Array.isArray(data)) {
          setDbError(null);
          setPosts(data); 
          data.forEach(post => fetchComments(post.original_post_id || post.id));
        }
      });
  };
  
  const fetchComments = (postId) => {
    apiFetch(`/comments.php?post_id=${postId}&pageSize=50&sortBy=created_at&sortDir=asc`)
      .then(async res => {
          const text = await res.text();
          try { return JSON.parse(text); } 
          catch (e) { console.error("Грешка в comments.php:", text); return []; }
      })
      .then(data => setComments(prev => ({ ...prev, [postId]: data })));
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
    if (currentUser && view === 'profile' && profileSlug && currentUser.username.toLowerCase() === profileSlug.toLowerCase()) {
      fetchMyFollows();
    }
  }, [currentUser?.id, view, profileSlug, followQuery, followStatusFilter]);

  const handleLogin = (e) => {
    e.preventDefault();
    fetch(`${API}/users.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'login', username, password }) })
    .then(res => res.ok ? res.json() : Promise.reject())
    .then(({ token, user }) => { 
      setAuthToken(token);
      setCurrentUser(user);
      setCookie('auth', { token, user }, 7);
      setUsername('');
      setPassword('');
      changeView('posts');
    })
    .catch(() => alert('Грешен потребител или парола!'));
  };

  const handleRegister = (e) => {
    e.preventDefault();
    if (!validateData(username, email, password)) return;
    fetch(`${API}/users.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, email, password }) })
    .then(res => res.ok ? res.json() : Promise.reject())
    .then(({ token, user }) => { 
      setAuthToken(token);
      setCurrentUser(user);
      setCookie('auth', { token, user }, 7);
      showMsg('Регистрацията е успешна!');
      setIsRegistering(false);
      setPassword('');
      changeView('posts');
    })
    .catch(() => alert('Грешка при регистрация.'));
  };

  const logout = () => { setCurrentUser(null); setAuthToken(null); eraseCookie('auth'); changeView('posts'); };

  const handleAddPost = (e) => {
    e.preventDefault();
    apiFetch(`/posts.php`, { method: 'POST', body: JSON.stringify({ title: postTitle, content: postContent }) })
    .then(() => { fetchPosts(); fetchUsers(); setPostTitle(''); setPostContent(''); showMsg('Статията е публикувана!'); fetchNotifications(); addActivity('Публикувахте нова статия'); });
  };

  const handleLike = (post) => {
    apiFetch(`/posts.php`, {
      method: 'POST',
      body: JSON.stringify({
        action: 'like',
        post_id: post.id,
        original_post_id: post.original_post_id
      })
    }).then(() => {
      fetchPosts();
      fetchUsers();
      fetchNotifications();
      addActivity(post.is_liked > 0 ? 'Премахнахте харесване' : 'Харесахте публикация');
    });
  };

  const handleReblog = (post) => {
    if (post.is_reblogged_by_me) {
      showMsg('Вече сте реблогнали тази публикация.');
      return;
    }

    apiFetch(`/posts.php`, {
      method: 'POST',
      body: JSON.stringify({
        title: post.title,
        content: post.content,
        original_post_id: post.original_post_id || post.id
      })
    }).then(async res => {
      if (res.status === 409) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || 'Вече сте реблогнали тази публикация.');
      }
      if (!res.ok) throw new Error('Грешка при реблог');
      return res.json();
    }).then(() => {
      showMsg('Успешно реблогнато!');
      fetchPosts();
      fetchUsers();
      fetchNotifications();
      addActivity('Реблогнахте публикация');
    }).catch(err => alert(err.message));
  };

  const handleUnreblog = (post) => {
    apiFetch(`/posts.php`, {
      method: 'POST',
      body: JSON.stringify({ action: 'unreblog', original_post_id: post.original_post_id || post.id })
    }).then(async res => {
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || 'Грешка при отмяна на реблог');
      }
      return res.json();
    }).then(() => {
      showMsg('Реблогът е премахнат.');
      fetchPosts();
      fetchUsers();
      fetchNotifications();
      addActivity('Премахнахте реблог');
    }).catch(err => alert(err.message));
  };
  const handleViewPost = (postId) => {
    if (!viewedPosts.has(postId)) {
      setViewedPosts(prev => new Set(prev).add(postId));
      apiFetch(`/posts.php`, { method: 'POST', body: JSON.stringify({ action: 'view', post_id: postId }) }).then(fetchPosts);
    }
  };

  const handleUpdate = () => {
    apiFetch(`/${editType}s.php`, { method: 'PUT', body: JSON.stringify(tempData) }).then(() => { setEditId(null); fetchPosts(); });
  };

  const handleDeletePost = (id) => { if (window.confirm('Сигурни ли сте?')) apiFetch(`/posts.php?id=${id}`, { method: 'DELETE' }).then(() => { fetchPosts(); fetchUsers(); addActivity('Изтрихте публикация'); }); };

  const handleAddComment = (postId, parentId = null) => {
    const text = parentId ? replyText[parentId] : commentText[postId];
    if (!text) return;
    apiFetch(`/comments.php`, { method: 'POST', body: JSON.stringify({ post_id: postId, parent_id: parentId, content: text }) })
    .then(() => { 
      fetchComments(postId);
      fetchUsers();
      fetchNotifications();
      addActivity(parentId ? 'Отговорихте на коментар' : 'Добавихте коментар');
      if (parentId) { setReplyText(prev => ({ ...prev, [parentId]: '' })); setReplyingTo(null); setCollapsedThreads(prev => ({ ...prev, [parentId]: false })); } 
      else { setCommentText(prev => ({ ...prev, [postId]: '' })); }
    });
  };

  const handleDeleteComment = (commentId, postId) => { if (window.confirm('Изтриване на коментара?')) apiFetch(`/comments.php?id=${commentId}`, { method: 'DELETE' }).then(() => { fetchComments(postId); fetchUsers(); addActivity('Изтрихте коментар'); }); };

  const handleSaveOptions = () => {
    if (!validateData(newUsername, null, undefined)) return;
    apiFetch(`/users.php`, { method: 'PUT', body: JSON.stringify({ id: currentUser.id, username: newUsername, avatar: newAvatar }) })
    .then(async res => { if (res.status === 409) throw new Error('Заето име'); return res.json(); })
    .then(() => {
        const updatedUser = { ...currentUser, username: newUsername, avatar: newAvatar };
        setCurrentUser(updatedUser); setCookie('auth', { token: authToken, user: updatedUser }, 7); setShowOptions(false);
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
      if (sortMode === 'reblogged') return (b.reblogs_count || 0) - (a.reblogs_count || 0);
      return (b.created_ts || 0) - (a.created_ts || 0);
    });
  const currentPosts = filteredPosts.slice((currentPage - 1) * postsPerPage, currentPage * postsPerPage);
  const totalPages = Math.ceil(filteredPosts.length / postsPerPage);

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
    return userComments.sort((a, b) => b.created_ts - a.created_ts);
  };

  const goToPost = (title) => { changeView('posts'); setSearchTerm(title); setCurrentPage(1); };

  const getProfileStats = (user) => {
    const userPosts = posts.filter(p => String(p.author_id) === String(user.id));
    const userComments = getUserComments();
    const likes = userPosts.reduce((sum, p) => sum + (Number(p.likes_count) || 0), 0);
    const views = userPosts.reduce((sum, p) => sum + (Number(p.view_count) || 0), 0);
    const reblogs = userPosts.reduce((sum, p) => sum + (Number(p.reblogs_count) || 0), 0);
    return { posts: userPosts.length, comments: userComments.length, likes, views, reblogs };
  };

  const renderComments = (commentsList, postId, parentId = null, depth = 0) => {
    if (!commentsList) return null;
    const filtered = commentsList.filter(c => c.parent_id == parentId && (c.is_approved == 1 || isAdmin() || c.user_id === currentUser.id));
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
            <span style={{ fontSize: '11px', color: colors.muted }}>{timeAgo(c.created_ts)}</span>
            {c.is_approved == 0 && <span style={{ color: 'red', fontSize: '10px', fontWeight: 'bold' }}>[СПАМ]</span>}
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
                  <div style={{ fontSize: '14px', marginBottom: '4px', marginTop: '2px', color: c.is_approved == 0 ? colors.muted : colors.text }}>{c.content}</div>
                  <div style={{ marginTop: '3px', marginBottom: '8px' }}>
                    <button onClick={() => setReplyingTo(replyingTo === c.id ? null : c.id)} style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontSize: '11px', padding: 0 }}>Отговор</button>
                    {canEdit({author_id: c.user_id}) && <button onClick={() => startEdit('comment', c)} style={{ background: 'none', border: 'none', color: colors.link, cursor: 'pointer', fontSize: '11px', marginLeft: '10px', padding: 0 }}>Редактирай</button>}
                    {canDelete(c.user_id) && <button onClick={() => handleDeleteComment(c.id, postId)} style={{ background: 'none', border: 'none', color: '#e35d5b', cursor: 'pointer', fontSize: '11px', marginLeft: '10px', padding: 0 }}>Изтрий</button>}
                  </div>
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
    const displayAvatar = p.original_post_id ? (p.original_author_avatar || DEFAULT_AVATAR) : (p.author_avatar || DEFAULT_AVATAR);
    const displayUsername = p.original_post_id ? (p.original_author_name || 'Неизвестен') : p.author_name;
    const originalPostDate = p.original_post_id ? p.original_created_ts : p.created_ts;
    const postAuthorObj = users.find(u => u.username === displayUsername);
    const repScore = postAuthorObj ? postAuthorObj.reputation_score : 0;
    
    return (
      <div key={p.id} onMouseEnter={() => handleViewPost(p.id)} className="card" style={{ border: `1px solid ${colors.border}`, borderRadius: '12px', padding: '15px', marginBottom: '20px', backgroundColor: colors.card, color: colors.text, position: 'relative', boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.25)' : '0 2px 5px rgba(0,0,0,0.05)' }}>
        <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', gap: '5px' }}>
          {canEdit(p) && <button onClick={() => startEdit('post', p)} className="btn btn-default" style={{ fontSize: '11px' }}>Редактирай</button>}
          {canDelete(p.author_id) && <button onClick={() => handleDeletePost(p.id)} className="btn btn-danger" style={{ fontSize: '11px' }}>Изтрий</button>}
        </div>

        {editId === p.id && editType === 'post' ? (
          <div className="form-group" style={{ marginTop: '20px' }}>
            <input value={tempData.title} onChange={e => setTempData({ ...tempData, title: e.target.value })} />
            <textarea value={tempData.content} onChange={e => setTempData({ ...tempData, content: e.target.value })} />
            <button onClick={handleUpdate} className="btn btn-primary">Запази</button>
            <button onClick={() => setEditId(null)} className="btn btn-default">Отказ</button>
          </div>
        ) : (
          <>
            {p.original_post_id && (
              <div style={{ color: colors.muted, fontSize: '12px', marginBottom: '15px', borderBottom: `1px solid ${colors.subtleBorder}`, paddingBottom: '5px' }}>
                Реблог <strong style={{ cursor: 'pointer', color: colors.link }} onClick={() => openProfile({ username: p.author_name })}>{p.author_name}</strong> от <strong style={{cursor: 'pointer', color: colors.link}} onClick={() => openProfile({username: displayUsername})}>{displayUsername}</strong> <span>{timeAgo(p.created_ts)}</span>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '15px' }}>
              <img src={displayAvatar} onClick={() => openProfile({username: displayUsername})} style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '4px', border: `1px solid ${colors.border}`, cursor: 'pointer' }} alt="avatar" />
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <h2 style={{ margin: '0 0 5px 0' }}>{p.title}</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <small style={{ color: colors.link, cursor: 'pointer', fontWeight: 'bold' }} onClick={() => openProfile({username: displayUsername})}>
                    @{displayUsername}
                  </small>
                  <span style={{ fontSize: '11px', color: colors.accent, fontWeight: 'bold' }}>Репутация: {repScore}</span>
                  <span style={{ fontSize: '11px', color: colors.muted }}>{getReputationBadge(repScore).label}</span>
                  <span style={{ fontSize: '11px', color: colors.muted }}>{timeAgo(originalPostDate)}</span>
                </div>
                
                <div style={{ marginTop: '15px', fontSize: '16px', lineHeight: '1.5', overflowWrap: 'break-word', color: colors.text }} dangerouslySetInnerHTML={{ __html: p.content }}></div>
              </div>
            </div>
            
            <div style={{ marginTop: '20px', display: 'flex', gap: '10px', borderTop: `1px solid ${colors.subtleBorder}`, paddingTop: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button onClick={() => handleLike(p)} className="btn btn-default" style={{ backgroundColor: isDark ? (p.is_liked > 0 ? '#1e2c3f' : '#121a27') : (p.is_liked > 0 ? '#eef5fb' : '#ffffff'), boxShadow: p.is_liked > 0 ? 'inset 0 2px 4px rgba(0,0,0,0.08)' : 'none', padding: '4px 10px' }}>
                Харесвания: {p.likes_count || 0}
              </button>
              {p.is_reblogged_by_me ? (
                <button onClick={() => handleUnreblog(p)} className="btn btn-default" style={{ padding: '4px 10px' }}>
                  Отмени реблог
                </button>
              ) : (
                <button onClick={() => handleReblog(p)} className="btn btn-default" style={{ padding: '4px 10px' }}>
                  Реблог {p.reblogs_count > 0 ? p.reblogs_count : ''}
                </button>
              )}
              <span style={{ fontSize: '12px', color: colors.muted, marginLeft: 'auto' }}>Преглеждания: {p.view_count || 0}</span>
              <span style={{ fontSize: '12px', color: colors.muted }}>Време за четене: {p.reading_time_minutes || 1} мин.</span>
            </div>
          </>
        )}

        <div className="comments-section" style={{ marginTop: '15px', paddingTop: '15px', borderTop: `1px solid ${colors.subtleBorder}` }}>
          <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: colors.muted }}>Коментари</h4>
          <div style={{ marginBottom: '15px' }}>
            {renderComments(comments[targetId], targetId)}
          </div>
          <div className="comment-input-area" style={{ display: 'flex', gap: '5px' }}>
            <input placeholder="Напишете нов коментар..." value={commentText[targetId] || ''} onChange={e => setCommentText({ ...commentText, [targetId]: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddComment(targetId); } }} style={{ flex: 1, padding: '8px', border: `1px solid ${colors.border}` }} />
            <button onClick={() => handleAddComment(targetId)} className="btn btn-primary" style={{ padding: '4px 15px' }}>OK</button>
          </div>
        </div>
      </div>
    );
  };

  if (!currentUser) {
    return (
      <div className="container" style={{ maxWidth: '400px', marginTop: '100px', color: colors.text, backgroundColor: colors.page, minHeight: '100vh', paddingTop: '20px' }}>
        <h2 style={{ textAlign: 'center' }}>{isRegistering ? 'Регистрация' : 'Вход'}</h2>
        <form onSubmit={isRegistering ? handleRegister : handleLogin} className="form-group">
          <input placeholder="Username или email" value={username} onChange={e => setUsername(e.target.value)} required />
          {isRegistering && <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />}
          <input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>{isRegistering ? 'Създай профил' : 'Влез'}</button>
        </form>
        <p style={{ textAlign: 'center', marginTop: '15px' }}>
          <a href="#" onClick={(e) => { e.preventDefault(); setIsRegistering(!isRegistering); }}>{isRegistering ? 'Влез тук' : 'Регистрирай се'}</a>
        </p>
      </div>
    );
  }

  return (
    <div className="container" style={{ backgroundColor: colors.page, color: colors.text, minHeight: '100vh', paddingBottom: '30px' }}>
      {notification && (
        <div style={{ position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)', backgroundColor: colors.successBg, border: `1px solid ${colors.border}`, color: colors.successText, padding: '10px 20px', borderRadius: '4px', zIndex: 1000, boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
          <strong>OK</strong> {notification}
        </div>
      )}

      {dbError && (
        <div style={{ backgroundColor: isDark ? '#2a1f26' : '#f8d7da', color: isDark ? '#ffd0dc' : '#721c24', padding: '15px', borderRadius: '5px', marginBottom: '20px', border: isDark ? '1px solid #5a2f42' : '1px solid #f5c6cb' }}>
          <strong>Внимание! Проблем с базата данни:</strong>
          <p style={{ marginTop: '5px', fontSize: '13px' }}>Изглежда някоя от колоните (напр. <i>view_count</i>, <i>reputation_score</i>, <i>spam_score</i>) не е създадена правилно в phpMyAdmin. Ето какво казва сървърът:</p>
          <pre style={{ whiteSpace: 'pre-wrap', marginTop: '10px', fontSize: '12px', background: 'rgba(255,255,255,0.5)', padding: '10px' }}>{dbError}</pre>
        </div>
      )}

      <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', color: colors.text }}>
        <div>Влезли сте като: <strong style={{ color: colors.primary }}>{currentUser.username}</strong></div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', position: 'relative', flexWrap: 'wrap' }}>
          <button onClick={() => { setShowActivity(!showActivity); if (!showActivity) markNotificationsRead(); }} className="btn btn-default">Известия {serverNotifications.filter(n => Number(n.is_read) === 0).length}</button>
          <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="btn btn-default">{theme === 'dark' ? 'Светъл режим' : 'Тъмен режим'}</button>
          <button onClick={logout} className="btn btn-default">Изход</button>
          {showActivity && (
            <div style={{ position: 'absolute', top: '42px', right: 0, width: '320px', backgroundColor: colors.card, color: colors.text, border: `1px solid ${colors.border}`, borderRadius: '10px', padding: '10px', zIndex: 900, boxShadow: '0 8px 20px rgba(0,0,0,0.18)' }}>
              <strong>Известия</strong>
              {serverNotifications.length === 0 && activityLog.length === 0 ? <p style={{ color: colors.muted, marginBottom: 0 }}>Няма нова активност.</p> : (
                <>
                  {serverNotifications.map(n => (
                    <div key={`server-${n.id}`} style={{ borderTop: `1px solid ${colors.subtleBorder}`, paddingTop: '8px', marginTop: '8px', fontSize: '13px' }}>
                      <div>{n.message}</div>
                      <small style={{ color: colors.muted }}>{timeAgo(n.created_ts)}</small>
                    </div>
                  ))}
                  {activityLog.map(a => (
                    <div key={`local-${a.id}`} style={{ borderTop: `1px solid ${colors.subtleBorder}`, paddingTop: '8px', marginTop: '8px', fontSize: '13px' }}>
                      <div>{a.text}</div>
                      <small style={{ color: colors.muted }}>{timeAgo(a.ts)}</small>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <nav>
        <button onClick={() => { setFeedMode('global'); changeView('posts'); setCurrentPage(1); setSearchTerm(''); }} className={`nav-btn ${view === 'posts' && feedMode === 'global' ? 'active' : ''}`}>Начало</button>
        <button onClick={() => { setFeedMode('following'); changeView('posts'); setCurrentPage(1); setSearchTerm(''); }} className={`nav-btn ${view === 'posts' && feedMode === 'following' ? 'active' : ''}`}>Следвани</button>
        {isAdmin() && <button onClick={() => changeView('users')} className={`nav-btn ${view === 'users' ? 'active' : ''}`}>Потребители</button>}
        <button onClick={() => openProfile(currentUser)} className={`nav-btn ${view === 'profile' && isMyProfile ? 'active' : ''}`}>Моят Профил</button>
      </nav>

      {view === 'posts' && (
        <section>
          <div className="card" style={{ backgroundColor: colors.softCard, color: colors.text, padding: '15px', border: `1px solid ${colors.border}`, borderRadius: '12px', marginBottom: '20px' }}>
            <form onSubmit={handleAddPost} className="form-group">
              <input placeholder="Заглавие..." value={postTitle} onChange={e => setPostTitle(e.target.value)} required />
              <textarea placeholder="Какво е на ума ти..." value={postContent} onChange={e => setPostContent(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} required style={{ minHeight: '80px' }} />
              <button type="submit" className="btn btn-primary">Публикувай</button>
            </form>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <input type="text" placeholder="Търси..." value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }} style={{ flex: 1, minWidth: '220px', padding: '10px', border: `1px solid ${colors.border}`, backgroundColor: colors.input, color: colors.text }} />
            <select value={sortMode} onChange={e => { setSortMode(e.target.value); setCurrentPage(1); }} style={{ padding: '10px', border: `1px solid ${colors.border}`, backgroundColor: colors.input, color: colors.text }}>
              <option value="newest">Най-нови</option>
              <option value="liked">Най-харесвани</option>
              <option value="viewed">Най-гледани</option>
              <option value="reblogged">Най-реблогвани</option>
            </select>
          </div>

          {currentPosts.length > 0 ? currentPosts.map(p => renderPost(p)) : <p>Няма намерени статии.</p>}

          {totalPages > 1 && (
            <div style={{ marginTop: '20px', display: 'flex', gap: '5px', justifyContent: 'center' }}>
              {Array.from({ length: totalPages }, (_, i) => (
                <button key={i + 1} onClick={() => setCurrentPage(i + 1)} className={`btn ${currentPage === i + 1 ? 'btn-primary' : 'btn-default'}`}>
                  {i + 1}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {view === 'profile' && profileUser && (
        <section>
          <div style={{
  background: colors.card,
  color: colors.text,
  borderRadius: '12px',
  overflow: 'hidden',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  marginBottom: '20px'
}}>

  <div style={{
    height: '180px',
    background: isDark ? 'linear-gradient(135deg, #152235, #26364b)' : 'linear-gradient(135deg, #337ab7, #6fa8dc)' 
  }}></div>

  <div style={{
    padding: '0 25px 25px 25px',
    marginTop: '-60px'
  }}>

    <img
      src={profileUser.avatar || DEFAULT_AVATAR}
      alt="profile"
      style={{
        width: '120px',
        height: '120px',
        borderRadius: '16px',
        objectFit: 'cover',
        border: `4px solid ${colors.card}`,
        boxShadow: '0 4px 10px rgba(0,0,0,0.15)'
      }}
    />

    <div style={{ marginTop: '15px' }}>
      <h2 style={{ margin: 0 }}>@{profileUser.username}</h2>

      <div style={{
        color: colors.accent,
        fontWeight: 'bold',
        marginTop: '6px'
      }}>
        Репутация: {profileUser.reputation_score || 0}
      </div>

      <div style={{ color: colors.muted, fontSize: '13px', marginTop: '6px' }}>
        {getReputationBadge(profileUser.reputation_score || 0).label}
      </div>

      <div style={{
        color: colors.muted,
        fontSize: '13px',
        marginTop: '6px'
      }}>
        Член от: {timeAgo(profileUser.registered_ts)}
      </div>
    </div>

    <div style={{
      display: 'flex',
      gap: '25px',
      marginTop: '20px',
      flexWrap: 'wrap',
      borderTop: `1px solid ${colors.subtleBorder}`,
      paddingTop: '15px'
    }}>
      <div><strong>{getProfileStats(profileUser).posts}</strong><br />Постове</div>
      <div><strong>{getProfileStats(profileUser).comments}</strong><br />Коментари</div>
      <div><strong>{getProfileStats(profileUser).likes}</strong><br />Харесвания</div>
      <div><strong>{getProfileStats(profileUser).views}</strong><br />Преглеждания</div>
      <div><strong>{getProfileStats(profileUser).reblogs}</strong><br />Реблогове</div>
      <div><strong>{profileUser.followers_count || 0}</strong><br />Последователи</div>
      <div><strong>{profileUser.following_count || 0}</strong><br />Следва</div>
    </div>

    <div style={{ display: 'flex', gap: '10px', marginTop: '20px', flexWrap: 'wrap' }}>
      {isMyProfile ? (
        <button onClick={() => setShowOptions(!showOptions)} className="btn btn-default">Опции</button>
      ) : (
        <button onClick={handleToggleFollow} className="btn" style={{
          color: followState.is_following ? '#ffffff' : colors.text,
          backgroundColor: followState.is_following ? colors.primary : colors.followBg,
          borderColor: followState.is_following ? colors.link : colors.followBorder,
          fontWeight: 600,
          boxShadow: followState.is_following ? '0 1px 0 rgba(0,0,0,0.12)' : 'none'
        }}>
          {followState.is_following ? 'Следвате' : 'Следвай'}
        </button>
      )}
    </div>

  </div>
</div>
          {showOptions && isMyProfile && (
            <div className="card" style={{ border: `1px solid ${colors.border}`, padding: '15px', marginBottom: '20px', backgroundColor: colors.softCard, color: colors.text, borderRadius: '12px' }}>
               <h4 style={{ marginTop: 0 }}>Настройки на профила</h4>
               <input value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="Ново име..." style={{ width: '100%', marginBottom: '10px', padding: '8px', border: `1px solid ${colors.border}` }} />
               <input value={newAvatar} onChange={e => setNewAvatar(e.target.value)} placeholder="URL на профилна снимка (завършващ на .jpg, .png...)" style={{ width: '100%', marginBottom: '10px', padding: '8px', border: `1px solid ${colors.border}` }} />
               <button onClick={handleSaveOptions} className="btn btn-primary">Запази промените</button>
            </div>
          )}
          {isMyProfile && (
            <div className="card" style={{ border: `1px solid ${colors.border}`, padding: '15px', marginBottom: '20px', backgroundColor: colors.softCard, color: colors.text, borderRadius: '12px' }}>
              <h4 style={{ marginTop: 0 }}>Моите следвания</h4>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '15px' }}>
                <input
                  value={followQuery}
                  onChange={e => setFollowQuery(e.target.value)}
                  placeholder="Търси по потребител или бележка..."
                  style={{ flex: 1, minWidth: '220px', padding: '8px', border: `1px solid ${colors.border}` }}
                />
                <select
                  value={followStatusFilter}
                  onChange={e => setFollowStatusFilter(e.target.value)}
                  style={{ padding: '8px', border: `1px solid ${colors.border}`, backgroundColor: colors.input, color: colors.text }}
                >
                  <option value="">Всички статуси</option>
                  <option value="active">active</option>
                  <option value="muted">muted</option>
                  <option value="blocked">blocked</option>
                </select>
                <button onClick={fetchMyFollows} className="btn btn-default">Обнови</button>
              </div>

              {myFollows.length === 0 ? (
                <p style={{ color: colors.muted, marginBottom: 0 }}>Няма резултати за показване.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                        <th style={{ padding: '8px' }}>Потребител</th>
                        <th style={{ padding: '8px' }}>Статус</th>
                        <th style={{ padding: '8px' }}>Бележка</th>
                        <th style={{ padding: '8px' }}>Близък</th>
                        <th style={{ padding: '8px' }}>Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myFollows.map(follow => {
                        const draft = followDrafts[follow.id] || {};
                        const currentStatus = draft.status ?? follow.status;
                        const currentNote = draft.note ?? follow.note ?? '';
                        const currentCloseFriend = draft.is_close_friend ?? Number(follow.is_close_friend) === 1;

                        return (
                          <tr key={follow.id} style={{ borderTop: `1px solid ${colors.subtleBorder}` }}>
                            <td style={{ padding: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <img src={follow.other_avatar || DEFAULT_AVATAR} alt="avatar" style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }} />
                                <strong>{follow.other_username}</strong>
                              </div>
                            </td>
                            <td style={{ padding: '8px' }}>
                              <select
                                value={currentStatus}
                                onChange={e => setFollowDrafts(prev => ({ ...prev, [follow.id]: { ...draft, status: e.target.value } }))}
                                style={{ width: '100%', padding: '6px', border: `1px solid ${colors.border}`, backgroundColor: colors.input, color: colors.text }}
                              >
                                <option value="active">active</option>
                                <option value="muted">muted</option>
                                <option value="blocked">blocked</option>
                              </select>
                            </td>
                            <td style={{ padding: '8px' }}>
                              <input
                                value={currentNote}
                                onChange={e => setFollowDrafts(prev => ({ ...prev, [follow.id]: { ...draft, note: e.target.value } }))}
                                style={{ width: '100%', padding: '6px', border: `1px solid ${colors.border}` }}
                                placeholder="Бележка"
                              />
                            </td>
                            <td style={{ padding: '8px', textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={currentCloseFriend}
                                onChange={e => setFollowDrafts(prev => ({ ...prev, [follow.id]: { ...draft, is_close_friend: e.target.checked } }))}
                              />
                            </td>
                            <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                              <button onClick={() => handleSaveFollow(follow)} className="btn btn-primary" style={{ marginRight: '8px' }}>Запази</button>
                              <button onClick={() => handleDeleteFollow(follow.id)} className="btn btn-danger">Премахни</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          {(() => {
  const userPosts = posts
    .filter(p => String(p.author_id) === String(profileUser.id))
    .map(p => ({
      type: 'post',
      ts: p.created_ts,
      data: p
    }));

  const userComments = getUserComments().map(c => ({
    type: 'comment',
    ts: c.created_ts,
    data: c
  }));

  const feed = [...userPosts, ...userComments].sort((a, b) => b.ts - a.ts);

  if (feed.length === 0) {
    return <p style={{ textAlign: 'center' }}>Няма активност.</p>;
  }

  return feed.map(item => {
    if (item.type === 'post') {
      return renderPost(item.data);
    }

    const c = item.data;

    return (
      <div
        key={`comment-${c.id}`}
        className="card"
        style={{
          border: `1px solid ${colors.subtleBorder}`,
          backgroundColor: colors.card,
          color: colors.text,
          padding: '15px',
          borderRadius: '8px',
          marginBottom: '15px'
        }}
      >
        <div style={{
          color: colors.muted,
          fontSize: '12px',
          marginBottom: '5px',
          display: 'flex',
          justifyContent: 'space-between'
        }}>
          <span>
            Към:
            <strong
              style={{
                color: colors.link,
                cursor: 'pointer',
                marginLeft: '5px'
              }}
              onClick={() => goToPost(c.postTitle)}
            >
              {c.postTitle}
            </strong>
          </span>

          <span>{timeAgo(c.created_ts)}</span>
        </div>

        <p style={{ margin: 0 }}>{c.content}</p>
      </div>
    );
  });
})()}
        </section>
      )}

      {view === 'profile' && !profileUser && (
        <section style={{ textAlign: 'center', padding: '50px' }}>
          <h2>Потребителят не е намерен</h2>
        </section>
      )}

      {view === 'users' && isAdmin() && (
        <section>
          <h2 style={{ color: colors.text }}>Всички потребители</h2>
          <table style={{ width: '100%', marginTop: '20px', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${colors.border}`, textAlign: 'left' }}>
                <th style={{ padding: '8px' }}>ID</th>
                <th style={{ padding: '8px' }}>Username</th>
                <th style={{ padding: '8px' }}>Email</th>
                <th style={{ padding: '8px' }}>Репутация</th>
                <th style={{ padding: '8px' }}>Последователи</th>
                <th style={{ padding: '8px' }}>Регистриран</th>
                <th style={{ padding: '8px' }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ borderBottom: `1px solid ${colors.subtleBorder}` }}>
                  <td style={{ padding: '8px' }}>{u.id}</td>
                  <td style={{ padding: '8px', cursor: 'pointer', color: colors.link }} onClick={() => openProfile(u)}>{u.username}</td>
                  <td style={{ padding: '8px' }}>{u.email}</td>
                  <td style={{ padding: '8px', color: colors.accent, fontWeight: 'bold' }}>{u.reputation_score || 0}</td>
                  <td style={{ padding: '8px' }}>{u.followers_count || 0}</td>
                  <td style={{ padding: '8px', fontSize: '12px', color: '#666' }}>{timeAgo(u.registered_ts)}</td>
                  <td style={{ padding: '8px' }}><button onClick={() => { if(window.confirm('Изтриване?')) apiFetch(`/users.php?id=${u.id}`, { method: 'DELETE' }).then(() => { fetchUsers(); addActivity('Изтрихте потребител'); }); }} className="btn btn-danger" style={{ fontSize: '11px', padding: '2px 5px' }}>Изтрий</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

export default App
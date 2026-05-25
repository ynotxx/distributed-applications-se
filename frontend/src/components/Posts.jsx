import { useState, useEffect, useContext } from 'react';
import AuthContext from '../AuthContext';
import './Posts.css';

const API_BASE = 'http://localhost/uni-api';

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

const formatTimestamp = (ts) => {
  const ms = normalizeTimestamp(ts);
  if (!ms) return 'току-що';
  return new Date(ms).toLocaleString();
};

export function PostsList() {
  const { authToken, currentUser } = useContext(AuthContext);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState('created_at');
  const [searchTerm, setSearchTerm] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');

  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [showNewPostForm, setShowNewPostForm] = useState(false);

  const fetchPosts = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page,
        pageSize: 5,
        sortBy,
        sortDir: 'desc',
        q: searchTerm,
      });
      const response = await fetch(`${API_BASE}/posts.php?${params}`, {
        headers: { 'Authorization': `Bearer ${authToken}` },
      });

      if (!response.ok) throw new Error('Failed to fetch posts');
      const data = await response.json();
      const rows = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
      setPosts(rows);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authToken) {
      fetchPosts();
    }
  }, [authToken, page, sortBy, searchTerm]);

  const handleCreatePost = async (e) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) {
      setError('Title and content required');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/posts.php`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: newTitle, content: newContent }),
      });

      if (!response.ok) throw new Error('Failed to create post');
      setNewTitle('');
      setNewContent('');
      setShowNewPostForm(false);
      fetchPosts();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUpdatePost = async () => {
    if (!editTitle.trim() || !editContent.trim()) {
      setError('Title and content required');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/posts.php`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: editingId, title: editTitle, content: editContent }),
      });

      if (!response.ok) throw new Error('Failed to update post');
      setEditingId(null);
      fetchPosts();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeletePost = async (id) => {
    if (!window.confirm('Delete post?')) return;

    try {
      const response = await fetch(`${API_BASE}/posts.php?id=${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` },
      });

      if (!response.ok) throw new Error('Failed to delete post');
      fetchPosts();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleLike = async (postId) => {
    try {
      const response = await fetch(`${API_BASE}/likes.php`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ post_id: postId }),
      });

      if (response.status === 409) {
        await fetch(`${API_BASE}/likes.php?post_id=${postId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${authToken}` },
        });
      }
      fetchPosts();
    } catch (err) {
      setError(err.message);
    }
  };

  const startEdit = (post) => {
    setEditingId(post.id);
    setEditTitle(post.title);
    setEditContent(post.content);
  };

  const canEdit = (post) => currentUser && String(currentUser.id) === String(post.author_id);

  return (
    <div className="posts-container">
      <h2>Posts</h2>

      {error && <p className="error">{error}</p>}

      <div className="search-bar">
        <input
          type="text"
          placeholder="Search posts..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setPage(1);
          }}
        />
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="created_at">Newest</option>
          <option value="title">Title</option>
          <option value="likes_count">Most Liked</option>
        </select>
      </div>

      <button onClick={() => setShowNewPostForm(!showNewPostForm)}>
        {showNewPostForm ? 'Cancel' : 'New Post'}
      </button>

      {showNewPostForm && (
        <form onSubmit={handleCreatePost} className="post-form">
          <input
            type="text"
            placeholder="Post title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            maxLength={200}
          />
          <textarea
            placeholder="Post content"
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            maxLength={10000}
            rows={6}
          />
          <button type="submit">Create Post</button>
        </form>
      )}

      {loading && <p>Loading...</p>}

      <div className="posts-list">
        {posts.map((post) => (
          <div key={post.id} className="post-card">
            {editingId === post.id ? (
              <div className="edit-form">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  maxLength={200}
                />
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  maxLength={10000}
                  rows={6}
                />
                <div className="edit-buttons">
                  <button onClick={handleUpdatePost}>Save</button>
                  <button onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <h3>{post.title}</h3>
                <p className="post-author">by {post.author_name} <span className="reputation">({post.author_reputation || 0} reputation)</span></p>
                <p className="post-content">{post.content.substring(0, 200)}...</p>
                <div className="post-meta">
                  <span>❤️ {post.likes_count || 0}</span>
                  <span>💬 {post.comments_count || 0}</span>
                  <span>{formatTimestamp(post.original_created_ts || post.created_ts)}</span>
                </div>
                <div className="post-actions">
                  <button onClick={() => handleLike(post.id)}>Like</button>
                  {canEdit(post) && (
                    <>
                      <button onClick={() => startEdit(post)}>Edit</button>
                      <button onClick={() => handleDeletePost(post.id)}>Delete</button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="pagination">
        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
          Previous
        </button>
        <span>Page {page}</span>
        <button onClick={() => setPage(p => p + 1)} disabled={posts.length < 5}>
          Next
        </button>
      </div>
    </div>
  );
}

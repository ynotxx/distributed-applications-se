-- MySQL schema for uni-blog coursework
-- Covers: users, posts, comments, follows, notifications, post_likes, auth_tokens

CREATE DATABASE IF NOT EXISTS `uni-blog` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `uni-blog`;

SET sql_mode = 'STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION';
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS auth_tokens;
DROP TABLE IF EXISTS post_likes;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS follows;
DROP TABLE IF EXISTS comments;
DROP TABLE IF EXISTS posts;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE IF NOT EXISTS users (
	id INT UNSIGNED NOT NULL AUTO_INCREMENT,
	username VARCHAR(50) NOT NULL,
	email VARCHAR(255) NOT NULL,
	password VARCHAR(255) NOT NULL,
	avatar VARCHAR(255) NOT NULL DEFAULT '',
	reputation_score INT NOT NULL DEFAULT 0,
	is_author TINYINT(1) NOT NULL DEFAULT 1,
	is_admin TINYINT(1) NOT NULL DEFAULT 0,
	registered_on DATETIME NOT NULL,
	last_login_at DATETIME NULL,
	PRIMARY KEY (id),
	UNIQUE KEY ux_users_username (username),
	UNIQUE KEY ux_users_email (email)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS posts (
	id INT UNSIGNED NOT NULL AUTO_INCREMENT,
	title VARCHAR(200) NOT NULL,
	content VARCHAR(10000) NOT NULL,
	author_id INT UNSIGNED NOT NULL,
	original_post_id INT UNSIGNED NULL,
	reading_time_minutes INT NOT NULL DEFAULT 1,
	view_count INT NOT NULL DEFAULT 0,
	created_at DATETIME NOT NULL,
	updated_at DATETIME NULL,
	PRIMARY KEY (id),
	KEY ix_posts_author (author_id),
	KEY ix_posts_original (original_post_id),
	CONSTRAINT fk_posts_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
	CONSTRAINT fk_posts_original FOREIGN KEY (original_post_id) REFERENCES posts(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS comments (
	id INT UNSIGNED NOT NULL AUTO_INCREMENT,
	post_id INT UNSIGNED NOT NULL,
	user_id INT UNSIGNED NOT NULL,
	parent_id INT UNSIGNED NULL,
	content VARCHAR(2000) NOT NULL,
	spam_score INT NOT NULL DEFAULT 0,
	is_approved TINYINT(1) NOT NULL DEFAULT 1,
	created_at DATETIME NOT NULL,
	updated_at DATETIME NULL,
	PRIMARY KEY (id),
	KEY ix_comments_post (post_id),
	KEY ix_comments_user (user_id),
	KEY ix_comments_parent (parent_id),
	CONSTRAINT fk_comments_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
	CONSTRAINT fk_comments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
	CONSTRAINT fk_comments_parent FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS follows (
	id INT UNSIGNED NOT NULL AUTO_INCREMENT,
	follower_id INT UNSIGNED NOT NULL,
	following_id INT UNSIGNED NOT NULL,
	status VARCHAR(20) NOT NULL DEFAULT 'active',
	note VARCHAR(200) NOT NULL DEFAULT '',
	is_close_friend TINYINT(1) NOT NULL DEFAULT 0,
	created_at DATETIME NOT NULL,
	updated_at DATETIME NULL,
	PRIMARY KEY (id),
	UNIQUE KEY ux_follows_pair (follower_id, following_id),
	KEY ix_follows_following (following_id),
	CONSTRAINT fk_follows_follower FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
	CONSTRAINT fk_follows_following FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notifications (
	id INT UNSIGNED NOT NULL AUTO_INCREMENT,
	user_id INT UNSIGNED NOT NULL,
	actor_id INT UNSIGNED NULL,
	type VARCHAR(30) NOT NULL,
	message VARCHAR(255) NOT NULL,
	post_id INT UNSIGNED NULL,
	comment_id INT UNSIGNED NULL,
	is_read TINYINT(1) NOT NULL DEFAULT 0,
	created_at DATETIME NOT NULL,
	PRIMARY KEY (id),
	KEY ix_notifications_user (user_id),
	KEY ix_notifications_created (created_at),
	CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
	CONSTRAINT fk_notifications_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL,
	CONSTRAINT fk_notifications_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE SET NULL,
	CONSTRAINT fk_notifications_comment FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS post_likes (
	id INT UNSIGNED NOT NULL AUTO_INCREMENT,
	post_id INT UNSIGNED NOT NULL,
	user_id INT UNSIGNED NOT NULL,
	created_at DATETIME NOT NULL,
	reaction_type VARCHAR(20) NOT NULL DEFAULT 'like',
	weight SMALLINT NOT NULL DEFAULT 1,
	source VARCHAR(30) NOT NULL DEFAULT 'web',
	PRIMARY KEY (id),
	UNIQUE KEY ux_post_likes (post_id, user_id),
	KEY ix_post_likes_user (user_id),
	CONSTRAINT fk_post_likes_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
	CONSTRAINT fk_post_likes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS auth_tokens (
	id INT UNSIGNED NOT NULL AUTO_INCREMENT,
	user_id INT UNSIGNED NOT NULL,
	token_hash CHAR(64) NOT NULL,
	created_at DATETIME NOT NULL,
	expires_at DATETIME NOT NULL,
	revoked_at DATETIME NULL,
	user_agent VARCHAR(200) NOT NULL DEFAULT '',
	ip_address VARCHAR(45) NOT NULL DEFAULT '',
	PRIMARY KEY (id),
	UNIQUE KEY ux_auth_tokens_hash (token_hash),
	KEY ix_auth_tokens_user (user_id),
	CONSTRAINT fk_auth_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

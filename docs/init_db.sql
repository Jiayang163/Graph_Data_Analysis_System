-- Create database
CREATE DATABASE IF NOT EXISTS graph_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE graph_system;

-- =========================
-- 1. Users Table
-- =========================
CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================
-- 2. Graph Records Table
-- =========================
CREATE TABLE IF NOT EXISTS graph_records (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    title VARCHAR(100) NOT NULL,
    graph_json LONGTEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, title),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =========================
-- 3. Graph Templates Table
-- =========================
CREATE TABLE IF NOT EXISTS graph_templates (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    graph_json LONGTEXT NOT NULL,
    node_count INT NOT NULL,
    edge_count INT NOT NULL,
    description TEXT
);

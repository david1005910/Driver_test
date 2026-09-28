CREATE DATABASE IF NOT EXISTS driver_exam CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE driver_exam;

CREATE TABLE IF NOT EXISTS questions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  no INT NOT NULL UNIQUE,
  question TEXT NOT NULL,
  options JSON NOT NULL,
  answer JSON NOT NULL,
  explanation TEXT NULL,
  images JSON NULL,
  question_type VARCHAR(32) DEFAULT 'text',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attempts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  question_id INT NOT NULL,
  user_answer JSON NOT NULL,
  is_correct TINYINT(1) NOT NULL,
  mode VARCHAR(32) DEFAULT 'study',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_question (question_id),
  INDEX idx_created (created_at),
  CONSTRAINT fk_attempts_q FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wrong_answers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  question_id INT NOT NULL UNIQUE,
  wrong_count INT DEFAULT 0,
  solved_count INT DEFAULT 0,
  last_wrong_at TIMESTAMP NULL,
  last_correct_at TIMESTAMP NULL,
  CONSTRAINT fk_wrong_q FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS embeddings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  question_id INT NOT NULL UNIQUE,
  model VARCHAR(64) NOT NULL,
  vector JSON NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_emb_q FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
);
CREATE DATABASE IF NOT EXISTS u750098024_court_db;
USE u750098024_court_db;

CREATE TABLE IF NOT EXISTS users (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  username VARCHAR(50) NOT NULL,
  email VARCHAR(150) NOT NULL,
  cm_no VARCHAR(50) DEFAULT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('user', 'admin', 'superadmin') NOT NULL DEFAULT 'user',
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'inactive',
  can_book ENUM('yes', 'no') NOT NULL DEFAULT 'no',
  fees_status ENUM('paid', 'defaulter') NOT NULL DEFAULT 'paid',
  token_version INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username),
  UNIQUE KEY uq_users_email (email)
);

CREATE TABLE IF NOT EXISTS courts (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  picture VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_courts_name (name)
);

CREATE TABLE IF NOT EXISTS events (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  picture VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_events_name (name)
);

CREATE TABLE IF NOT EXISTS bookings (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  court_id INT NOT NULL,
  booking_type ENUM('COURT') NOT NULL DEFAULT 'COURT',
  booking_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  players_json JSON DEFAULT NULL,
  booking_status ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  payment_status ENUM('UNPAID', 'PAID') NOT NULL DEFAULT 'UNPAID',
  admin_note TEXT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_bookings_user_id (user_id),
  KEY idx_bookings_court_id (court_id),
  KEY idx_bookings_date (booking_date),
  CONSTRAINT fk_bookings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_bookings_court FOREIGN KEY (court_id) REFERENCES courts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS event_bookings (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  event_id INT NOT NULL,
  booking_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  booking_status ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  payment_status ENUM('UNPAID', 'PAID') NOT NULL DEFAULT 'UNPAID',
  admin_note TEXT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_event_bookings_user_id (user_id),
  KEY idx_event_bookings_event_id (event_id),
  KEY idx_event_bookings_date (booking_date),
  CONSTRAINT fk_event_bookings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_event_bookings_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS faqs (
  id INT NOT NULL AUTO_INCREMENT,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  sort_order INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS news (
  id INT NOT NULL AUTO_INCREMENT,
  heading VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  picture VARCHAR(255) NOT NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  sort_order INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS slides (
  id INT NOT NULL AUTO_INCREMENT,
  title VARCHAR(255) NOT NULL,
  subtitle VARCHAR(255) DEFAULT NULL,
  picture VARCHAR(255) NOT NULL,
  sort_order INT NOT NULL DEFAULT 1,
  is_active ENUM('yes', 'no') NOT NULL DEFAULT 'yes',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT DEFAULT NULL,
  email VARCHAR(150) NOT NULL,
  note TEXT DEFAULT NULL,
  resolution_note TEXT DEFAULT NULL,
  status ENUM('pending', 'processed') NOT NULL DEFAULT 'pending',
  processed_by INT DEFAULT NULL,
  processed_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_account_deletion_requests_user_id (user_id),
  KEY idx_account_deletion_requests_email (email),
  CONSTRAINT fk_account_deletion_requests_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Create your first admin manually after deployment using:
-- 1. the protected admin user API from an existing superadmin session, or
-- 2. a one-time SQL insert with a freshly generated bcrypt password hash.

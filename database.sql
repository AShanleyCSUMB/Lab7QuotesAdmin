CREATE TABLE admin_users (
  userId INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL
);

INSERT INTO admin_users (username, password)
VALUES ('admin', 's3cr3t');
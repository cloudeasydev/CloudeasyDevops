-- Run on MySQL server (15.252.183.230) as root, e.g.:
--   mysql -u root -p < scripts/mysql-allow-remote.sql
-- Replace YOUR_PUBLIC_IP with the IP shown in the API boot error (e.g. 106.202.61.132).

CREATE DATABASE IF NOT EXISTS cloudeasy CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Option A: allow your current dev machine IP only (safer)
CREATE USER IF NOT EXISTS 'admin'@'106.202.61.132' IDENTIFIED BY 'AvbHoSkE0yDG';
GRANT ALL PRIVILEGES ON cloudeasy.* TO 'admin'@'106.202.61.132';

-- Option B: allow from any host (use only if you need many clients)
-- CREATE USER IF NOT EXISTS 'admin'@'%' IDENTIFIED BY 'AvbHoSkE0yDG';
-- GRANT ALL PRIVILEGES ON cloudeasy.* TO 'admin'@'%';

FLUSH PRIVILEGES;

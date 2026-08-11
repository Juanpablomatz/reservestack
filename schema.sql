-- =================================================================
-- SCRIPT DE CREACIÓN DE BASE DE DATOS PARA RESERVESTACK
-- =================================================================

CREATE DATABASE IF NOT EXISTS `reservestack_db` 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE `reservestack_db`;

-- -----------------------------------------------------------------
-- 1. TABLA: RESTAURANTES
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `restaurantes` (
  `id_restaurante` INT AUTO_INCREMENT PRIMARY KEY,
  `nombre` VARCHAR(100) NOT NULL,
  `slug` VARCHAR(50) NOT NULL UNIQUE,
  `color_tema` VARCHAR(20) DEFAULT '#d4af37',
  `creado_en` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `restaurantes` (`id_restaurante`, `nombre`, `slug`, `color_tema`) VALUES
(1, 'Pietra Cucina', 'pietra', '#d4af37'),
(2, 'Rosa Mexicano', 'rosa', '#e5007e'),
(3, 'Llorona Comedor', 'llorona', '#f1c40f')
ON DUPLICATE KEY UPDATE `nombre` = VALUES(`nombre`);

-- -----------------------------------------------------------------
-- 2. TABLA: USUARIOS (Hostess / Admins)
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `usuarios` (
  `id_usuario` INT AUTO_INCREMENT PRIMARY KEY,
  `usuario` VARCHAR(50) NOT NULL UNIQUE,
  `email` VARCHAR(100) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `nombre` VARCHAR(100) NOT NULL,
  `rol` ENUM('admin', 'hostess', 'gerente') DEFAULT 'hostess',
  `creado_en` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `usuarios` (`usuario`, `email`, `password`, `nombre`, `rol`) VALUES
('admin', 'admin@reservestack.com', 'admin123', 'Administrador Principal', 'admin'),
('hostess', 'hostess@reservestack.com', 'hostess2026', 'Hostess Recepción', 'hostess')
ON DUPLICATE KEY UPDATE `nombre` = VALUES(`nombre`);

-- -----------------------------------------------------------------
-- 3. TABLA: MESAS / LAYOUT FÍSICO
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `mesas` (
  `id_mesa` INT NOT NULL,
  `id_restaurante` INT NOT NULL,
  `zona` VARCHAR(50) NOT NULL,
  `capacidad` INT NOT NULL DEFAULT 4,
  `x` INT DEFAULT 10,
  `y` INT DEFAULT 10,
  `is_merged` TINYINT(1) DEFAULT 0,
  `is_vertical` TINYINT(1) DEFAULT 0,
  `display_id` VARCHAR(20) DEFAULT NULL,
  `original_tables_json` TEXT DEFAULT NULL,
  PRIMARY KEY (`id_mesa`, `id_restaurante`, `zona`),
  FOREIGN KEY (`id_restaurante`) REFERENCES `restaurantes`(`id_restaurante`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------
-- 4. TABLA: RESERVAS
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `reservas` (
  `id_reserva` VARCHAR(100) NOT NULL,
  `id_restaurante` INT NOT NULL,
  `fecha` DATE NOT NULL,
  `hora` TIME NOT NULL,
  `zona` VARCHAR(50) NOT NULL,
  `id_mesa` INT NOT NULL,
  `nombre` VARCHAR(100) NOT NULL,
  `personas` INT NOT NULL DEFAULT 1,
  `telefono` VARCHAR(30) DEFAULT NULL,
  `email` VARCHAR(100) DEFAULT NULL,
  `nota` TEXT DEFAULT NULL,
  `estado` ENUM('pendiente', 'confirmada', 'llegada', 'completada', 'noshow', 'cancelada') DEFAULT 'confirmada',
  `creado_en` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_reserva`, `id_restaurante`),
  INDEX `idx_restaurante_fecha` (`id_restaurante`, `fecha`),
  FOREIGN KEY (`id_restaurante`) REFERENCES `restaurantes`(`id_restaurante`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

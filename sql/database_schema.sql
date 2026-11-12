-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Nov 12, 2026 at 02:53 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.1.25

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `optimum_vision_db`
--

-- --------------------------------------------------------

--
-- Table structure for table `appointments`
--

CREATE TABLE `appointments` (
  `id` int(10) UNSIGNED NOT NULL,
  `patient_id` int(10) UNSIGNED NOT NULL,
  `slot_id` int(10) UNSIGNED NOT NULL,
  `reason` varchar(255) DEFAULT NULL,
  `status` enum('Pending','Confirmed','Completed','Cancelled','Rejected','No-Show') NOT NULL DEFAULT 'Pending',
  `staff_notes` varchar(255) DEFAULT NULL,
  `active_slot_id` int(10) UNSIGNED GENERATED ALWAYS AS (case when `status` in ('Pending','Confirmed') then `slot_id` else NULL end) STORED,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `appointments`
--


-- --------------------------------------------------------

--
-- Table structure for table `appointment_slots`
--

CREATE TABLE `appointment_slots` (
  `id` int(10) UNSIGNED NOT NULL,
  `slot_date` date NOT NULL,
  `slot_time` time NOT NULL,
  `is_available` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `appointment_slots`
--

INSERT INTO `appointment_slots` (`id`, `slot_date`, `slot_time`, `is_available`, `created_at`) VALUES
(1, '2026-11-09', '09:00:00', 1, '2026-11-08 04:20:56'),
(2, '2026-11-09', '10:00:00', 1, '2026-11-08 04:20:56'),
(3, '2026-11-09', '11:00:00', 1, '2026-11-08 04:20:56'),
(4, '2026-11-09', '13:00:00', 1, '2026-11-08 04:20:56'),
(5, '2026-11-09', '14:00:00', 1, '2026-11-08 04:20:56'),
(6, '2026-11-09', '15:00:00', 1, '2026-11-08 04:20:56'),
(7, '2026-11-09', '16:00:00', 1, '2026-11-08 04:20:56'),
(8, '2026-11-10', '09:00:00', 1, '2026-11-08 04:20:56'),
(9, '2026-11-10', '10:00:00', 1, '2026-11-08 04:20:56'),
(10, '2026-11-10', '11:00:00', 1, '2026-11-08 04:20:56'),
(11, '2026-11-10', '13:00:00', 1, '2026-11-08 04:20:56'),
(12, '2026-11-10', '14:00:00', 1, '2026-11-08 04:20:56'),
(13, '2026-11-10', '15:00:00', 1, '2026-11-08 04:20:56'),
(14, '2026-11-10', '16:00:00', 1, '2026-11-08 04:20:56'),
(15, '2026-11-11', '09:00:00', 1, '2026-11-08 04:20:56'),
(16, '2026-11-11', '10:00:00', 1, '2026-11-08 04:20:56'),
(17, '2026-11-11', '11:00:00', 1, '2026-11-08 04:20:56'),
(18, '2026-11-11', '13:00:00', 1, '2026-11-08 04:20:56'),
(19, '2026-11-15', '16:00:00', 1, '2026-11-08 04:20:56'),
(20, '2026-11-11', '15:00:00', 1, '2026-11-08 04:20:56'),
(21, '2026-11-11', '16:00:00', 1, '2026-11-08 04:20:56'),
(22, '2026-11-12', '09:00:00', 1, '2026-11-08 04:20:56'),
(23, '2026-11-12', '10:00:00', 1, '2026-11-08 04:20:56'),
(24, '2026-11-12', '11:00:00', 1, '2026-11-08 04:20:56'),
(25, '2026-11-12', '13:00:00', 1, '2026-11-08 04:20:56'),
(26, '2026-11-12', '14:00:00', 1, '2026-11-08 04:20:56'),
(27, '2026-11-12', '15:00:00', 1, '2026-11-08 04:20:56'),
(28, '2026-11-12', '16:00:00', 1, '2026-11-08 04:20:56'),
(29, '2026-11-13', '09:00:00', 1, '2026-11-08 04:20:56'),
(30, '2026-11-13', '10:00:00', 1, '2026-11-08 04:20:56'),
(31, '2026-11-13', '11:00:00', 1, '2026-11-08 04:20:56'),
(32, '2026-11-13', '13:00:00', 1, '2026-11-08 04:20:56'),
(33, '2026-11-13', '14:00:00', 1, '2026-11-08 04:20:56'),
(34, '2026-11-13', '15:00:00', 1, '2026-11-08 04:20:56'),
(35, '2026-11-13', '16:00:00', 1, '2026-11-08 04:20:56'),
(36, '2026-11-14', '09:00:00', 1, '2026-11-08 04:20:56'),
(37, '2026-11-14', '10:00:00', 1, '2026-11-08 04:20:56'),
(38, '2026-11-14', '11:00:00', 1, '2026-11-08 04:20:56'),
(39, '2026-11-14', '13:00:00', 1, '2026-11-08 04:20:56'),
(40, '2026-11-14', '14:00:00', 1, '2026-11-08 04:20:56'),
(41, '2026-11-14', '15:00:00', 1, '2026-11-08 04:20:56'),
(42, '2026-11-14', '16:00:00', 1, '2026-11-08 04:20:56'),
(43, '2026-11-16', '09:00:00', 1, '2026-11-08 04:20:56'),
(44, '2026-11-16', '10:00:00', 1, '2026-11-08 04:20:56'),
(45, '2026-11-16', '11:00:00', 1, '2026-11-08 04:20:56'),
(46, '2026-11-16', '13:00:00', 1, '2026-11-08 04:20:56'),
(47, '2026-11-16', '14:00:00', 1, '2026-11-08 04:20:56'),
(48, '2026-11-16', '15:00:00', 1, '2026-11-08 04:20:56'),
(49, '2026-11-16', '16:00:00', 1, '2026-11-08 04:20:56'),
(50, '2026-11-17', '09:00:00', 1, '2026-11-08 04:20:56'),
(51, '2026-11-17', '10:00:00', 1, '2026-11-08 04:20:56'),
(52, '2026-11-17', '11:00:00', 1, '2026-11-08 04:20:56'),
(53, '2026-11-17', '13:00:00', 1, '2026-11-08 04:20:56'),
(54, '2026-11-17', '14:00:00', 1, '2026-11-08 04:20:56'),
(55, '2026-11-17', '15:00:00', 1, '2026-11-08 04:20:56'),
(56, '2026-11-17', '16:00:00', 1, '2026-11-08 04:20:56'),
(57, '2026-11-18', '09:00:00', 1, '2026-11-08 04:20:56'),
(58, '2026-11-18', '10:00:00', 1, '2026-11-08 04:20:56'),
(59, '2026-11-18', '11:00:00', 1, '2026-11-08 04:20:56'),
(60, '2026-11-18', '13:00:00', 1, '2026-11-08 04:20:56'),
(61, '2026-11-18', '14:00:00', 1, '2026-11-08 04:20:56'),
(62, '2026-11-18', '15:00:00', 1, '2026-11-08 04:20:56'),
(63, '2026-11-18', '16:00:00', 1, '2026-11-08 04:20:56'),
(64, '2026-11-19', '09:00:00', 1, '2026-11-08 04:20:56'),
(65, '2026-11-19', '10:00:00', 1, '2026-11-08 04:20:56'),
(66, '2026-11-19', '11:00:00', 1, '2026-11-08 04:20:56'),
(67, '2026-11-19', '13:00:00', 1, '2026-11-08 04:20:56'),
(68, '2026-11-19', '14:00:00', 1, '2026-11-08 04:20:56'),
(69, '2026-11-19', '15:00:00', 1, '2026-11-08 04:20:56'),
(70, '2026-11-19', '16:00:00', 1, '2026-11-08 04:20:56'),
(71, '2026-11-20', '09:00:00', 1, '2026-11-08 04:20:56'),
(72, '2026-11-20', '10:00:00', 1, '2026-11-08 04:20:56'),
(73, '2026-11-20', '11:00:00', 1, '2026-11-08 04:20:56'),
(74, '2026-11-20', '13:00:00', 1, '2026-11-08 04:20:56'),
(75, '2026-11-20', '14:00:00', 1, '2026-11-08 04:20:56'),
(76, '2026-11-20', '15:00:00', 1, '2026-11-08 04:20:56'),
(77, '2026-11-20', '16:00:00', 1, '2026-11-08 04:20:56'),
(78, '2026-11-21', '09:00:00', 1, '2026-11-08 04:20:56'),
(79, '2026-11-21', '10:00:00', 1, '2026-11-08 04:20:56'),
(80, '2026-11-21', '11:00:00', 1, '2026-11-08 04:20:56'),
(81, '2026-11-21', '13:00:00', 1, '2026-11-08 04:20:56'),
(82, '2026-11-21', '14:00:00', 1, '2026-11-08 04:20:56'),
(83, '2026-11-21', '15:00:00', 1, '2026-11-08 04:20:56'),
(84, '2026-11-21', '16:00:00', 1, '2026-11-08 04:20:56'),
(128, '2026-11-20', '17:30:00', 1, '2026-11-08 10:09:41'),
(130, '2026-11-01', '09:00:00', 1, '2026-11-08 10:38:32'),
(131, '2026-11-15', '14:30:00', 1, '2026-11-11 05:14:51');

-- --------------------------------------------------------

--
-- Table structure for table `auth_tokens`
--

CREATE TABLE `auth_tokens` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `user_id` int(10) UNSIGNED NOT NULL,
  `token_hash` char(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `auth_tokens`
--


-- --------------------------------------------------------

--
-- Table structure for table `eye_examinations`
--

CREATE TABLE `eye_examinations` (
  `id` int(10) UNSIGNED NOT NULL,
  `patient_id` int(10) UNSIGNED NOT NULL,
  `examination_date` date NOT NULL,
  `chief_complaint` text DEFAULT NULL,
  `visual_acuity_od` varchar(20) DEFAULT NULL,
  `visual_acuity_os` varchar(20) DEFAULT NULL,
  `findings` text DEFAULT NULL,
  `remarks` text DEFAULT NULL,
  `examined_by` int(10) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `inventory`
--

CREATE TABLE `inventory` (
  `id` int(10) UNSIGNED NOT NULL,
  `product_name` varchar(150) NOT NULL,
  `category` enum('Eyeglass Frames','Contact Lenses','Eyedrops','Lenses','Accessories','Others') NOT NULL,
  `brand` varchar(100) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `sku` varchar(50) DEFAULT NULL,
  `price` decimal(10,2) NOT NULL DEFAULT 0.00,
  `stock_quantity` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `low_stock_threshold` int(10) UNSIGNED NOT NULL DEFAULT 5,
  `status` enum('Active','Inactive') NOT NULL DEFAULT 'Active',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `inventory`
--

INSERT INTO `inventory` (`id`, `product_name`, `category`, `brand`, `description`, `sku`, `price`, `stock_quantity`, `low_stock_threshold`, `status`, `created_at`, `updated_at`) VALUES
(1, 'Classic Black Eyeglass Frame', 'Eyeglass Frames', 'Optimum Vision', 'Updated classic black eyeglass frame', 'OV-FRAME-001', 1750.00, 10, 5, 'Active', '2026-11-09 00:43:02', '2026-11-09 00:58:08'),
(2, 'Blue Light Eyeglass Frame', 'Eyeglass Frames', 'Optimum Vision', 'Lightweight frame for everyday use', 'OV-FRAME-002', 1250.00, 15, 5, 'Active', '2026-11-11 06:34:47', '2026-11-11 06:40:35'),
(3, 'Systane Ultra Lubricant Eye Drops 10 mL', 'Eyedrops', 'Systane', 'Lubricating eye drops for temporary relief of dry eye symptoms.', 'OV-EYE-001', 450.00, 20, 5, 'Active', '2026-11-11 07:45:28', '2026-11-12 03:21:08'),
(4, 'Refresh Tears Lubricant Eye Drops 15 mL', 'Eyedrops', 'Refresh', 'Lubricating eye drops for temporary relief of dry eyes and irritation.', 'OV-EYE-002', 350.00, 20, 5, 'Active', '2026-11-11 07:46:41', '2026-11-11 07:48:17');

-- --------------------------------------------------------

--
-- Table structure for table `inventory_batches`
--

CREATE TABLE `inventory_batches` (
  `id` int(10) UNSIGNED NOT NULL,
  `inventory_id` int(10) UNSIGNED NOT NULL,
  `batch_number` varchar(100) NOT NULL,
  `quantity_received` int(10) UNSIGNED NOT NULL,
  `quantity_remaining` int(10) UNSIGNED NOT NULL,
  `date_received` date NOT NULL,
  `expiration_date` date DEFAULT NULL,
  `received_by` int(10) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `inventory_batches`
--



-- --------------------------------------------------------

--
-- Table structure for table `inventory_expired_records`
--

CREATE TABLE `inventory_expired_records` (
  `id` int(10) UNSIGNED NOT NULL,
  `batch_id` int(10) UNSIGNED NOT NULL,
  `inventory_id` int(10) UNSIGNED NOT NULL,
  `expired_quantity` int(10) UNSIGNED NOT NULL,
  `expiration_date` date NOT NULL,
  `recorded_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `inventory_expired_records`
--



-- --------------------------------------------------------

--
-- Table structure for table `inventory_stock_movements`
--

CREATE TABLE `inventory_stock_movements` (
  `id` int(10) UNSIGNED NOT NULL,
  `inventory_id` int(10) UNSIGNED NOT NULL,
  `movement_type` enum('Stock In','Stock Out','Adjustment','Sale','Return','Expired') NOT NULL,
  `quantity_change` int(11) NOT NULL,
  `stock_before` int(10) UNSIGNED NOT NULL,
  `stock_after` int(10) UNSIGNED NOT NULL,
  `reference_id` int(10) UNSIGNED DEFAULT NULL,
  `remarks` varchar(255) DEFAULT NULL,
  `performed_by` int(10) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `inventory_stock_movements`
--



-- --------------------------------------------------------

--
-- Table structure for table `patients`
--

CREATE TABLE `patients` (
  `id` int(10) UNSIGNED NOT NULL,
  `user_id` int(10) UNSIGNED NOT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `birth_date` date DEFAULT NULL,
  `address` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `patients`
--


-- --------------------------------------------------------

--
-- Table structure for table `payments`
--

CREATE TABLE `payments` (
  `id` int(10) UNSIGNED NOT NULL,
  `sale_id` int(10) UNSIGNED NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `payment_method` enum('Cash','GCash','Maya','Bank Transfer','Other') NOT NULL,
  `reference_number` varchar(100) DEFAULT NULL,
  `received_by` int(10) UNSIGNED DEFAULT NULL,
  `payment_date` timestamp NOT NULL DEFAULT current_timestamp(),
  `notes` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ;

--
-- Dumping data for table `payments`
--



-- --------------------------------------------------------

--
-- Table structure for table `prescriptions`
--

CREATE TABLE `prescriptions` (
  `id` int(10) UNSIGNED NOT NULL,
  `examination_id` int(10) UNSIGNED NOT NULL,
  `patient_id` int(10) UNSIGNED NOT NULL,
  `od_sph` decimal(5,2) DEFAULT NULL,
  `od_cyl` decimal(5,2) DEFAULT NULL,
  `od_axis` smallint(5) UNSIGNED DEFAULT NULL,
  `od_add` decimal(5,2) DEFAULT NULL,
  `os_sph` decimal(5,2) DEFAULT NULL,
  `os_cyl` decimal(5,2) DEFAULT NULL,
  `os_axis` smallint(5) UNSIGNED DEFAULT NULL,
  `os_add` decimal(5,2) DEFAULT NULL,
  `pd` decimal(5,2) DEFAULT NULL,
  `lens_type` varchar(100) DEFAULT NULL,
  `prescription_notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `sales`
--

CREATE TABLE `sales` (
  `id` int(10) UNSIGNED NOT NULL,
  `patient_id` int(10) UNSIGNED DEFAULT NULL,
  `processed_by` int(10) UNSIGNED DEFAULT NULL,
  `sale_date` timestamp NOT NULL DEFAULT current_timestamp(),
  `total_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `payment_status` enum('Unpaid','Partial','Paid') NOT NULL DEFAULT 'Unpaid',
  `status` enum('Completed','Cancelled') NOT NULL DEFAULT 'Completed',
  `notes` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `sales`
--



-- --------------------------------------------------------

--
-- Table structure for table `sale_items`
--

CREATE TABLE `sale_items` (
  `id` int(10) UNSIGNED NOT NULL,
  `sale_id` int(10) UNSIGNED NOT NULL,
  `inventory_id` int(10) UNSIGNED NOT NULL,
  `quantity` int(10) UNSIGNED NOT NULL,
  `unit_price` decimal(10,2) NOT NULL,
  `subtotal` decimal(12,2) GENERATED ALWAYS AS (`quantity` * `unit_price`) STORED,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ;

--
-- Dumping data for table `sale_items`
--



-- --------------------------------------------------------

--
-- Table structure for table `sale_item_batch_allocations`
--

CREATE TABLE `sale_item_batch_allocations` (
  `id` int(10) UNSIGNED NOT NULL,
  `sale_item_id` int(10) UNSIGNED NOT NULL,
  `batch_id` int(10) UNSIGNED NOT NULL,
  `quantity` int(10) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `sale_item_batch_allocations`
--



-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(10) UNSIGNED NOT NULL,
  `full_name` varchar(100) NOT NULL,
  `email` varchar(150) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` enum('patient','owner','staff') NOT NULL DEFAULT 'patient',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `failed_attempts` tinyint(3) UNSIGNED NOT NULL DEFAULT 0,
  `locked_until` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `users`
--


--
-- Indexes for dumped tables
--

--
-- Indexes for table `appointments`
--
ALTER TABLE `appointments`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_active_slot` (`active_slot_id`),
  ADD KEY `idx_appt_patient` (`patient_id`),
  ADD KEY `idx_appt_slot` (`slot_id`),
  ADD KEY `idx_appt_status` (`status`);

--
-- Indexes for table `appointment_slots`
--
ALTER TABLE `appointment_slots`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_slot_datetime` (`slot_date`,`slot_time`),
  ADD KEY `idx_slot_date` (`slot_date`);

--
-- Indexes for table `auth_tokens`
--
ALTER TABLE `auth_tokens`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_token_hash` (`token_hash`),
  ADD KEY `idx_tokens_user` (`user_id`),
  ADD KEY `idx_tokens_expiry` (`expires_at`);

--
-- Indexes for table `eye_examinations`
--
ALTER TABLE `eye_examinations`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_eye_patient` (`patient_id`),
  ADD KEY `idx_eye_date` (`examination_date`);

--
-- Indexes for table `inventory`
--
ALTER TABLE `inventory`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_inventory_sku` (`sku`),
  ADD KEY `idx_inventory_category` (`category`),
  ADD KEY `idx_inventory_status` (`status`);

--
-- Indexes for table `inventory_batches`
--
ALTER TABLE `inventory_batches`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_inventory_id` (`inventory_id`),
  ADD KEY `idx_expiration_date` (`expiration_date`),
  ADD KEY `idx_date_received` (`date_received`),
  ADD KEY `fk_batch_received_by` (`received_by`);

--
-- Indexes for table `inventory_expired_records`
--
ALTER TABLE `inventory_expired_records`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_expired_batch` (`batch_id`),
  ADD KEY `fk_expired_inventory` (`inventory_id`);

--
-- Indexes for table `inventory_stock_movements`
--
ALTER TABLE `inventory_stock_movements`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_stock_inventory` (`inventory_id`),
  ADD KEY `idx_stock_created` (`created_at`),
  ADD KEY `fk_stock_user` (`performed_by`);

--
-- Indexes for table `patients`
--
ALTER TABLE `patients`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_patients_user` (`user_id`);

--
-- Indexes for table `payments`
--
ALTER TABLE `payments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_payments_sale` (`sale_id`),
  ADD KEY `idx_payments_date` (`payment_date`),
  ADD KEY `fk_payments_user` (`received_by`);

--
-- Indexes for table `prescriptions`
--
ALTER TABLE `prescriptions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_prescription_examination` (`examination_id`),
  ADD KEY `idx_prescription_patient` (`patient_id`);

--
-- Indexes for table `sales`
--
ALTER TABLE `sales`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_sales_patient` (`patient_id`),
  ADD KEY `idx_sales_date` (`sale_date`),
  ADD KEY `fk_sales_user` (`processed_by`);

--
-- Indexes for table `sale_items`
--
ALTER TABLE `sale_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_sale_items_sale` (`sale_id`),
  ADD KEY `idx_sale_items_inventory` (`inventory_id`);

--
-- Indexes for table `sale_item_batch_allocations`
--
ALTER TABLE `sale_item_batch_allocations`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_alloc_sale_item` (`sale_item_id`),
  ADD KEY `idx_alloc_batch` (`batch_id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_users_email` (`email`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `appointments`
--
ALTER TABLE `appointments`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `appointment_slots`
--
ALTER TABLE `appointment_slots`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=132;

--
-- AUTO_INCREMENT for table `auth_tokens`
--
ALTER TABLE `auth_tokens`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=44;

--
-- AUTO_INCREMENT for table `eye_examinations`
--
ALTER TABLE `eye_examinations`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `inventory`
--
ALTER TABLE `inventory`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `inventory_batches`
--
ALTER TABLE `inventory_batches`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

--
-- AUTO_INCREMENT for table `inventory_expired_records`
--
ALTER TABLE `inventory_expired_records`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `inventory_stock_movements`
--
ALTER TABLE `inventory_stock_movements`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=12;

--
-- AUTO_INCREMENT for table `patients`
--
ALTER TABLE `patients`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;

--
-- AUTO_INCREMENT for table `payments`
--
ALTER TABLE `payments`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `prescriptions`
--
ALTER TABLE `prescriptions`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `sales`
--
ALTER TABLE `sales`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `sale_items`
--
ALTER TABLE `sale_items`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `sale_item_batch_allocations`
--
ALTER TABLE `sale_item_batch_allocations`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=12;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `appointments`
--
ALTER TABLE `appointments`
  ADD CONSTRAINT `fk_appt_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`),
  ADD CONSTRAINT `fk_appt_slot` FOREIGN KEY (`slot_id`) REFERENCES `appointment_slots` (`id`);

--
-- Constraints for table `auth_tokens`
--
ALTER TABLE `auth_tokens`
  ADD CONSTRAINT `fk_tokens_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `eye_examinations`
--
ALTER TABLE `eye_examinations`
  ADD CONSTRAINT `fk_eye_examination_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`) ON UPDATE CASCADE;

--
-- Constraints for table `inventory_batches`
--
ALTER TABLE `inventory_batches`
  ADD CONSTRAINT `fk_batch_inventory` FOREIGN KEY (`inventory_id`) REFERENCES `inventory` (`id`),
  ADD CONSTRAINT `fk_batch_received_by` FOREIGN KEY (`received_by`) REFERENCES `users` (`id`);

--
-- Constraints for table `inventory_expired_records`
--
ALTER TABLE `inventory_expired_records`
  ADD CONSTRAINT `fk_expired_batch` FOREIGN KEY (`batch_id`) REFERENCES `inventory_batches` (`id`),
  ADD CONSTRAINT `fk_expired_inventory` FOREIGN KEY (`inventory_id`) REFERENCES `inventory` (`id`);

--
-- Constraints for table `inventory_stock_movements`
--
ALTER TABLE `inventory_stock_movements`
  ADD CONSTRAINT `fk_stock_inventory` FOREIGN KEY (`inventory_id`) REFERENCES `inventory` (`id`),
  ADD CONSTRAINT `fk_stock_user` FOREIGN KEY (`performed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `patients`
--
ALTER TABLE `patients`
  ADD CONSTRAINT `fk_patients_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `payments`
--
ALTER TABLE `payments`
  ADD CONSTRAINT `fk_payments_sale` FOREIGN KEY (`sale_id`) REFERENCES `sales` (`id`),
  ADD CONSTRAINT `fk_payments_user` FOREIGN KEY (`received_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `prescriptions`
--
ALTER TABLE `prescriptions`
  ADD CONSTRAINT `fk_prescription_examination` FOREIGN KEY (`examination_id`) REFERENCES `eye_examinations` (`id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_prescription_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`) ON UPDATE CASCADE;

--
-- Constraints for table `sales`
--
ALTER TABLE `sales`
  ADD CONSTRAINT `fk_sales_patient` FOREIGN KEY (`patient_id`) REFERENCES `patients` (`id`),
  ADD CONSTRAINT `fk_sales_user` FOREIGN KEY (`processed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `sale_items`
--
ALTER TABLE `sale_items`
  ADD CONSTRAINT `fk_sale_items_inventory` FOREIGN KEY (`inventory_id`) REFERENCES `inventory` (`id`),
  ADD CONSTRAINT `fk_sale_items_sale` FOREIGN KEY (`sale_id`) REFERENCES `sales` (`id`);

--
-- Constraints for table `sale_item_batch_allocations`
--
ALTER TABLE `sale_item_batch_allocations`
  ADD CONSTRAINT `fk_alloc_batch` FOREIGN KEY (`batch_id`) REFERENCES `inventory_batches` (`id`),
  ADD CONSTRAINT `fk_alloc_sale_item` FOREIGN KEY (`sale_item_id`) REFERENCES `sale_items` (`id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;



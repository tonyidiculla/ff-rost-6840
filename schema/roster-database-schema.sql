-- Rostering System Database Schema for Furfield HMS
-- This file documents the required tables for the ff-roster microservice
-- These tables should be added to the shared Supabase database

-- ============================================================================
-- EXISTING TABLES (Referenced by subscription system)
-- ============================================================================

-- hospital_master table (existing)
-- Contains hospital information and subscription details
-- ASSUMED STRUCTURE (to be confirmed):
CREATE TABLE IF NOT EXISTS hospital_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_platform_id UUID UNIQUE NOT NULL,
  hospital_name VARCHAR(255) NOT NULL,
  hospital_code VARCHAR(50),
  address TEXT,
  phone VARCHAR(20),
  email VARCHAR(255),
  subscription_status VARCHAR(20) DEFAULT 'trial', -- active, inactive, trial, suspended
  subscription_start_date DATE,
  subscription_end_date DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- modules_master table (existing)
-- Contains available modules/features in the system
-- ASSUMED STRUCTURE (to be confirmed):
CREATE TABLE IF NOT EXISTS modules_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_name VARCHAR(100) NOT NULL,
  module_code VARCHAR(50) NOT NULL,
  solution_type VARCHAR(20) NOT NULL, -- HMS, PA, ORG, etc.
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- hospital_module_subscriptions table (linking table)
-- Maps which modules each hospital has subscribed to
-- ASSUMED STRUCTURE (to be confirmed):
CREATE TABLE IF NOT EXISTS hospital_module_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL REFERENCES hospital_master(id),
  module_id UUID NOT NULL REFERENCES modules_master(id),
  subscription_status VARCHAR(20) DEFAULT 'active', -- active, inactive, suspended
  subscription_start_date DATE,
  subscription_end_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(hospital_id, module_id)
);

-- ============================================================================
-- NEW ROSTERING TABLES (To be created)
-- ============================================================================

-- Staff members table for rostering
CREATE TABLE IF NOT EXISTS staff_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_platform_id UUID NOT NULL, -- Links to hospital_master.entity_platform_id
  user_platform_id VARCHAR(255), -- Links to user management system
  employee_id VARCHAR(100), -- Internal employee identifier
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(20),
  role_type VARCHAR(100) NOT NULL, -- vet, nurse, technician, admin, etc.
  job_title VARCHAR(255),
  slot_duration_minutes INTEGER DEFAULT 15, -- Default appointment duration
  can_take_appointments BOOLEAN DEFAULT true,
  hire_date DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Weekly schedules for staff members
CREATE TABLE IF NOT EXISTS weekly_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_member_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL, -- 0 = Sunday, 1 = Monday, etc.
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_available BOOLEAN DEFAULT true,
  effective_from DATE NOT NULL,
  effective_until DATE, -- NULL means indefinite
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure start time is before end time
  CONSTRAINT valid_time_range CHECK (start_time < end_time),
  -- Prevent overlapping schedules for same staff/day
  UNIQUE(staff_member_id, day_of_week, effective_from)
);

-- Schedule exceptions (holidays, sick days, special hours)
CREATE TABLE IF NOT EXISTS schedule_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_member_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  exception_date DATE NOT NULL,
  exception_type VARCHAR(50) NOT NULL, -- holiday, sick_leave, vacation, special_hours, unavailable
  start_time TIME, -- NULL for full day exceptions
  end_time TIME, -- NULL for full day exceptions
  reason TEXT,
  created_by UUID, -- Who created this exception
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure valid time range for partial day exceptions
  CONSTRAINT valid_exception_time CHECK (
    (start_time IS NULL AND end_time IS NULL) OR 
    (start_time IS NOT NULL AND end_time IS NOT NULL AND start_time < end_time)
  )
);

-- External bookings (appointments from other systems like HMS)
CREATE TABLE IF NOT EXISTS external_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_platform_id UUID NOT NULL, -- Links to hospital_master.entity_platform_id
  staff_member_id UUID NOT NULL REFERENCES staff_members(id),
  external_booking_id VARCHAR(255) NOT NULL, -- ID from the external system (like HMS appointment ID)
  source_service VARCHAR(100) NOT NULL, -- Which service created this booking (ff-hms, ff-pa, etc.)
  booking_date DATE NOT NULL,
  booking_time TIME NOT NULL,
  booking_end_time TIME NOT NULL,
  duration_minutes INTEGER NOT NULL,
  status VARCHAR(20) DEFAULT 'active', -- active, cancelled, completed, no_show
  metadata JSONB, -- Additional data from external system
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure booking end time is after start time
  CONSTRAINT valid_booking_time CHECK (booking_time < booking_end_time),
  -- Prevent duplicate external bookings
  UNIQUE(external_booking_id, source_service)
);

-- ============================================================================
-- INDEXES for better performance
-- ============================================================================

-- Subscription checking indexes
CREATE INDEX IF NOT EXISTS idx_hospital_master_entity_platform_id ON hospital_master(entity_platform_id);
CREATE INDEX IF NOT EXISTS idx_hospital_master_subscription_status ON hospital_master(subscription_status);
CREATE INDEX IF NOT EXISTS idx_hospital_module_subscriptions_hospital_id ON hospital_module_subscriptions(hospital_id);
CREATE INDEX IF NOT EXISTS idx_modules_master_solution_type ON modules_master(solution_type);

-- Staff and scheduling indexes
CREATE INDEX IF NOT EXISTS idx_staff_members_entity_platform_id ON staff_members(entity_platform_id);
CREATE INDEX IF NOT EXISTS idx_staff_members_active ON staff_members(is_active);
CREATE INDEX IF NOT EXISTS idx_staff_members_role_type ON staff_members(role_type);

-- Schedule lookup indexes
CREATE INDEX IF NOT EXISTS idx_weekly_schedules_staff_day ON weekly_schedules(staff_member_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_weekly_schedules_effective ON weekly_schedules(effective_from, effective_until);
CREATE INDEX IF NOT EXISTS idx_schedule_exceptions_staff_date ON schedule_exceptions(staff_member_id, exception_date);

-- Booking lookup indexes
CREATE INDEX IF NOT EXISTS idx_external_bookings_staff_date ON external_bookings(staff_member_id, booking_date);
CREATE INDEX IF NOT EXISTS idx_external_bookings_external_id ON external_bookings(external_booking_id);
CREATE INDEX IF NOT EXISTS idx_external_bookings_entity_platform_id ON external_bookings(entity_platform_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_bookings ENABLE ROW LEVEL SECURITY;

-- Staff members: Only accessible by same entity
CREATE POLICY "staff_members_entity_isolation" ON staff_members
  FOR ALL USING (
    auth.jwt() ->> 'entity_platform_id' = entity_platform_id::text
  );

-- Weekly schedules: Only accessible through staff member's entity
CREATE POLICY "weekly_schedules_entity_isolation" ON weekly_schedules
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM staff_members 
      WHERE staff_members.id = weekly_schedules.staff_member_id 
      AND staff_members.entity_platform_id::text = auth.jwt() ->> 'entity_platform_id'
    )
  );

-- Schedule exceptions: Only accessible through staff member's entity
CREATE POLICY "schedule_exceptions_entity_isolation" ON schedule_exceptions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM staff_members 
      WHERE staff_members.id = schedule_exceptions.staff_member_id 
      AND staff_members.entity_platform_id::text = auth.jwt() ->> 'entity_platform_id'
    )
  );

-- External bookings: Only accessible by same entity
CREATE POLICY "external_bookings_entity_isolation" ON external_bookings
  FOR ALL USING (
    auth.jwt() ->> 'entity_platform_id' = entity_platform_id::text
  );

-- ============================================================================
-- SAMPLE DATA for testing
-- ============================================================================

-- Insert sample module for roster (if not exists)
INSERT INTO modules_master (module_name, module_code, solution_type, description) 
VALUES (
  'Roster & Scheduling', 
  'ROSTER', 
  'HMS', 
  'Staff scheduling and appointment slot management'
) ON CONFLICT DO NOTHING;

-- Note: Sample hospitals and subscriptions should be added by the system administrators
-- based on actual customer subscriptions.

-- ============================================================================
-- COMMENTS AND DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE staff_members IS 'Staff members who can take appointments and have schedules';
COMMENT ON TABLE weekly_schedules IS 'Regular weekly working hours for staff members';
COMMENT ON TABLE schedule_exceptions IS 'Exceptions to regular schedules (holidays, sick days, etc.)';
COMMENT ON TABLE external_bookings IS 'Appointments booked from external systems like HMS';

COMMENT ON COLUMN staff_members.entity_platform_id IS 'Links to hospital_master.entity_platform_id for multi-tenancy';
COMMENT ON COLUMN staff_members.slot_duration_minutes IS 'Default appointment duration for this staff member';
COMMENT ON COLUMN weekly_schedules.day_of_week IS '0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday';
COMMENT ON COLUMN schedule_exceptions.exception_type IS 'Types: holiday, sick_leave, vacation, special_hours, unavailable';
COMMENT ON COLUMN external_bookings.source_service IS 'Which microservice created this booking (ff-hms, ff-pa, etc.)';
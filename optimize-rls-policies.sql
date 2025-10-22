-- Optimize Roster RLS Policies for Performance
-- Replace direct auth.jwt() calls with (SELECT auth.jwt()) to evaluate once per query instead of per row
-- This significantly improves performance for queries with many rows

-- Drop existing policies
DROP POLICY IF EXISTS "staff_members_entity_isolation" ON staff_members;
DROP POLICY IF EXISTS "weekly_schedules_entity_isolation" ON weekly_schedules;
DROP POLICY IF EXISTS "schedule_exceptions_entity_isolation" ON schedule_exceptions;
DROP POLICY IF EXISTS "external_bookings_entity_isolation" ON external_bookings;

-- =====================================================
-- OPTIMIZED POLICIES WITH SUBQUERIES
-- =====================================================

-- Staff members: Only accessible by same entity
CREATE POLICY "staff_members_entity_isolation" ON staff_members
  FOR ALL USING (
    (SELECT auth.jwt()) ->> 'entity_platform_id' = entity_platform_id::text
  );

-- Weekly schedules: Only accessible through staff member's entity
CREATE POLICY "weekly_schedules_entity_isolation" ON weekly_schedules
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM staff_members 
      WHERE staff_members.id = weekly_schedules.staff_member_id 
      AND staff_members.entity_platform_id::text = (SELECT auth.jwt()) ->> 'entity_platform_id'
    )
  );

-- Schedule exceptions: Only accessible through staff member's entity
CREATE POLICY "schedule_exceptions_entity_isolation" ON schedule_exceptions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM staff_members 
      WHERE staff_members.id = schedule_exceptions.staff_member_id 
      AND staff_members.entity_platform_id::text = (SELECT auth.jwt()) ->> 'entity_platform_id'
    )
  );

-- External bookings: Only accessible by same entity
CREATE POLICY "external_bookings_entity_isolation" ON external_bookings
  FOR ALL USING (
    (SELECT auth.jwt()) ->> 'entity_platform_id' = entity_platform_id::text
  );

-- =====================================================
-- VERIFICATION
-- =====================================================

-- Check that all policies are in place
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('staff_members', 'weekly_schedules', 'schedule_exceptions', 'external_bookings')
ORDER BY tablename, policyname;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Roster RLS policies optimized successfully!';
  RAISE NOTICE '📊 All auth.jwt() calls now use subqueries for better performance';
  RAISE NOTICE '🚀 Queries with many rows will now execute faster';
END $$;

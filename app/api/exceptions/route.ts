import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { validateRosterAccess } from '@/lib/subscription'
import { z } from 'zod'

// Validation schema for schedule exception creation
const createExceptionSchema = z.object({
  entity_platform_id: z.string().uuid(),
  staff_member_id: z.string().uuid().optional(), // Optional for hospital-wide exceptions
  exception_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  exception_type: z.enum(['holiday', 'sick_leave', 'personal_leave', 'emergency', 'training', 'custom']),
  is_available: z.boolean().default(false), // Most exceptions make staff unavailable
  start_time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)').optional(),
  end_time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)').optional(),
  reason: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const entityId = searchParams.get('entity_id')
    const staffMemberId = searchParams.get('staff_member_id')
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')
    const exceptionType = searchParams.get('exception_type')

    if (!entityId) {
      return NextResponse.json(
        { error: 'entity_id parameter is required' },
        { status: 400 }
      )
    }

    // Check subscription access to roster module
    const accessCheck = await validateRosterAccess(entityId)
    if (!accessCheck.allowed) {
      return NextResponse.json(
        { 
          error: 'Access denied to roster module',
          reason: accessCheck.error 
        },
        { status: 403 }
      )
    }

    // Build query for schedule exceptions
    let query = supabaseAdmin
      .from('schedule_exceptions')
      .select(`
        *,
        staff_member:staff_members(
          id,
          employee_id,
          full_name,
          role_type
        )
      `)
      .eq('entity_platform_id', entityId)
      .eq('is_active', true)

    // Apply filters
    if (staffMemberId) {
      query = query.eq('staff_member_id', staffMemberId)
    }

    if (startDate) {
      query = query.gte('exception_date', startDate)
    }

    if (endDate) {
      query = query.lte('exception_date', endDate)
    }

    if (exceptionType) {
      query = query.eq('exception_type', exceptionType)
    }

    const { data: exceptions, error } = await query.order('exception_date', { ascending: true })

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch schedule exceptions' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: exceptions,
      count: exceptions.length,
      filters: {
        entity_id: entityId,
        staff_member_id: staffMemberId,
        start_date: startDate,
        end_date: endDate,
        exception_type: exceptionType
      }
    })

  } catch (error) {
    console.error('Schedule exceptions GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Validate input
    const validatedData = createExceptionSchema.parse(body)

    // Check subscription access
    const accessCheck = await validateRosterAccess(validatedData.entity_platform_id)
    if (!accessCheck.allowed) {
      return NextResponse.json(
        { 
          error: 'Access denied to roster module',
          reason: accessCheck.error 
        },
        { status: 403 }
      )
    }

    // If staff_member_id is provided, verify it exists and belongs to this entity
    if (validatedData.staff_member_id) {
      const { data: staffMember, error: staffError } = await supabaseAdmin
        .from('staff_members')
        .select('id, entity_platform_id')
        .eq('id', validatedData.staff_member_id)
        .eq('entity_platform_id', validatedData.entity_platform_id)
        .eq('is_active', true)
        .single()

      if (staffError || !staffMember) {
        return NextResponse.json(
          { error: 'Staff member not found or does not belong to this entity' },
          { status: 404 }
        )
      }
    }

    // Validate time range if both start and end times are provided
    if (validatedData.start_time && validatedData.end_time) {
      if (validatedData.start_time >= validatedData.end_time) {
        return NextResponse.json(
          { error: 'Start time must be before end time' },
          { status: 400 }
        )
      }
    }

    // Check for existing exceptions on the same date
    let conflictQuery = supabaseAdmin
      .from('schedule_exceptions')
      .select('id')
      .eq('entity_platform_id', validatedData.entity_platform_id)
      .eq('exception_date', validatedData.exception_date)
      .eq('is_active', true)

    if (validatedData.staff_member_id) {
      conflictQuery = conflictQuery.eq('staff_member_id', validatedData.staff_member_id)
    } else {
      conflictQuery = conflictQuery.is('staff_member_id', null)
    }

    const { data: existingExceptions, error: conflictError } = await conflictQuery

    if (conflictError) {
      console.error('Conflict check error:', conflictError)
      return NextResponse.json(
        { error: 'Failed to check for existing exceptions' },
        { status: 500 }
      )
    }

    if (existingExceptions && existingExceptions.length > 0) {
      return NextResponse.json(
        { error: 'An exception already exists for this date and staff member' },
        { status: 409 }
      )
    }

    // Create the schedule exception
    const { data: newException, error: createError } = await supabaseAdmin
      .from('schedule_exceptions')
      .insert([validatedData])
      .select(`
        *,
        staff_member:staff_members(
          id,
          employee_id,
          full_name,
          role_type
        )
      `)
      .single()

    if (createError) {
      console.error('Schedule exception creation error:', createError)
      return NextResponse.json(
        { error: 'Failed to create schedule exception' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Schedule exception created successfully',
      data: newException
    }, { status: 201 })

  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { 
          error: 'Validation failed',
          details: error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message
          }))
        },
        { status: 400 }
      )
    }

    console.error('Schedule exceptions POST error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
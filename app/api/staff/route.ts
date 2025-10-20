import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { validateRosterAccess } from '@/lib/subscription'

// This endpoint provides READ-ONLY access to staff data for scheduling purposes
// Staff management (CRUD operations) should be handled by the ff-hr microservice

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const entityId = searchParams.get('entity_id')
    const activeOnly = searchParams.get('active_only') !== 'false'
    const roleType = searchParams.get('role_type')
    const canTakeAppointments = searchParams.get('can_take_appointments')

    if (!entityId) {
      return NextResponse.json(
        { error: 'entity_id parameter is required' },
        { status: 400 }
      )
    }

    // Check subscription access
    const accessCheck = await validateRosterAccess(entityId)
    if (!accessCheck.allowed) {
      return NextResponse.json(
        { 
          error: 'Access denied to roster module',
          reason: accessCheck.error,
          subscription: accessCheck.subscription 
        },
        { status: 403 }
      )
    }

    let query = supabaseAdmin
      .from('staff_members')
      .select(`
        id,
        entity_platform_id,
        user_platform_id,
        employee_id,
        full_name,
        role_type,
        job_title,
        can_take_appointments,
        is_active,
        created_at,
        updated_at
      `)
      .eq('entity_platform_id', entityId)

    // Apply filters
    if (activeOnly) {
      query = query.eq('is_active', true)
    }

    if (roleType) {
      query = query.eq('role_type', roleType)
    }

    if (canTakeAppointments !== null) {
      query = query.eq('can_take_appointments', canTakeAppointments === 'true')
    }

    const { data: staff, error } = await query.order('full_name')

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch staff members' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: staff,
      count: staff.length,
      message: 'Staff data retrieved for scheduling purposes only. Use ff-hr microservice for staff management.'
    })

  } catch (error) {
    console.error('Staff GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Staff creation/update/deletion should be handled by ff-hr microservice
export async function POST() {
  return NextResponse.json(
    { 
      error: 'Staff management operations not supported',
      message: 'Please use the ff-hr (Human Resources) microservice for creating, updating, or deleting staff members.',
      redirect_to: 'ff-hr/api/staff'
    },
    { status: 405 }
  )
}

export async function PUT() {
  return NextResponse.json(
    { 
      error: 'Staff management operations not supported',
      message: 'Please use the ff-hr (Human Resources) microservice for creating, updating, or deleting staff members.',
      redirect_to: 'ff-hr/api/staff'
    },
    { status: 405 }
  )
}

export async function DELETE() {
  return NextResponse.json(
    { 
      error: 'Staff management operations not supported',
      message: 'Please use the ff-hr (Human Resources) microservice for creating, updating, or deleting staff members.',
      redirect_to: 'ff-hr/api/staff'
    },
    { status: 405 }
  )
}

// Staff creation/update/deletion should be handled by ff-hr microservice
export async function POST() {
  return NextResponse.json(
    { 
      error: 'Staff management operations not supported',
      message: 'Please use the ff-hr (Human Resources) microservice for creating, updating, or deleting staff members.',
      redirect_to: 'ff-hr/api/staff'
    },
    { status: 405 }
  )
}

export async function PUT() {
  return NextResponse.json(
    { 
      error: 'Staff management operations not supported',
      message: 'Please use the ff-hr (Human Resources) microservice for creating, updating, or deleting staff members.',
      redirect_to: 'ff-hr/api/staff'
    },
    { status: 405 }
  )
}

export async function DELETE() {
  return NextResponse.json(
    { 
      error: 'Staff management operations not supported',
      message: 'Please use the ff-hr (Human Resources) microservice for creating, updating, or deleting staff members.',
      redirect_to: 'ff-hr/api/staff'
    },
    { status: 405 }
  )
}
      .eq('entity_platform_id', entityId)

    if (activeOnly) {
      query = query.eq('is_active', true)
    }

    if (roleType) {
      query = query.eq('role_type', roleType)
    }

    query = query.order('full_name', { ascending: true })

    const { data, error } = await query

    if (error) {
      console.error('Staff fetch error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch staff members' },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      staff: data,
      subscription: accessCheck.subscription 
    })
  } catch (error) {
    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validatedData = createStaffSchema.parse(body)

    // Check subscription access
    const accessCheck = await validateRosterAccess(validatedData.entity_platform_id)
    if (!accessCheck.allowed) {
      return NextResponse.json(
        { 
          error: 'Access denied to roster module',
          reason: accessCheck.error,
          subscription: accessCheck.subscription 
        },
        { status: 403 }
      )
    }

    const { data, error } = await supabaseAdmin
      .from('staff_members')
      .insert([validatedData])
      .select()
      .single()

    if (error) {
      console.error('Staff creation error:', error)
      return NextResponse.json(
        { error: 'Failed to create staff member' },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      staff: data,
      subscription: accessCheck.subscription 
    }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      )
    }

    console.error('Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
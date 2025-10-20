# 🗓️ FF-Roster - Furfield Rostering & Scheduling Microservice

A dedicated microservice for staff scheduling and appointment slot management within the Furfield veterinary hospital management ecosystem. Built with **Next.js 15** and **Supabase**, designed to integrate seamlessly with other Furfield microservices.

## 🌟 Features

- **Staff Management** - Create and manage staff members with role-based scheduling
- **Schedule Configuration** - Weekly schedules with exceptions for holidays and leave
- **Slot Availability** - Real-time 15-minute appointment slot checking
- **Booking Management** - External booking integration for appointment systems
- **Subscription-Based Access** - Hospital subscription validation before API access
- **Multi-Tenant** - Secure isolation between different hospital entities
- **Real-time Updates** - Powered by Supabase realtime subscriptions

## 🏗️ Architecture

This microservice follows the Furfield microservices pattern:
- **Next.js 15** for API routes and modern React server components
- **Supabase** for shared database access with other microservices  
- **Subscription Middleware** for access control based on hospital module subscriptions
- **TypeScript** for type safety and better developer experience
- **Zod** for API validation and type inference

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Access to shared Supabase database (same as ff-hms)
- Valid hospital subscription with roster module access

### Installation

```bash
# Clone and navigate to the roster service
cd ff-roster

# Install dependencies
npm install

# Set up environment variables
cp .env.local.example .env.local
# Edit .env.local with your Supabase credentials

# Run development server
npm run dev
```

The service will be available at `http://localhost:6840`

### Environment Variables

```env
# Supabase Configuration (shared with other microservices)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
NEXT_SUPABASE_SECRET_ROLE_KEY=your_service_role_key_here

# JWT Secret for inter-service authentication
JWT_SECRET=your_jwt_secret_for_service_auth

# CORS Configuration
CORS_ORIGINS=http://localhost:6830,http://localhost:6840

# Service Configuration
SERVICE_NAME=ff-roster
SERVICE_PORT=6840
```

## 📚 API Documentation

### Authentication & Authorization

All API endpoints require:
1. **Valid entity_platform_id** - Identifies the hospital/organization
2. **Active subscription** - Hospital must have active subscription status
3. **Roster module access** - Hospital must be subscribed to roster module with solution_type='HMS'

### Core Endpoints

#### 🏥 Health Check
```http
GET /api/health
```
Returns service status and version information.

#### 👥 Staff Management

**Get Staff Members**
```http
GET /api/staff?entity_id={entity_platform_id}&active_only=true&role_type=vet
```

**Create Staff Member**
```http
POST /api/staff
Content-Type: application/json

{
  "entity_platform_id": "uuid",
  "user_platform_id": "user_123",
  "employee_id": "EMP001",
  "full_name": "Dr. Sarah Johnson",
  "email": "sarah.johnson@hospital.com",
  "phone": "+1234567890",
  "role_type": "veterinarian",
  "job_title": "Senior Veterinarian",
  "slot_duration_minutes": 15,
  "can_take_appointments": true,
  "hire_date": "2024-01-01T00:00:00Z"
}
```

#### 📅 Available Slots

**Get Available Time Slots**
```http
GET /api/slots/available?entity_id={entity_platform_id}&date=2024-10-21&duration=15&staff_id={uuid}&role_type=vet
```

Returns available appointment slots for specified criteria:
```json
{
  "date": "2024-10-21",
  "duration": 15,
  "slots": [
    {
      "start_time": "2024-10-21T09:00:00Z",
      "end_time": "2024-10-21T09:15:00Z",
      "is_available": true,
      "staff_id": "uuid",
      "staff_name": "Dr. Sarah Johnson",
      "staff_role": "veterinarian"
    }
  ],
  "subscription": {
    "hospital_id": "uuid",
    "hospital_name": "Happy Paws Clinic",
    "subscription_status": "active",
    "modules": ["Roster & Scheduling", "Core HMS"]
  }
}
```

#### 📋 Booking Management

**Create External Booking**
```http
POST /api/slots/book
Content-Type: application/json

{
  "entity_platform_id": "uuid",
  "staff_member_id": "uuid",
  "booking_date": "2024-10-21",
  "booking_time": "09:00",
  "booking_end_time": "09:15",
  "duration_minutes": 15,
  "external_booking_id": "HMS_APPT_12345",
  "source_service": "ff-hms",
  "metadata": {
    "appointment_type": "consultation",
    "patient_id": "patient_uuid",
    "notes": "Regular checkup"
  }
}
```

### Subscription Validation

All endpoints automatically validate:

1. **Hospital exists and is active** in `hospital_master` table
2. **Subscription is active** with valid date range
3. **Roster module subscription** exists in `hospital_module_subscriptions`
4. **Solution type is HMS** in the `modules_master` table

Access denied responses return 403 with details:
```json
{
  "error": "Access denied to roster module",
  "reason": "Hospital does not have an active roster module subscription",
  "subscription": {
    "hospital_id": "uuid",
    "hospital_name": "Test Clinic",
    "subscription_status": "active",
    "modules": ["Core HMS"]
  }
}
```

## 🗄️ Database Schema

The roster service uses these main tables in the shared Supabase database:

### Subscription Tables (Existing)
- `hospital_master` - Hospital information and subscription status
- `modules_master` - Available modules with solution types
- `hospital_module_subscriptions` - Hospital-to-module mapping

### Roster Tables (New)
- `staff_members` - Staff who can take appointments
- `weekly_schedules` - Regular working hours per staff member
- `schedule_exceptions` - Holidays, sick days, special hours
- `external_bookings` - Appointments from other systems (HMS, PA, etc.)

See `schema/roster-database-schema.sql` for complete table definitions.

## 🔄 Integration with FF-HMS

The roster service integrates with the main HMS application:

1. **HMS calls roster APIs** for appointment booking
2. **Subscription validation** ensures access control
3. **Real-time updates** via Supabase subscriptions
4. **Shared database** for consistent data access

Example HMS integration:
```typescript
// In ff-hms appointment booking
const response = await fetch('http://localhost:6840/api/slots/available', {
  method: 'GET',
  params: {
    entity_id: hospital.entity_platform_id,
    date: '2024-10-21',
    role_type: 'veterinarian'
  }
})

const { slots, subscription } = await response.json()
```

## 🔒 Security Features

- **Row Level Security (RLS)** - Entity-based data isolation
- **Subscription middleware** - Access control per hospital
- **Input validation** - Zod schemas for all API endpoints
- **JWT authentication** - Secure inter-service communication
- **CORS protection** - Configurable origin restrictions

## 🛠️ Development

### Available Scripts

```bash
npm run dev          # Start development server on port 6840
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
```

### Project Structure

```
ff-roster/
├── app/
│   ├── api/
│   │   ├── health/route.ts       # Health check endpoint
│   │   ├── staff/route.ts        # Staff management
│   │   └── slots/
│   │       ├── available/route.ts # Slot availability
│   │       └── book/route.ts      # Booking creation
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                  # Service dashboard
├── lib/
│   ├── supabase.ts              # Database client configuration
│   └── subscription.ts          # Subscription validation middleware
├── schema/
│   └── roster-database-schema.sql # Database schema documentation
├── package.json
└── README.md
```

### Testing

```bash
# Test health endpoint
curl http://localhost:6840/api/health

# Test staff endpoint with subscription validation
curl "http://localhost:6840/api/staff?entity_id=your-entity-uuid"

# Test slot availability
curl "http://localhost:6840/api/slots/available?entity_id=your-entity-uuid&date=2024-10-21"
```

## 📦 Dependencies

### Core Dependencies
- **next**: 15.5.6 - React framework for production
- **react**: 19.1.0 - UI library
- **@supabase/supabase-js**: 2.75.1 - Database client
- **zod**: 4.1.12 - Schema validation
- **typescript**: 5+ - Type safety

### Development Dependencies  
- **@types/node**: Node.js type definitions
- **@types/react**: React type definitions
- **eslint**: Code linting
- **tailwindcss**: Utility-first CSS framework

## 🤝 Contributing

1. Follow the existing code patterns and TypeScript conventions
2. Add proper validation with Zod schemas
3. Include subscription checking for new endpoints
4. Update API documentation for new features
5. Test with multiple hospital entities for isolation

## 📄 License

Part of the Furfield Veterinary Hospital Management System.
Built with ❤️ for veterinary professionals.

---

**Port**: 6840  
**Status**: ✅ Active Development  
**Integration**: FF-HMS, FF-PA, FF-ORG

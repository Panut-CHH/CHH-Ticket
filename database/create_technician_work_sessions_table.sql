-- Create technician_work_sessions table for tracking technician work time
-- This replaces localStorage-based time tracking with persistent database storage

create table technician_work_sessions (
  id uuid primary key default uuid_generate_v4(),
  ticket_no text not null,
  station_id uuid not null references stations(id),
  step_order int not null,
  technician_id uuid not null references users(id),
  started_at timestamptz not null,
  completed_at timestamptz,
  duration_minutes decimal,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes for performance
create index idx_tech_sessions_ticket on technician_work_sessions(ticket_no);
create index idx_tech_sessions_technician on technician_work_sessions(technician_id);
create index idx_tech_sessions_station on technician_work_sessions(station_id);
create index idx_tech_sessions_started_at on technician_work_sessions(started_at);

-- RLS Policies for security
alter table technician_work_sessions enable row level security;

-- Technicians can view their own sessions
create policy "Technicians can view own sessions" on technician_work_sessions
  for select using (technician_id = auth.uid());

-- Technicians can insert their own sessions
create policy "Technicians can insert own sessions" on technician_work_sessions
  for insert with check (technician_id = auth.uid());

-- Technicians can update their own sessions
create policy "Technicians can update own sessions" on technician_work_sessions
  for update using (technician_id = auth.uid());

-- Admins can view all sessions
create policy "Admins can view all sessions" on technician_work_sessions
  for select using (
    exists (
      select 1 from users 
      where users.id = auth.uid() 
      and users.role in ('admin', 'manager')
    )
  );

-- Admins can insert sessions for any technician
create policy "Admins can insert any sessions" on technician_work_sessions
  for insert with check (
    exists (
      select 1 from users 
      where users.id = auth.uid() 
      and users.role in ('admin', 'manager')
    )
  );

-- Admins can update any sessions
create policy "Admins can update any sessions" on technician_work_sessions
  for update using (
    exists (
      select 1 from users 
      where users.id = auth.uid() 
      and users.role in ('admin', 'manager')
    )
  );

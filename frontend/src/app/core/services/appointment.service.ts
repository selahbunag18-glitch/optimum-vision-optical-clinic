
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiService } from './api.service';
import { ApiSuccess } from '../models/api.models';

export type AppointmentStatus =
  | 'Pending'
  | 'Confirmed'
  | 'Completed'
  | 'Cancelled'
  | 'Rejected'
  | 'No-Show';

export interface Appointment {
  id: number;
  status: AppointmentStatus;
  reason: string | null;

  slot: {
    id: number;
    slot_date: string;
    slot_time: string;
    slot_time_label: string;
  };

  is_past: boolean;
  created_at: string;
  updated_at: string;

  staff_notes?: string | null;

  patient?: {
    id: number;
    full_name: string;
    email: string;
    phone: string | null;
  };
}

export interface AppointmentListData {
  appointments: Appointment[];

  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface AppointmentFilters {
  status?: AppointmentStatus | '';
  date?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
}

export type StaffAppointmentStatus =
  | 'Confirmed'
  | 'Rejected'
  | 'Completed'
  | 'No-Show'
  | 'Cancelled';

@Injectable({
  providedIn: 'root'
})
export class AppointmentService {

  private readonly api = inject(ApiService);

  // Get all appointments (Owner / Staff)
  async list(
    filters: AppointmentFilters = {}
  ): Promise<AppointmentListData> {

    const params: Record<string, string | number> = {
      action: 'list',
      page: filters.page ?? 1,
      limit: filters.limit ?? 20
    };

    if (filters.status) {
      params['status'] = filters.status;
    }

    if (filters.date) {
      params['date'] = filters.date;
    } else {
      if (filters.date_from) {
        params['date_from'] = filters.date_from;
      }

      if (filters.date_to) {
        params['date_to'] = filters.date_to;
      }
    }

    const response = await firstValueFrom(
      this.api.get<ApiSuccess<AppointmentListData>>(
        'appointments',
        params
      )
    );

    return response.data;
  }

  // Get appointment details
  async get(id: number): Promise<Appointment> {

    const response = await firstValueFrom(
      this.api.get<ApiSuccess<Appointment>>(
        'appointments',
        {
          action: 'get',
          id
        }
      )
    );

    return response.data;
  }

  // Change appointment status (Owner / Staff)
  async updateStatus(
    id: number,
    status: StaffAppointmentStatus,
    staffNotes?: string
  ): Promise<Appointment> {

    const body: {
      status: StaffAppointmentStatus;
      staff_notes?: string;
    } = { status };

    if (staffNotes !== undefined) {
      body.staff_notes = staffNotes;
    }

    const response = await firstValueFrom(
      this.api.put<ApiSuccess<Appointment>>(
        'appointments',
        body,
        {
          action: 'status',
          id
        }
      )
    );

    return response.data;
  }

  // Cancel appointment
  async cancel(
    id: number,
    staffNotes?: string
  ): Promise<Appointment> {

    const body: { staff_notes?: string } = {};

    if (staffNotes !== undefined) {
      body.staff_notes = staffNotes;
    }

    const response = await firstValueFrom(
      this.api.put<ApiSuccess<Appointment>>(
        'appointments',
        body,
        {
          action: 'cancel',
          id
        }
      )
    );

    return response.data;
  }

  // Update staff notes
  async updateNotes(
    id: number,
    staffNotes: string
  ): Promise<Appointment> {

    const response = await firstValueFrom(
      this.api.put<ApiSuccess<Appointment>>(
        'appointments',
        {
          staff_notes: staffNotes
        },
        {
          action: 'notes',
          id
        }
      )
    );

    return response.data;
  }

  // Reschedule appointment
  async reschedule(
    id: number,
    slotId: number
  ): Promise<Appointment> {

    const response = await firstValueFrom(
      this.api.put<ApiSuccess<Appointment>>(
        'appointments',
        {
          slot_id: slotId
        },
        {
          action: 'reschedule',
          id
        }
      )
    );

    return response.data;
  }

  // Get logged-in patient's appointments
  async myAppointments(
    filters: Pick<
      AppointmentFilters,
      'status' | 'page' | 'limit'
    > = {}
  ): Promise<AppointmentListData> {

    const params: Record<string, string | number> = {
      action: 'my',
      page: filters.page ?? 1,
      limit: filters.limit ?? 20
    };

    if (filters.status) {
      params['status'] = filters.status;
    }

    const response = await firstValueFrom(
      this.api.get<ApiSuccess<AppointmentListData>>(
        'appointments',
        params
      )
    );

    return response.data;
  }

  // Book appointment (Patient only)
  async book(
    slotId: number,
    reason: string
  ): Promise<Appointment> {

    const response = await firstValueFrom(
      this.api.post<ApiSuccess<Appointment>>(
        'appointments',
        {
          slot_id: slotId,
          reason
        },
        {
          action: 'book'
        }
      )
    );

    return response.data;
  }
}

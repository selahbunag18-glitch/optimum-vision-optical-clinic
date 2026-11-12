
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiService } from './api.service';
import { ApiSuccess } from '../models/api.models';

export interface AppointmentSlot {
  id: number;
  slot_date: string;
  slot_time: string;
  slot_time_label: string;
  is_available: boolean;
}

export interface AvailableDate {
  date: string;
  available_slots: number;
}

export interface AvailableDatesData {
  date_from: string;
  date_to: string;
  dates: AvailableDate[];
}

export interface AvailableSlotsData {
  date: string;
  total: number;
  slots: AppointmentSlot[];
}

export interface StaffAppointmentSlot extends AppointmentSlot {
  status: 'available' | 'booked' | 'disabled';
  appointment_id: number | null;
  appointment_status: string | null;
  is_past: boolean;
}

export interface StaffSlotsData {
  date_from: string;
  date_to: string;
  total: number;
  slots: StaffAppointmentSlot[];
}

@Injectable({
  providedIn: 'root'
})
export class SlotService {

  private readonly api = inject(ApiService);

  // Get dates with available slots
  async getAvailableDates(): Promise<AvailableDatesData> {

    const response = await firstValueFrom(
      this.api.get<ApiSuccess<AvailableDatesData>>(
        'slots',
        {
          action: 'dates'
        }
      )
    );

    return response.data;
  }

  // Get available slots for a selected date
  async getAvailableSlots(
    date: string
  ): Promise<AvailableSlotsData> {

    const response = await firstValueFrom(
      this.api.get<ApiSuccess<AvailableSlotsData>>(
        'slots',
        {
          action: 'available',
          date
        }
      )
    );

    return response.data;
  }

  // Get all slots for Owner / Staff
  async listSlots(
    dateFrom?: string,
    dateTo?: string
  ): Promise<StaffSlotsData> {

    const params: Record<string, string> = {
      action: 'list'
    };

    if (dateFrom) {
      params['date_from'] = dateFrom;
    }

    if (dateTo) {
      params['date_to'] = dateTo;
    }

    const response = await firstValueFrom(
      this.api.get<ApiSuccess<StaffSlotsData>>(
        'slots',
        params
      )
    );

    return response.data;
  }

  // Create a new slot (Owner / Staff)
  async createSlot(
    slotDate: string,
    slotTime: string,
    isAvailable = true
  ): Promise<AppointmentSlot> {

    const response = await firstValueFrom(
      this.api.post<ApiSuccess<AppointmentSlot>>(
        'slots',
        {
          slot_date: slotDate,
          slot_time: slotTime,
          is_available: isAvailable
        },
        {
          action: 'create'
        }
      )
    );

    return response.data;
  }

  // Update slot (Owner / Staff)
  async updateSlot(
    id: number,
    data: {
      slot_date?: string;
      slot_time?: string;
      is_available?: boolean;
    }
  ): Promise<AppointmentSlot> {

    const response = await firstValueFrom(
      this.api.put<ApiSuccess<AppointmentSlot>>(
        'slots',
        data,
        {
          action: 'update',
          id
        }
      )
    );

    return response.data;
  }
}

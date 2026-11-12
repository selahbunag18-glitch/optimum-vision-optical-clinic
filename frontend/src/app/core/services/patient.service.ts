
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiSuccess } from '../models/api.models';

import {
  Patient,
  PatientListData
} from '../models/patient.models';

import { ApiService } from './api.service';

// Data allowed when updating a patient
export interface UpdatePatientData {
  full_name?: string;
  phone?: string | null;
  birth_date?: string | null;
  address?: string | null;
  confirm_shared_phone?: boolean;
}

// Data required when registering a walk-in patient
export interface CreateWalkInPatientData {
  full_name: string;
  email: string;
  phone: string;
  birth_date?: string | null;
  address?: string | null;
  confirm_shared_phone?: boolean;
}

// Data for linking an existing patient account
export interface CreatePatientProfileData {
  email: string;
  phone: string;
  birth_date?: string | null;
  address?: string | null;
  confirm_shared_phone?: boolean;
}

// Existing account found during duplicate checking
export interface PatientCheckMatch {
  user_id: number;
  full_name: string;
  role: string;
  is_active: boolean;
  has_patient_profile: boolean;
  patient_id: number | null;
}

// Patient matching the supplied phone number
export interface PatientPhoneMatch {
  id: number;
  full_name: string;
  email: string;
  phone: string;
}

// Duplicate checking response
export interface PatientCheckData {
  exists: boolean;
  email_match: PatientCheckMatch | null;
  phone_matches: PatientPhoneMatch[];
  can_create: boolean;
}

// Successful walk-in registration response
export interface CreateWalkInResult {
  patient: Patient;
  temporary_password: string;
}

// Patient appointment history
export interface PatientHistoryAppointment {
  id: number;
  status: string;
  reason: string | null;
  staff_notes: string | null;

  slot: {
    id: number;
    slot_date: string;
    slot_time: string;
    slot_time_label: string;
  };

  created_at: string;
  updated_at: string;
}

// Patient purchase and payment history
export interface PatientHistorySale {
  id: number;
  sale_date: string;
  status: string;
  payment_status: string;
  total_amount: string;
  amount_paid: string;
  balance: string;
  item_count: number;
  notes: string | null;
}

// Patient history summary
export interface PatientHistorySummary {
  appointment_count: number;
  appointments_by_status: Record<string, number>;
  sale_count: number;
  cancelled_sale_count: number;
  total_billed: string;
  total_paid: string;
  outstanding_balance: string;
}

// Complete patient history API response
export interface PatientHistoryData {
  patient: Patient;
  summary: PatientHistorySummary;
  appointments: PatientHistoryAppointment[];
  sales: PatientHistorySale[];
  history_limit: number;
}

@Injectable({
  providedIn: 'root'
})
export class PatientService {

  private readonly api = inject(ApiService);

  // Get patient list and search
  async list(
    search: string,
    page: number,
    limit = 20
  ): Promise<PatientListData> {

    const params: Record<string, string | number> = {
      action: 'list',
      page,
      limit
    };

    if (search !== '') {
      params['search'] = search;
    }

    const response = await firstValueFrom(
      this.api.get<ApiSuccess<PatientListData>>(
        'patients',
        params
      )
    );

    return response.data;
  }

  // Get one patient's details
  async get(id: number): Promise<Patient> {

    const response = await firstValueFrom(
      this.api.get<ApiSuccess<Patient>>(
        'patients',
        {
          action: 'get',
          id
        }
      )
    );

    return response.data;
  }

  // Check whether a patient already exists
  async checkExisting(
    email: string,
    phone: string
  ): Promise<PatientCheckData> {

    const params: Record<string, string> = {
      action: 'check'
    };

    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();

    if (cleanEmail) {
      params['email'] = cleanEmail;
    }

    if (cleanPhone) {
      params['phone'] = cleanPhone;
    }

    if (!cleanEmail && !cleanPhone) {
      throw new Error(
        'Enter an email or phone number to check.'
      );
    }

    const response = await firstValueFrom(
      this.api.get<ApiSuccess<PatientCheckData>>(
        'patients',
        params
      )
    );

    return response.data;
  }

  // Create a patient record for an existing account
  async createProfile(
    data: CreatePatientProfileData
  ): Promise<Patient> {

    const response = await firstValueFrom(
      this.api.post<ApiSuccess<Patient>>(
        'patients',
        data,
        {
          action: 'create'
        }
      )
    );

    return response.data;
  }

  // Update patient information
  async update(
    id: number,
    data: UpdatePatientData
  ): Promise<Patient> {

    const response = await firstValueFrom(
      this.api.put<ApiSuccess<Patient>>(
        'patients',
        data,
        {
          action: 'update',
          id
        }
      )
    );

    return response.data;
  }

  // Register a new walk-in patient
  async createWalkIn(
    data: CreateWalkInPatientData
  ): Promise<CreateWalkInResult> {

    const response = await firstValueFrom(
      this.api.post<ApiSuccess<CreateWalkInResult>>(
        'patients',
        data,
        {
          action: 'create_walk_in'
        }
      )
    );

    return response.data;
  }

  // Get complete patient history
  async getHistory(
    id: number
  ): Promise<PatientHistoryData> {

    const response = await firstValueFrom(
      this.api.get<ApiSuccess<PatientHistoryData>>(
        'patients',
        {
          action: 'history',
          id
        }
      )
    );

    return response.data;
  }
}

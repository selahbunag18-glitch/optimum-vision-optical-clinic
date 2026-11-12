
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiService } from './api.service';
import { ApiSuccess } from '../models/api.models';

export interface EyePrescription {
  id: number;
  examination_id: number;
  patient_id: number;

  od_sph: string | null;
  od_cyl: string | null;
  od_axis: number | null;
  od_add: string | null;

  os_sph: string | null;
  os_cyl: string | null;
  os_axis: number | null;
  os_add: string | null;

  pd: string | null;
  lens_type: string | null;
  prescription_notes: string | null;

  created_at: string;
  updated_at: string;
}

export interface EyeExamination {
  id: number;
  patient_id: number;
  examination_date: string;

  chief_complaint: string | null;
  visual_acuity_od: string | null;
  visual_acuity_os: string | null;
  findings: string | null;
  remarks: string | null;

  examined_by: number | null;

  patient_name?: string;
  patient_email?: string;
  patient_phone?: string | null;

  has_prescription?: boolean;
  prescription?: EyePrescription | null;

  created_at: string;
  updated_at: string;
}

export interface EyeExaminationListData {
  examinations: EyeExamination[];
  total: number;
}

export interface CreateEyeExaminationData {
  patient_id: number;
  examination_date: string;
  chief_complaint?: string | null;
  visual_acuity_od?: string | null;
  visual_acuity_os?: string | null;
  findings?: string | null;
  remarks?: string | null;
}

export interface UpdateEyeExaminationData {
  examination_date?: string;
  chief_complaint?: string | null;
  visual_acuity_od?: string | null;
  visual_acuity_os?: string | null;
  findings?: string | null;
  remarks?: string | null;
}

export interface SaveEyePrescriptionData {
  od_sph?: number | null;
  od_cyl?: number | null;
  od_axis?: number | null;
  od_add?: number | null;

  os_sph?: number | null;
  os_cyl?: number | null;
  os_axis?: number | null;
  os_add?: number | null;

  pd?: number | null;
  lens_type?: string | null;
  prescription_notes?: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class EyeExaminationService {
  private readonly api = inject(ApiService);

  async list(
    patientId: number
  ): Promise<EyeExaminationListData> {
    const response = await firstValueFrom(
      this.api.get<ApiSuccess<EyeExaminationListData>>(
        'eye-examinations',
        {
          action: 'list',
          patient_id: patientId
        }
      )
    );

    return response.data;
  }

  async get(
    id: number
  ): Promise<EyeExamination> {
    const response = await firstValueFrom(
      this.api.get<ApiSuccess<EyeExamination>>(
        'eye-examinations',
        {
          action: 'get',
          id
        }
      )
    );

    return response.data;
  }

  async create(
    data: CreateEyeExaminationData
  ): Promise<EyeExamination> {
    const response = await firstValueFrom(
      this.api.post<ApiSuccess<EyeExamination>>(
        'eye-examinations',
        data,
        {
          action: 'create'
        }
      )
    );

    return response.data;
  }

  async update(
    id: number,
    data: UpdateEyeExaminationData
  ): Promise<EyeExamination> {
    const response = await firstValueFrom(
      this.api.put<ApiSuccess<EyeExamination>>(
        'eye-examinations',
        data,
        {
          action: 'update',
          id
        }
      )
    );

    return response.data;
  }

  async savePrescription(
    examinationId: number,
    data: SaveEyePrescriptionData
  ): Promise<EyeExamination> {
    const response = await firstValueFrom(
      this.api.put<ApiSuccess<EyeExamination>>(
        'eye-examinations',
        data,
        {
          action: 'save_prescription',
          id: examinationId
        }
      )
    );

    return response.data;
  }
}

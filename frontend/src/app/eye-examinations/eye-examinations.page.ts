
import {
  Component,
  OnInit,
  inject,
  signal
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';

import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonTextarea,
  IonTitle,
  IonToolbar,
  IonSpinner
} from '@ionic/angular';

import { addIcons } from 'ionicons';

import {
  arrowBackOutline,
  addOutline,
  createOutline,
  documentTextOutline,
  printOutline,
  saveOutline,
  refreshOutline,
  eyeOutline,
  checkmarkCircleOutline,
  calendarOutline
} from 'ionicons/icons';

import {
  EyeExamination,
  EyeExaminationService,
  CreateEyeExaminationData,
  SaveEyePrescriptionData
} from '../core/services/eye-examination.service';

import { ApiService } from '../core/services/api.service';

type PageMode = 'list' | 'exam' | 'prescription';

@Component({
  selector: 'app-eye-examinations',
  standalone: true,
  templateUrl: './eye-examinations.page.html',
  styleUrls: ['./eye-examinations.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonTextarea,
    IonTitle,
    IonToolbar,
    IonSpinner
  ]
})
export class EyeExaminationsPage implements OnInit {

  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(EyeExaminationService);

  readonly patientId = signal(0);
  readonly examinations = signal<EyeExamination[]>([]);
  readonly selected = signal<EyeExamination | null>(null);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly opening = signal(false);

  readonly error = signal('');
  readonly message = signal('');
  readonly mode = signal<PageMode>('list');

  examinationId = 0;
  examinationDate = '';
  chiefComplaint = '';
  visualAcuityOd = '';
  visualAcuityOs = '';
  findings = '';
  remarks = '';

  prescription: Record<string, string | number | null> = {};

  constructor() {
    addIcons({
      arrowBackOutline,
      addOutline,
      createOutline,
      documentTextOutline,
      printOutline,
      saveOutline,
      refreshOutline,
      eyeOutline,
      checkmarkCircleOutline,
      calendarOutline
    });
  }

  ngOnInit(): void {
    const id = Number(
      this.route.snapshot.paramMap.get('patientId')
    );

    if (!Number.isSafeInteger(id) || id <= 0) {
      this.error.set('Invalid patient ID.');
      return;
    }

    this.patientId.set(id);
    void this.load();
  }

  private getErrorMessage(err: unknown): string {
    return ApiService.toApiError(err).message;
  }

  private today(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  async load(): Promise<void> {
    if (this.patientId() <= 0) {
      return;
    }

    this.loading.set(true);
    this.error.set('');

    try {
      const result = await this.api.list(this.patientId());

      this.examinations.set(
        Array.isArray(result.examinations)
          ? result.examinations
          : []
      );

    } catch (err) {
      this.error.set(this.getErrorMessage(err));

    } finally {
      this.loading.set(false);
    }
  }

  newExamination(): void {
    this.examinationId = 0;
    this.examinationDate = this.today();

    this.chiefComplaint = '';
    this.visualAcuityOd = '';
    this.visualAcuityOs = '';
    this.findings = '';
    this.remarks = '';

    this.error.set('');
    this.message.set('');
    this.mode.set('exam');
  }

  editExamination(exam: EyeExamination): void {
    this.examinationId = exam.id;
    this.examinationDate = exam.examination_date;
    this.chiefComplaint = exam.chief_complaint ?? '';
    this.visualAcuityOd = exam.visual_acuity_od ?? '';
    this.visualAcuityOs = exam.visual_acuity_os ?? '';
    this.findings = exam.findings ?? '';
    this.remarks = exam.remarks ?? '';

    this.error.set('');
    this.message.set('');
    this.mode.set('exam');
  }

  async saveExamination(): Promise<void> {
    if (this.saving()) {
      return;
    }

    if (!this.examinationDate) {
      this.error.set('Please select an examination date.');
      return;
    }

    if (this.examinationDate > this.today()) {
      this.error.set('Examination date cannot be in the future.');
      return;
    }

    const wasEditing = this.examinationId > 0;

    const data: CreateEyeExaminationData = {
      patient_id: this.patientId(),
      examination_date: this.examinationDate,
      chief_complaint: this.chiefComplaint.trim(),
      visual_acuity_od: this.visualAcuityOd.trim(),
      visual_acuity_os: this.visualAcuityOs.trim(),
      findings: this.findings.trim(),
      remarks: this.remarks.trim()
    };

    this.saving.set(true);
    this.error.set('');
    this.message.set('');

    try {
      if (wasEditing) {
        await this.api.update(this.examinationId, data);
      } else {
        await this.api.create(data);
      }

      this.mode.set('list');

      await this.load();

      this.message.set(
        wasEditing
          ? 'Examination updated successfully.'
          : 'Examination saved successfully.'
      );

    } catch (err) {
      this.error.set(this.getErrorMessage(err));

    } finally {
      this.saving.set(false);
    }
  }

  async openPrescription(
    exam: EyeExamination
  ): Promise<void> {
    if (this.opening()) {
      return;
    }

    this.opening.set(true);
    this.error.set('');
    this.message.set('');

    try {
      const result = await this.api.get(exam.id);

      this.selected.set(result);

      const p = result.prescription;

      this.prescription = {
        od_sph: String(p?.od_sph ?? ''),
        od_cyl: String(p?.od_cyl ?? ''),
        od_axis: String(p?.od_axis ?? ''),
        od_add: String(p?.od_add ?? ''),

        os_sph: String(p?.os_sph ?? ''),
        os_cyl: String(p?.os_cyl ?? ''),
        os_axis: String(p?.os_axis ?? ''),
        os_add: String(p?.os_add ?? ''),

        pd: String(p?.pd ?? ''),
        lens_type: p?.lens_type ?? '',
        prescription_notes: p?.prescription_notes ?? ''
      };

      this.mode.set('prescription');

    } catch (err) {
      this.error.set(this.getErrorMessage(err));

    } finally {
      this.opening.set(false);
    }
  }

  private numberOrNull(key: string): number | null {
    const raw = this.prescription[key];

    if (
      raw === null ||
      raw === undefined ||
      String(raw).trim() === ''
    ) {
      return null;
    }

    const number = Number(raw);

    return Number.isFinite(number) ? number : null;
  }

  private textOrNull(key: string): string | null {
    const raw = this.prescription[key];

    if (raw === null || raw === undefined) {
      return null;
    }

    return String(raw).trim() || null;
  }

  private validatePrescription(): string | null {
    const numericFields = [
      'od_sph', 'od_cyl', 'od_axis', 'od_add',
      'os_sph', 'os_cyl', 'os_axis', 'os_add',
      'pd'
    ];

    for (const key of numericFields) {
      const raw = this.prescription[key];

      if (
        raw === null ||
        raw === undefined ||
        String(raw).trim() === ''
      ) {
        continue;
      }

      if (!Number.isFinite(Number(raw))) {
        return `${key.toUpperCase()} must be a valid number.`;
      }
    }

    for (const key of ['od_axis', 'os_axis']) {
      const axis = this.numberOrNull(key);

      if (
        axis !== null &&
        (!Number.isInteger(axis) || axis < 0 || axis > 180)
      ) {
        return `${key.toUpperCase()} must be between 0 and 180.`;
      }
    }

    const pd = this.numberOrNull('pd');

    if (pd !== null && (pd <= 0 || pd > 100)) {
      return 'PD must be greater than 0 and not exceed 100 mm.';
    }

    for (const key of [
      'od_sph', 'od_cyl', 'od_add',
      'os_sph', 'os_cyl', 'os_add'
    ]) {
      const value = this.numberOrNull(key);

      if (value !== null && Math.abs(value) > 30) {
        return `${key.toUpperCase()} is outside the allowed test range (-30 to +30).`;
      }
    }

    return null;
  }

  async savePrescription(): Promise<void> {
    const exam = this.selected();

    if (!exam || this.saving()) {
      return;
    }

    const validationError = this.validatePrescription();

    if (validationError) {
      this.error.set(validationError);
      return;
    }

    const data: SaveEyePrescriptionData = {
      od_sph: this.numberOrNull('od_sph'),
      od_cyl: this.numberOrNull('od_cyl'),
      od_axis: this.numberOrNull('od_axis'),
      od_add: this.numberOrNull('od_add'),

      os_sph: this.numberOrNull('os_sph'),
      os_cyl: this.numberOrNull('os_cyl'),
      os_axis: this.numberOrNull('os_axis'),
      os_add: this.numberOrNull('os_add'),

      pd: this.numberOrNull('pd'),
      lens_type: this.textOrNull('lens_type'),
      prescription_notes: this.textOrNull('prescription_notes')
    };

    this.saving.set(true);
    this.error.set('');
    this.message.set('');

    try {
      await this.api.savePrescription(exam.id, data);

      // Reload the saved record from the database.
      const updated = await this.api.get(exam.id);

      this.selected.set(updated);

      // Stay on the prescription page so it can be printed.
      this.mode.set('prescription');

      this.message.set(
        'Prescription saved successfully. You can now print it.'
      );

    } catch (err) {
      this.error.set(this.getErrorMessage(err));

    } finally {
      this.saving.set(false);
    }
  }

  async printPrescription(): Promise<void> {
    const exam = this.selected();

    if (!exam?.prescription) {
      this.error.set(
        'Save the prescription before printing.'
      );
      return;
    }

    this.error.set('');

    // Let Angular update the printable view before printing.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 100);
    });

    window.print();
  }

  backToList(): void {
    this.mode.set('list');
    this.selected.set(null);
    this.error.set('');
    this.message.set('');
    void this.load();
  }
}

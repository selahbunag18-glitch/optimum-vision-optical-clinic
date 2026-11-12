import {
  Component,
  inject,
  signal,
  computed,
  viewChild,
  afterNextRender,
  Injector
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import {
  IonContent,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonSpinner,
  IonBadge,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonItem,
  IonLabel,
  IonToggle,
  AlertController,
  ToastController
} from '@ionic/angular';

import { addIcons } from 'ionicons';

import {
  addOutline,
  refreshOutline,
  calendarOutline,
  createOutline,
  checkmarkCircleOutline,
  closeCircleOutline,
  arrowBackOutline
} from 'ionicons/icons';

import {
  SlotService,
  StaffAppointmentSlot
} from '../../core/services/slot.service';

import { ApiService } from '../../core/services/api.service';

type SlotFilter = 'all' | 'available' | 'booked' | 'disabled';

@Component({
  selector: 'app-slot-management',
  templateUrl: './slot-management.page.html',
  styleUrls: ['./slot-management.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    IonContent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonSpinner,
    IonBadge,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonItem,
    IonLabel,
    IonToggle
  ]
})
export class SlotManagementPage {

  private readonly slotService = inject(SlotService);
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);
  private readonly injector = inject(Injector);

  // Reference to Ionic content
  private readonly pageContent = viewChild(IonContent);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly slots = signal<StaffAppointmentSlot[]>([]);

  readonly dateFrom = signal(this.today());
  readonly dateTo = signal(this.addDays(30));
  readonly statusFilter = signal<SlotFilter>('all');

  readonly showForm = signal(false);
  readonly editingId = signal<number | null>(null);

  readonly formDate = signal(this.today());
  readonly formTime = signal('09:00');
  readonly formAvailable = signal(true);

  readonly totalSlots = computed(() =>
    this.slots().length
  );

  readonly availableCount = computed(() =>
    this.slots().filter(
      slot =>
        slot.status === 'available' &&
        !slot.is_past
    ).length
  );

  readonly bookedCount = computed(() =>
    this.slots().filter(
      slot => slot.status === 'booked'
    ).length
  );

  readonly disabledCount = computed(() =>
    this.slots().filter(
      slot => slot.status === 'disabled'
    ).length
  );

  readonly filteredSlots = computed(() => {
    const filter = this.statusFilter();

    if (filter === 'all') {
      return this.slots();
    }

    return this.slots().filter(
      slot => slot.status === filter
    );
  });

  constructor() {
    addIcons({
      addOutline,
      refreshOutline,
      calendarOutline,
      createOutline,
      checkmarkCircleOutline,
      closeCircleOutline,
      arrowBackOutline
    });
  }

  ionViewWillEnter(): void {
    void this.loadSlots();
  }

  // Alisin ang focus bago umalis para mawala ang aria-hidden warning
  ionViewWillLeave(): void {
    (document.activeElement as HTMLElement | null)?.blur();
  }

  // CURRENT DATE
  private today(): string {
    const now = new Date();

    const year = now.getFullYear();
    const month = String(
      now.getMonth() + 1
    ).padStart(2, '0');

    const day = String(
      now.getDate()
    ).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  // ADD DAYS TO CURRENT DATE
  private addDays(days: number): string {
    const date = new Date();

    date.setDate(
      date.getDate() + days
    );

    const year = date.getFullYear();

    const month = String(
      date.getMonth() + 1
    ).padStart(2, '0');

    const day = String(
      date.getDate()
    ).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  // API ERROR HANDLING
  private getErrorMessage(
    error: unknown
  ): string {
    const apiError =
      ApiService.toApiError(error);

    return Object.values(
      apiError.fieldErrors ?? {}
    )[0]
      ?? apiError.message
      ?? 'Something went wrong. Please try again.';
  }

  // LOAD APPOINTMENT SLOTS
  async loadSlots(): Promise<void> {

    if (
      this.dateFrom() > this.dateTo()
    ) {
      this.error.set(
        'End date must not be earlier than start date.'
      );

      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const response =
        await this.slotService.listSlots(
          this.dateFrom(),
          this.dateTo()
        );

      this.slots.set(
        response.slots
      );

    } catch (error) {

      this.error.set(
        this.getErrorMessage(error)
      );

    } finally {

      this.loading.set(false);

    }
  }

  // DATE FILTERS
  updateDateFrom(
    value: string | number | null | undefined
  ): void {
    this.dateFrom.set(
      String(value ?? '')
    );
  }

  updateDateTo(
    value: string | number | null | undefined
  ): void {
    this.dateTo.set(
      String(value ?? '')
    );
  }

  // STATUS FILTER
  updateStatusFilter(
    value: string | number | null | undefined
  ): void {
    const filter =
      String(value ?? 'all') as SlotFilter;

    this.statusFilter.set(filter);
  }

  // AUTOMATIC SCROLL TO CREATE / EDIT FORM
  private scrollToForm(): void {

    afterNextRender(async () => {

      const content =
        this.pageContent();

      if (!content) {
        console.warn(
          'IonContent not found.'
        );
        return;
      }

      // Find form in Angular's rendered DOM
      const form =
        document.querySelector(
          'app-slot-management .form-card'
        ) as HTMLElement | null;

      if (!form) {
        console.warn(
          'Appointment slot form not found.'
        );
        return;
      }

      // Get Ionic scroll container
      const scrollElement =
        await content.getScrollElement();

      // Calculate form position
      const formTop =
        form.getBoundingClientRect().top;

      const contentTop =
        scrollElement.getBoundingClientRect().top;

      const targetY =
        scrollElement.scrollTop +
        formTop -
        contentTop -
        12;

      // Smooth automatic scrolling
      await content.scrollToPoint(
        0,
        Math.max(0, targetY),
        400
      );

    }, {
      injector: this.injector
    });
  }

  // OPEN CREATE SLOT FORM
  openCreateForm(): void {

    this.editingId.set(null);

    this.formDate.set(
      this.today()
    );

    this.formTime.set('09:00');

    this.formAvailable.set(true);

    this.showForm.set(true);

    this.scrollToForm();
  }

  // OPEN EDIT SLOT FORM
  openEditForm(
    slot: StaffAppointmentSlot
  ): void {

    if (
      slot.is_past ||
      slot.status === 'booked'
    ) {
      return;
    }

    this.editingId.set(
      slot.id
    );

    this.formDate.set(
      slot.slot_date
    );

    this.formTime.set(
      slot.slot_time.substring(0, 5)
    );

    this.formAvailable.set(
      slot.is_available
    );

    this.showForm.set(true);

    this.scrollToForm();
  }

  // CLOSE FORM
  closeForm(): void {

    if (this.saving()) {
      return;
    }

    this.showForm.set(false);
    this.editingId.set(null);
  }

  // FORM DATE INPUT
  updateFormDate(
    value: string | number | null | undefined
  ): void {
    this.formDate.set(
      String(value ?? '')
    );
  }

  // FORM TIME INPUT
  updateFormTime(
    value: string | number | null | undefined
  ): void {
    this.formTime.set(
      String(value ?? '')
    );
  }

  // FORM AVAILABILITY
  updateFormAvailable(
    value: boolean
  ): void {
    this.formAvailable.set(value);
  }

  // CREATE OR UPDATE SLOT
  async saveSlot(): Promise<void> {

    if (this.saving()) {
      return;
    }

    const date = this.formDate();
    const time = this.formTime();

    if (!date || !time) {

      await this.showToast(
        'Date and time are required.',
        'danger'
      );

      return;
    }

    const selectedDateTime =
      new Date(
        `${date}T${time}:00`
      );

    if (
      Number.isNaN(
        selectedDateTime.getTime()
      ) ||
      selectedDateTime.getTime() <= Date.now()
    ) {

      await this.showToast(
        'Slot date and time must be in the future.',
        'danger'
      );

      return;
    }

    this.saving.set(true);

    try {

      const id =
        this.editingId();

      if (id === null) {

        await this.slotService.createSlot(
          date,
          time,
          this.formAvailable()
        );

      } else {

        await this.slotService.updateSlot(
          id,
          {
            slot_date: date,
            slot_time: time,
            is_available: this.formAvailable()
          }
        );

      }

      this.showForm.set(false);
      this.editingId.set(null);

      await this.showToast(
        id === null
          ? 'Appointment slot created successfully!'
          : 'Appointment slot updated successfully!',
        'success'
      );

      await this.loadSlots();

    } catch (error) {

      await this.showToast(
        this.getErrorMessage(error),
        'danger'
      );

    } finally {

      this.saving.set(false);

    }
  }

  // ENABLE OR DISABLE SLOT
  async toggleAvailability(
    slot: StaffAppointmentSlot
  ): Promise<void> {

    if (
      slot.is_past ||
      slot.status === 'booked' ||
      this.saving()
    ) {
      return;
    }

    const enable =
      !slot.is_available;

    const alert =
      await this.alertController.create({

        header: enable
          ? 'Enable Slot'
          : 'Disable Slot',

        message: enable
          ? `Enable the appointment slot on ${slot.slot_date} at ${slot.slot_time_label}?`
          : `Disable the appointment slot on ${slot.slot_date} at ${slot.slot_time_label}?`,

        buttons: [
          {
            text: 'Cancel',
            role: 'cancel'
          },
          {
            text: enable
              ? 'Enable'
              : 'Disable',

            handler: () => {
              void this.updateAvailability(
                slot.id,
                enable
              );
            }
          }
        ]
      });

    await alert.present();
  }

  // SAVE AVAILABILITY CHANGE
  private async updateAvailability(
    id: number,
    isAvailable: boolean
  ): Promise<void> {

    this.saving.set(true);

    try {

      await this.slotService.updateSlot(
        id,
        {
          is_available: isAvailable
        }
      );

      await this.showToast(
        isAvailable
          ? 'Slot enabled successfully!'
          : 'Slot disabled successfully!',
        'success'
      );

      await this.loadSlots();

    } catch (error) {

      await this.showToast(
        this.getErrorMessage(error),
        'danger'
      );

    } finally {

      this.saving.set(false);

    }
  }

  // TOAST NOTIFICATION
  private async showToast(
    message: string,
    color: 'success' | 'danger'
  ): Promise<void> {

    const toast =
      await this.toastController.create({
        message,
        duration: 3000,
        color,
        position: 'bottom'
      });

    await toast.present();
  }

  // TRACK SLOTS
  trackSlot(
    _index: number,
    slot: StaffAppointmentSlot
  ): number {
    return slot.id;
  }
}
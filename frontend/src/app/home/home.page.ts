import {
  Component,
  OnInit,
  inject,
  signal
} from '@angular/core';

import {
  Router,
  RouterLink
} from '@angular/router';

import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonIcon,
  IonSpinner
} from '@ionic/angular';

import { addIcons } from 'ionicons';

import {
  peopleOutline,
  calendarOutline,
  cubeOutline,
  cartOutline,
  logOutOutline,
  addCircleOutline,
  personCircleOutline,
  timeOutline,
  calendarClearOutline,
  glassesOutline,
  eyeOutline,
  locationOutline,
  notificationsOutline,
  homeOutline,
  menuOutline,
  closeOutline
} from 'ionicons/icons';

import { AuthUser } from '../core/models/api.models';
import { AuthService } from '../core/services/auth.service';

interface DashboardModule {
  title: string;
  description: string;
  icon: string;
  route?: string;
  comingSoon?: boolean;
}

@Component({
  selector: 'app-home',
  standalone: true,
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [
    RouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonButton,
    IonIcon,
    IonSpinner
  ]
})
export class HomePage implements OnInit {

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly user = signal<AuthUser | null>(null);
  readonly loading = signal(true);
  readonly loggingOut = signal(false);
  readonly menuOpen = signal(false);

  // OWNER / STAFF QUICK ACTIONS
  readonly quickActions: DashboardModule[] = [
    {
      title: 'Add Patient',
      description: 'Register a new patient.',
      icon: 'add-circle-outline',
      route: '/patients/new'
    },
    {
      title: 'Inventory Batches',
      description: 'Monitor inventory batches and stock.',
      icon: 'cube-outline',
      route: '/inventory/batches'
    },
    {
      title: 'Appointment Slots',
      description: 'Manage available booking schedules.',
      icon: 'time-outline',
      route: '/appointments/slots'
    }
  ];

  // OWNER / STAFF MANAGEMENT MODULES
  readonly modules: DashboardModule[] = [
    {
      title: 'Patient Management',
      description: 'Manage patient records and information.',
      icon: 'people-outline',
      route: '/patients'
    },
    {
      title: 'Inventory Management',
      description: 'Manage optical products and stock.',
      icon: 'cube-outline',
      route: '/inventory'
    },
    {
      title: 'Appointments',
      description: 'Manage bookings and appointment schedules.',
      icon: 'calendar-outline',
      route: '/appointments'
    },
    {
      title: 'Sales Management',
      description: 'Manage sales transactions and payments.',
      icon: 'cart-outline',
      route: '/sales'
    }
  ];

  // PATIENT MODULES
  readonly patientModules: DashboardModule[] = [
    {
      title: 'Book Appointment',
      description: 'Schedule your next eye consultation.',
      icon: 'calendar-outline',
      route: '/appointments/book'
    },
    {
      title: 'My Appointments',
      description: 'View your appointment bookings.',
      icon: 'calendar-clear-outline',
      comingSoon: true
    },
    {
      title: 'Prescription History',
      description: 'View your eye prescription history.',
      icon: 'eye-outline',
      comingSoon: true
    },
    {
      title: 'Product Catalog',
      description: 'Browse optical products.',
      icon: 'glasses-outline',
      route: '/product-catalog'
    },
    {
      title: 'Clinic Location',
      description: 'Find our optical clinic.',
      icon: 'location-outline',
      route: '/clinic-location'
    },
    {
      title: 'Notifications',
      description: 'View appointment updates.',
      icon: 'notifications-outline',
      comingSoon: true
    }
  ];

  constructor() {
    addIcons({
      peopleOutline,
      calendarOutline,
      cubeOutline,
      cartOutline,
      logOutOutline,
      addCircleOutline,
      personCircleOutline,
      timeOutline,
      calendarClearOutline,
      glassesOutline,
      eyeOutline,
      locationOutline,
      notificationsOutline,
      homeOutline,
      menuOutline,
      closeOutline
    });
  }

  async ngOnInit(): Promise<void> {
    await this.loadUser();
  }

  ionViewWillEnter(): void {
    void this.loadUser();
  }

  async loadUser(): Promise<void> {
    this.loading.set(true);
    this.menuOpen.set(false);

    try {
      const currentUser = await this.auth.getCurrentUser();

      if (
        !currentUser ||
        !['owner', 'staff', 'patient'].includes(currentUser.role)
      ) {
        this.user.set(null);

        await this.router.navigateByUrl('/login', {
          replaceUrl: true
        });

        return;
      }

      this.user.set(currentUser);

      const currentPath = this.router.url.split('?')[0];

      const expectedPath =
        currentUser.role === 'owner'
          ? '/owner'
          : currentUser.role === 'staff'
            ? '/staff'
            : '/patient';

      if (
        ['/owner', '/staff', '/patient'].includes(currentPath) &&
        currentPath !== expectedPath
      ) {
        await this.router.navigateByUrl(expectedPath, {
          replaceUrl: true
        });
      }

    } catch {
      this.user.set(null);

      await this.router.navigateByUrl('/login', {
        replaceUrl: true
      });

    } finally {
      this.loading.set(false);
    }
  }

  get isPatient(): boolean {
    return this.user()?.role === 'patient';
  }

  get roleLabel(): string {
    const role = this.user()?.role;

    if (role === 'owner') {
      return 'Clinic Owner';
    }

    if (role === 'staff') {
      return 'Clinic Staff';
    }

    return 'Patient';
  }

  get fullName(): string {
    return this.user()?.full_name?.trim() || 'User';
  }

  get firstName(): string {
    return this.fullName.split(/\s+/)[0];
  }

  get dashboardHome(): string {
    const role = this.user()?.role;

    if (role === 'owner') {
      return '/owner';
    }

    if (role === 'staff') {
      return '/staff';
    }

    return '/patient';
  }

  toggleMenu(): void {
    if (this.loading() || !this.user()) {
      return;
    }

    this.menuOpen.update(open => !open);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }

  // =====================================
  // REMOVE FOCUS BEFORE NAVIGATING AWAY
  // Prevents "Blocked aria-hidden on an
  // element because its descendant
  // retained focus" console warnings when
  // this page is hidden mid-transition.
  // =====================================

  blurLink(event: Event): void {
    const target = event.currentTarget as HTMLElement | null;
    target?.blur();
  }

  async logout(): Promise<void> {
    if (this.loggingOut()) {
      return;
    }

    this.loggingOut.set(true);
    this.closeMenu();

    try {
      await this.auth.logout();
    } catch {
      // Preserve existing logout behavior.
    } finally {
      this.loggingOut.set(false);
    }

    this.user.set(null);

    await this.router.navigateByUrl('/login', {
      replaceUrl: true
    });
  }
}
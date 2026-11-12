import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  signal
} from '@angular/core';

import { RouterLink } from '@angular/router';

import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonContent,
  IonButton,
  IonIcon
} from '@ionic/angular';

import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  addOutline,
  removeOutline,
  navigateOutline,
  locationOutline
} from 'ionicons/icons';

import * as L from 'leaflet';

import {
  CLINIC_LOCATION,
  ClinicLocationSettings
} from './clinic-location.config';

@Component({
  selector: 'app-clinic-location',
  standalone: true,
  templateUrl: './clinic-location.page.html',
  styleUrls: ['./clinic-location.page.scss'],
  imports: [
    RouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonContent,
    IonButton,
    IonIcon
  ]
})
export class ClinicLocationPage implements AfterViewInit, OnDestroy {

  // static: true because the map element is always in the template
  @ViewChild('mapEl', { static: true })
  private mapEl!: ElementRef<HTMLDivElement>;

  readonly clinic: ClinicLocationSettings = CLINIC_LOCATION;

  readonly canZoomIn = signal(true);
  readonly canZoomOut = signal(true);

  private map: L.Map | null = null;
  private marker: L.Marker | null = null;
  private resizeObserver: ResizeObserver | null = null;

  private readonly defaultZoom = 17;

  constructor() {
    addIcons({
      arrowBackOutline,
      addOutline,
      removeOutline,
      navigateOutline,
      locationOutline
    });
  }

  // =====================================
  // CLINIC COORDINATES ARE SET?
  // =====================================

  get configured(): boolean {
    const { latitude, longitude } = this.clinic;

    return (
      latitude !== null &&
      longitude !== null &&
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= -90 && latitude <= 90 &&
      longitude >= -180 && longitude <= 180
    );
  }

  get displayAddress(): string {
    return this.clinic.address.trim() || 'Address not set';
  }

  // =====================================
  // MAP SETUP
  // =====================================

  ngAfterViewInit(): void {
    if (!this.configured) {
      return;
    }

    this.initMap();
  }

  // Ionic fires this after the page transition finishes.
  // The container only has its final size at this point.
  ionViewDidEnter(): void {
    this.refreshMapSize();
  }

  private initMap(): void {
    const latitude = this.clinic.latitude as number;
    const longitude = this.clinic.longitude as number;
    const center: L.LatLngTuple = [latitude, longitude];

    const map = L.map(this.mapEl.nativeElement, {
      center,
      zoom: this.defaultZoom,
      minZoom: 3,
      maxZoom: 19,
      zoomControl: false,        // we use our own + / - buttons
      attributionControl: true   // OpenStreetMap credit stays visible
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" ' +
        'target="_blank" rel="noopener">OpenStreetMap</a> contributors'
    }).addTo(map);

    // One marker only.
    this.marker = L.marker(center, {
      icon: this.createPinIcon(),
      title: this.clinic.name,
      alt: this.clinic.name,
      keyboard: true
    })
      .addTo(map)
      .bindPopup(this.createPopupContent(), {
        closeButton: true,
        autoPanPadding: [24, 24]
      })
      .openPopup();

    map.on('zoomend', () => this.syncZoomState());

    this.map = map;
    this.syncZoomState();

    // Keep the map correct when the window or layout resizes.
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.map?.invalidateSize();
      });

      this.resizeObserver.observe(this.mapEl.nativeElement);
    }

    // One-time size fix after the first paint (no repeating timers).
    requestAnimationFrame(() => this.refreshMapSize());
  }

  private refreshMapSize(): void {
    this.map?.invalidateSize();
  }

  // Blue pin drawn with inline SVG: no image files needed,
  // so it works with the Angular build and on Android.
  private createPinIcon(): L.DivIcon {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="52" ' +
      'viewBox="0 0 40 52" aria-hidden="true">' +
      '<path d="M20 0C9 0 0 8.9 0 19.8 0 33.5 20 52 20 52s20-18.5 ' +
      '20-32.2C40 8.9 31 0 20 0z" fill="#0066c6" stroke="#ffffff" ' +
      'stroke-width="2"/>' +
      '<circle cx="20" cy="19" r="8" fill="#ffffff"/>' +
      '</svg>';

    return L.divIcon({
      className: '',               // remove Leaflet's default white box
      html: svg,
      iconSize: [40, 52],
      iconAnchor: [20, 52],        // the tip of the pin is the exact spot
      popupAnchor: [0, -46]
    });
  }

  // Built with DOM nodes (textContent), never raw HTML strings.
  private createPopupContent(): HTMLElement {
    const wrapper = document.createElement('div');

    const title = document.createElement('strong');
    title.textContent = this.clinic.name;

    const address = document.createElement('p');
    address.textContent = this.displayAddress;
    address.style.margin = '6px 0 0';

    wrapper.append(title, address);

    return wrapper;
  }

  // =====================================
  // ZOOM BUTTONS
  // =====================================

  zoomIn(): void {
    this.map?.zoomIn();
  }

  zoomOut(): void {
    this.map?.zoomOut();
  }

  private syncZoomState(): void {
    if (!this.map) {
      return;
    }

    const zoom = this.map.getZoom();

    this.canZoomIn.set(zoom < this.map.getMaxZoom());
    this.canZoomOut.set(zoom > this.map.getMinZoom());
  }

  // =====================================
  // GET DIRECTIONS (free Google Maps link, no API key)
  // The destination is the clinic. We do not send an origin, so
  // Google Maps starts from the patient's current location and
  // asks for location access itself. If the patient denies it,
  // Google Maps still shows the clinic as the destination.
  // =====================================

  getDirections(): void {
    if (!this.configured) {
      return;
    }

    const destination =
      `${this.clinic.latitude},${this.clinic.longitude}`;

    const url =
      'https://www.google.com/maps/dir/?api=1' +
      `&destination=${encodeURIComponent(destination)}` +
      '&travelmode=driving';

    window.open(url, '_blank', 'noopener,noreferrer');
  }

  // =====================================
  // REMOVE FOCUS BEFORE NAVIGATING AWAY
  // =====================================

  blurActiveElement(): void {
    (document.activeElement as HTMLElement | null)?.blur();
  }

  // =====================================
  // CLEAN UP (prevents leaks when leaving the page)
  // =====================================

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    this.marker = null;

    this.map?.remove();
    this.map = null;
  }
}
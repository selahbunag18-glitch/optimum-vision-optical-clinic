import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SlotManagementPage } from './slot-management.page';

describe('SlotManagementPage', () => {
  let component: SlotManagementPage;
  let fixture: ComponentFixture<SlotManagementPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(SlotManagementPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

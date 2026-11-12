import { ComponentFixture, TestBed } from '@angular/core/testing';
import { InventoryEditPage } from './inventory-edit.page';

describe('InventoryEditPage', () => {
  let component: InventoryEditPage;
  let fixture: ComponentFixture<InventoryEditPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(InventoryEditPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

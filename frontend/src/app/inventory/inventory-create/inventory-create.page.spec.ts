import { ComponentFixture, TestBed } from '@angular/core/testing';
import { InventoryCreatePage } from './inventory-create.page';

describe('InventoryCreatePage', () => {
  let component: InventoryCreatePage;
  let fixture: ComponentFixture<InventoryCreatePage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(InventoryCreatePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

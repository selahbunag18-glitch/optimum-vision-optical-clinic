import { ComponentFixture, TestBed } from '@angular/core/testing';
import { InventoryBatchesPage } from './inventory-batches.page';

describe('InventoryBatchesPage', () => {
  let component: InventoryBatchesPage;
  let fixture: ComponentFixture<InventoryBatchesPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(InventoryBatchesPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

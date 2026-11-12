import { ComponentFixture, TestBed } from '@angular/core/testing';
import { InventoryStockInPage } from './inventory-stock-in.page';

describe('InventoryStockInPage', () => {
  let component: InventoryStockInPage;
  let fixture: ComponentFixture<InventoryStockInPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(InventoryStockInPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

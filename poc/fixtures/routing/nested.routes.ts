import { Routes } from '@angular/router';
import { ProductsComponent } from './products.component';

export const routes: Routes = [
  {
    path: 'products',
    component: ProductsComponent,
    children: [
      { path: 'list', component: ProductsComponent },
      { path: 'detail', loadComponent: () => import('./product-detail.component').then(m => m.ProductDetailComponent) },
    ],
  },
];

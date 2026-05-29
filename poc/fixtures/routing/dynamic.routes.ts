import { Routes } from '@angular/router';

const featurePath = './features/' + 'reports';
export const routes: Routes = [
  { path: 'reports', loadComponent: () => import(/* @vite-ignore */ featurePath).then((m: any) => m.ReportsComponent) },
];

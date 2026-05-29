import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { DashboardComponent } from './dashboard.component';
import { SettingsComponent } from './settings.component';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter([
      { path: 'dashboard', component: DashboardComponent },
      { path: 'settings', component: SettingsComponent },
    ]),
  ],
};

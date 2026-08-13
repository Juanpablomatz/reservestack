import { bootstrapApplication } from '@angular/platform-browser';
import { RouteReuseStrategy, provideRouter, withPreloading, PreloadAllModules } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';
import { provideHttpClient } from '@angular/common/http';

import { addIcons } from 'ionicons';
import { 
  documentTextOutline, 
  restaurantOutline, 
  calendarOutline, 
  timeOutline, 
  personOutline, 
  lockClosedOutline, 
  mailOutline, 
  phonePortraitOutline,
  logOutOutline,
  chevronBackOutline,
  addOutline,
  trashOutline,
  createOutline,
  checkmarkCircleOutline
} from 'ionicons/icons';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';

// Registro explícito de íconos en TypeScript con formato kebab-case
addIcons({
  'document-text-outline': documentTextOutline,
  'restaurant-outline': restaurantOutline,
  'calendar-outline': calendarOutline,
  'time-outline': timeOutline,
  'person-outline': personOutline,
  'lock-closed-outline': lockClosedOutline,
  'mail-outline': mailOutline,
  'phone-portrait-outline': phonePortraitOutline,
  'log-out-outline': logOutOutline,
  'chevron-back-outline': chevronBackOutline,
  'add-outline': addOutline,
  'trash-outline': trashOutline,
  'create-outline': createOutline,
  'checkmark-circle-outline': checkmarkCircleOutline
});

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideHttpClient()
  ],
});
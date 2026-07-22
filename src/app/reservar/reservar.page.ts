import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { 
  IonContent, 
  IonInput, 
  IonSelect, 
  IonSelectOption, 
  IonTextarea, 
  IonButton,
  IonIcon // <-- IMPORTANTE: Esto soluciona el error NG8001
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons'; // <-- Importante para registrar los iconos
import { 
  calendarOutline, 
  timeOutline, 
  peopleOutline, 
  restaurantOutline, 
  personOutline, 
  callOutline, 
  mailOutline, 
  documentTextOutline 
} from 'ionicons/icons'; // <-- Importamos los iconos que usamos en el HTML

@Component({
  selector: 'app-reservar',
  templateUrl: './reservar.page.html',
  styleUrls: ['./reservar.page.scss'],
  standalone: true,
  imports: [
    IonContent, 
    CommonModule, 
    FormsModule,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonTextarea,
    IonButton,
    IonIcon // <-- Agregamos IonIcon a los imports de este componente
  ]
})
export class ReservarPage implements OnInit {

  constructor() {
    // Registramos los iconos para este componente de manera limpia
    addIcons({ 
      calendarOutline, 
      timeOutline, 
      peopleOutline, 
      restaurantOutline, 
      personOutline, 
      callOutline, 
      mailOutline, 
      documentTextOutline 
    });
  }

  ngOnInit() {}
}
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-swap',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './swap.component.html',
  styleUrls: ['./swap.component.scss']
})
export class SwapComponent implements OnInit {
  
  constructor() {
  }

  ngOnInit() {}

}
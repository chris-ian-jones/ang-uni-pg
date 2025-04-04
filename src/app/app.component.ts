import { Component } from '@angular/core';
import { SwapComponent } from './components/swap/swap.component';
@Component({
  selector: 'app-root',
  imports: [SwapComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  title = 'Uniswap Natural Language UI';
}

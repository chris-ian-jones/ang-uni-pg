import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EthereumService } from '../../services/ethereum.service';
import { Observable } from 'rxjs';


@Component({
  selector: 'app-swap',
  standalone: true,
  imports: [CommonModule],
  providers: [EthereumService],
  templateUrl: './swap.component.html',
  styleUrls: ['./swap.component.scss'],
})
export class SwapComponent implements OnInit {
  account$: Observable<string | null> = new Observable();

  constructor(private ethereumService: EthereumService) {}

  ngOnInit() {
    this.account$ = this.ethereumService.account$;
  }

  connectWallet() {
    console.log('connectWallet');
  }
}

import { Injectable } from '@angular/core';
import { ethers } from 'ethers';
import { environment } from '../environments/environment';
import { BehaviorSubject, catchError, from, map, Observable, throwError } from 'rxjs';

declare global {
  interface Window {
    ethereum: any;
  }
}

@Injectable({
  providedIn: 'root',
})
export class EthereumService {
  private infuraProvider: ethers.providers.JsonRpcProvider;
  public provider: ethers.providers.Web3Provider | null = null;
  private providerSubject = new BehaviorSubject<ethers.providers.Web3Provider | null>(null);
  public provider$ = this.providerSubject.asObservable();
  private accountSubject = new BehaviorSubject<string | null>(null);
  public account$ = this.accountSubject.asObservable();

  private signer: ethers.Signer | null = null;

  constructor() {
    if (!environment.infura.apiKey) {
      console.error('Infura API key not found in environment variables');
    }
    this.infuraProvider = new ethers.providers.JsonRpcProvider(environment.infura.rpcUrl);

    this.initializeEthereum();
  }

  private initializeEthereum(): void {
    if (typeof window.ethereum !== 'undefined') {
      this.provider = new ethers.providers.Web3Provider(window.ethereum);
      this.providerSubject.next(this.provider);

      window.ethereum.on('accountsChanged', (accounts: string[]) => {
        this.accountSubject.next(accounts[0] || null);
      });

      this.connectWallet().subscribe();
    } else {
      console.error('MetaMask is not installed');
    }
  }

  connectWallet(): Observable<string> {
    console.log('Attempting to connect wallet...');
    if (!this.provider) {
      console.error('Provider not initialized');
      return throwError(() => new Error('Provider not initialized'));
    }

    return from(this.provider.send('eth_requestAccounts', [])).pipe(
      map((accounts: string[]) => {
        console.log('Connected accounts:', accounts);
        if (!accounts || accounts.length === 0) {
          throw new Error('No accounts returned from wallet');
        }
        this.signer = this.provider!.getSigner();
        this.accountSubject.next(accounts[0]);
        return accounts[0];
      }),
      catchError((error) => {
        console.error('Error connecting wallet:', error);
        return throwError(() => new Error(`Failed to connect wallet: ${error.message}`));
      })
    );
  }

  disconnectWallet(): void {
    this.accountSubject.next(null);
    this.signer = null;
  }
}

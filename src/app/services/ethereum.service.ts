import { Injectable } from '@angular/core';
import { ethers } from 'ethers';
import { environment } from '../environments/environment';
import { BehaviorSubject, catchError, from, map, Observable, throwError } from 'rxjs';
import { TOKENS } from './../models/tokens';
import { FeeAmount } from '@uniswap/v3-sdk';
import { computePoolAddress } from '@uniswap/v3-sdk';
import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import Quoter from '@uniswap/v3-periphery/artifacts/contracts/lens/Quoter.sol/Quoter.json';
import { fromReadableAmount } from '../libs/conversion';

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
  private readonly POOL_FACTORY_CONTRACT_ADDRESS = '0x1F98431c8aD98523631AE4a59f267346ea31F984';
  private readonly QUOTER_CONTRACT_ADDRESS = '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6';

  private token0: any = null;
  private token1: any = null;
  private fee: any = null;

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

  async getUniswapPoolAddress(tokenInSymbol: string, tokenOutSymbol: string): Promise<any> {
    return computePoolAddress({
      factoryAddress: this.POOL_FACTORY_CONTRACT_ADDRESS,
      tokenA: TOKENS[tokenInSymbol],
      tokenB: TOKENS[tokenOutSymbol],
      fee: FeeAmount.MEDIUM,
    });
  }

  async getUniswapPoolData(poolAddress: string): Promise<any> {
    const poolContract = new ethers.Contract(
      poolAddress,
      IUniswapV3PoolABI.abi,
      this.infuraProvider
    );

    const [token0, token1, fee, liquidity, slot0] = await Promise.all([
      poolContract['token0'](),
      poolContract['token1'](),
      poolContract['fee'](),
      poolContract['liquidity'](),
      poolContract['slot0'](),
    ]);

    console.log('poolContract', poolContract);
    console.log('token0', token0);
    this.token0 = token0;
    console.log('token1', token1);
    this.token1 = token1;
    console.log('fee', fee);
    this.fee = fee;
    console.log('liquidity', liquidity);
    console.log('slot0', slot0);

    return poolContract;
  }

  async getQuoterContract(): Promise<any> {
    const quoterContract = new ethers.Contract(
      this.QUOTER_CONTRACT_ADDRESS,
      Quoter.abi,
      this.infuraProvider
    );

    console.log('quoterContract', quoterContract);

    return quoterContract;
  }

  async getQuotedAmountIn(
    quoterContract: any,
    tokenInSymbol: string,
    tokenOutSymbol: string,
    amountOut: number
  ): Promise<any> {
    console.log(
      'fromReadableAmount(amountOut, TOKENS[tokenOutSymbol].decimals)',
      fromReadableAmount(amountOut, TOKENS[tokenOutSymbol].decimals)
    );

    const quotedAmountIn = await quoterContract.callStatic.quoteExactOutputSingle(
      this.token1, // tokenIn
      this.token0, // tokenOut
      this.fee, // fee
      fromReadableAmount(amountOut, TOKENS[tokenOutSymbol].decimals).toString(), // amountOut
      0
    );

    console.log('quotedAmountIn', quotedAmountIn);

    return quotedAmountIn;
  }
}

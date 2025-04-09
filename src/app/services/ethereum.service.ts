import { Injectable } from '@angular/core';
import { BigNumber, ethers } from 'ethers';
import { environment } from '../environments/environment';
import {
  BehaviorSubject,
  catchError,
  firstValueFrom,
  from,
  map,
  Observable,
  throwError,
} from 'rxjs';
import { TOKENS } from './../models/tokens';
import {
  FeeAmount,
  Route,
  SwapQuoter,
  computePoolAddress,
  Pool,
  Trade,
  SwapOptions,
  SwapRouter,
} from '@uniswap/v3-sdk';
import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import Quoter from '@uniswap/v3-periphery/artifacts/contracts/lens/Quoter.sol/Quoter.json';
import { fromReadableAmount } from '../libs/conversion';
import { SUPPORTED_CHAINS, Token, CurrencyAmount, TradeType, Percent } from '@uniswap/sdk-core';
import JSBI from 'jsbi';

declare global {
  interface Window {
    ethereum: any;
  }
}

enum TransactionState {
  Failed = 'Failed',
  New = 'New',
  Rejected = 'Rejected',
  Sending = 'Sending',
  Sent = 'Sent',
}

const ERC20_ABI = [
  // Read-Only Functions
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',

  // Authenticated Functions
  'function transfer(address to, uint amount) returns (bool)',
  'function approve(address _spender, uint256 _value) returns (bool)',

  // Events
  'event Transfer(address indexed from, address indexed to, uint amount)',
];

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
  private readonly QUOTER_V2_CONTRACT_ADDRESS = '0x61fFE014bA17989E743c5F6cB21bF9697530B21e';
  private readonly SWAP_ROUTER_ADDRESS = '0xE592427A0AEce92De3Edee1F18E0157C05861564';
  private readonly TOKEN_AMOUNT_TO_APPROVE_FOR_TRANSFER = 2000;
  private readonly MAX_FEE_PER_GAS = 100000000000;
  private readonly MAX_PRIORITY_FEE_PER_GAS = 100000000000;

  private token0: any = null;
  private token1: any = null;
  private fee: any = null;
  private liquidity: any = null;
  private slot0: any = null;

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
    this.slot0 = slot0;
    console.log('slot0', slot0);
    this.liquidity = liquidity;

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

  async getSwapRoute(poolContract: any, tokenInSymbol: string, tokenOutSymbol: string) {
    console.log('getSwapRoute poolContract', poolContract);

    const token0 = TOKENS[tokenInSymbol];
    const token1 = TOKENS[tokenOutSymbol];

    const token0Address = await poolContract.token0();
    const token1Address = await poolContract.token1();

    const token0IsInput =
      TOKENS[tokenInSymbol].address.toLowerCase() === token0Address.toLowerCase();

    const pool = new Pool(
      token0IsInput ? TOKENS[tokenInSymbol] : TOKENS[tokenOutSymbol],
      token0IsInput ? TOKENS[tokenOutSymbol] : TOKENS[tokenInSymbol],
      this.fee,
      this.slot0[0].toString(), // sqrtPriceX96
      this.liquidity.toString(),
      this.slot0[1] // tick
    );

    const swapRoute = await new Route([pool], token0, token1);

    return swapRoute;
  }

  async getInputQuote(swapRoute: any, amountOut: number, tokenOutSymbol: string) {
    try {
      const amountOutRaw = fromReadableAmount(
        amountOut,
        TOKENS[tokenOutSymbol].decimals
      ).toString();
      console.log('Amount Out Raw:', amountOutRaw);

      const currencyAmount = CurrencyAmount.fromRawAmount(TOKENS[tokenOutSymbol], amountOutRaw);
      console.log('Currency Amount:', currencyAmount.toExact());

      const { calldata } = await SwapQuoter.quoteCallParameters(
        swapRoute,
        currencyAmount,
        TradeType.EXACT_OUTPUT,
        {
          useQuoterV2: true,
        }
      );
      console.log('Quoter Calldata:', calldata);

      const quoteCallReturnData = await this.infuraProvider.call({
        to: this.QUOTER_V2_CONTRACT_ADDRESS,
        data: calldata,
      });

      const decodedQuoteCallReturnData = ethers.utils.defaultAbiCoder.decode(
        ['uint256'],
        quoteCallReturnData
      );

      return decodedQuoteCallReturnData[0];
    } catch (error) {
      console.error('Detailed quote error:', {
        route: swapRoute,
        amountOut,
        tokenOutSymbol,
        error,
      });

      throw error;
    }
  }

  async createUncheckedTrade(
    swapRoute: any,
    amountOut: number,
    tokenOutSymbol: string,
    tokenInSymbol: string,
    inputQuote: any
  ) {
    try {
      const amountOutRaw = fromReadableAmount(
        amountOut,
        TOKENS[tokenOutSymbol].decimals
      ).toString();
      const currencyAmount = CurrencyAmount.fromRawAmount(TOKENS[tokenOutSymbol], amountOutRaw);

      const uncheckedTrade = Trade.createUncheckedTrade({
        route: swapRoute,
        inputAmount: CurrencyAmount.fromRawAmount(TOKENS[tokenInSymbol], JSBI.BigInt(inputQuote)),
        outputAmount: currencyAmount,
        tradeType: TradeType.EXACT_OUTPUT,
      });
      return uncheckedTrade;
    } catch (error) {
      console.error('Error creating unchecked trade:', error);
      throw error;
    }
  }

  async getTokenApproval(tokenInSymbol: any) {
    try {
      const address = await firstValueFrom(this.account$);
      console.log('address', address);

      if (!this.provider || !address) {
        console.log('No Provider Found');
        return TransactionState.Failed;
      }

      try {
        const tokenContract = new ethers.Contract(
          TOKENS[tokenInSymbol].address,
          ERC20_ABI,
          this.provider
        );

        const transaction = await tokenContract.populateTransaction['approve'](
          this.SWAP_ROUTER_ADDRESS,
          fromReadableAmount(
            this.TOKEN_AMOUNT_TO_APPROVE_FOR_TRANSFER,
            TOKENS[tokenInSymbol].decimals
          ).toString()
        );

        return this.sendTransactionViaWallet({
          ...transaction,
          from: address,
        });
      } catch (e) {
        console.error(e);
        return TransactionState.Failed;
      }
      return null;
    } catch (error) {
      console.error('Error getting token approval:', error);
      throw error;
    }
  }

  async sendTransactionViaWallet(transaction: any) {
    if (transaction.value) {
      transaction.value = BigNumber.from(transaction.value);
    }
    const txRes = await this.signer?.sendTransaction(transaction);

    let receipt = null;
    const provider = this.provider;
    if (!provider) {
      return TransactionState.Failed;
    }

    while (receipt === null) {
      try {
        receipt = await provider.getTransactionReceipt(txRes?.hash || '');

        if (receipt === null) {
          continue;
        }
      } catch (e) {
        console.log(`Receipt error:`, e);
        break;
      }
    }

    // Transaction was successful if status === 1
    if (receipt) {
      return TransactionState.Sent;
    } else {
      return TransactionState.Failed;
    }
  }

  async getSwapOptions() {
    const address = await firstValueFrom(this.account$);

    return {
      slippageTolerance: new Percent(50, 10_000), // 50 bips, or 0.50%
      deadline: Math.floor(Date.now() / 1000) + 60 * 20, // 20 minutes from the current Unix time
      recipient: address,
    };
  }

  async sendTransaction(uncheckedTrade: any, swapOptions: any) {
    const address = await firstValueFrom(this.account$);
    console.log('address', address);
    const methodParameters = await SwapRouter.swapCallParameters([uncheckedTrade], swapOptions);
    console.log('methodParameters', methodParameters);

    const tx = {
      data: methodParameters.calldata,
      to: this.SWAP_ROUTER_ADDRESS,
      value: methodParameters.value,
      from: address,
      gasLimit: 300000,
      maxFeePerGas: this.MAX_FEE_PER_GAS,
      maxPriorityFeePerGas: this.MAX_PRIORITY_FEE_PER_GAS,
    };

    console.log('tx', tx);

    try {
      const res = await this.signer?.sendTransaction(tx as any);
      console.log('res', res);
    //   return res;
    return null
    } catch (error) {
      console.error('Error sending transaction:', error);
      throw error;
    }
  }
}

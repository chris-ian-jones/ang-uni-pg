import { Token } from '@uniswap/sdk-core';

export interface TokenInfo {
  address: string;
  decimals: number;
  symbol: string;
  name: string;
}

// Ethereum Mainnet token addresses
export const TOKEN_DATA: { [key: string]: TokenInfo } = {
  'WETH': {
    address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    decimals: 18,
    symbol: 'WETH',
    name: 'Wrapped Ether'
  },
  'USDC': {
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    decimals: 6,
    symbol: 'USDC',
    name: 'USD Coin'
  }
};

export const TOKENS = Object.entries(TOKEN_DATA).reduce((acc, [symbol, info]) => {
  acc[symbol] = new Token(
    1, // mainnet
    info.address,
    info.decimals,
    info.symbol,
    info.name
  );
  return acc;
}, {} as { [key: string]: Token });

export interface ParsedInstruction {
  action: 'buy' | 'sell';
  amount: string;
  token: string;
  using?: string;
} 
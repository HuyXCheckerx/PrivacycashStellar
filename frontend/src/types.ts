export type Nomination = 100 | 1000 | 10000 | 100000;

export interface TerminalLine {
  id: string;
  type: 'input' | 'output' | 'error' | 'success' | 'warning';
  content: string;
  timestamp: number;
}

export interface MetaKeypair {
  publicKey: string;
  privateKey: string;
}

export interface DepositStatus {
  hasDeposited: boolean;
  nomination?: Nomination;
  nullifier?: string;
}

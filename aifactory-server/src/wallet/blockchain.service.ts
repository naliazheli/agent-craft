import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ethers } from 'ethers';
import * as crypto from 'crypto';

const AIC_ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

@Injectable()
export class BlockchainService {
  private readonly logger = new Logger(BlockchainService.name);
  private provider: ethers.JsonRpcProvider | null = null;
  private readonly encryptionKey: Buffer | null;
  private readonly contractAddress: string;
  private readonly rewardPoolKey: string;
  private readonly deployerKey: string;
  private readonly isTestEnv: boolean;

  constructor() {
    this.isTestEnv = process.env.NODE_ENV === 'test' || !!process.env.JEST_WORKER_ID;
    const rpcUrl = process.env.POLYGON_RPC_URL;
    if (rpcUrl && !this.isTestEnv) {
      this.provider = new ethers.JsonRpcProvider(rpcUrl);
    }

    const keyHex = process.env.WALLET_ENCRYPTION_KEY;
    this.encryptionKey = keyHex ? Buffer.from(keyHex, 'hex') : null;
    this.contractAddress = process.env.AIC_CONTRACT_ADDRESS || '';
    this.rewardPoolKey = process.env.REWARD_POOL_PRIVATE_KEY || '';
    this.deployerKey = process.env.DEPLOYER_PRIVATE_KEY || '';
  }

  /**
   * Generate a new random wallet. Returns address + AES-256-GCM encrypted private key.
   */
  createWallet(): { address: string; encryptedPrivateKey: string } {
    const wallet = ethers.Wallet.createRandom();
    const encryptedPrivateKey = this.encryptPrivateKey(wallet.privateKey);
    return { address: wallet.address, encryptedPrivateKey };
  }

  /**
   * Encrypt a private key using AES-256-GCM.
   * Format: iv(hex):authTag(hex):ciphertext(hex)
   */
  private encryptPrivateKey(privateKey: string): string {
    if (!this.encryptionKey) {
      // Fallback: store raw (NOT recommended for production)
      this.logger.warn('WALLET_ENCRYPTION_KEY not set. Storing private key without encryption.');
      return `plain:${privateKey}`;
    }

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    let encrypted = cipher.update(privateKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  /**
   * Decrypt an encrypted private key.
   */
  decryptPrivateKey(encryptedData: string): string {
    if (encryptedData.startsWith('plain:')) {
      return encryptedData.slice(6);
    }

    if (!this.encryptionKey) {
      throw new BadRequestException('WALLET_ENCRYPTION_KEY not configured');
    }

    const [ivHex, authTagHex, ciphertext] = encryptedData.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Query on-chain AIC (ERC-20) balance for a wallet address.
   */
  async getOnchainBalance(walletAddress: string): Promise<string> {
    if (!this.provider || !this.contractAddress) {
      return '0';
    }

    try {
      const contract = new ethers.Contract(this.contractAddress, AIC_ERC20_ABI, this.provider);
      const balance: bigint = await contract.balanceOf(walletAddress);
      return ethers.formatEther(balance);
    } catch (err) {
      this.logger.warn(`Failed to query on-chain balance for ${walletAddress}: ${err.message}`);
      return '0';
    }
  }

  async getRewardPoolStatus(): Promise<{
    configured: boolean;
    address: string | null;
    aicBalance: string;
    nativeBalance: string;
  }> {
    if (!this.provider || !this.rewardPoolKey) {
      return {
        configured: this.isConfigured(),
        address: null,
        aicBalance: '0',
        nativeBalance: '0',
      };
    }

    try {
      const wallet = new ethers.Wallet(this.rewardPoolKey, this.provider);
      const [aicBalance, nativeBalance] = await Promise.all([
        this.getOnchainBalance(wallet.address),
        this.provider.getBalance(wallet.address),
      ]);

      return {
        configured: this.isConfigured(),
        address: wallet.address,
        aicBalance,
        nativeBalance: ethers.formatEther(nativeBalance),
      };
    } catch (err) {
      this.logger.warn(`Failed to query reward pool status: ${err.message}`);
      return {
        configured: this.isConfigured(),
        address: null,
        aicBalance: '0',
        nativeBalance: '0',
      };
    }
  }

  /**
   * Transfer AIC tokens on-chain from the reward pool to a user wallet.
   * Used for withdrawals (off-chain balance → on-chain AIC).
   */
  async transferFromRewardPool(toAddress: string, amount: string): Promise<string> {
    if (!this.provider || !this.contractAddress || !this.rewardPoolKey) {
      throw new BadRequestException('Blockchain not configured for on-chain transfers');
    }

    const wallet = new ethers.Wallet(this.rewardPoolKey, this.provider);
    const contract = new ethers.Contract(this.contractAddress, AIC_ERC20_ABI, wallet);
    const amountWei = ethers.parseEther(amount);

    const tx = await contract.transfer(toAddress, amountWei);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  /**
   * Transfer AIC tokens on-chain from a user's custodial wallet.
   * Used when user wants to send tokens from their platform wallet.
   */
  async transferFromCustodial(
    encryptedPrivateKey: string,
    toAddress: string,
    amount: string,
  ): Promise<string> {
    if (!this.provider || !this.contractAddress) {
      throw new BadRequestException('Blockchain not configured');
    }

    const privateKey = this.decryptPrivateKey(encryptedPrivateKey);
    const wallet = new ethers.Wallet(privateKey, this.provider);
    const contract = new ethers.Contract(this.contractAddress, AIC_ERC20_ABI, wallet);
    const amountWei = ethers.parseEther(amount);

    const tx = await contract.transfer(toAddress, amountWei);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  /**
   * Airdrop signup bonus AIC from the deployer wallet to a new user's wallet on-chain.
   * Returns the transaction hash, or null if blockchain is not configured.
   */
  async airdropSignupBonus(toAddress: string, amount: string): Promise<string | null> {
    if (this.isTestEnv) {
      return null;
    }

    if (!this.provider || !this.contractAddress || !this.deployerKey) {
      this.logger.warn('Blockchain not configured for signup airdrop. Skipping on-chain transfer.');
      return null;
    }

    try {
      const wallet = new ethers.Wallet(this.deployerKey, this.provider);
      const contract = new ethers.Contract(this.contractAddress, AIC_ERC20_ABI, wallet);
      const amountWei = ethers.parseEther(amount);

      const tx = await contract.transfer(toAddress, amountWei);
      const receipt = await tx.wait();
      this.logger.log(`Signup airdrop of ${amount} AIC sent to ${toAddress}, txHash: ${receipt.hash}`);
      return receipt.hash;
    } catch (err) {
      this.logger.error(`Signup airdrop failed for ${toAddress}: ${err.message}`);
      return null;
    }
  }

  /**
   * Check if blockchain integration is configured and available.
   */
  isConfigured(): boolean {
    return !this.isTestEnv && !!(this.provider && this.contractAddress);
  }

  /**
   * Check if deployer wallet is configured for airdrops.
   */
  isAirdropConfigured(): boolean {
    return !this.isTestEnv && !!(this.provider && this.contractAddress && this.deployerKey);
  }
}

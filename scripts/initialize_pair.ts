import { 
    Connection, 
    PublicKey, 
    sendAndConfirmTransaction,
    Keypair,
    SystemProgram,
    SYSVAR_RENT_PUBKEY,
    Transaction
} from '@solana/web3.js';
import { 
    TOKEN_PROGRAM_ID, 
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    getAssociatedTokenAddress
} from '@solana/spl-token';
import { Program } from '@coral-xyz/anchor';
import idl from '../target/idl/omnipair.json' with { type: "json" };
import type { Omnipair } from '../target/types/omnipair';
import * as anchor from '@coral-xyz/anchor';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Replace these with your actual values
const TOKEN0_MINT = new PublicKey(process.env.TOKEN0_MINT || '');
const TOKEN1_MINT = new PublicKey(process.env.TOKEN1_MINT || '');

async function main() {
    console.log('Starting pair initialization...');
    
    // Setup connection and provider using Anchor configuration
    const provider = anchor.AnchorProvider.env();
    const program = new Program<Omnipair>(idl, provider);
    const DEPLOYER_KEYPAIR = provider.wallet.payer;
    
    if(!DEPLOYER_KEYPAIR) {
        throw new Error('Deployer keypair not found');
    }

    // Set proper commitment levels
    provider.opts.commitment = 'confirmed';
    provider.opts.preflightCommitment = 'confirmed';
    provider.opts.skipPreflight = false;

    console.log('Connected to network:', provider.connection.rpcEndpoint);
    console.log('Deployer address:', provider.wallet.publicKey.toBase58());

    // Generate a new keypair for the rate model
    const rateModelKeypair = Keypair.generate();
    console.log('Rate Model address:', rateModelKeypair.publicKey.toBase58());

    // Find PDA for the pair
    const [pairPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('gamm_pair'), TOKEN0_MINT.toBuffer(), TOKEN1_MINT.toBuffer()],
        program.programId
    );

    // Find PDA for the LP mint
    const [lpMintPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('gamm_lp_mint'), pairPda.toBuffer()],
        program.programId
    );

    console.log('Pair PDA:', pairPda.toBase58());
    console.log('LP Mint PDA:', lpMintPda.toBase58());

    // Get or create LP token account
    const deployerLpTokenAccount = await getAssociatedTokenAddress(
        lpMintPda,
        DEPLOYER_KEYPAIR.publicKey
    );

    console.log('LP Token ATA:', deployerLpTokenAccount.toBase58());

    // Get token program for each mint
    const token0Program = (await provider.connection.getAccountInfo(TOKEN0_MINT))?.owner.equals(TOKEN_2022_PROGRAM_ID) 
        ? TOKEN_2022_PROGRAM_ID 
        : TOKEN_PROGRAM_ID;
    const token1Program = (await provider.connection.getAccountInfo(TOKEN1_MINT))?.owner.equals(TOKEN_2022_PROGRAM_ID) 
        ? TOKEN_2022_PROGRAM_ID 
        : TOKEN_PROGRAM_ID;

    console.log('Token0 Program:', token0Program.toBase58());
    console.log('Token1 Program:', token1Program.toBase58());

    // Create transaction
    const tx = await program.methods
        .initializePair()
        .accounts({
            deployer: DEPLOYER_KEYPAIR.publicKey,
            token0Mint: TOKEN0_MINT,
            token1Mint: TOKEN1_MINT,
            rateModel: rateModelKeypair.publicKey,
        })
        .transaction();

    console.log('Transaction created. Sending...');

    // Send transaction
    const signature = await sendAndConfirmTransaction(
        provider.connection,
        tx,
        [DEPLOYER_KEYPAIR, rateModelKeypair]
    );

    console.log('Signature:', signature);
}

main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
}); 
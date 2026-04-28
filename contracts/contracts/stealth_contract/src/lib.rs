#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, token, xdr::ToXdr, Address, Bytes, BytesN,
    Env, IntoVal, Symbol, Val, Vec,
};

#[cfg(test)]
mod test;

// ── Storage Keys ──────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    PCSToken,
    RewardMultiplier,
    Paused,
    Balance(BytesN<32>),
}

// ── Errors ────────────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum StealthError {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    InvalidAmount = 3,
    NoFundsAvailable = 4,
    ContractPaused = 5,
    Unauthorized = 6,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct StealthContract;

// ── Implementation ────────────────────────────────────────────────────────────

#[contractimpl]
impl StealthContract {
    /// Initialize the stealth contract with admin, PCS token address, and reward multiplier.
    /// The reward multiplier determines how many PCS tokens are minted per unit of fee.
    /// E.g., multiplier = 10 means fee of 1 XLM → 10 PCS minted to withdrawer.
    pub fn initialize(env: Env, admin: Address, pcs_token: Address, reward_multiplier: i128) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }

        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::PCSToken, &pcs_token);
        env.storage()
            .instance()
            .set(&DataKey::RewardMultiplier, &reward_multiplier);
        env.storage().instance().set(&DataKey::Paused, &false);
    }

    /// Deposit funds into the smart contract and assign them to a stealth public key.
    pub fn deposit(
        env: Env,
        from: Address,
        stealth_pubkey: BytesN<32>,
        ephemeral_key: BytesN<32>,
        encrypted_seed: BytesN<32>,
        token: Address,
        amount: i128,
    ) -> bool {
        from.require_auth();

        // Check paused state
        let paused: bool = env
            .storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false);
        if paused {
            panic!("contract is paused");
        }

        if amount <= 0 {
            panic!("Amount must be greater than 0");
        }

        // Transfer funds from sender to this contract
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&from, &env.current_contract_address(), &amount);

        // Update persistent storage for the stealth address
        let current_balance: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::Balance(stealth_pubkey.clone()))
            .unwrap_or(0);
        env.storage().persistent().set(
            &DataKey::Balance(stealth_pubkey.clone()),
            &(current_balance + amount),
        );

        // Bump TTL to ensure the stealth deposit doesn't expire quickly (approx 30 days)
        env.storage().persistent().extend_ttl(
            &DataKey::Balance(stealth_pubkey.clone()),
            518400,
            518400,
        );

        // Emit the event so the receiver can scan for it
        env.events().publish(
            (Symbol::new(&env, "stealth"), Symbol::new(&env, "deposit")),
            (ephemeral_key, encrypted_seed, stealth_pubkey, amount, token),
        );

        true
    }

    /// Withdraw funds from a stealth address to a final destination.
    /// The stealth keypair signs the payload; the relayer submits the transaction.
    /// On successful withdrawal, PCS governance tokens are minted to the destination
    /// as a reward proportional to the fee amount.
    pub fn withdraw(
        env: Env,
        stealth_pubkey: BytesN<32>,
        token: Address,
        destination: Address,
        relayer: Address,
        signature: BytesN<64>,
    ) {
        // Check paused state
        let paused: bool = env
            .storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false);
        if paused {
            panic!("contract is paused");
        }

        let balance: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::Balance(stealth_pubkey.clone()))
            .unwrap_or(0);

        if balance <= 0 {
            panic!("No funds available for this stealth address");
        }

        // Verify signature over the withdrawal parameters
        let mut payload = Bytes::new(&env);
        payload.append(&env.current_contract_address().to_xdr(&env));
        payload.append(&token.clone().to_xdr(&env));
        payload.append(&destination.clone().to_xdr(&env));
        payload.append(&relayer.clone().to_xdr(&env));

        env.crypto()
            .ed25519_verify(&stealth_pubkey, &payload, &signature);

        // Zero out the balance to prevent re-entrancy/double withdrawal
        env.storage()
            .persistent()
            .remove(&DataKey::Balance(stealth_pubkey));

        // Calculate 0.5% fee (5/1000)
        let fee: i128 = (balance * 5) / 1000;
        let transfer_amount: i128 = balance - fee;

        let token_client = token::Client::new(&env, &token);

        // Transfer the 0.5% fee to the relayer
        if fee > 0 {
            token_client.transfer(&env.current_contract_address(), &relayer, &fee);
        }

        // Transfer the remaining funds to the specified destination
        if transfer_amount > 0 {
            token_client.transfer(
                &env.current_contract_address(),
                &destination,
                &transfer_amount,
            );
        }

        // ── PCS Reward Minting (Inter-Contract Call) ──────────────────────
        // Mint PCS tokens to the destination as a reward.
        // reward = fee * reward_multiplier
        let pcs_token_opt: Option<Address> = env.storage().instance().get(&DataKey::PCSToken);
        let multiplier: i128 = env
            .storage()
            .instance()
            .get(&DataKey::RewardMultiplier)
            .unwrap_or(10);

        if let Some(pcs_token) = pcs_token_opt {
            if fee > 0 && multiplier > 0 {
                let reward = fee * multiplier;

                // Inter-contract call: invoke PCS token's mint function
                // mint(minter: Address, to: Address, amount: i128)
                // The stealth contract (self) is an authorized minter on the PCS token
                let mint_fn = Symbol::new(&env, "mint");
                let args: Vec<Val> = Vec::from_array(
                    &env,
                    [
                        env.current_contract_address().into_val(&env),
                        destination.clone().into_val(&env),
                        reward.into_val(&env),
                    ],
                );
                env.invoke_contract::<()>(&pcs_token, &mint_fn, args);

                // Emit reward event
                env.events().publish(
                    (
                        Symbol::new(&env, "stealth"),
                        Symbol::new(&env, "pcs_reward"),
                    ),
                    (destination.clone(), reward),
                );
            }
        }

        // Emit withdrawal event
        env.events().publish(
            (Symbol::new(&env, "stealth"), Symbol::new(&env, "withdraw")),
            (destination, transfer_amount, fee),
        );
    }

    /// Helper to compute the signature payload (useful for debugging).
    pub fn test_payload(env: Env, token: Address, destination: Address, relayer: Address) -> Bytes {
        let mut payload = Bytes::new(&env);
        payload.append(&env.current_contract_address().to_xdr(&env));
        payload.append(&token.clone().to_xdr(&env));
        payload.append(&destination.clone().to_xdr(&env));
        payload.append(&relayer.clone().to_xdr(&env));
        payload
    }

    // ── View Functions ────────────────────────────────────────────────────

    /// Get the balance stored for a stealth public key.
    pub fn get_balance(env: Env, stealth_pubkey: BytesN<32>) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Balance(stealth_pubkey))
            .unwrap_or(0)
    }

    /// Get the PCS token address.
    pub fn get_pcs_token(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::PCSToken)
            .expect("not initialized")
    }

    /// Get the current reward multiplier.
    pub fn get_reward_multiplier(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::RewardMultiplier)
            .unwrap_or(10)
    }

    /// Check if the contract is paused.
    pub fn is_paused(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false)
    }

    // ── Admin Functions ───────────────────────────────────────────────────

    /// Pause the contract. Only callable by admin.
    pub fn pause(env: Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("not initialized");
        admin.require_auth();
        env.storage().instance().set(&DataKey::Paused, &true);
    }

    /// Unpause the contract. Only callable by admin.
    pub fn unpause(env: Env) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("not initialized");
        admin.require_auth();
        env.storage().instance().set(&DataKey::Paused, &false);
    }

    /// Update the reward multiplier. Only callable by admin.
    pub fn set_reward_multiplier(env: Env, new_multiplier: i128) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("not initialized");
        admin.require_auth();
        env.storage()
            .instance()
            .set(&DataKey::RewardMultiplier, &new_multiplier);
    }
}

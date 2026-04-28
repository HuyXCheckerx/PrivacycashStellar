#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env, Symbol};

#[cfg(test)]
mod test;

// ── Storage Keys ──────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    TokenA,
    TokenB,
    ReserveA,
    ReserveB,
    TotalShares,
    Shares(Address),
    Initialized,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct LiquidityPool;

// ── Helpers ───────────────────────────────────────────────────────────────────

fn get_reserve_a(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get(&DataKey::ReserveA)
        .unwrap_or(0)
}

fn get_reserve_b(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get(&DataKey::ReserveB)
        .unwrap_or(0)
}

fn get_total_shares(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get(&DataKey::TotalShares)
        .unwrap_or(0)
}

fn get_shares(env: &Env, addr: &Address) -> i128 {
    env.storage()
        .persistent()
        .get(&DataKey::Shares(addr.clone()))
        .unwrap_or(0)
}

fn set_shares(env: &Env, addr: &Address, amount: i128) {
    env.storage()
        .persistent()
        .set(&DataKey::Shares(addr.clone()), &amount);
    env.storage()
        .persistent()
        .extend_ttl(&DataKey::Shares(addr.clone()), 518400, 518400);
}

/// Integer square root using Newton's method (no floating point in no_std)
fn isqrt(n: i128) -> i128 {
    if n <= 0 {
        return 0;
    }
    if n == 1 {
        return 1;
    }
    let mut x = n;
    let mut y = (x + 1) / 2;
    while y < x {
        x = y;
        y = (x + n / x) / 2;
    }
    x
}

fn min(a: i128, b: i128) -> i128 {
    if a < b {
        a
    } else {
        b
    }
}

// ── Implementation ────────────────────────────────────────────────────────────

#[contractimpl]
impl LiquidityPool {
    /// Initialize the pool with two token addresses (e.g. PCS and XLM).
    pub fn initialize(env: Env, token_a: Address, token_b: Address) {
        if env.storage().instance().has(&DataKey::Initialized) {
            panic!("already initialized");
        }

        env.storage().instance().set(&DataKey::TokenA, &token_a);
        env.storage().instance().set(&DataKey::TokenB, &token_b);
        env.storage().instance().set(&DataKey::ReserveA, &0i128);
        env.storage().instance().set(&DataKey::ReserveB, &0i128);
        env.storage().instance().set(&DataKey::TotalShares, &0i128);
        env.storage().instance().set(&DataKey::Initialized, &true);
    }

    /// Add liquidity to the pool. Returns LP shares minted.
    pub fn add_liquidity(env: Env, depositor: Address, amount_a: i128, amount_b: i128) -> i128 {
        depositor.require_auth();

        if amount_a <= 0 || amount_b <= 0 {
            panic!("amounts must be positive");
        }

        let token_a: Address = env.storage().instance().get(&DataKey::TokenA).unwrap();
        let token_b: Address = env.storage().instance().get(&DataKey::TokenB).unwrap();
        let reserve_a = get_reserve_a(&env);
        let reserve_b = get_reserve_b(&env);
        let total_shares = get_total_shares(&env);
        let pool_addr = env.current_contract_address();

        // Transfer tokens from depositor to pool
        let client_a = token::Client::new(&env, &token_a);
        let client_b = token::Client::new(&env, &token_b);
        client_a.transfer(&depositor, &pool_addr, &amount_a);
        client_b.transfer(&depositor, &pool_addr, &amount_b);

        // Calculate shares to mint
        let shares = if total_shares == 0 {
            // First deposit: shares = sqrt(amount_a * amount_b)
            isqrt(amount_a * amount_b)
        } else {
            // Proportional to existing reserves
            min(
                (amount_a * total_shares) / reserve_a,
                (amount_b * total_shares) / reserve_b,
            )
        };

        if shares <= 0 {
            panic!("insufficient liquidity minted");
        }

        // Update state
        env.storage()
            .instance()
            .set(&DataKey::ReserveA, &(reserve_a + amount_a));
        env.storage()
            .instance()
            .set(&DataKey::ReserveB, &(reserve_b + amount_b));
        env.storage()
            .instance()
            .set(&DataKey::TotalShares, &(total_shares + shares));

        let current_shares = get_shares(&env, &depositor);
        set_shares(&env, &depositor, current_shares + shares);

        env.events().publish(
            (Symbol::new(&env, "add_liquidity"), depositor.clone()),
            (amount_a, amount_b, shares),
        );

        shares
    }

    /// Remove liquidity from the pool. Returns (amount_a, amount_b) withdrawn.
    pub fn remove_liquidity(env: Env, provider: Address, share_amount: i128) -> (i128, i128) {
        provider.require_auth();

        if share_amount <= 0 {
            panic!("share amount must be positive");
        }

        let token_a: Address = env.storage().instance().get(&DataKey::TokenA).unwrap();
        let token_b: Address = env.storage().instance().get(&DataKey::TokenB).unwrap();
        let reserve_a = get_reserve_a(&env);
        let reserve_b = get_reserve_b(&env);
        let total_shares = get_total_shares(&env);

        let user_shares = get_shares(&env, &provider);
        if user_shares < share_amount {
            panic!("insufficient shares");
        }

        // Calculate proportional amounts
        let amount_a = (share_amount * reserve_a) / total_shares;
        let amount_b = (share_amount * reserve_b) / total_shares;

        if amount_a <= 0 || amount_b <= 0 {
            panic!("insufficient liquidity burned");
        }

        // Update state
        env.storage()
            .instance()
            .set(&DataKey::ReserveA, &(reserve_a - amount_a));
        env.storage()
            .instance()
            .set(&DataKey::ReserveB, &(reserve_b - amount_b));
        env.storage()
            .instance()
            .set(&DataKey::TotalShares, &(total_shares - share_amount));
        set_shares(&env, &provider, user_shares - share_amount);

        // Transfer tokens back
        let pool_addr = env.current_contract_address();
        let client_a = token::Client::new(&env, &token_a);
        let client_b = token::Client::new(&env, &token_b);
        client_a.transfer(&pool_addr, &provider, &amount_a);
        client_b.transfer(&pool_addr, &provider, &amount_b);

        env.events().publish(
            (Symbol::new(&env, "remove_liquidity"), provider.clone()),
            (amount_a, amount_b, share_amount),
        );

        (amount_a, amount_b)
    }

    /// Swap one token for the other. Uses constant product (x*y=k) with 0.3% fee.
    /// Returns amount of output token received.
    pub fn swap(
        env: Env,
        user: Address,
        token_in: Address,
        amount_in: i128,
        min_amount_out: i128,
    ) -> i128 {
        user.require_auth();

        if amount_in <= 0 {
            panic!("amount must be positive");
        }

        let token_a: Address = env.storage().instance().get(&DataKey::TokenA).unwrap();
        let token_b: Address = env.storage().instance().get(&DataKey::TokenB).unwrap();
        let reserve_a = get_reserve_a(&env);
        let reserve_b = get_reserve_b(&env);

        // Determine direction
        let (reserve_in, reserve_out, token_out, is_a_to_b) = if token_in == token_a {
            (reserve_a, reserve_b, token_b.clone(), true)
        } else if token_in == token_b {
            (reserve_b, reserve_a, token_a.clone(), false)
        } else {
            panic!("invalid token");
        };

        // Constant product formula with 0.3% fee
        // amount_out = (amount_in * 997 * reserve_out) / (reserve_in * 1000 + amount_in * 997)
        let amount_in_with_fee = amount_in * 997;
        let numerator = amount_in_with_fee * reserve_out;
        let denominator = reserve_in * 1000 + amount_in_with_fee;
        let amount_out = numerator / denominator;

        if amount_out < min_amount_out {
            panic!("slippage exceeded");
        }

        if amount_out <= 0 {
            panic!("insufficient output amount");
        }

        // Transfer tokens
        let pool_addr = env.current_contract_address();
        let client_in = token::Client::new(&env, &token_in);
        let client_out = token::Client::new(&env, &token_out);

        client_in.transfer(&user, &pool_addr, &amount_in);
        client_out.transfer(&pool_addr, &user, &amount_out);

        // Update reserves
        if is_a_to_b {
            env.storage()
                .instance()
                .set(&DataKey::ReserveA, &(reserve_a + amount_in));
            env.storage()
                .instance()
                .set(&DataKey::ReserveB, &(reserve_b - amount_out));
        } else {
            env.storage()
                .instance()
                .set(&DataKey::ReserveB, &(reserve_b + amount_in));
            env.storage()
                .instance()
                .set(&DataKey::ReserveA, &(reserve_a - amount_out));
        }

        env.events().publish(
            (Symbol::new(&env, "swap"), user.clone()),
            (token_in, amount_in, amount_out),
        );

        amount_out
    }

    // ── View Functions ────────────────────────────────────────────────────

    /// Get current reserves (reserve_a, reserve_b).
    pub fn get_reserves(env: Env) -> (i128, i128) {
        (get_reserve_a(&env), get_reserve_b(&env))
    }

    /// Get LP share balance for an address.
    pub fn get_shares(env: Env, addr: Address) -> i128 {
        get_shares(&env, &addr)
    }

    /// Get total LP shares outstanding.
    pub fn get_total_shares(env: Env) -> i128 {
        get_total_shares(&env)
    }

    /// Preview swap output (view only, no state change).
    pub fn quote(env: Env, token_in: Address, amount_in: i128) -> i128 {
        let token_a: Address = env.storage().instance().get(&DataKey::TokenA).unwrap();
        let token_b: Address = env.storage().instance().get(&DataKey::TokenB).unwrap();
        let reserve_a = get_reserve_a(&env);
        let reserve_b = get_reserve_b(&env);

        let (reserve_in, reserve_out) = if token_in == token_a {
            (reserve_a, reserve_b)
        } else if token_in == token_b {
            (reserve_b, reserve_a)
        } else {
            panic!("invalid token");
        };

        let amount_in_with_fee = amount_in * 997;
        let numerator = amount_in_with_fee * reserve_out;
        let denominator = reserve_in * 1000 + amount_in_with_fee;
        numerator / denominator
    }

    /// Get the token addresses.
    pub fn get_tokens(env: Env) -> (Address, Address) {
        let token_a: Address = env.storage().instance().get(&DataKey::TokenA).unwrap();
        let token_b: Address = env.storage().instance().get(&DataKey::TokenB).unwrap();
        (token_a, token_b)
    }
}

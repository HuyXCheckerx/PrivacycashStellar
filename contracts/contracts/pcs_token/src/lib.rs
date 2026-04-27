#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror, token, Address, Env, String, Symbol,
};

#[cfg(test)]
mod test;

// ── Storage Keys ──────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Minter(Address),
    Balance(Address),
    Allowance(AllowanceKey),
    Name,
    Symbol,
    Decimals,
    TotalSupply,
}

#[contracttype]
#[derive(Clone)]
pub struct AllowanceKey {
    pub from: Address,
    pub spender: Address,
}

// ── Errors ────────────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum TokenError {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    Unauthorized = 3,
    InsufficientBalance = 4,
    InsufficientAllowance = 5,
    InvalidAmount = 6,
}

// ── Contract ──────────────────────────────────────────────────────────────────

#[contract]
pub struct PCSToken;

// ── Helpers ───────────────────────────────────────────────────────────────────

fn get_balance(env: &Env, addr: &Address) -> i128 {
    env.storage()
        .persistent()
        .get(&DataKey::Balance(addr.clone()))
        .unwrap_or(0)
}

fn set_balance(env: &Env, addr: &Address, amount: i128) {
    env.storage()
        .persistent()
        .set(&DataKey::Balance(addr.clone()), &amount);
    env.storage()
        .persistent()
        .extend_ttl(&DataKey::Balance(addr.clone()), 518400, 518400);
}

fn get_allowance(env: &Env, from: &Address, spender: &Address) -> i128 {
    let key = DataKey::Allowance(AllowanceKey {
        from: from.clone(),
        spender: spender.clone(),
    });
    env.storage().persistent().get(&key).unwrap_or(0)
}

fn set_allowance(env: &Env, from: &Address, spender: &Address, amount: i128) {
    let key = DataKey::Allowance(AllowanceKey {
        from: from.clone(),
        spender: spender.clone(),
    });
    env.storage().persistent().set(&key, &amount);
    env.storage().persistent().extend_ttl(&key, 518400, 518400);
}

fn get_admin(env: &Env) -> Address {
    env.storage()
        .instance()
        .get(&DataKey::Admin)
        .expect("not initialized")
}

fn get_total_supply(env: &Env) -> i128 {
    env.storage()
        .instance()
        .get(&DataKey::TotalSupply)
        .unwrap_or(0)
}

fn set_total_supply(env: &Env, amount: i128) {
    env.storage().instance().set(&DataKey::TotalSupply, &amount);
}

fn is_minter(env: &Env, addr: &Address) -> bool {
    env.storage()
        .persistent()
        .get(&DataKey::Minter(addr.clone()))
        .unwrap_or(false)
}

// ── Implementation ────────────────────────────────────────────────────────────

#[contractimpl]
impl PCSToken {
    /// Initialize the PCS token. Can only be called once.
    pub fn initialize(env: Env, admin: Address, decimals: u32, name: String, symbol: String) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Decimals, &decimals);
        env.storage().instance().set(&DataKey::Name, &name);
        env.storage().instance().set(&DataKey::Symbol, &symbol);
        env.storage().instance().set(&DataKey::TotalSupply, &0i128);
    }

    /// Add an authorized minter. Only callable by admin.
    pub fn add_minter(env: Env, minter: Address) {
        let admin = get_admin(&env);
        admin.require_auth();

        env.storage()
            .persistent()
            .set(&DataKey::Minter(minter.clone()), &true);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Minter(minter), 518400, 518400);
    }

    /// Remove an authorized minter. Only callable by admin.
    pub fn remove_minter(env: Env, minter: Address) {
        let admin = get_admin(&env);
        admin.require_auth();

        env.storage()
            .persistent()
            .remove(&DataKey::Minter(minter));
    }

    /// Mint new PCS tokens. Only callable by admin or authorized minters.
    pub fn mint(env: Env, minter: Address, to: Address, amount: i128) {
        if amount <= 0 {
            panic!("invalid amount");
        }

        minter.require_auth();

        // Check authorization: must be admin or an authorized minter
        let admin = get_admin(&env);
        if minter != admin && !is_minter(&env, &minter) {
            panic!("unauthorized minter");
        }

        let balance = get_balance(&env, &to);
        set_balance(&env, &to, balance + amount);

        let supply = get_total_supply(&env);
        set_total_supply(&env, supply + amount);

        env.events()
            .publish((Symbol::new(&env, "mint"), to.clone()), amount);
    }

    // ── Standard Token Interface ──────────────────────────────────────────

    pub fn allowance(env: Env, from: Address, spender: Address) -> i128 {
        get_allowance(&env, &from, &spender)
    }

    pub fn approve(env: Env, from: Address, spender: Address, amount: i128, _expiration_ledger: u32) {
        from.require_auth();
        set_allowance(&env, &from, &spender, amount);

        env.events()
            .publish((Symbol::new(&env, "approve"), from.clone()), amount);
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        get_balance(&env, &id)
    }

    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();

        if amount <= 0 {
            panic!("invalid amount");
        }

        let from_bal = get_balance(&env, &from);
        if from_bal < amount {
            panic!("insufficient balance");
        }

        set_balance(&env, &from, from_bal - amount);
        let to_bal = get_balance(&env, &to);
        set_balance(&env, &to, to_bal + amount);

        env.events()
            .publish((Symbol::new(&env, "transfer"), from.clone()), amount);
    }

    pub fn transfer_from(env: Env, spender: Address, from: Address, to: Address, amount: i128) {
        spender.require_auth();

        if amount <= 0 {
            panic!("invalid amount");
        }

        let allowance = get_allowance(&env, &from, &spender);
        if allowance < amount {
            panic!("insufficient allowance");
        }

        let from_bal = get_balance(&env, &from);
        if from_bal < amount {
            panic!("insufficient balance");
        }

        set_allowance(&env, &from, &spender, allowance - amount);
        set_balance(&env, &from, from_bal - amount);
        let to_bal = get_balance(&env, &to);
        set_balance(&env, &to, to_bal + amount);

        env.events()
            .publish((Symbol::new(&env, "transfer"), from.clone()), amount);
    }

    pub fn burn(env: Env, from: Address, amount: i128) {
        from.require_auth();

        if amount <= 0 {
            panic!("invalid amount");
        }

        let balance = get_balance(&env, &from);
        if balance < amount {
            panic!("insufficient balance");
        }

        set_balance(&env, &from, balance - amount);

        let supply = get_total_supply(&env);
        set_total_supply(&env, supply - amount);

        env.events()
            .publish((Symbol::new(&env, "burn"), from.clone()), amount);
    }

    pub fn burn_from(env: Env, spender: Address, from: Address, amount: i128) {
        spender.require_auth();

        if amount <= 0 {
            panic!("invalid amount");
        }

        let allowance = get_allowance(&env, &from, &spender);
        if allowance < amount {
            panic!("insufficient allowance");
        }

        let balance = get_balance(&env, &from);
        if balance < amount {
            panic!("insufficient balance");
        }

        set_allowance(&env, &from, &spender, allowance - amount);
        set_balance(&env, &from, balance - amount);

        let supply = get_total_supply(&env);
        set_total_supply(&env, supply - amount);

        env.events()
            .publish((Symbol::new(&env, "burn"), from.clone()), amount);
    }

    pub fn decimals(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::Decimals)
            .unwrap_or(7)
    }

    pub fn name(env: Env) -> String {
        env.storage()
            .instance()
            .get(&DataKey::Name)
            .unwrap_or(String::from_str(&env, "PrivacyCashStellar"))
    }

    pub fn symbol(env: Env) -> String {
        env.storage()
            .instance()
            .get(&DataKey::Symbol)
            .unwrap_or(String::from_str(&env, "PCS"))
    }

    // ── View Functions ────────────────────────────────────────────────────

    pub fn total_supply(env: Env) -> i128 {
        get_total_supply(&env)
    }

    pub fn is_minter(env: Env, addr: Address) -> bool {
        is_minter(&env, &addr)
    }
}

#![cfg(test)]

use super::*;
use soroban_sdk::token::{Client as TokenClient, StellarAssetClient};
use soroban_sdk::{testutils::Address as _, Address, Env};

#[allow(deprecated)]
fn create_token<'a>(env: &Env, admin: &Address) -> (TokenClient<'a>, StellarAssetClient<'a>) {
    let addr = env.register_stellar_asset_contract(admin.clone());
    (
        TokenClient::new(env, &addr),
        StellarAssetClient::new(env, &addr),
    )
}

#[test]
fn test_add_liquidity_and_swap() {
    let env = Env::default();
    env.mock_all_auths();

    let pool_id = env.register(LiquidityPool, ());
    let pool_client = LiquidityPoolClient::new(&env, &pool_id);

    let admin = Address::generate(&env);
    let (token_a, token_a_admin) = create_token(&env, &admin);
    let (token_b, token_b_admin) = create_token(&env, &admin);

    pool_client.initialize(&token_a.address, &token_b.address);

    let alice = Address::generate(&env);
    token_a_admin.mint(&alice, &10000);
    token_b_admin.mint(&alice, &10000);

    // Add liquidity: 1000 A + 1000 B
    let shares = pool_client.add_liquidity(&alice, &1000, &1000);
    assert!(shares > 0);

    let (ra, rb) = pool_client.get_reserves();
    assert_eq!(ra, 1000);
    assert_eq!(rb, 1000);

    // Swap 100 A for B
    let bob = Address::generate(&env);
    token_a_admin.mint(&bob, &1000);

    let out = pool_client.swap(&bob, &token_a.address, &100, &1);
    assert!(out > 0);
    // With 0.3% fee and constant product: expected ~90 tokens out
    assert!(out > 80 && out < 100);

    assert_eq!(token_b.balance(&bob), out);
}

#[test]
fn test_remove_liquidity() {
    let env = Env::default();
    env.mock_all_auths();

    let pool_id = env.register(LiquidityPool, ());
    let pool_client = LiquidityPoolClient::new(&env, &pool_id);

    let admin = Address::generate(&env);
    let (token_a, token_a_admin) = create_token(&env, &admin);
    let (token_b, token_b_admin) = create_token(&env, &admin);

    pool_client.initialize(&token_a.address, &token_b.address);

    let alice = Address::generate(&env);
    token_a_admin.mint(&alice, &10000);
    token_b_admin.mint(&alice, &10000);

    let shares = pool_client.add_liquidity(&alice, &1000, &1000);

    // Remove all liquidity
    let (amount_a, amount_b) = pool_client.remove_liquidity(&alice, &shares);
    assert_eq!(amount_a, 1000);
    assert_eq!(amount_b, 1000);

    let (ra, rb) = pool_client.get_reserves();
    assert_eq!(ra, 0);
    assert_eq!(rb, 0);
}

#[test]
fn test_quote() {
    let env = Env::default();
    env.mock_all_auths();

    let pool_id = env.register(LiquidityPool, ());
    let pool_client = LiquidityPoolClient::new(&env, &pool_id);

    let admin = Address::generate(&env);
    let (token_a, token_a_admin) = create_token(&env, &admin);
    let (token_b, token_b_admin) = create_token(&env, &admin);

    pool_client.initialize(&token_a.address, &token_b.address);

    let alice = Address::generate(&env);
    token_a_admin.mint(&alice, &100000);
    token_b_admin.mint(&alice, &100000);
    pool_client.add_liquidity(&alice, &10000, &10000);

    // Quote should match actual swap output
    let quoted = pool_client.quote(&token_a.address, &100);
    assert!(quoted > 0);

    let bob = Address::generate(&env);
    token_a_admin.mint(&bob, &100);
    let actual = pool_client.swap(&bob, &token_a.address, &100, &1);
    assert_eq!(quoted, actual);
}

#[test]
#[should_panic(expected = "slippage exceeded")]
fn test_slippage_protection() {
    let env = Env::default();
    env.mock_all_auths();

    let pool_id = env.register(LiquidityPool, ());
    let pool_client = LiquidityPoolClient::new(&env, &pool_id);

    let admin = Address::generate(&env);
    let (token_a, token_a_admin) = create_token(&env, &admin);
    let (token_b, token_b_admin) = create_token(&env, &admin);

    pool_client.initialize(&token_a.address, &token_b.address);

    let alice = Address::generate(&env);
    token_a_admin.mint(&alice, &100000);
    token_b_admin.mint(&alice, &100000);
    pool_client.add_liquidity(&alice, &1000, &1000);

    // Try to swap with unreasonably high min_amount_out
    let bob = Address::generate(&env);
    token_a_admin.mint(&bob, &100);
    pool_client.swap(&bob, &token_a.address, &100, &99999);
}

#[test]
fn test_multiple_liquidity_providers() {
    let env = Env::default();
    env.mock_all_auths();

    let pool_id = env.register(LiquidityPool, ());
    let pool_client = LiquidityPoolClient::new(&env, &pool_id);

    let admin = Address::generate(&env);
    let (token_a, token_a_admin) = create_token(&env, &admin);
    let (token_b, token_b_admin) = create_token(&env, &admin);

    pool_client.initialize(&token_a.address, &token_b.address);

    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    token_a_admin.mint(&alice, &100000);
    token_b_admin.mint(&alice, &100000);
    token_a_admin.mint(&bob, &100000);
    token_b_admin.mint(&bob, &100000);

    // Alice adds first
    let shares_a = pool_client.add_liquidity(&alice, &1000, &1000);
    assert!(shares_a > 0);

    // Bob adds proportionally
    let shares_b = pool_client.add_liquidity(&bob, &500, &500);
    assert!(shares_b > 0);

    let total = pool_client.get_total_shares();
    assert_eq!(total, shares_a + shares_b);
}

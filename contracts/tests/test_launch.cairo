use droptron_contracts::launch::{IDroptronLaunchDispatcher, IDroptronLaunchDispatcherTrait};
use droptron_contracts::mock_token::{IMockTokenDispatcher, IMockTokenDispatcherTrait};
use droptron_contracts::reentrant_token::{
    IReentrantTokenDispatcher, IReentrantTokenDispatcherTrait,
};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_block_timestamp,
    start_cheat_caller_address, stop_cheat_caller_address,
};
use starknet::ContractAddress;

const WAD: u256 = 1000000000000000000;
const OWNER_FELT: felt252 = 0x111;
const BUYER_FELT: felt252 = 0x222;
const START: u64 = 100;
const END: u64 = 200;

fn address(value: felt252) -> ContractAddress {
    value.try_into().unwrap()
}

fn deploy_token() -> ContractAddress {
    let class = declare("MockToken").unwrap().contract_class();
    let calldata = ArrayTrait::new();
    class.deploy(@calldata).unwrap().0
}

fn deploy_reentrant_token() -> ContractAddress {
    let class = declare("ReentrantToken").unwrap().contract_class();
    let calldata = ArrayTrait::new();
    class.deploy(@calldata).unwrap().0
}

fn deploy_launch(
    owner: ContractAddress,
    sale_token: ContractAddress,
    payment_token: ContractAddress,
    allocation: u256,
    raise_limit: u256,
) -> ContractAddress {
    let class = declare("DroptronLaunch").unwrap().contract_class();
    let mut calldata = ArrayTrait::new();
    owner.serialize(ref calldata);
    sale_token.serialize(ref calldata);
    payment_token.serialize(ref calldata);
    18_u8.serialize(ref calldata);
    18_u8.serialize(ref calldata);
    0_u8.serialize(ref calldata);
    (2 * WAD).serialize(ref calldata);
    0_u256.serialize(ref calldata);
    allocation.serialize(ref calldata);
    raise_limit.serialize(ref calldata);
    START.serialize(ref calldata);
    END.serialize(ref calldata);
    class.deploy(@calldata).unwrap().0
}

fn deploy_linear_launch(
    owner: ContractAddress,
    sale_token: ContractAddress,
    payment_token: ContractAddress,
    allocation: u256,
    raise_limit: u256,
) -> ContractAddress {
    let class = declare("DroptronLaunch").unwrap().contract_class();
    let mut calldata = ArrayTrait::new();
    owner.serialize(ref calldata);
    sale_token.serialize(ref calldata);
    payment_token.serialize(ref calldata);
    18_u8.serialize(ref calldata);
    18_u8.serialize(ref calldata);
    1_u8.serialize(ref calldata);
    (2 * WAD).serialize(ref calldata);
    WAD.serialize(ref calldata);
    allocation.serialize(ref calldata);
    raise_limit.serialize(ref calldata);
    START.serialize(ref calldata);
    END.serialize(ref calldata);
    class.deploy(@calldata).unwrap().0
}

fn mint_and_approve(
    token_address: ContractAddress, owner: ContractAddress, spender: ContractAddress, amount: u256,
) {
    let token = IMockTokenDispatcher { contract_address: token_address };
    token.mint(owner, amount);
    start_cheat_caller_address(token_address, owner);
    assert(token.approve(spender, amount), 'APPROVAL_FAILED');
    stop_cheat_caller_address(token_address);
}

#[test]
fn owner_funds_exact_sale_allocation() {
    let owner = address(OWNER_FELT);
    let sale_token_address = deploy_token();
    let payment_token_address = deploy_token();
    let allocation = 100 * WAD;
    let launch_address = deploy_launch(
        owner, sale_token_address, payment_token_address, allocation, 500 * WAD,
    );
    mint_and_approve(sale_token_address, owner, launch_address, allocation);

    start_cheat_caller_address(launch_address, owner);
    let launch = IDroptronLaunchDispatcher { contract_address: launch_address };
    launch.fund();

    let sale = IMockTokenDispatcher { contract_address: sale_token_address };
    assert(launch.is_funded(), 'LAUNCH_NOT_FUNDED');
    assert(sale.balance_of(launch_address) == allocation, 'BAD_LAUNCH_BALANCE');
    assert(sale.balance_of(owner) == 0, 'BAD_OWNER_BALANCE');
}

#[test]
fn active_buyer_pays_quote_and_receives_sale_tokens() {
    let owner = address(OWNER_FELT);
    let buyer = address(BUYER_FELT);
    let sale_token_address = deploy_token();
    let payment_token_address = deploy_token();
    let allocation = 100 * WAD;
    let launch_address = deploy_launch(
        owner, sale_token_address, payment_token_address, allocation, 500 * WAD,
    );
    mint_and_approve(sale_token_address, owner, launch_address, allocation);
    start_cheat_caller_address(launch_address, owner);
    let launch = IDroptronLaunchDispatcher { contract_address: launch_address };
    launch.fund();

    let purchase = 3 * WAD;
    let expected_payment = 6 * WAD;
    mint_and_approve(payment_token_address, buyer, launch_address, expected_payment);
    start_cheat_caller_address(launch_address, buyer);
    start_cheat_block_timestamp(launch_address, 150);
    let paid = launch.buy_exact_sale(purchase, expected_payment);

    let sale = IMockTokenDispatcher { contract_address: sale_token_address };
    let payment = IMockTokenDispatcher { contract_address: payment_token_address };
    assert(paid == expected_payment, 'BAD_PAYMENT_RETURN');
    assert(launch.sold() == purchase, 'BAD_SOLD_TOTAL');
    assert(launch.raised() == expected_payment, 'BAD_RAISED_TOTAL');
    assert(sale.balance_of(buyer) == purchase, 'BUYER_NOT_DELIVERED');
    assert(payment.balance_of(launch_address) == expected_payment, 'PAYMENT_NOT_COLLECTED');
}

#[test]
#[should_panic(expected: 'OWNER_ONLY')]
fn non_owner_cannot_fund_launch() {
    let owner = address(OWNER_FELT);
    let buyer = address(BUYER_FELT);
    let sale_token_address = deploy_token();
    let payment_token_address = deploy_token();
    let allocation = 10 * WAD;
    let launch_address = deploy_launch(
        owner, sale_token_address, payment_token_address, allocation, 50 * WAD,
    );
    mint_and_approve(sale_token_address, owner, launch_address, allocation);
    start_cheat_caller_address(launch_address, buyer);
    IDroptronLaunchDispatcher { contract_address: launch_address }.fund();
}

#[test]
#[should_panic(expected: 'NOT_ACTIVE')]
fn purchase_before_start_is_rejected() {
    let owner = address(OWNER_FELT);
    let buyer = address(BUYER_FELT);
    let sale_token_address = deploy_token();
    let payment_token_address = deploy_token();
    let allocation = 10 * WAD;
    let launch_address = deploy_launch(
        owner, sale_token_address, payment_token_address, allocation, 50 * WAD,
    );
    mint_and_approve(sale_token_address, owner, launch_address, allocation);
    start_cheat_caller_address(launch_address, owner);
    let launch = IDroptronLaunchDispatcher { contract_address: launch_address };
    launch.fund();
    mint_and_approve(payment_token_address, buyer, launch_address, 2 * WAD);
    start_cheat_caller_address(launch_address, buyer);
    start_cheat_block_timestamp(launch_address, START - 1);
    launch.buy_exact_sale(WAD, 2 * WAD);
}

#[test]
#[should_panic(expected: 'SLIPPAGE')]
fn payment_above_buyer_limit_is_rejected() {
    let owner = address(OWNER_FELT);
    let buyer = address(BUYER_FELT);
    let sale_token_address = deploy_token();
    let payment_token_address = deploy_token();
    let allocation = 10 * WAD;
    let launch_address = deploy_launch(
        owner, sale_token_address, payment_token_address, allocation, 50 * WAD,
    );
    mint_and_approve(sale_token_address, owner, launch_address, allocation);
    start_cheat_caller_address(launch_address, owner);
    let launch = IDroptronLaunchDispatcher { contract_address: launch_address };
    launch.fund();
    mint_and_approve(payment_token_address, buyer, launch_address, 2 * WAD);
    start_cheat_caller_address(launch_address, buyer);
    start_cheat_block_timestamp(launch_address, 150);
    launch.buy_exact_sale(WAD, 2 * WAD - 1);
}

#[test]
fn cancellation_returns_the_funded_sale_allocation() {
    let owner = address(OWNER_FELT);
    let sale_token_address = deploy_token();
    let payment_token_address = deploy_token();
    let allocation = 10 * WAD;
    let launch_address = deploy_launch(
        owner, sale_token_address, payment_token_address, allocation, 50 * WAD,
    );
    mint_and_approve(sale_token_address, owner, launch_address, allocation);
    start_cheat_caller_address(launch_address, owner);
    let launch = IDroptronLaunchDispatcher { contract_address: launch_address };
    launch.fund();
    launch.cancel();

    let sale = IMockTokenDispatcher { contract_address: sale_token_address };
    assert(launch.is_cancelled(), 'LAUNCH_NOT_CANCELLED');
    assert(sale.balance_of(owner) == allocation, 'OWNER_NOT_REFUNDED');
    assert(sale.balance_of(launch_address) == 0, 'TOKENS_STILL_LOCKED');
}

#[test]
#[should_panic(expected: 'ALLOCATION_EXCEEDED')]
fn purchase_above_sale_allocation_is_rejected() {
    let owner = address(OWNER_FELT);
    let buyer = address(BUYER_FELT);
    let sale_token_address = deploy_token();
    let payment_token_address = deploy_token();
    let allocation = 2 * WAD;
    let launch_address = deploy_launch(
        owner, sale_token_address, payment_token_address, allocation, 50 * WAD,
    );
    mint_and_approve(sale_token_address, owner, launch_address, allocation);
    start_cheat_caller_address(launch_address, owner);
    let launch = IDroptronLaunchDispatcher { contract_address: launch_address };
    launch.fund();
    mint_and_approve(payment_token_address, buyer, launch_address, 6 * WAD);
    start_cheat_caller_address(launch_address, buyer);
    start_cheat_block_timestamp(launch_address, 150);
    launch.buy_exact_sale(3 * WAD, 6 * WAD);
}

#[test]
#[should_panic(expected: 'RAISE_LIMIT_EXCEEDED')]
fn purchase_above_raise_limit_is_rejected() {
    let owner = address(OWNER_FELT);
    let buyer = address(BUYER_FELT);
    let sale_token_address = deploy_token();
    let payment_token_address = deploy_token();
    let allocation = 10 * WAD;
    let launch_address = deploy_launch(
        owner, sale_token_address, payment_token_address, allocation, 3 * WAD,
    );
    mint_and_approve(sale_token_address, owner, launch_address, allocation);
    start_cheat_caller_address(launch_address, owner);
    let launch = IDroptronLaunchDispatcher { contract_address: launch_address };
    launch.fund();
    mint_and_approve(payment_token_address, buyer, launch_address, 4 * WAD);
    start_cheat_caller_address(launch_address, buyer);
    start_cheat_block_timestamp(launch_address, 150);
    launch.buy_exact_sale(2 * WAD, 4 * WAD);
}

#[test]
#[should_panic(expected: 'SALE_STARTED')]
fn owner_cannot_cancel_after_a_purchase() {
    let owner = address(OWNER_FELT);
    let buyer = address(BUYER_FELT);
    let sale_token_address = deploy_token();
    let payment_token_address = deploy_token();
    let allocation = 10 * WAD;
    let launch_address = deploy_launch(
        owner, sale_token_address, payment_token_address, allocation, 50 * WAD,
    );
    mint_and_approve(sale_token_address, owner, launch_address, allocation);
    start_cheat_caller_address(launch_address, owner);
    let launch = IDroptronLaunchDispatcher { contract_address: launch_address };
    launch.fund();
    mint_and_approve(payment_token_address, buyer, launch_address, 2 * WAD);
    start_cheat_caller_address(launch_address, buyer);
    start_cheat_block_timestamp(launch_address, 150);
    launch.buy_exact_sale(WAD, 2 * WAD);
    start_cheat_caller_address(launch_address, owner);
    launch.cancel();
}

#[test]
fn owner_withdraws_proceeds_and_recovers_unsold_tokens_after_close() {
    let owner = address(OWNER_FELT);
    let buyer = address(BUYER_FELT);
    let sale_token_address = deploy_token();
    let payment_token_address = deploy_token();
    let allocation = 10 * WAD;
    let launch_address = deploy_launch(
        owner, sale_token_address, payment_token_address, allocation, 50 * WAD,
    );
    mint_and_approve(sale_token_address, owner, launch_address, allocation);
    start_cheat_caller_address(launch_address, owner);
    let launch = IDroptronLaunchDispatcher { contract_address: launch_address };
    launch.fund();

    let purchase = 3 * WAD;
    let payment_amount = 6 * WAD;
    mint_and_approve(payment_token_address, buyer, launch_address, payment_amount);
    start_cheat_caller_address(launch_address, buyer);
    start_cheat_block_timestamp(launch_address, 150);
    launch.buy_exact_sale(purchase, payment_amount);

    start_cheat_caller_address(launch_address, owner);
    start_cheat_block_timestamp(launch_address, END);
    let withdrawn = launch.withdraw_proceeds();
    let recovered = launch.recover_unsold();

    let sale = IMockTokenDispatcher { contract_address: sale_token_address };
    let payment = IMockTokenDispatcher { contract_address: payment_token_address };
    assert(withdrawn == payment_amount, 'BAD_WITHDRAW_AMOUNT');
    assert(recovered == allocation - purchase, 'BAD_RECOVERY_AMOUNT');
    assert(payment.balance_of(owner) == payment_amount, 'OWNER_NOT_PAID');
    assert(sale.balance_of(owner) == allocation - purchase, 'UNSOLD_NOT_RECOVERED');
    assert(payment.balance_of(launch_address) == 0, 'PAYMENT_STILL_LOCKED');
    assert(sale.balance_of(launch_address) == 0, 'SALE_STILL_LOCKED');
}

#[test]
fn linear_launch_prices_successive_purchases_on_the_curve() {
    let owner = address(OWNER_FELT);
    let buyer = address(BUYER_FELT);
    let sale_token_address = deploy_token();
    let payment_token_address = deploy_token();
    let allocation = 10 * WAD;
    let launch_address = deploy_linear_launch(
        owner, sale_token_address, payment_token_address, allocation, 100 * WAD,
    );
    mint_and_approve(sale_token_address, owner, launch_address, allocation);
    start_cheat_caller_address(launch_address, owner);
    let launch = IDroptronLaunchDispatcher { contract_address: launch_address };
    launch.fund();

    mint_and_approve(payment_token_address, buyer, launch_address, 6 * WAD);
    start_cheat_caller_address(launch_address, buyer);
    start_cheat_block_timestamp(launch_address, 150);
    let first_payment = launch.buy_exact_sale(WAD, 2500000000000000000);
    let second_payment = launch.buy_exact_sale(WAD, 3500000000000000000);

    assert(first_payment == 2500000000000000000, 'BAD_FIRST_PAYMENT');
    assert(second_payment == 3500000000000000000, 'BAD_SECOND_PAYMENT');
    assert(launch.sold() == 2 * WAD, 'BAD_LINEAR_SOLD');
    assert(launch.raised() == 6 * WAD, 'BAD_LINEAR_RAISED');
    assert(launch.current_price_wad() == 4 * WAD, 'BAD_LINEAR_PRICE');
    let config = launch.get_config();
    let state = launch.get_state();
    assert(config.pricing_kind == 1, 'BAD_PRICING_KIND');
    assert(config.slope_wad == WAD, 'BAD_SLOPE');
    assert(state.status == 2, 'BAD_ACTIVE_STATUS');
    assert(state.remaining_sale_raw == 8 * WAD, 'BAD_REMAINING_SALE');
}

#[test]
fn linear_launch_requires_a_non_zero_slope() {
    let owner = address(OWNER_FELT);
    let sale_token_address = deploy_token();
    let payment_token_address = deploy_token();
    let class = declare("DroptronLaunch").unwrap().contract_class();
    let mut calldata = ArrayTrait::new();
    owner.serialize(ref calldata);
    sale_token_address.serialize(ref calldata);
    payment_token_address.serialize(ref calldata);
    18_u8.serialize(ref calldata);
    18_u8.serialize(ref calldata);
    1_u8.serialize(ref calldata);
    (2 * WAD).serialize(ref calldata);
    0_u256.serialize(ref calldata);
    (10 * WAD).serialize(ref calldata);
    (50 * WAD).serialize(ref calldata);
    START.serialize(ref calldata);
    END.serialize(ref calldata);
    assert(class.deploy(@calldata).is_err(), 'ZERO_SLOPE_ACCEPTED');
}

#[test]
#[should_panic(expected: 'NOT_ACTIVE')]
fn purchase_at_the_end_timestamp_is_rejected() {
    let owner = address(OWNER_FELT);
    let buyer = address(BUYER_FELT);
    let sale_token_address = deploy_token();
    let payment_token_address = deploy_token();
    let allocation = 10 * WAD;
    let launch_address = deploy_launch(
        owner, sale_token_address, payment_token_address, allocation, 50 * WAD,
    );
    mint_and_approve(sale_token_address, owner, launch_address, allocation);
    start_cheat_caller_address(launch_address, owner);
    let launch = IDroptronLaunchDispatcher { contract_address: launch_address };
    launch.fund();
    mint_and_approve(payment_token_address, buyer, launch_address, 2 * WAD);
    start_cheat_caller_address(launch_address, buyer);
    start_cheat_block_timestamp(launch_address, END);
    launch.buy_exact_sale(WAD, 2 * WAD);
}

#[test]
#[should_panic(expected: 'REENTRANCY')]
fn reentrant_payment_token_cannot_enter_purchase_twice() {
    let owner = address(OWNER_FELT);
    let buyer = address(BUYER_FELT);
    let sale_token_address = deploy_token();
    let payment_token_address = deploy_reentrant_token();
    let allocation = 10 * WAD;
    let launch_address = deploy_launch(
        owner, sale_token_address, payment_token_address, allocation, 50 * WAD,
    );
    mint_and_approve(sale_token_address, owner, launch_address, allocation);
    start_cheat_caller_address(launch_address, owner);
    let launch = IDroptronLaunchDispatcher { contract_address: launch_address };
    launch.fund();

    let payment = IReentrantTokenDispatcher { contract_address: payment_token_address };
    payment.mint(buyer, 4 * WAD);
    start_cheat_caller_address(payment_token_address, buyer);
    assert(payment.approve(launch_address, 4 * WAD), 'APPROVAL_FAILED');
    payment.configure_attack(launch_address, WAD, 2 * WAD);

    start_cheat_caller_address(launch_address, buyer);
    start_cheat_block_timestamp(launch_address, 150);
    launch.buy_exact_sale(WAD, 2 * WAD);
}

use droptron_contracts::launch::{IDroptronLaunchDispatcher, IDroptronLaunchDispatcherTrait};
use droptron_contracts::launch_participation::{
    ILaunchParticipationDispatcher, ILaunchParticipationDispatcherTrait, OpenNoteDeposit,
};
use droptron_contracts::mocks::mock_token::{IMockTokenDispatcher, IMockTokenDispatcherTrait};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_block_timestamp,
    start_cheat_caller_address, stop_cheat_caller_address,
};
use starknet::ContractAddress;

const WAD: u256 = 1000000000000000000;
const OWNER_FELT: felt252 = 0x111;
const POOL_FELT: felt252 = 0x222;
const OUTSIDER_FELT: felt252 = 0x333;
const SALE_NOTE_ID: felt252 = 0x444;
const REFUND_NOTE_ID: felt252 = 0x555;

fn address(value: felt252) -> ContractAddress {
    value.try_into().unwrap()
}

fn deploy_token() -> ContractAddress {
    let class = declare("MockToken").unwrap().contract_class();
    class.deploy(@ArrayTrait::new()).unwrap().0
}

fn deploy_launch(
    sale_token: ContractAddress, payment_token: ContractAddress, allocation: u256,
) -> ContractAddress {
    let class = declare("DroptronLaunch").unwrap().contract_class();
    let mut calldata = ArrayTrait::new();
    address(OWNER_FELT).serialize(ref calldata);
    sale_token.serialize(ref calldata);
    payment_token.serialize(ref calldata);
    18_u8.serialize(ref calldata);
    18_u8.serialize(ref calldata);
    0_u8.serialize(ref calldata);
    (2 * WAD).serialize(ref calldata);
    0_u256.serialize(ref calldata);
    allocation.serialize(ref calldata);
    (500 * WAD).serialize(ref calldata);
    100_u64.serialize(ref calldata);
    200_u64.serialize(ref calldata);
    class.deploy(@calldata).unwrap().0
}

fn deploy_helper(pool: ContractAddress) -> ILaunchParticipationDispatcher {
    let class = declare("DroptronLaunchParticipation").unwrap().contract_class();
    let mut calldata = ArrayTrait::new();
    pool.serialize(ref calldata);
    ILaunchParticipationDispatcher { contract_address: class.deploy(@calldata).unwrap().0 }
}

fn prepare_launch_and_input(maximum: u256) -> (
    IMockTokenDispatcher,
    IMockTokenDispatcher,
    IDroptronLaunchDispatcher,
    ILaunchParticipationDispatcher,
) {
    let owner = address(OWNER_FELT);
    let pool = address(POOL_FELT);
    let sale = IMockTokenDispatcher { contract_address: deploy_token() };
    let payment = IMockTokenDispatcher { contract_address: deploy_token() };
    let launch = IDroptronLaunchDispatcher {
        contract_address: deploy_launch(sale.contract_address, payment.contract_address, 100 * WAD),
    };
    let helper = deploy_helper(pool);

    sale.mint(owner, 100 * WAD);
    start_cheat_caller_address(sale.contract_address, owner);
    assert(sale.approve(launch.contract_address, 100 * WAD), 'SALE_APPROVAL_FAILED');
    stop_cheat_caller_address(sale.contract_address);
    start_cheat_caller_address(launch.contract_address, owner);
    launch.fund();
    stop_cheat_caller_address(launch.contract_address);
    start_cheat_block_timestamp(launch.contract_address, 150);

    payment.mint(pool, maximum);
    start_cheat_caller_address(payment.contract_address, pool);
    assert(payment.transfer(helper.contract_address, maximum), 'INPUT_TRANSFER_FAILED');
    stop_cheat_caller_address(payment.contract_address);
    (sale, payment, launch, helper)
}

#[test]
fn exact_private_purchase_returns_one_sale_deposit() {
    let pool = address(POOL_FELT);
    let sale_amount: u128 = 3_000_000_000_000_000_000;
    let payment_amount: u128 = 6_000_000_000_000_000_000;
    let (sale, payment, launch, helper) = prepare_launch_and_input(payment_amount.into());

    start_cheat_caller_address(helper.contract_address, pool);
    let deposits = helper
        .privacy_invoke(
            payment.contract_address,
            sale.contract_address,
            payment_amount,
            sale_amount,
            launch.contract_address,
            SALE_NOTE_ID,
            REFUND_NOTE_ID,
        );
    stop_cheat_caller_address(helper.contract_address);

    assert(deposits.len() == 1, 'BAD_DEPOSIT_COUNT');
    assert(
        *deposits.at(0)
            == OpenNoteDeposit {
                note_id: SALE_NOTE_ID,
                token: sale.contract_address,
                amount: sale_amount,
            },
        'BAD_SALE_DEPOSIT',
    );
    assert(sale.balance_of(helper.contract_address) == sale_amount.into(), 'BAD_HELPER_SALE');
    assert(payment.balance_of(helper.contract_address) == 0, 'PAYMENT_NOT_SPENT');
    assert(sale.allowance(helper.contract_address, pool) == sale_amount.into(), 'POOL_NOT_APPROVED');
    assert(
        payment.allowance(helper.contract_address, launch.contract_address) == 0,
        'RESIDUAL_LAUNCH_ALLOWANCE',
    );
}

#[test]
fn unused_maximum_payment_is_returned_to_a_private_note() {
    let pool = address(POOL_FELT);
    let sale_amount: u128 = 3_000_000_000_000_000_000;
    let maximum: u128 = 7_000_000_000_000_000_000;
    let expected_refund: u128 = 1_000_000_000_000_000_000;
    let (sale, payment, launch, helper) = prepare_launch_and_input(maximum.into());

    start_cheat_caller_address(helper.contract_address, pool);
    let deposits = helper
        .privacy_invoke(
            payment.contract_address,
            sale.contract_address,
            maximum,
            sale_amount,
            launch.contract_address,
            SALE_NOTE_ID,
            REFUND_NOTE_ID,
        );
    stop_cheat_caller_address(helper.contract_address);

    assert(deposits.len() == 2, 'BAD_DEPOSIT_COUNT');
    assert(
        *deposits.at(1)
            == OpenNoteDeposit {
                note_id: REFUND_NOTE_ID,
                token: payment.contract_address,
                amount: expected_refund,
            },
        'BAD_REFUND_DEPOSIT',
    );
    assert(
        payment.balance_of(helper.contract_address) == expected_refund.into(),
        'BAD_HELPER_REFUND',
    );
    assert(
        payment.allowance(helper.contract_address, pool) == expected_refund.into(),
        'REFUND_NOT_APPROVED',
    );
    assert(
        payment.allowance(helper.contract_address, launch.contract_address) == 0,
        'RESIDUAL_LAUNCH_ALLOWANCE',
    );
}

#[test]
#[should_panic(expected: 'POOL_ONLY')]
fn caller_other_than_pool_is_rejected() {
    let pool = address(POOL_FELT);
    let helper = deploy_helper(pool);
    start_cheat_caller_address(helper.contract_address, address(OUTSIDER_FELT));
    helper.privacy_invoke(
        address(0x10),
        address(0x20),
        1,
        1,
        address(0x30),
        SALE_NOTE_ID,
        REFUND_NOTE_ID,
    );
}

#[test]
#[should_panic(expected: 'TOKEN_MISMATCH')]
fn tokens_must_match_the_launch_configuration() {
    let pool = address(POOL_FELT);
    let sale_amount: u128 = 1_000_000_000_000_000_000;
    let maximum: u128 = 2_000_000_000_000_000_000;
    let (sale, _payment, launch, helper) = prepare_launch_and_input(maximum.into());
    let wrong_token = deploy_token();
    start_cheat_caller_address(helper.contract_address, pool);
    helper.privacy_invoke(
        wrong_token,
        sale.contract_address,
        maximum,
        sale_amount,
        launch.contract_address,
        SALE_NOTE_ID,
        REFUND_NOTE_ID,
    );
}

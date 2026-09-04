use starknet::ContractAddress;
use crate::launch_participation::OpenNoteDeposit;

#[starknet::interface]
pub trait IClaimRedemption<TState> {
    fn privacy_invoke(ref self: TState, series: ContractAddress, amount: u128, note_id: felt252) -> Span<OpenNoteDeposit>;
    fn pool_address(self: @TState) -> ContractAddress;
    fn factory_address(self: @TState) -> ContractAddress;
}

/// Stateless STRK20 claim helper. Tickets are bearer instruments: never send
/// them here outside the atomic pool withdraw/invoke/deposit transaction.
#[starknet::contract]
pub mod DroptronClaimRedemption {
    use core::num::traits::Zero;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::{ContractAddress, get_caller_address, get_contract_address};
    use crate::claim_series::{IClaimSeriesDispatcher, IClaimSeriesDispatcherTrait};
    use crate::fixed_supply_token::{IDroptronFixedSupplyTokenDispatcher, IDroptronFixedSupplyTokenDispatcherTrait};
    use crate::distribution_factory::{IDistributionFactoryDispatcher, IDistributionFactoryDispatcherTrait};
    use crate::launch_participation::OpenNoteDeposit;

    #[storage]
    struct Storage { pool: ContractAddress, factory: ContractAddress, entered: bool }
    #[constructor]
    fn constructor(ref self: ContractState, pool: ContractAddress, factory: ContractAddress) {
        assert(pool.is_non_zero() && factory.is_non_zero(), 'INVALID_ADDRESS');
        assert(pool != get_contract_address() && factory != get_contract_address(), 'INVALID_ADDRESS');
        self.pool.write(pool);
        self.factory.write(factory);
    }
    #[abi(embed_v0)]
    impl RedemptionImpl of super::IClaimRedemption<ContractState> {
        fn pool_address(self: @ContractState) -> ContractAddress { self.pool.read() }
        fn factory_address(self: @ContractState) -> ContractAddress { self.factory.read() }
        fn privacy_invoke(ref self: ContractState, series: ContractAddress, amount: u128, note_id: felt252) -> Span<OpenNoteDeposit> {
            let pool = self.pool.read();
            assert(get_caller_address() == pool, 'POOL_ONLY');
            assert(!self.entered.read(), 'REENTRANCY');
            self.entered.write(true);
            assert(amount > 0, 'ZERO_AMOUNT');
            let factory = IDistributionFactoryDispatcher { contract_address: self.factory.read() };
            assert(factory.is_series(series), 'UNKNOWN_SERIES');
            let claim = IClaimSeriesDispatcher { contract_address: series };
            let token_address = claim.terms().underlying;
            assert(token_address != series && token_address != get_contract_address(), 'INVALID_TOKEN');
            let token = IDroptronFixedSupplyTokenDispatcher { contract_address: token_address };
            let tickets = IDroptronFixedSupplyTokenDispatcher { contract_address: series };
            let here = get_contract_address();
            let before = token.balance_of(here);
            let tickets_before = tickets.balance_of(here);
            let value: u256 = amount.into();
            assert(tickets_before >= value, 'INSUFFICIENT_TICKETS');
            claim.redeem(amount, here);
            assert(tickets.balance_of(here) + value == tickets_before, 'BURN_MISMATCH');
            let received = token.balance_of(here) - before;
            assert(received == value, 'PAYOUT_MISMATCH');
            assert(token.approve(pool, received), 'APPROVAL_FAILED');
            self.entered.write(false);
            array![OpenNoteDeposit { note_id, token: token_address, amount: received.try_into().expect('AMOUNT_OVERFLOW') }].span()
        }
    }
}

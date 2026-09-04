use starknet::ContractAddress;

// Positional Serde must remain identical to privacy::objects::OpenNoteDeposit.
#[derive(Serde, Copy, Drop, PartialEq, Debug)]
pub struct OpenNoteDeposit {
    pub note_id: felt252,
    pub token: ContractAddress,
    pub amount: u128,
}

#[starknet::interface]
pub trait IERC20<TState> {
    fn balance_of(self: @TState, account: ContractAddress) -> u256;
    fn approve(ref self: TState, spender: ContractAddress, amount: u256) -> bool;
}

#[starknet::interface]
pub trait IDroptronLaunch<TState> {
    fn buy_exact_sale(ref self: TState, sale_amount_raw: u256, max_payment_raw: u256) -> u256;
    fn sale_token(self: @TState) -> ContractAddress;
    fn payment_token(self: @TState) -> ContractAddress;
}

#[starknet::interface]
pub trait ILaunchParticipation<TState> {
    /// Called only by the configured STRK20 pool during a private transaction.
    /// The pool transfers `max_payment_amount` to this helper before this call.
    fn privacy_invoke(
        ref self: TState,
        payment_token: ContractAddress,
        sale_token: ContractAddress,
        max_payment_amount: u128,
        sale_amount: u128,
        launch: ContractAddress,
        sale_note_id: felt252,
        refund_note_id: felt252,
    ) -> Span<OpenNoteDeposit>;
    fn pool_address(self: @TState) -> ContractAddress;
}

/// Pool-pinned STRK20 helper for private Droptron launch participation.
/// The deployed code remains unaudited and requires independent review before meaningful-value use.
#[starknet::contract]
pub mod DroptronLaunchParticipation {
    use core::num::traits::Zero;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::{ContractAddress, get_caller_address, get_contract_address};
    use super::{
        IDroptronLaunchDispatcher, IDroptronLaunchDispatcherTrait, IERC20Dispatcher,
        IERC20DispatcherTrait, OpenNoteDeposit,
    };

    mod errors {
        pub const INVALID_POOL: felt252 = 'INVALID_POOL';
        pub const POOL_ONLY: felt252 = 'POOL_ONLY';
        pub const INVALID_TOKEN: felt252 = 'INVALID_TOKEN';
        pub const SAME_TOKEN: felt252 = 'SAME_TOKEN';
        pub const INVALID_LAUNCH: felt252 = 'INVALID_LAUNCH';
        pub const ZERO_AMOUNT: felt252 = 'ZERO_AMOUNT';
        pub const INSUFFICIENT_INPUT: felt252 = 'INSUFFICIENT_INPUT';
        pub const TOKEN_MISMATCH: felt252 = 'TOKEN_MISMATCH';
        pub const PAYMENT_MISMATCH: felt252 = 'PAYMENT_MISMATCH';
        pub const SALE_MISMATCH: felt252 = 'SALE_MISMATCH';
        pub const APPROVAL_FAILED: felt252 = 'APPROVAL_FAILED';
        pub const AMOUNT_OVERFLOW: felt252 = 'AMOUNT_OVERFLOW';
    }

    #[storage]
    struct Storage {
        pool_address: ContractAddress,
    }

    #[constructor]
    fn constructor(ref self: ContractState, pool_address: ContractAddress) {
        assert(
            pool_address.is_non_zero() && pool_address != get_contract_address(),
            errors::INVALID_POOL,
        );
        self.pool_address.write(pool_address);
    }

    #[abi(embed_v0)]
    impl LaunchParticipationImpl of super::ILaunchParticipation<ContractState> {
        fn privacy_invoke(
            ref self: ContractState,
            payment_token: ContractAddress,
            sale_token: ContractAddress,
            max_payment_amount: u128,
            sale_amount: u128,
            launch: ContractAddress,
            sale_note_id: felt252,
            refund_note_id: felt252,
        ) -> Span<OpenNoteDeposit> {
            let pool = self.pool_address.read();
            assert(get_caller_address() == pool, errors::POOL_ONLY);
            assert(payment_token.is_non_zero(), errors::INVALID_TOKEN);
            assert(sale_token.is_non_zero(), errors::INVALID_TOKEN);
            assert(payment_token != sale_token, errors::SAME_TOKEN);
            assert(launch.is_non_zero(), errors::INVALID_LAUNCH);
            assert(max_payment_amount.is_non_zero(), errors::ZERO_AMOUNT);
            assert(sale_amount.is_non_zero(), errors::ZERO_AMOUNT);

            let launch_contract = IDroptronLaunchDispatcher { contract_address: launch };
            assert(launch_contract.payment_token() == payment_token, errors::TOKEN_MISMATCH);
            assert(launch_contract.sale_token() == sale_token, errors::TOKEN_MISMATCH);

            let helper = get_contract_address();
            let payment = IERC20Dispatcher { contract_address: payment_token };
            let sale = IERC20Dispatcher { contract_address: sale_token };
            let payment_before = payment.balance_of(helper);
            let sale_before = sale.balance_of(helper);
            let maximum: u256 = max_payment_amount.into();
            let requested_sale: u256 = sale_amount.into();
            assert(payment_before >= maximum, errors::INSUFFICIENT_INPUT);
            assert(payment.approve(launch, maximum), errors::APPROVAL_FAILED);

            let reported_payment = launch_contract.buy_exact_sale(requested_sale, maximum);
            // A quote may use less than the maximum. Do not leave the launch
            // authorized to spend the helper's refund or future inputs.
            assert(payment.approve(launch, 0), errors::APPROVAL_FAILED);
            let payment_after = payment.balance_of(helper);
            let sale_after = sale.balance_of(helper);
            let paid = payment_before - payment_after;
            let received = sale_after - sale_before;
            assert(paid == reported_payment && paid <= maximum, errors::PAYMENT_MISMATCH);
            assert(received == requested_sale, errors::SALE_MISMATCH);

            let received_u128: u128 = received.try_into().expect(errors::AMOUNT_OVERFLOW);
            assert(sale.approve(pool, received), errors::APPROVAL_FAILED);
            let mut deposits = array![
                OpenNoteDeposit { note_id: sale_note_id, token: sale_token, amount: received_u128 },
            ];

            let refund = maximum - paid;
            if refund != 0 {
                let refund_u128: u128 = refund.try_into().expect(errors::AMOUNT_OVERFLOW);
                assert(payment.approve(pool, refund), errors::APPROVAL_FAILED);
                deposits.append(
                    OpenNoteDeposit {
                        note_id: refund_note_id,
                        token: payment_token,
                        amount: refund_u128,
                    },
                );
            }
            deposits.span()
        }

        fn pool_address(self: @ContractState) -> ContractAddress {
            self.pool_address.read()
        }
    }
}

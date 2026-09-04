use starknet::ContractAddress;

#[derive(Drop, Serde)]
pub struct LaunchConfig {
    pub owner: ContractAddress,
    pub sale_token: ContractAddress,
    pub payment_token: ContractAddress,
    pub sale_decimals: u8,
    pub payment_decimals: u8,
    pub pricing_kind: u8,
    pub initial_price_wad: u256,
    pub slope_wad: u256,
    pub sale_allocation_raw: u256,
    pub raise_limit_raw: u256,
    pub starts_at: u64,
    pub ends_at: u64,
}

#[derive(Drop, Serde)]
pub struct LaunchState {
    pub status: u8,
    pub funded: bool,
    pub cancelled: bool,
    pub sold_raw: u256,
    pub raised_raw: u256,
    pub remaining_sale_raw: u256,
}

#[starknet::interface]
pub trait IERC20<TState> {
    fn balance_of(self: @TState, account: ContractAddress) -> u256;
    fn transfer(ref self: TState, recipient: ContractAddress, amount: u256) -> bool;
    fn transfer_from(
        ref self: TState, sender: ContractAddress, recipient: ContractAddress, amount: u256,
    ) -> bool;
}

#[starknet::interface]
pub trait IDroptronLaunch<TState> {
    fn fund(ref self: TState);
    fn buy_exact_sale(ref self: TState, sale_amount_raw: u256, max_payment_raw: u256) -> u256;
    fn cancel(ref self: TState);
    fn withdraw_proceeds(ref self: TState) -> u256;
    fn recover_unsold(ref self: TState) -> u256;
    fn quote_exact_sale(self: @TState, sale_amount_raw: u256) -> u256;
    fn current_price_wad(self: @TState) -> u256;
    fn get_config(self: @TState) -> LaunchConfig;
    fn get_state(self: @TState) -> LaunchState;
    fn owner(self: @TState) -> ContractAddress;
    fn sale_token(self: @TState) -> ContractAddress;
    fn payment_token(self: @TState) -> ContractAddress;
    fn sold(self: @TState) -> u256;
    fn raised(self: @TState) -> u256;
    fn is_funded(self: @TState) -> bool;
    fn is_cancelled(self: @TState) -> bool;
}

#[starknet::contract]
pub mod DroptronLaunch {
    use core::num::traits::Zero;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::{ContractAddress, get_block_timestamp, get_caller_address, get_contract_address};
    use crate::math::{checked_add, current_linear_price_wad, fixed_price_quote, linear_price_quote};
    use super::{IERC20Dispatcher, IERC20DispatcherTrait, LaunchConfig, LaunchState};

    mod errors {
        pub const OWNER_ONLY: felt252 = 'OWNER_ONLY';
        pub const INVALID_TOKEN: felt252 = 'INVALID_TOKEN';
        pub const SAME_TOKEN: felt252 = 'SAME_TOKEN';
        pub const INVALID_TIME: felt252 = 'INVALID_TIME';
        pub const INVALID_DECIMALS: felt252 = 'INVALID_DECIMALS';
        pub const INVALID_LIMIT: felt252 = 'INVALID_LIMIT';
        pub const INVALID_PRICING: felt252 = 'INVALID_PRICING';
        pub const INVALID_SLOPE: felt252 = 'INVALID_SLOPE';
        pub const ALREADY_FUNDED: felt252 = 'ALREADY_FUNDED';
        pub const NOT_FUNDED: felt252 = 'NOT_FUNDED';
        pub const CANCELLED: felt252 = 'CANCELLED';
        pub const NOT_ACTIVE: felt252 = 'NOT_ACTIVE';
        pub const ZERO_AMOUNT: felt252 = 'ZERO_AMOUNT';
        pub const ALLOCATION_EXCEEDED: felt252 = 'ALLOCATION_EXCEEDED';
        pub const RAISE_LIMIT_EXCEEDED: felt252 = 'RAISE_LIMIT_EXCEEDED';
        pub const SLIPPAGE: felt252 = 'SLIPPAGE';
        pub const TRANSFER_FAILED: felt252 = 'TRANSFER_FAILED';
        pub const SALE_STARTED: felt252 = 'SALE_STARTED';
        pub const NOT_CLOSED: felt252 = 'NOT_CLOSED';
        pub const NOTHING_TO_WITHDRAW: felt252 = 'NOTHING_TO_WITHDRAW';
        pub const NOTHING_TO_RECOVER: felt252 = 'NOTHING_TO_RECOVER';
        pub const REENTRANCY: felt252 = 'REENTRANCY';
    }

    #[storage]
    struct Storage {
        owner: ContractAddress,
        sale_token: ContractAddress,
        payment_token: ContractAddress,
        sale_decimals: u8,
        payment_decimals: u8,
        pricing_kind: u8,
        initial_price_wad: u256,
        slope_wad: u256,
        sale_allocation_raw: u256,
        raise_limit_raw: u256,
        starts_at: u64,
        ends_at: u64,
        sold: u256,
        raised: u256,
        proceeds_withdrawn: u256,
        sale_recovered: u256,
        funded: bool,
        cancelled: bool,
        entered: bool,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        LaunchFunded: LaunchFunded,
        Purchase: Purchase,
        LaunchCancelled: LaunchCancelled,
        ProceedsWithdrawn: ProceedsWithdrawn,
        UnsoldRecovered: UnsoldRecovered,
    }

    #[derive(Drop, starknet::Event)]
    struct LaunchFunded {
        amount: u256,
    }

    #[derive(Drop, starknet::Event)]
    struct Purchase {
        #[key]
        executor: ContractAddress,
        sale_amount: u256,
        payment_amount: u256,
        sold_total: u256,
        raised_total: u256,
    }

    #[derive(Drop, starknet::Event)]
    struct LaunchCancelled {}

    #[derive(Drop, starknet::Event)]
    struct ProceedsWithdrawn {
        amount: u256,
    }

    #[derive(Drop, starknet::Event)]
    struct UnsoldRecovered {
        amount: u256,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        owner: ContractAddress,
        sale_token: ContractAddress,
        payment_token: ContractAddress,
        sale_decimals: u8,
        payment_decimals: u8,
        pricing_kind: u8,
        initial_price_wad: u256,
        slope_wad: u256,
        sale_allocation_raw: u256,
        raise_limit_raw: u256,
        starts_at: u64,
        ends_at: u64,
    ) {
        assert(owner.is_non_zero() && owner != get_contract_address(), errors::OWNER_ONLY);
        assert(sale_token.is_non_zero(), errors::INVALID_TOKEN);
        assert(payment_token.is_non_zero(), errors::INVALID_TOKEN);
        assert(sale_token != payment_token, errors::SAME_TOKEN);
        assert(pricing_kind <= 1, errors::INVALID_PRICING);
        assert(
            (pricing_kind == 0 && slope_wad == 0) || (pricing_kind == 1 && slope_wad != 0),
            errors::INVALID_SLOPE,
        );
        assert(sale_decimals <= 18 && payment_decimals <= 18, errors::INVALID_DECIMALS);
        assert(initial_price_wad != 0, errors::INVALID_LIMIT);
        assert(sale_allocation_raw != 0, errors::INVALID_LIMIT);
        assert(raise_limit_raw != 0, errors::INVALID_LIMIT);
        assert(starts_at < ends_at, errors::INVALID_TIME);

        self.owner.write(owner);
        self.sale_token.write(sale_token);
        self.payment_token.write(payment_token);
        self.sale_decimals.write(sale_decimals);
        self.payment_decimals.write(payment_decimals);
        self.pricing_kind.write(pricing_kind);
        self.initial_price_wad.write(initial_price_wad);
        self.slope_wad.write(slope_wad);
        self.sale_allocation_raw.write(sale_allocation_raw);
        self.raise_limit_raw.write(raise_limit_raw);
        self.starts_at.write(starts_at);
        self.ends_at.write(ends_at);
    }

    #[abi(embed_v0)]
    impl DroptronLaunchImpl of super::IDroptronLaunch<ContractState> {
        fn fund(ref self: ContractState) {
            self.assert_owner();
            assert(!self.funded.read(), errors::ALREADY_FUNDED);
            assert(!self.cancelled.read(), errors::CANCELLED);

            self.enter();
            let token = IERC20Dispatcher { contract_address: self.sale_token.read() };
            let amount = self.sale_allocation_raw.read();
            let balance_before = token.balance_of(get_contract_address());
            let transferred = token
                .transfer_from(self.owner.read(), get_contract_address(), amount);
            assert(transferred, errors::TRANSFER_FAILED);
            let balance_after = token.balance_of(get_contract_address());
            assert(balance_after - balance_before == amount, errors::TRANSFER_FAILED);
            self.funded.write(true);
            self.exit();
            self.emit(LaunchFunded { amount });
        }

        fn buy_exact_sale(
            ref self: ContractState, sale_amount_raw: u256, max_payment_raw: u256,
        ) -> u256 {
            assert(self.funded.read(), errors::NOT_FUNDED);
            assert(!self.cancelled.read(), errors::CANCELLED);
            assert(sale_amount_raw != 0, errors::ZERO_AMOUNT);
            let now = get_block_timestamp();
            assert(now >= self.starts_at.read() && now < self.ends_at.read(), errors::NOT_ACTIVE);

            let payment_amount = self.quote_exact_sale(sale_amount_raw);
            assert(payment_amount <= max_payment_raw, errors::SLIPPAGE);
            let next_sold = checked_add(self.sold.read(), sale_amount_raw);
            let next_raised = checked_add(self.raised.read(), payment_amount);
            assert(next_sold <= self.sale_allocation_raw.read(), errors::ALLOCATION_EXCEEDED);
            assert(next_raised <= self.raise_limit_raw.read(), errors::RAISE_LIMIT_EXCEEDED);

            self.enter();
            self.sold.write(next_sold);
            self.raised.write(next_raised);
            let caller = get_caller_address();
            let payment = IERC20Dispatcher { contract_address: self.payment_token.read() };
            let payment_balance_before = payment.balance_of(get_contract_address());
            let paid = payment.transfer_from(caller, get_contract_address(), payment_amount);
            assert(paid, errors::TRANSFER_FAILED);
            let payment_balance_after = payment.balance_of(get_contract_address());
            assert(
                payment_balance_after - payment_balance_before == payment_amount,
                errors::TRANSFER_FAILED,
            );
            let sale = IERC20Dispatcher { contract_address: self.sale_token.read() };
            let sale_balance_before = sale.balance_of(caller);
            let delivered = sale.transfer(caller, sale_amount_raw);
            assert(delivered, errors::TRANSFER_FAILED);
            let sale_balance_after = sale.balance_of(caller);
            assert(
                sale_balance_after - sale_balance_before == sale_amount_raw,
                errors::TRANSFER_FAILED,
            );
            self.exit();

            self
                .emit(
                    Purchase {
                        executor: caller,
                        sale_amount: sale_amount_raw,
                        payment_amount,
                        sold_total: next_sold,
                        raised_total: next_raised,
                    },
                );
            payment_amount
        }

        fn cancel(ref self: ContractState) {
            self.assert_owner();
            assert(self.sold.read() == 0, errors::SALE_STARTED);
            assert(!self.cancelled.read(), errors::CANCELLED);
            self.cancelled.write(true);
            if self.funded.read() {
                let amount = self.sale_allocation_raw.read();
                self.enter();
                self.sale_recovered.write(amount);
                self.send_exact(self.sale_token.read(), self.owner.read(), amount);
                self.exit();
                self.emit(UnsoldRecovered { amount });
            }
            self.emit(LaunchCancelled {});
        }

        fn withdraw_proceeds(ref self: ContractState) -> u256 {
            self.assert_owner();
            assert(self.is_closed(), errors::NOT_CLOSED);
            let amount = self.raised.read() - self.proceeds_withdrawn.read();
            assert(amount != 0, errors::NOTHING_TO_WITHDRAW);
            self.enter();
            self.proceeds_withdrawn.write(self.raised.read());
            self.send_exact(self.payment_token.read(), self.owner.read(), amount);
            self.exit();
            self.emit(ProceedsWithdrawn { amount });
            amount
        }

        fn recover_unsold(ref self: ContractState) -> u256 {
            self.assert_owner();
            assert(self.is_closed(), errors::NOT_CLOSED);
            let amount = self.sale_allocation_raw.read()
                - self.sold.read()
                - self.sale_recovered.read();
            assert(amount != 0, errors::NOTHING_TO_RECOVER);
            self.enter();
            self.sale_recovered.write(self.sale_recovered.read() + amount);
            self.send_exact(self.sale_token.read(), self.owner.read(), amount);
            self.exit();
            self.emit(UnsoldRecovered { amount });
            amount
        }

        fn quote_exact_sale(self: @ContractState, sale_amount_raw: u256) -> u256 {
            if self.pricing_kind.read() == 0 {
                fixed_price_quote(
                    sale_amount_raw,
                    self.sale_decimals.read(),
                    self.payment_decimals.read(),
                    self.initial_price_wad.read(),
                )
            } else {
                linear_price_quote(
                    sale_amount_raw,
                    self.sold.read(),
                    self.sale_decimals.read(),
                    self.payment_decimals.read(),
                    self.initial_price_wad.read(),
                    self.slope_wad.read(),
                )
            }
        }

        fn current_price_wad(self: @ContractState) -> u256 {
            if self.pricing_kind.read() == 0 {
                self.initial_price_wad.read()
            } else {
                current_linear_price_wad(
                    self.sold.read(),
                    self.sale_decimals.read(),
                    self.initial_price_wad.read(),
                    self.slope_wad.read(),
                )
            }
        }

        fn get_config(self: @ContractState) -> LaunchConfig {
            LaunchConfig {
                owner: self.owner.read(),
                sale_token: self.sale_token.read(),
                payment_token: self.payment_token.read(),
                sale_decimals: self.sale_decimals.read(),
                payment_decimals: self.payment_decimals.read(),
                pricing_kind: self.pricing_kind.read(),
                initial_price_wad: self.initial_price_wad.read(),
                slope_wad: self.slope_wad.read(),
                sale_allocation_raw: self.sale_allocation_raw.read(),
                raise_limit_raw: self.raise_limit_raw.read(),
                starts_at: self.starts_at.read(),
                ends_at: self.ends_at.read(),
            }
        }

        fn get_state(self: @ContractState) -> LaunchState {
            LaunchState {
                status: self.status(),
                funded: self.funded.read(),
                cancelled: self.cancelled.read(),
                sold_raw: self.sold.read(),
                raised_raw: self.raised.read(),
                remaining_sale_raw: self.sale_allocation_raw.read()
                    - self.sold.read()
                    - self.sale_recovered.read(),
            }
        }

        fn owner(self: @ContractState) -> ContractAddress {
            self.owner.read()
        }
        fn sale_token(self: @ContractState) -> ContractAddress {
            self.sale_token.read()
        }
        fn payment_token(self: @ContractState) -> ContractAddress {
            self.payment_token.read()
        }
        fn sold(self: @ContractState) -> u256 {
            self.sold.read()
        }
        fn raised(self: @ContractState) -> u256 {
            self.raised.read()
        }
        fn is_funded(self: @ContractState) -> bool {
            self.funded.read()
        }
        fn is_cancelled(self: @ContractState) -> bool {
            self.cancelled.read()
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn assert_owner(self: @ContractState) {
            assert(get_caller_address() == self.owner.read(), errors::OWNER_ONLY);
        }

        fn enter(ref self: ContractState) {
            assert(!self.entered.read(), errors::REENTRANCY);
            self.entered.write(true);
        }

        fn exit(ref self: ContractState) {
            self.entered.write(false);
        }

        fn send_exact(
            self: @ContractState, token_address: ContractAddress, recipient: ContractAddress,
            amount: u256,
        ) {
            let token = IERC20Dispatcher { contract_address: token_address };
            let here = get_contract_address();
            let contract_before = token.balance_of(here);
            let recipient_before = token.balance_of(recipient);
            assert(token.transfer(recipient, amount), errors::TRANSFER_FAILED);
            assert(contract_before - token.balance_of(here) == amount, errors::TRANSFER_FAILED);
            assert(token.balance_of(recipient) - recipient_before == amount, errors::TRANSFER_FAILED);
        }

        fn is_closed(self: @ContractState) -> bool {
            self.cancelled.read()
                || get_block_timestamp() >= self.ends_at.read()
                || self.sold.read() == self.sale_allocation_raw.read()
                || self.raised.read() == self.raise_limit_raw.read()
        }

        fn status(self: @ContractState) -> u8 {
            if self.cancelled.read() {
                4
            } else if !self.funded.read() {
                0
            } else if self.is_closed() {
                3
            } else if get_block_timestamp() < self.starts_at.read() {
                1
            } else {
                2
            }
        }
    }
}

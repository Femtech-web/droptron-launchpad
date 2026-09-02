use core::integer::u512_safe_div_rem_by_u256;
use core::num::traits::{OverflowingAdd, OverflowingMul, WideMul};

pub const WAD: u256 = 1000000000000000000;

pub fn checked_add(lhs: u256, rhs: u256) -> u256 {
    let (result, overflow) = lhs.overflowing_add(rhs);
    assert(!overflow, 'MATH_OVERFLOW');
    result
}

pub fn checked_mul(lhs: u256, rhs: u256) -> u256 {
    let (result, overflow) = lhs.overflowing_mul(rhs);
    assert(!overflow, 'MATH_OVERFLOW');
    result
}

pub fn ceil_div(numerator: u256, denominator: u256) -> u256 {
    assert(denominator != 0, 'DIV_BY_ZERO');
    let quotient = numerator / denominator;
    if numerator % denominator == 0 {
        quotient
    } else {
        quotient + 1
    }
}

pub fn pow10(decimals: u8) -> u256 {
    let mut value: u256 = 1;
    let mut index: u8 = 0;
    loop {
        if index == decimals {
            break value;
        }
        value *= 10;
        index += 1;
    }
}

pub fn mul_div_ceil(lhs: u256, rhs: u256, denominator: u256) -> u256 {
    assert(denominator != 0, 'DIV_BY_ZERO');
    let non_zero_denominator: NonZero<u256> = denominator.try_into().unwrap();
    let (wide_quotient, remainder) = u512_safe_div_rem_by_u256(
        lhs.wide_mul(rhs), non_zero_denominator,
    );
    let quotient: u256 = wide_quotient.try_into().expect('MATH_OVERFLOW');
    if remainder == 0 {
        quotient
    } else {
        checked_add(quotient, 1)
    }
}

pub fn fixed_price_quote(
    sale_amount_raw: u256, sale_decimals: u8, payment_decimals: u8, price_wad: u256,
) -> u256 {
    assert(sale_amount_raw != 0, 'ZERO_SALE_AMOUNT');
    assert(price_wad != 0, 'ZERO_PRICE');

    let sale_wad = mul_div_ceil(sale_amount_raw, WAD, pow10(sale_decimals));
    let cost_wad = mul_div_ceil(sale_wad, price_wad, WAD);
    mul_div_ceil(cost_wad, pow10(payment_decimals), WAD)
}

pub fn current_linear_price_wad(
    sold_raw: u256, sale_decimals: u8, initial_price_wad: u256, slope_wad: u256,
) -> u256 {
    let sold_wad = mul_div_ceil(sold_raw, WAD, pow10(sale_decimals));
    checked_add(initial_price_wad, mul_div_ceil(slope_wad, sold_wad, WAD))
}

pub fn linear_price_quote(
    sale_amount_raw: u256,
    sold_raw: u256,
    sale_decimals: u8,
    payment_decimals: u8,
    initial_price_wad: u256,
    slope_wad: u256,
) -> u256 {
    assert(sale_amount_raw != 0, 'ZERO_SALE_AMOUNT');
    assert(initial_price_wad != 0, 'ZERO_PRICE');
    assert(slope_wad != 0, 'ZERO_SLOPE');

    let sale_wad = mul_div_ceil(sale_amount_raw, WAD, pow10(sale_decimals));
    let sold_wad = mul_div_ceil(sold_raw, WAD, pow10(sale_decimals));
    let position_sum = checked_add(checked_mul(sold_wad, 2), sale_wad);
    let average_curve_price_wad = mul_div_ceil(slope_wad, position_sum, checked_mul(2, WAD));
    let base_cost_wad = mul_div_ceil(sale_wad, initial_price_wad, WAD);
    let curve_cost_wad = mul_div_ceil(sale_wad, average_curve_price_wad, WAD);
    let cost_wad = checked_add(base_cost_wad, curve_cost_wad);
    mul_div_ceil(cost_wad, pow10(payment_decimals), WAD)
}

#[cfg(test)]
mod tests {
    use super::{
        WAD, ceil_div, current_linear_price_wad, fixed_price_quote, linear_price_quote,
        mul_div_ceil, pow10,
    };

    #[test]
    fn ceil_div_rounds_up_only_when_needed() {
        assert(ceil_div(10, 2) == 5, 'EXACT_DIVISION');
        assert(ceil_div(11, 2) == 6, 'ROUNDED_DIVISION');
    }

    #[test]
    fn pow10_handles_supported_decimal_scales() {
        assert(pow10(0) == 1, 'ZERO_DECIMALS');
        assert(pow10(6) == 1000000, 'SIX_DECIMALS');
        assert(pow10(18) == WAD, 'EIGHTEEN_DECIMALS');
    }

    #[test]
    fn quote_one_token_at_two_payment_tokens() {
        let quote = fixed_price_quote(WAD, 18, 18, 2 * WAD);
        assert(quote == 2 * WAD, 'BAD_18_18_QUOTE');
    }

    #[test]
    fn quote_normalizes_six_decimal_payment_token() {
        let quote = fixed_price_quote(WAD, 18, 6, 2 * WAD);
        assert(quote == 2000000, 'BAD_18_6_QUOTE');
    }

    #[test]
    fn quote_rounds_payment_against_the_buyer() {
        let quote = fixed_price_quote(1, 18, 6, WAD);
        assert(quote == 1, 'QUOTE_MUST_ROUND_UP');
    }

    #[test]
    fn wide_mul_div_does_not_overflow_before_division() {
        let large = 1606938044258990275541962092341162602522202993782792835301376_u256;
        assert(mul_div_ceil(large, WAD, WAD) == large, 'WIDE_MUL_DIV_FAILED');
    }

    #[test]
    fn linear_quote_integrates_the_first_purchase() {
        let quote = linear_price_quote(WAD, 0, 18, 18, 2 * WAD, WAD);
        assert(quote == 2500000000000000000, 'BAD_FIRST_CURVE_QUOTE');
    }

    #[test]
    fn linear_quote_uses_the_existing_sold_position() {
        let quote = linear_price_quote(WAD, 3 * WAD, 18, 18, 2 * WAD, WAD);
        assert(quote == 5500000000000000000, 'BAD_MIDDLE_CURVE_QUOTE');
        assert(current_linear_price_wad(4 * WAD, 18, 2 * WAD, WAD) == 6 * WAD, 'BAD_CURRENT_PRICE');
    }

    #[test]
    fn split_linear_purchases_match_a_combined_purchase() {
        let combined = linear_price_quote(2 * WAD, 0, 18, 18, 2 * WAD, WAD);
        let first = linear_price_quote(WAD, 0, 18, 18, 2 * WAD, WAD);
        let second = linear_price_quote(WAD, WAD, 18, 18, 2 * WAD, WAD);
        assert(combined == first + second, 'SPLIT_QUOTE_DRIFT');
    }

    #[test]
    fn linear_quote_normalizes_six_decimal_tokens() {
        let payment_six = linear_price_quote(1000000, 0, 6, 6, 2 * WAD, WAD);
        let payment_eighteen = linear_price_quote(1000000, 0, 6, 18, 2 * WAD, WAD);
        assert(payment_six == 2500000, 'BAD_LINEAR_6_6_QUOTE');
        assert(payment_eighteen == 2500000000000000000, 'BAD_LINEAR_6_18_QUOTE');
    }

    #[test]
    fn linear_quotes_increase_with_the_sold_position() {
        let mut sold = 0;
        let mut previous = 0;
        loop {
            if sold == 5 * WAD {
                break;
            }
            let quote = linear_price_quote(WAD, sold, 18, 18, 2 * WAD, WAD);
            assert(quote > previous, 'CURVE_NOT_MONOTONIC');
            previous = quote;
            sold += WAD;
        };
    }

    #[test]
    #[should_panic(expected: 'MATH_OVERFLOW')]
    fn checked_multiplication_rejects_a_u256_overflow() {
        let maximum =
            115792089237316195423570985008687907853269984665640564039457584007913129639935_u256;
        super::checked_mul(maximum, 2);
    }
}

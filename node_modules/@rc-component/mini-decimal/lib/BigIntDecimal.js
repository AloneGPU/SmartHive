"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _numberUtil = require("./numberUtil");
class BigIntDecimal {
  origin = '';
  negative;
  integer;
  decimal;
  /** BigInt will convert `0009` to `9`. We need record the len of decimal */
  decimalLen;
  empty;
  nan;
  constructor(value) {
    if ((0, _numberUtil.isEmpty)(value)) {
      this.empty = true;
      return;
    }
    this.origin = String(value);

    // Act like Number convert
    if (value === '-' || Number.isNaN(value)) {
      this.nan = true;
      return;
    }
    let mergedValue = value;

    // We need convert back to Number since it require `toFixed` to handle this
    if ((0, _numberUtil.isE)(mergedValue)) {
      mergedValue = Number(mergedValue);
    }
    mergedValue = typeof mergedValue === 'string' ? mergedValue : (0, _numberUtil.num2str)(mergedValue);
    if ((0, _numberUtil.validateNumber)(mergedValue)) {
      const trimRet = (0, _numberUtil.trimNumber)(mergedValue);
      this.negative = trimRet.negative;
      const numbers = trimRet.trimStr.split('.');
      this.integer = BigInt(numbers[0]);
      const decimalStr = numbers[1] || '0';
      this.decimal = BigInt(decimalStr);
      this.decimalLen = decimalStr.length;
    } else {
      this.nan = true;
    }
  }
  getMark() {
    return this.negative ? '-' : '';
  }
  getIntegerStr() {
    return this.integer.toString();
  }

  /**
   * @private get decimal string
   */
  getDecimalStr() {
    return this.decimal.toString().padStart(this.decimalLen, '0');
  }

  /**
   * @private Align BigIntDecimal with same decimal length. e.g. 12.3 + 5 = 1230000
   * This is used for add function only.
   */
  alignDecimal(decimalLength) {
    const str = `${this.getMark()}${this.getIntegerStr()}${this.getDecimalStr().padEnd(decimalLength, '0')}`;
    return BigInt(str);
  }
  negate() {
    const clone = new BigIntDecimal(this.toString());
    clone.negative = !clone.negative;
    return clone;
  }
  cal(offset, calculator, calDecimalLen) {
    const maxDecimalLength = Math.max(this.getDecimalStr().length, offset.getDecimalStr().length);
    const myAlignedDecimal = this.alignDecimal(maxDecimalLength);
    const offsetAlignedDecimal = offset.alignDecimal(maxDecimalLength);
    const valueStr = calculator(myAlignedDecimal, offsetAlignedDecimal).toString();
    const nextDecimalLength = calDecimalLen(maxDecimalLength);

    // We need fill string length back to `maxDecimalLength` to avoid parser failed
    const {
      negativeStr,
      trimStr
    } = (0, _numberUtil.trimNumber)(valueStr);
    const hydrateValueStr = `${negativeStr}${trimStr.padStart(nextDecimalLength + 1, '0')}`;
    return new BigIntDecimal(`${hydrateValueStr.slice(0, -nextDecimalLength)}.${hydrateValueStr.slice(-nextDecimalLength)}`);
  }
  add(value) {
    if (this.isInvalidate()) {
      return new BigIntDecimal(value);
    }
    const offset = new BigIntDecimal(value);
    if (offset.isInvalidate()) {
      return this;
    }
    return this.cal(offset, (num1, num2) => num1 + num2, len => len);
  }
  multi(value) {
    const target = new BigIntDecimal(value);
    if (this.isInvalidate() || target.isInvalidate()) {
      return new BigIntDecimal(NaN);
    }
    return this.cal(target, (num1, num2) => num1 * num2, len => len * 2);
  }
  isEmpty() {
    return this.empty;
  }
  isNaN() {
    return this.nan;
  }
  isInvalidate() {
    return this.isEmpty() || this.isNaN();
  }
  equals(target) {
    return this.toString() === target?.toString();
  }
  lessEquals(target) {
    return this.add(target.negate().toString()).toNumber() <= 0;
  }
  toNumber() {
    if (this.isNaN()) {
      return NaN;
    }
    return Number(this.toString());
  }
  toString(safe = true) {
    if (!safe) {
      return this.origin;
    }
    if (this.isInvalidate()) {
      return '';
    }
    return (0, _numberUtil.trimNumber)(`${this.getMark()}${this.getIntegerStr()}.${this.getDecimalStr()}`).fullStr;
  }
}
exports.default = BigIntDecimal;
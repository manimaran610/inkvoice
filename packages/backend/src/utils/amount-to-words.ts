const SMALL_NUMBERS = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];

const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

const INDIAN_SCALES = ["Thousand", "Lakh", "Crore", "Arab", "Kharab", "Neel", "Padma", "Shankh"];

function underHundred(value: number): string {
  if (value < 20) return SMALL_NUMBERS[value];
  return `${TENS[Math.floor(value / 10)]}${value % 10 ? `-${SMALL_NUMBERS[value % 10]}` : ""}`;
}

function underThousand(value: number): string {
  const hundreds = Math.floor(value / 100);
  const remainder = value % 100;
  return [
    ...(hundreds ? [`${SMALL_NUMBERS[hundreds]} Hundred`] : []),
    ...(remainder ? [underHundred(remainder)] : []),
  ].join(" ");
}

function integerToWords(value: number): string {
  if (value === 0) return SMALL_NUMBERS[0];

  const parts: string[] = [];
  const hundreds = value % 1000;
  if (hundreds) parts.push(underThousand(hundreds));

  let remainder = Math.floor(value / 1000);
  let scaleIndex = 0;
  while (remainder > 0) {
    const group = remainder % 100;
    if (group) {
      const scale = INDIAN_SCALES[scaleIndex];
      parts.push(`${underHundred(group)}${scale ? ` ${scale}` : ""}`);
    }
    remainder = Math.floor(remainder / 100);
    scaleIndex++;
  }

  return parts.reverse().join(" ");
}

export function amountToWords(amount: number): string {
  const absoluteAmount = Math.abs(amount);
  const paise = Math.round(absoluteAmount * 100);
  const rupees = Math.floor(paise / 100);
  const fraction = paise % 100;
  const words = integerToWords(rupees);
  const sign = amount < 0 ? "Minus " : "";

  return `${sign}${words}${fraction ? ` and ${underHundred(fraction)}/100` : ""} Only`;
}

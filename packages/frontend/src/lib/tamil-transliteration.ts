const vowels: Record<string, { independent: string; dependent: string }> = {
  aa: { independent: "ஆ", dependent: "ா" },
  ee: { independent: "ஈ", dependent: "ீ" },
  ii: { independent: "ஈ", dependent: "ீ" },
  oo: { independent: "ஊ", dependent: "ூ" },
  uu: { independent: "ஊ", dependent: "ூ" },
  ai: { independent: "ஐ", dependent: "ை" },
  au: { independent: "ஔ", dependent: "ௌ" },
  ow: { independent: "ஔ", dependent: "ௌ" },
  a: { independent: "அ", dependent: "" },
  i: { independent: "இ", dependent: "ி" },
  u: { independent: "உ", dependent: "ு" },
  e: { independent: "எ", dependent: "ெ" },
  o: { independent: "ஒ", dependent: "ொ" },
};

const consonants: Record<string, string> = {
  ng: "ங்",
  nj: "ஞ",
  ny: "ஞ",
  zh: "ழ",
  sh: "ஷ",
  ch: "ச",
  th: "த",
  dh: "த",
  kh: "க",
  gh: "க",
  ph: "ப",
  bh: "ப",
  k: "க",
  g: "க",
  c: "ச",
  s: "ச",
  j: "ஜ",
  t: "ட",
  d: "ட",
  n: "ந",
  p: "ப",
  b: "ப",
  m: "ம",
  y: "ய",
  r: "ர",
  l: "ல",
  v: "வ",
  w: "வ",
  h: "ஹ",
  f: "ஃப",
  q: "க",
  x: "க்ஸ்",
  z: "ஸ",
};

const tamilProductTranslations: Record<string, string> = {
  apple: "ஆப்பிள்",
  banana: "வாழைப்பழம்",
  beans: "பீன்ஸ்",
  brinjal: "கத்தரிக்காய்",
  cabbage: "முட்டைக்கோஸ்",
  carrot: "கேரட்",
  coconut: "தேங்காய்",
  coriander: "கொத்தமல்லி",
  cucumber: "வெள்ளரிக்காய்",
  garlic: "பூண்டு",
  ginger: "இஞ்சி",
  grapes: "திராட்சை",
  lemon: "எலுமிச்சை",
  mango: "மாம்பழம்",
  milk: "பால்",
  onion: "வெங்காயம்",
  orange: "ஆரஞ்சு",
  potato: "உருளைக்கிழங்கு",
  rice: "அரிசி",
  tomato: "தக்காளி",
  thakkali: "தக்காளி",
  thengai: "தேங்காய்",
  vengayam: "வெங்காயம்",
};

const orderedVowels = Object.keys(vowels).sort((a, b) => b.length - a.length);
const orderedConsonants = Object.keys(consonants).sort((a, b) => b.length - a.length);

function matchToken(input: string, index: number, tokens: string[]): string | undefined {
  return tokens.find((token) => input.startsWith(token, index));
}

export function transliterateTamil(value: string): string {
  const input = value.toLowerCase();
  let output = "";
  let index = 0;

  while (index < input.length) {
    const vowel = matchToken(input, index, orderedVowels);
    if (vowel) {
      output += vowels[vowel].independent;
      index += vowel.length;
      continue;
    }

    const consonant = matchToken(input, index, orderedConsonants);
    if (consonant) {
      const nextIndex = index + consonant.length;
      const followingVowel = matchToken(input, nextIndex, orderedVowels);
      output += consonants[consonant];
      if (consonant === "x" && !followingVowel) {
        index = nextIndex;
        continue;
      }
      if (consonant === "ng") output += "க";
      if (followingVowel) {
        output += vowels[followingVowel].dependent;
        index = nextIndex + followingVowel.length;
      } else {
        output += "்";
        index = nextIndex;
      }
      continue;
    }

    const originalCharacter = value[index];
    output += originalCharacter;
    index++;
  }

  return output;
}

export function tamilProductName(value: string): string {
  return value
    .split(/(\s+)/)
    .map((part) => {
      const lowerPart = part.toLowerCase();
      const normalized = lowerPart.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
      const translated = tamilProductTranslations[normalized];
      if (!translated) return transliterateTamil(part);
      const wordStart = lowerPart.indexOf(normalized);
      return `${part.slice(0, wordStart)}${translated}${part.slice(wordStart + normalized.length)}`;
    })
    .join("");
}

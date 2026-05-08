import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // PDF template'leri @react-pdf/renderer kullanıyor; <Image /> burada
    // PDF için renderlanır, HTML değil — alt-text kuralı uygulanamaz.
    files: ["lib/pdf/**/*.{ts,tsx}"],
    rules: {
      "jsx-a11y/alt-text": "off",
    },
  },
];

export default eslintConfig;

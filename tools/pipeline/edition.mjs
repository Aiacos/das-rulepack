// Which printing of the rules a book carries. The code's first letter says nothing (XGE is from 2017): the 2024 books are
// named, or are dated 2025 or later, or have entries that the dataset marks as 2024 (`srd52`, `basicRules2024`).
const BOOKS_2024 = ["XPHB", "XDMG"];

export function editionOf(code, { year, flagged } = {}) {
  if (BOOKS_2024.includes(String(code).toUpperCase())) return "2024";
  if (Number.isInteger(year) && year >= 2025) return "2024";
  return flagged === true ? "2024" : "2014";
}

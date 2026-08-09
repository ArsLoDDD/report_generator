import * as shevchenko from "shevchenko";

export type UkrainianCase = "називний" | "родовий" | "давальний" | "знахідний" | "орудний" | "місцевий" | "кличний";
type NameParts = { surname?: string; givenName?: string; patronymic?: string; gender?: "чоловіча" | "жіноча" };
const decliners: Record<UkrainianCase, typeof shevchenko.inNominative> = { називний: shevchenko.inNominative, родовий: shevchenko.inGenitive, давальний: shevchenko.inDative, знахідний: shevchenko.inAccusative, орудний: shevchenko.inAblative, місцевий: shevchenko.inLocative, кличний: shevchenko.inVocative };
const normaliseName = (value?: string) => value?.toLocaleLowerCase("uk").replace(/(^|[-\s])(\p{L})/gu, (_, prefix: string, letter: string) => `${prefix}${letter.toLocaleUpperCase("uk")}`);

/** Єдиний адаптер Shevchenko: UI та парсер не викликають бібліотеку напряму. */
export const morphologyService = {
  async declineName(parts: NameParts, grammaticalCase: UkrainianCase): Promise<{ value: string; warning?: string }> {
    try {
      const surnameWasUppercase = Boolean(parts.surname && parts.surname === parts.surname.toLocaleUpperCase("uk"));
      const input = { familyName: normaliseName(parts.surname), givenName: normaliseName(parts.givenName), patronymicName: normaliseName(parts.patronymic) };
      const detected = parts.gender === "чоловіча" ? shevchenko.GrammaticalGender.MASCULINE : parts.gender === "жіноча" ? shevchenko.GrammaticalGender.FEMININE : await shevchenko.detectGender(input);
      if (!detected) return { value: [parts.surname, parts.givenName, parts.patronymic].filter(Boolean).join(" "), warning: "Не вдалося визначити стать для коректного відмінювання." };
      const result = await decliners[grammaticalCase]({ gender: detected, ...input });
      const familyName = surnameWasUppercase ? result.familyName?.toLocaleUpperCase("uk") : result.familyName;
      return { value: [familyName, result.givenName, result.patronymicName].filter(Boolean).join(" ") };
    } catch { return { value: [parts.surname, parts.givenName, parts.patronymic].filter(Boolean).join(" "), warning: "Не вдалося відмінити значення. Використано початкову форму." }; }
  },
  declineRank(value: string, grammaticalCase: UkrainianCase) {
    const forms: Record<string, Record<UkrainianCase, string>> = { "солдат": { називний: "солдат", родовий: "солдата", давальний: "солдату", знахідний: "солдата", орудний: "солдатом", місцевий: "солдаті", кличний: "солдате" }, "старший солдат": { називний: "старший солдат", родовий: "старшого солдата", давальний: "старшому солдату", знахідний: "старшого солдата", орудний: "старшим солдатом", місцевий: "старшому солдаті", кличний: "старший солдате" } };
    return forms[value.toLocaleLowerCase("uk")]?.[grammaticalCase] ?? value;
  },
  declinePosition(value: string, grammaticalCase: UkrainianCase) {
    if (grammaticalCase === "називний") return value;
    const [head, ...tail] = value.split(/(\s+)/);
    const lower = head.toLocaleLowerCase("uk");
    const endings: Record<UkrainianCase, [string, string]> = {
      називний: ["", ""], родовий: ["а", ""], давальний: ["у", ""], знахідний: ["а", ""],
      орудний: ["ом", ""], місцевий: ["і", ""], кличний: ["е", ""]
    };
    let changed = lower;
    if (lower.endsWith("ець")) changed = `${lower.slice(0, -3)}${grammaticalCase === "орудний" ? "цем" : grammaticalCase === "місцевий" ? "ці" : grammaticalCase === "кличний" ? "цю" : "ця"}`;
    else if (lower.endsWith("ий")) changed = `${lower.slice(0, -2)}${grammaticalCase === "родовий" || grammaticalCase === "знахідний" ? "ого" : grammaticalCase === "давальний" || grammaticalCase === "місцевий" ? "ому" : grammaticalCase === "орудний" ? "им" : "ий"}`;
    else changed = `${lower}${endings[grammaticalCase][0]}`;
    const first = head === head.toLocaleUpperCase("uk") ? changed.toLocaleUpperCase("uk") : changed;
    return [first, ...tail].join("");
  },
  transformText(value: string, modifier: "великими" | "маленькими" | "з_великої") {
    if (modifier === "великими") return value.toUpperCase();
    if (modifier === "маленькими") return value.toLowerCase();
    const lowered = value.toLocaleLowerCase("uk");
    return lowered.replace(/^(\s*)(\p{L})/u, (_, prefix: string, letter: string) => `${prefix}${letter.toLocaleUpperCase("uk")}`);
  }
};

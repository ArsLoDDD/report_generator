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
    const replacements: Partial<Record<UkrainianCase, Array<[RegExp, string]>>> = { родовий: [[/командир/iu, "командира"], [/начальник/iu, "начальника"], [/стрілець/iu, "стрільця"]], давальний: [[/командир/iu, "командиру"], [/начальник/iu, "начальнику"], [/стрілець/iu, "стрільцю"]], знахідний: [[/командир/iu, "командира"], [/начальник/iu, "начальника"], [/стрілець/iu, "стрільця"]], орудний: [[/командир/iu, "командиром"], [/начальник/iu, "начальником"], [/стрілець/iu, "стрільцем"]], місцевий: [[/командир/iu, "командирі"], [/начальник/iu, "начальнику"], [/стрілець/iu, "стрільці"]], кличний: [[/командир/iu, "командире"], [/начальник/iu, "начальнику"], [/стрілець/iu, "стрільцю"]] };
    return (replacements[grammaticalCase] ?? []).reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), value);
  },
  transformText(value: string, modifier: "великими" | "маленькими" | "з_великої") { if (modifier === "великими") return value.toUpperCase(); if (modifier === "маленькими") return value.toLowerCase(); return value.toLowerCase().replace(/(^|\s|-)(\p{L})/gu, (_, prefix: string, letter: string) => `${prefix}${letter.toUpperCase()}`); }
};

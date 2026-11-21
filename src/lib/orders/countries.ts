// Where the store ships: everywhere ("free worldwide shipping") except the countries under full trade
// embargoes. The checkout sends the two-letter code; the order stores the English name. Client-safe.

const CODES =
  "AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IQ IS IT JE JM JO JP KE KG KH KI KM KN KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW".split(
    " ",
  );

/** Places where addresses have no postal code, so the field is optional there. */
const NO_POSTCODE = new Set(
  "AE AG AO AW BF BI BJ BO BS BW BZ CD CF CG CI CK CM DJ DM ER FJ GA GD GH GM GQ GY HK JM KI KM KN LY ML MO MR MW NR NU QA RW SB SC SL SR SS ST TD TG TK TL TO TV UG VU YE ZW".split(
    " ",
  ),
);

let names: Intl.DisplayNames | null | undefined;
function displayName(code: string): string {
  if (names === undefined) {
    try {
      names = new Intl.DisplayNames(["en"], { type: "region" });
    } catch {
      names = null;
    }
  }
  try {
    return names?.of(code) ?? code;
  } catch {
    return code;
  }
}

export const COUNTRIES: { code: string; name: string }[] = CODES.map((code) => ({ code, name: displayName(code) })).sort((a, b) => a.name.localeCompare(b.name, "en"));

const VALID = new Set(CODES);
export const isCountryCode = (v: unknown): v is string => typeof v === "string" && VALID.has(v);
export const countryName = (code: string) => displayName(code);
export const needsPostcode = (code: string) => !NO_POSTCODE.has(code);

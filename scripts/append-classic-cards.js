// One-off: append a batch of classic, universal drinking-game prompts to
// src/data/prompts.json. Focus on cards that (a) are coherent Croatian
// (no AI-hallucinated word salad), (b) reliably cause drinking, and
// (c) don't depend on in-jokes about specific characters.
//
// Run: node scripts/append-classic-cards.js

const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "src", "data", "prompts.json");
const data = JSON.parse(fs.readFileSync(file, "utf8"));

// ── NEVER HAVE I EVER ─────────────────────────────────────────────────
const NHIE = [
  "...pao s kreveta tijekom seksa",
  "...povratio u tudoj kuci",
  "...zakljucao se van stana u gacama",
  "...zaspao u vlaku i promasio stanicu",
  "...ispustio telefon u WC",
  "...lagao zaposlodavcu da sam bolestan",
  "...jeo hranu s poda po pravilu 5 sekundi",
  "...slao poruku bivsoj poslije 2 piva",
  "...placao za taksi vise nego za pice te veceri",
  "...zavrsio u krivom gradu poslije noci izlaska",
  "...google-ao sebe vise od 3 puta u jednom danu",
  "...lagao o tome koliko zaradujem",
  "...zaboravio ime osobe s kojom sam spavao",
  "...povratio pa nastavio piti",
  "...plakao od smijeha toliko da sam se popiskio",
  "...spavao u odjeci s veceri",
  "...nosio iste gace 3 dana zaredom",
  "...lazno se predstavljao u baru",
  "...pao na stepenicama pijan",
  "...razbio tudi mobitel dok sam bio pijan",
  "...poslao krivu poruku krivoj osobi",
  "...izgubio nocni u izlasku i morao ici pjeske",
  "...ukrao casu iz bara za uspomenu",
  "...plakao zbog pjesme u autu",
  "...zaspao na WC-u u nocnom klubu",
];

// ── MOST LIKELY TO ────────────────────────────────────────────────────
const MLT = [
  "...pije sam doma usred tjedna",
  "...postane alkoholicar sljedecih 10 godina",
  "...se prvi razvede",
  "...zaspi tijekom vlastitog vjencanja",
  "...zavrsi u zatvoru zbog gluposti",
  "...dobije dijete s krivom osobom",
  "...izgubi posao zbog pijanstva",
  "...zavrsi na reality showu",
  "...prvi umre od jetre",
  "...kupi sportski auto za krizu srednjih godina",
  "...ode iz Hrvatske i nikad se ne vrati",
  "...pocne hodati s puno mlađom",
  "...zaboravi rodendan vlastite zene",
  "...izgubi kljuceve veceras",
  "...prvi padne u krevet veceras",
  "...povrati veceras",
  "...nazove bivsu veceras",
  "...izgubi telefon veceras",
  "...zaluta veceras",
  "...zapuca s nepoznatom osobom veceras",
];

// ── WHO IN THE ROOM ───────────────────────────────────────────────────
const WHO = [
  "...najgore plese?",
  "...najvise lazi?",
  "...se najbrze napije?",
  "...najlose podnosi alkohol?",
  "...je najbolje lazac?",
  "...ima najljepsi smijeh?",
  "...bi prvi skocio s mosta za opkladu?",
  "...je najljenciji?",
  "...najvise prica gluposti kad je pijan?",
  "...je najbolji frend?",
  "...bi prvi izdao ostale za novac?",
  "...najcesce kasni?",
  "...je imao najgori dan danas?",
  "...ce prvi zaspati veceras?",
  "...ima najvecu toleranciju na alkohol?",
];

// ── WOULD YOU RATHER (universal, no in-jokes) ─────────────────────────
const WYR = [
  { option_a: "Radije nikad vise ne pio alkohol", option_b: "Radije nikad vise ne gledao porno" },
  { option_a: "Radije jeo samo kruh godinu dana", option_b: "Radije pio samo vodu godinu dana" },
  { option_a: "Radije uhvacen u laganju", option_b: "Radije uhvacen u varanju" },
  { option_a: "Radije bio pijan na vlastitom vjencanju", option_b: "Radije trijezan na momackoj veceri" },
  { option_a: "Radije izgubio sve slike iz zivota", option_b: "Radije izgubio sve poruke" },
  { option_a: "Radije imao super snagu ali bio ruzan", option_b: "Radije bio lijep ali nesposoban" },
  { option_a: "Radije zivio 100 godina sam", option_b: "Radije zivio 50 godina sretno" },
  { option_a: "Radije da svi znaju sto mislis", option_b: "Radije da nikad nista ne mislis o ljudima" },
  { option_a: "Radije bez alkohola mjesec dana", option_b: "Radije bez telefona mjesec dana" },
  { option_a: "Radije izgubio 10.000 kuna", option_b: "Radije izgubio vikend sjecanja" },
];

// ── TRUTHS (universal, not groom) ─────────────────────────────────────
const TRUTHS = [
  "Koja ti je najveca tajna koju nikome nisi rekao?",
  "Kad si zadnji put plakao i zbog cega?",
  "Koga u ovoj sobi najmanje podnosis?",
  "Koji je najgluplji razlog zbog kojeg si se svadao?",
  "Koja je najgora laz koju si ikad rekao?",
  "Koja ti je bila najgora faza u srednjoj?",
  "Koju osobu iz proslosti si najvise povrijedio?",
  "Koju stvar si ucinio, a nikom nisi rekao?",
  "Sto te najvise plasi u zivotu?",
  "Kad si zadnji put lagao roditeljima i o cemu?",
  "Koja ti je bila najgora ideja pijan?",
  "Tko ti je prvi frend kojem bi rekao da si ubio covjeka?",
  "Koje ti je najgore jutro poslije bilo?",
];

// ── DARES ─────────────────────────────────────────────────────────────
const DARES = [
  "Napravi 15 sklekova sad i ovdje",
  "Nazovi mamu i reci joj da je volis (bez konteksta)",
  "Pjevaj 30 sekundi pjesme koju ti kazu",
  "Zamijeni majicu s osobom do tebe",
  "Pokazi zadnju sliku iz galerije svima",
  "Daj telefon osobi desno — 30 sekundi slobode",
  "Napravi plesnu tocku od 20 sekundi",
  "Oponasaj nekoga iz sobe — drugi pogadaju",
  "Posalji emoji 🍆 zadnjoj osobi u porukama",
  "Pricaj 60 sekundi bez rijeci 'ja' i 'mi'",
  "Popij s drugom rukom do kraja veceri",
  "Imitiraj zivotinju — ostali moraju pogoditi",
  "Progovori sljedeca 3 puta u rimi",
];

// ── CHAOS CARDS — classic drinking game mechanics ─────────────────────
// Each entry: { text, effect }. effect one of: waterfall, shot,
// everyone_drinks, groom_drinks, reverse, custom.
const CHAOS = [
  { text: "WATERFALL! Mladozenja krece piti. Svi redom krecu za njim. Nitko ne smije stati dok onaj do njega ne prestane. Mladozenja staje zadnji.", effect: "waterfall" },
  { text: "KATEGORIJE! Mladozenja bira kategoriju (marke auta, alkoholna pica, imena...). Svi redom imenuju po jedan. Tko zastane ili ponovi — pije 3.", effect: "custom" },
  { text: "THUMB MASTER! Prva osoba koja primijeti palac mladozenje na stolu postaje Thumb Master. Svi moraju stavit palac kad on stavi. Zadnji pije 2.", effect: "custom" },
  { text: "MALI COVJEK! Svi imaju nevidljivog malog covjeka na pivu. Prvo ga skini, pa pij, pa ga vrati. Tko zaboravi — shot.", effect: "custom" },
  { text: "KRALJ MATIJA! Sljedecih 5 minuta — mladozenja je KRALJ. Svi se moraju obracati 'Kralju Matija'. Tko zaboravi — pije 2.", effect: "custom" },
  { text: "RIMA! Mladozenja kaze rijec. Svi redom moraju rimovati. Tko zastane — pije 3.", effect: "custom" },
  { text: "POKAZI U ZRAK! Svi odmah dignu prst u zrak. Zadnji — pije 3.", effect: "custom" },
  { text: "BRACE! Svi stave ruke na glavu. Zadnji — pije 3.", effect: "custom" },
  { text: "TISINA 60s! Sljedecih 60 sekundi — nitko ne smije progovoriti. Tko puca — shot.", effect: "shot" },
  { text: "OCI U OCI! Svi odabiru partnera. Gledaju se u oci. Tko prvi trepne — pije 2.", effect: "custom" },
  { text: "DUPLO! Sljedeca karta vrijedi duplo — dupli gutljaji, dupla sramota.", effect: "custom" },
  { text: "DRUSTVENA! Svi piju 2 za mladozenju.", effect: "everyone_drinks" },
  { text: "NAZDRAVICA! Svi dignu cake i ispiju do dna. Zivjeli!", effect: "everyone_drinks" },
  { text: "LIJEVA RUKA! Sljedecih 10 minuta svi piju samo lijevom rukom. Tko zaboravi — pije 3.", effect: "custom" },
  { text: "NI PSOVKE NI 'JA'! Sljedece 3 minute zabranjene rijeci. Svaki prekrsaj — gutljaj.", effect: "custom" },
  { text: "NAJMLADI PIJE 2! Najmladi za stolom odmah pije 2.", effect: "custom" },
  { text: "NAJSTARIJI PIJE 2! Najstariji za stolom odmah pije 2.", effect: "custom" },
  { text: "ZAMJENA! Zamijeni mjesto s osobom preko puta. Stara pozicija sad pije 2.", effect: "custom" },
  { text: "POSLJEDNJI SLOG! Sljedecih 2 minute — svi se moraju rimovati sa zadnjom rijeci prosle osobe. Tko pukne — pije 3.", effect: "custom" },
  { text: "DODATAK! Odaberi osobu — ona pije tvoju sljedecu kaznu.", effect: "custom" },
  { text: "VOZAC! Osoba desno od mladozenje postaje 'vozac' — ne smije piti sljedeca 2 kruga.", effect: "custom" },
  { text: "MLADOZENJA EX! Mladozenja ispija svoje pice do kraja. ODMAH.", effect: "groom_drinks" },
  { text: "OBRNUTO! Sljedecih 3 karte — tko god bi trebao piti, NE pije. Onaj koji je izvukao kartu — pije.", effect: "reverse" },
];

// ── RULE EXAMPLES ─────────────────────────────────────────────────────
const RULES = [
  "Svaki put kad netko kaze ime mladozenje, svi piju 1",
  "Nitko ne smije pokazivati prstom — tko pokaze, pije 2",
  "Svaki put kad zazvoni telefon, vlasnik pije 2",
  "Nitko ne smije reci 'ja' — tko kaze, pije 1",
  "Svaki put kad netko kaze 'pijem' ili 'alkohol', mladozenja pije 1",
  "Tko ide na WC mora povesti partnera — tko ide sam, pije 3",
  "Svaki put kad netko psuje, pije 1",
  "Nitko ne smije koristiti ime — samo nadimke. Tko prekrsi, pije 2",
  "Svaki put kad netko kaze 'bivsa' ili 'bivsi', svi piju",
];

// ── HOT TAKES (universal) ─────────────────────────────────────────────
const HOT_TAKES = [
  "Svadbe su zapravo samo izgovor za pijanku",
  "Monogamija je protiv ljudske prirode",
  "Ljudi se nikad stvarno ne mijenjaju",
  "Najbolji frendovi su oni koji su gledali tvoje najgore trenutke",
  "Vecina ljubavnih veza zavrsi iz cistog umora",
  "Alkohol je cesto bolji od terapije",
  "Djeca unistavaju brak, ali bez njih nema smisla",
  "Muskarci ne znaju sto zele do 40-e",
  "Trezveni ljudi na tulumu su najgori",
];

// ── GROOM SPECIALS (universal — target groom but not character-specific)
// Shape: { text, sub_type } where sub_type is truth|dare|toast|challenge|confession
const GROOM_SPECIALS = [
  { text: "Mladozenja — reci zadnju iskrenu stvar koju mislis o svojoj buducoj zeni", sub_type: "truth" },
  { text: "Mladozenja — otpjevaj pjesmu koja te podsjeca na nju", sub_type: "dare" },
  { text: "Mladozenja — koja je stvar koju tajis od nje, a moras se priznati?", sub_type: "confession" },
  { text: "Mladozenja — daj nam 3 savjeta za sretan brak (koje nisi sam poslusao)", sub_type: "truth" },
  { text: "Mladozenja — pokazi najstariju sliku vas dvoje", sub_type: "dare" },
  { text: "Mladozenja — posalji joj sada 'Volim te' i pokazi svima odgovor", sub_type: "dare" },
  { text: "Mladozenja — opisi prvi poljubac u 3 rijeci", sub_type: "truth" },
  { text: "Mladozenja — koja je rijec koju ti najcesce kaze kad se svadate?", sub_type: "truth" },
  { text: "Mladozenja — reci jednu stvar o njoj koja te i danas iznenaduje", sub_type: "truth" },
  { text: "Mladozenja — nazdravi zaručnici. Ex tvoje pice.", sub_type: "toast" },
  { text: "Mladozenja — nazdravi ovim momcima. Bez njih veceras ne bi imalo smisla. Ex.", sub_type: "toast" },
  { text: "Mladozenja — priznaj jednu stvar koju se bojis reci na vjencanju", sub_type: "confession" },
  { text: "Mladozenja — 20 sklekova. Sad.", sub_type: "challenge" },
  { text: "Mladozenja — reci tri stvari koje ces prestati raditi nakon vjencanja", sub_type: "truth" },
  { text: "Mladozenja — odaberi jedno 'necu vise nikad' i obecaj pred svima", sub_type: "challenge" },
];

// Append helpers -----------------------------------------------------
function appendNHIE(arr) {
  for (const text of arr) data.NEVER_HAVE_I_EVER.push({ text, is_groom_targeted: false });
}
function appendMLT(arr) { for (const text of arr) data.MOST_LIKELY_TO.push(text); }
function appendWHO(arr) { for (const text of arr) data.WHO_IN_THE_ROOM.push(text); }
function appendWYR(arr) { for (const obj of arr) data.WOULD_YOU_RATHER.push(obj); }
function appendTRUTHS(arr) {
  for (const text of arr) data.TRUTHS.push({ text, is_groom_targeted: false });
}
function appendDARES(arr) {
  for (const text of arr) data.DARES.push({ text, is_groom_targeted: false });
}
function appendCHAOS(arr) { for (const obj of arr) data.CHAOS_CARDS.push(obj); }
function appendRULES(arr) { for (const text of arr) data.RULE_EXAMPLES.push(text); }
function appendHOT(arr) { for (const text of arr) data.HOT_TAKES.push(text); }
function appendGROOM(arr) { for (const obj of arr) data.GROOM_SPECIALS.push(obj); }

// Apply in the same format each category uses. Inspect one entry of
// each so we don't accidentally diverge from the current shape.
function shapeOf(sample) {
  if (typeof sample === "string") return "string";
  if (sample && typeof sample === "object") return Object.keys(sample).join(",");
  return typeof sample;
}
console.log("Detected shapes (should match what we append):");
for (const k of ["NEVER_HAVE_I_EVER","TRUTHS","DARES","MOST_LIKELY_TO","WHO_IN_THE_ROOM","WOULD_YOU_RATHER","CHAOS_CARDS","RULE_EXAMPLES","HOT_TAKES","GROOM_SPECIALS"]) {
  console.log("  ", k.padEnd(20), "→", shapeOf(data[k][0]));
}

appendNHIE(NHIE);
appendMLT(MLT);
appendWHO(WHO);
appendWYR(WYR);
appendTRUTHS(TRUTHS);
appendDARES(DARES);
appendCHAOS(CHAOS);
appendRULES(RULES);
appendHOT(HOT_TAKES);
appendGROOM(GROOM_SPECIALS);

fs.writeFileSync(file, JSON.stringify(data));
console.log("\nNew totals:");
for (const k of Object.keys(data)) console.log("  ", k.padEnd(20), data[k].length);
